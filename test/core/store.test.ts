import { describe, expect, test } from 'bun:test';
import { GracefulShutdownStore } from '../../src/core';

describe('GracefulShutdownStore', () => {
  describe('begin', () => {
    test('sets the shutdown context', () => {
      const store = new GracefulShutdownStore();

      store.begin({ reason: 'signal', signal: 'SIGTERM' });

      expect(store.state).toBe('shutting_down');
      expect(store.reason).toBe('signal');
      expect(store.signal).toBe('SIGTERM');
      expect(typeof store.startedAt).toBe('number');
    });
  });

  describe('request tracking', () => {
    test('tracks each token once and resolves when active requests drain', async () => {
      const store = new GracefulShutdownStore();
      const idlePromise = store.wait();
      const token = store.startRequest();

      expect(token).toBe(1);
      expect(store.activeRequestCount).toBe(1);

      let resolved = false;
      const drainingPromise = store.wait().then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);

      expect(store.finishRequest(token)).toBe(true);
      expect(store.finishRequest(token)).toBe(false);
      expect(store.finishRequest()).toBe(false);
      expect(store.activeRequestCount).toBe(0);

      await idlePromise;
      await drainingPromise;
      expect(resolved).toBe(true);
    });
  });
});
