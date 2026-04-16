import { describe, expect, test } from 'bun:test';
import { GracefulShutdownStore } from '../../src/core';

describe('GracefulShutdownStore', () => {
  describe('begin', () => {
    test('sets the shutdown context and resets timedOut', () => {
      const store = new GracefulShutdownStore();

      store.markTimedOut();
      store.begin({ reason: 'signal', signal: 'SIGTERM' });

      expect(store.state).toBe('shutting_down');
      expect(store.reason).toBe('signal');
      expect(store.signal).toBe('SIGTERM');
      expect(store.timedOut).toBe(false);
      expect(typeof store.startedAt).toBe('number');
    });
  });

  describe('markTimedOut', () => {
    test('marks timeout without overwriting the original reason', () => {
      const store = new GracefulShutdownStore();

      store.begin({ reason: 'manual' });
      store.markTimedOut();

      expect(store.reason).toBe('manual');
      expect(store.timedOut).toBe(true);
    });
  });

  describe('finishWork', () => {
    test('does not decrement active work below zero', () => {
      const store = new GracefulShutdownStore();

      store.finishWork();

      expect(store.hasActiveWork()).toBe(false);
    });
  });
});
