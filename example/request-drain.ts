import { Elysia } from 'elysia';
import { gracefulShutdown } from '../src';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const graceful = gracefulShutdown({
  signals: ['SIGINT', 'SIGTERM'],
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
});

const app = new Elysia()
  .use(graceful)
  .get('/', () => {
    return {
      ok: true,
      message: 'use /slow/5000, then press Ctrl+C and call /status from another terminal',
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

console.log('request drain example listening on http://localhost:3000');
console.log('1) In terminal A: curl http://localhost:3000/slow/5000');
console.log('2) While it is running, press Ctrl+C in this terminal');
console.log('3) In terminal B: curl http://localhost:3000/status');
console.log('4) In terminal B: curl -i http://localhost:3000/');
console.log(
  'Expected: the in-flight /slow request finishes, new requests return 503, and shutdown logs show the active request count draining to zero before cleanup continues.',
);
