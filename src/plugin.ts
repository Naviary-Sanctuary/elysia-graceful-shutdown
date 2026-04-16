import { Elysia } from 'elysia';
import type { GracefulShutdownOptions, GracefulShutdownReason, Signal } from './types';
import { GracefulShutdownStore, shutdown } from './core';

const WORK_STARTED = Symbol('graceful-shutdown-work-started');

export function gracefulShutdown(options: GracefulShutdownOptions = {}) {
  const store = new GracefulShutdownStore();
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  const signalHandlers = new Map<Signal, () => void>();

  const reportError = ({ phase, error, signal }: { phase: 'shutdown' | 'stop'; error: unknown; signal?: Signal }) => {
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
            try {
              await shutdown({
                store,
                options,
                reason: 'signal',
                signal,
              });
            } catch (error) {
              reportError({ phase: 'shutdown', error, signal });
            } finally {
              try {
                await app.stop();
              } catch (error) {
                reportError({ phase: 'stop', error, signal });
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

      (context as Record<symbol, boolean>)[WORK_STARTED] = true;

      store.startWork();
    })
    .onAfterResponse((context) => {
      if ((context as Record<symbol, boolean>)[WORK_STARTED]) {
        store.finishWork();
        (context as Record<symbol, boolean>)[WORK_STARTED] = false;
      }
    })
    .onError((context) => {
      if ((context as Record<symbol, boolean>)[WORK_STARTED]) {
        store.finishWork();
        (context as Record<symbol, boolean>)[WORK_STARTED] = false;
      }
    });
}
