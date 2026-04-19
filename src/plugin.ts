import { Elysia } from 'elysia';
import type { GracefulShutdownOptions, GracefulShutdownReason, Signal } from './types';
import { GracefulShutdownStore, shutdown } from './core';

const requestTokenKey = Symbol('gracefulShutdownRequestToken');
const DEFAULT_TIMEOUT_MS = 30_000;

type RequestTrackingContext = {
  [requestTokenKey]?: number;
};

export function gracefulShutdown(options: GracefulShutdownOptions = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

  if (options.drainTimeout !== undefined && options.drainTimeout > timeout) {
    throw new Error('gracefulShutdown: drainTimeout must be less than or equal to timeout');
  }

  const store = new GracefulShutdownStore();
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  const signalHandlers = new Map<Signal, () => void>();

  const reportError = ({
    phase,
    error,
    signal,
  }: {
    phase: 'shutdown' | 'stop' | 'timeout';
    error: unknown;
    signal?: Signal;
  }) => {
    try {
      options.onError?.({ phase, error, signal });
    } catch {
      // Error reporting must never break the fail-safe shutdown path.
    }
  };

  return new Elysia({
    name: 'graceful-shutdown',
  })
    .decorate('gracefulShutdown', {
      options,
      store,
      runShutdown: async (reason: GracefulShutdownReason, signal?: Signal) => {
        return await shutdown({
          store,
          options,
          reason,
          signal,
        });
      },
    })
    .onStart((app) => {
      for (const signal of signals) {
        const handler = () => {
          void (async () => {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            let didTimeout = false;
            let gracefulStopPromise: Promise<void> | undefined;
            let forceStopPromise: Promise<void> | undefined;

            const stopApp = (closeActiveConnections: boolean) => {
              if (closeActiveConnections) {
                if (forceStopPromise) return forceStopPromise;

                forceStopPromise = (async () => {
                  try {
                    await app.stop(true);
                  } catch (error) {
                    reportError({ phase: 'stop', error, signal });
                  }
                })();

                return forceStopPromise;
              }

              if (gracefulStopPromise) return gracefulStopPromise;

              gracefulStopPromise = (async () => {
                try {
                  await app.stop(false);
                } catch (error) {
                  reportError({ phase: 'stop', error, signal });
                }
              })();

              return gracefulStopPromise;
            };

            const hookFlow = (async () => {
              try {
                await shutdown({
                  store,
                  options,
                  reason: 'signal',
                  signal,
                  finalize: false,
                });
              } catch (error) {
                reportError({ phase: 'shutdown', error, signal });
              }
            })();

            const shutdownFlow = (async () => {
              await hookFlow;

              if (!didTimeout) {
                await stopApp(false);
              }
            })();

            const timeoutFlow = new Promise<void>((resolve) => {
              timeoutId = setTimeout(() => {
                didTimeout = true;
                reportError({
                  phase: 'timeout',
                  error: new Error(`Shutdown timed out after ${timeout}ms`),
                  signal,
                });

                void stopApp(true).finally(resolve);
              }, timeout);
            });

            try {
              await Promise.race([shutdownFlow, timeoutFlow]);
            } finally {
              if (timeoutId) clearTimeout(timeoutId);

              if (store.state === 'shutting_down') {
                store.complete();
                await options.finally?.(store.toContext());
              }
            }
          })();
        };

        signalHandlers.set(signal, handler);
        process.on(signal, handler);
      }
    })
    .onStop(() => {
      for (const [signal, handler] of signalHandlers.entries()) {
        process.off(signal, handler);
      }
      signalHandlers.clear();
    })
    .onRequest((context) => {
      if (store.state !== 'idle') {
        context.set.status = 503;
        return 'Service Unavailable';
      }

      const trackedContext = context as RequestTrackingContext;

      if (trackedContext[requestTokenKey] !== undefined) return;

      const token = store.startRequest();
      trackedContext[requestTokenKey] = token;
    })
    .onAfterResponse({ as: 'scoped' }, (context) => {
      store.finishRequest((context as RequestTrackingContext)[requestTokenKey]);
    });
}
