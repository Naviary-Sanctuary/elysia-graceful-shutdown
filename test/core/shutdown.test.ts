import { describe, expect, test } from 'bun:test';
import { shutdown } from '../../src/core';
import { GracefulShutdownStore } from '../../src/core';

describe('shutdown', () => {
  describe('shutdown', () => {
    test('runs hooks in order and completes the store', async () => {
      const store = new GracefulShutdownStore();
      const calls: string[] = [];

      await shutdown({
        store,
        reason: 'manual',
        options: {
          preShutdown: ({ reason, state }) => {
            calls.push(`pre:${reason}:${state}`);
          },
          onShutdown: ({ state }) => {
            calls.push(`on:${state}`);
          },
          finally: ({ state }) => {
            calls.push(`finally:${state}`);
          },
        },
      });

      expect(calls).toEqual(['pre:manual:shutting_down', 'on:shutting_down', 'finally:completed']);
      expect(store.state).toBe('completed');
      expect(store.reason).toBe('manual');
    });

    test('waits for active requests to drain before onShutdown', async () => {
      const store = new GracefulShutdownStore();
      const calls: string[] = [];

      const token = store.startRequest();

      const shutdownPromise = shutdown({
        store,
        reason: 'manual',
        options: {
          preShutdown: ({ activeRequestCount }) => {
            calls.push(`pre:${activeRequestCount}`);
          },
          onShutdown: ({ activeRequestCount }) => {
            calls.push(`on:${activeRequestCount}`);
          },
          finally: ({ activeRequestCount }) => {
            calls.push(`finally:${activeRequestCount}`);
          },
        },
      });

      await Promise.resolve();
      calls.push('draining');
      store.finishRequest(token);

      await shutdownPromise;

      expect(calls).toEqual(['pre:1', 'draining', 'on:0', 'finally:0']);
    });

    test('does not run twice after shutdown has already started', async () => {
      const store = new GracefulShutdownStore();
      let onShutdownCalls = 0;

      const firstShutdown = shutdown({
        store,
        reason: 'manual',
        options: {
          onShutdown: async () => {
            onShutdownCalls += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
          },
        },
      });

      const secondShutdown = shutdown({
        store,
        reason: 'signal',
        signal: 'SIGTERM',
        options: {
          onShutdown: () => {
            onShutdownCalls += 1;
          },
        },
      });

      await Promise.all([firstShutdown, secondShutdown]);

      expect(onShutdownCalls).toBe(1);
      expect(store.reason).toBe('manual');
      expect(store.state).toBe('completed');
    });

    test('runs finally even if preShutdown throws', async () => {
      const store = new GracefulShutdownStore();
      const calls: string[] = [];

      await expect(
        shutdown({
          store,
          reason: 'manual',
          options: {
            preShutdown: () => {
              calls.push('preShutdown');
              throw new Error('preShutdown failed');
            },
            finally: ({ state }) => {
              calls.push(`finally:${state}`);
            },
          },
        }),
      ).rejects.toThrow('preShutdown failed');

      expect(calls).toEqual(['preShutdown', 'finally:completed']);
      expect(store.state).toBe('completed');
    });

    test('runs finally even if onShutdown throws', async () => {
      const store = new GracefulShutdownStore();
      const calls: string[] = [];

      await expect(
        shutdown({
          store,
          reason: 'manual',
          options: {
            onShutdown: () => {
              calls.push('onShutdown');
              throw new Error('onShutdown failed');
            },
            finally: ({ state }) => {
              calls.push(`finally:${state}`);
            },
          },
        }),
      ).rejects.toThrow('onShutdown failed');

      expect(calls).toEqual(['onShutdown', 'finally:completed']);
      expect(store.state).toBe('completed');
    });
  });
});
