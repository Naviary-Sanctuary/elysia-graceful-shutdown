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
});
