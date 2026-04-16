import { describe, expect, test } from 'bun:test';
import { gracefulShutdown } from '../src/plugin';

function getHook<T>(hook: T | undefined, name: string): T {
  if (!hook) throw new Error(`Missing hook: ${name}`);

  return hook;
}

describe('gracefulShutdown', () => {
  describe('runShutdown', () => {
    test('passes through the provided reason and signal', async () => {
      const plugin = gracefulShutdown();
      const contexts: Array<{ reason: 'signal' | 'manual'; signal?: string }> = [];
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;

      gracefulShutdownDecorator.options.onShutdown = ({
        reason,
        signal,
      }: {
        reason: 'signal' | 'manual';
        signal?: string;
      }) => {
        contexts.push({ reason, signal });
      };

      await gracefulShutdownDecorator.runShutdown('signal', 'SIGTERM');

      expect(contexts).toEqual([{ reason: 'signal', signal: 'SIGTERM' }]);
      expect(gracefulShutdownDecorator.store.state).toBe('completed');
    });
  });

  describe('request lifecycle', () => {
    test('tracks accepted work through an accepted request and afterResponse', () => {
      const plugin = gracefulShutdown();
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;
      const context = {
        set: {},
        responseValue: undefined,
        response: undefined,
      } as {
        set: Record<string, unknown>;
        responseValue: unknown;
        response: unknown;
      };
      const requestHook = getHook(plugin.event.request?.[0], 'request');
      const afterResponseHook = getHook(plugin.event.afterResponse?.[0], 'afterResponse');

      requestHook.fn(context);

      expect(gracefulShutdownDecorator.store.hasActiveWork()).toBe(true);

      afterResponseHook.fn(context);

      expect(gracefulShutdownDecorator.store.hasActiveWork()).toBe(false);
    });

    test('tracks accepted work through an accepted request and error hook', () => {
      const plugin = gracefulShutdown();
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;
      const context = {
        set: {},
        code: 'UNKNOWN',
        error: new Error('boom'),
      } as {
        set: Record<string, unknown>;
        code: string;
        error: Error;
      };
      const requestHook = getHook(plugin.event.request?.[0], 'request');
      const errorHook = getHook(plugin.event.error?.[0], 'error');

      requestHook.fn(context);

      expect(gracefulShutdownDecorator.store.hasActiveWork()).toBe(true);

      errorHook.fn(context);

      expect(gracefulShutdownDecorator.store.hasActiveWork()).toBe(false);
    });

    test('rejects requests with 503 while shutdown is in progress', () => {
      const plugin = gracefulShutdown();
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;
      const context = {
        set: {},
      } as { set: { status?: number } };
      const requestHook = getHook(plugin.event.request?.[0], 'request');

      gracefulShutdownDecorator.store.begin({ reason: 'manual' });

      const response = requestHook.fn(context);

      expect(context.set.status).toBe(503);
      expect(response).toBe('Service Unavailable');
      expect(gracefulShutdownDecorator.store.hasActiveWork()).toBe(false);
    });
  });

  describe('signal lifecycle', () => {
    test('registers handlers on start and removes them on stop', async () => {
      const plugin = gracefulShutdown({ signals: ['SIGTERM'] });
      const registered = new Map<string, () => Promise<void>>();
      const originalOn = process.on;
      const originalOff = process.off;

      const fakeApp = {
        stop: async () => undefined,
      };

      process.on = ((signal: NodeJS.Signals, handler: () => Promise<void>) => {
        registered.set(signal, handler);
        return process;
      }) as typeof process.on;

      process.off = ((signal: NodeJS.Signals) => {
        registered.delete(signal);
        return process;
      }) as typeof process.off;

      try {
        const startHook = getHook(plugin.event.start?.[0], 'start');
        const stopHook = getHook(plugin.event.stop?.[0], 'stop');

        await startHook.fn(fakeApp);

        expect(registered.has('SIGTERM')).toBe(true);

        stopHook.fn(fakeApp);

        expect(registered.size).toBe(0);
      } finally {
        process.on = originalOn;
        process.off = originalOff;
      }
    });
  });
});
