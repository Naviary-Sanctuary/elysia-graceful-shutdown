import { Elysia } from 'elysia';
import { gracefulShutdown } from '../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const app = new Elysia()
  .use(
    gracefulShutdown({
      signals: ['SIGINT', 'SIGTERM'],
      timeout: 6_000,
      drainTimeout: 3_000,
      preShutdown: ({ signal, activeRequestCount }) => {
        console.log('[graceful-shutdown] preShutdown', {
          signal,
          activeRequestCount,
        });
      },
      onShutdown: async ({ reason, activeRequestCount }) => {
        console.log('[graceful-shutdown] onShutdown', {
          reason,
          activeRequestCount,
        });

        await sleep(300);
      },
      finally: ({ state, activeRequestCount }) => {
        console.log('[graceful-shutdown] finally', {
          state,
          activeRequestCount,
        });
      },
      onError: ({ phase, signal, error }) => {
        console.error('[graceful-shutdown] error', {
          phase,
          signal,
          error,
        });
      },
    }),
  )
  .get('/', () => {
    return {
      ok: true,
      message: 'use /slow/10000, then press Ctrl+C before it finishes',
    };
  })
  .get('/status', ({ gracefulShutdown }) => {
    return {
      state: gracefulShutdown.store.state,
      reason: gracefulShutdown.store.reason ?? null,
      signal: gracefulShutdown.store.signal ?? null,
      startedAt: gracefulShutdown.store.startedAt ?? null,
      activeRequestCount: gracefulShutdown.store.activeRequestCount,
    };
  })
  .get('/slow/:ms', async ({ params, gracefulShutdown }) => {
    const duration = Number(params.ms);

    console.log('[request] slow:start', {
      duration,
      activeRequestCount: gracefulShutdown.store.activeRequestCount,
      state: gracefulShutdown.store.state,
    });

    await sleep(duration);

    console.log('[request] slow:end', {
      duration,
      activeRequestCount: gracefulShutdown.store.activeRequestCount,
      state: gracefulShutdown.store.state,
    });

    return {
      done: true,
      duration,
      state: gracefulShutdown.store.state,
      activeRequestCount: gracefulShutdown.store.activeRequestCount,
    };
  });

app.listen(3000);

console.log('request timeout example listening on http://localhost:3000');
console.log('timeout is set to 6000ms');
console.log('drainTimeout is set to 3000ms');
console.log('1) In terminal A: curl http://localhost:3000/slow/10000');
console.log('2) Before it finishes, press Ctrl+C in this terminal');
console.log('3) Watch onShutdown start after about 3 seconds when draining times out');
console.log('4) If shutdown still does not finish by about 6 seconds, the plugin calls app.stop(true)');
console.log('5) Bun may still let the server-side /slow handler finish its own work even after the connection closes');
console.log('6) In terminal B, you can inspect state with: curl http://localhost:3000/status');
