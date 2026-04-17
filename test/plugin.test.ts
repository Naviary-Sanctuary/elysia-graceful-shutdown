import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
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
    test('exports afterResponse to parent routes when used as a plugin', () => {
      const plugin = gracefulShutdown();
      const app = new Elysia().use(plugin).get('/', () => 'ok');

      expect(plugin.event.afterResponse).toHaveLength(1);
      expect(app.event.request).toHaveLength(1);
      expect(app.event.afterResponse).toHaveLength(1);
    });

    test('tracks accepted requests until afterResponse completes', () => {
      const plugin = gracefulShutdown();
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;
      const requestHook = getHook(plugin.event.request?.[0], 'request');
      const afterResponseHook = getHook(plugin.event.afterResponse?.[0], 'afterResponse');
      const request = new Request('http://localhost/accepted');
      const context = {
        request,
        responseValue: undefined,
        response: undefined,
        set: {},
      } as { request: Request; responseValue: unknown; response: unknown; set: { status?: number } };
      const differentAfterResponseContext = {
        request: new Request('http://localhost/accepted'),
        responseValue: undefined,
        response: undefined,
        set: {},
      } as { request: Request; responseValue: unknown; response: unknown; set: { status?: number } };

      requestHook.fn(context);
      requestHook.fn(context);

      expect(gracefulShutdownDecorator.store.activeRequestCount).toBe(1);

      afterResponseHook.fn(differentAfterResponseContext);
      expect(gracefulShutdownDecorator.store.activeRequestCount).toBe(1);

      afterResponseHook.fn(context);
      afterResponseHook.fn(context);

      expect(gracefulShutdownDecorator.store.activeRequestCount).toBe(0);
    });

    test('rejects requests with 503 while shutdown is in progress', () => {
      const plugin = gracefulShutdown();
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;
      const context = {
        request: new Request('http://localhost/rejected-during-shutdown'),
        set: {},
      } as { request: Request; set: { status?: number } };
      const requestHook = getHook(plugin.event.request?.[0], 'request');

      gracefulShutdownDecorator.store.begin({ reason: 'manual' });

      const response = requestHook.fn(context);

      expect(context.set.status).toBe(503);
      expect(response).toBe('Service Unavailable');
      expect(gracefulShutdownDecorator.store.activeRequestCount).toBe(0);
    });

    test('rejects requests with 503 after shutdown has completed', () => {
      const plugin = gracefulShutdown();
      const gracefulShutdownDecorator = plugin.decorator.gracefulShutdown;
      const context = {
        request: new Request('http://localhost/rejected-after-shutdown'),
        set: {},
      } as { request: Request; set: { status?: number } };
      const requestHook = getHook(plugin.event.request?.[0], 'request');

      gracefulShutdownDecorator.store.complete();

      const response = requestHook.fn(context);

      expect(context.set.status).toBe(503);
      expect(response).toBe('Service Unavailable');
      expect(gracefulShutdownDecorator.store.activeRequestCount).toBe(0);
    });
  });

  describe('signal lifecycle', () => {
    test('registers handlers on start and removes them on stop', async () => {
      const plugin = gracefulShutdown({ signals: ['SIGTERM'] });
      const registered = new Map<string, () => void>();
      const originalOn = process.on;
      const originalOff = process.off;

      const fakeApp = {
        stop: async () => undefined,
      };

      process.on = ((signal: NodeJS.Signals, handler: () => void) => {
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

    test('attempts app.stop even when shutdown hooks throw', async () => {
      const errors: Array<{ phase: 'shutdown' | 'stop'; error: unknown; signal?: string }> = [];
      const plugin = gracefulShutdown({
        signals: ['SIGTERM'],
        onShutdown: () => {
          throw new Error('cleanup failed');
        },
        onError: ({ phase, error, signal }) => {
          errors.push({ phase, error, signal });
        },
      });
      const registered = new Map<string, () => void>();
      const originalOn = process.on;
      const originalOff = process.off;
      let stopCalls = 0;

      const fakeApp = {
        stop: async () => {
          stopCalls += 1;
        },
      };

      process.on = ((signal: NodeJS.Signals, handler: () => void) => {
        registered.set(signal, handler);
        return process;
      }) as typeof process.on;

      process.off = ((signal: NodeJS.Signals) => {
        registered.delete(signal);
        return process;
      }) as typeof process.off;

      try {
        const startHook = getHook(plugin.event.start?.[0], 'start');

        await startHook.fn(fakeApp);

        const handler = registered.get('SIGTERM');

        expect(handler).toBeDefined();

        handler?.();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(errors).toHaveLength(1);
        expect(errors[0]?.phase).toBe('shutdown');
        expect(errors[0]?.signal).toBe('SIGTERM');
        expect(errors[0]?.error).toBeInstanceOf(Error);
        expect(stopCalls).toBe(1);
        expect(plugin.decorator.gracefulShutdown.store.state).toBe('completed');
      } finally {
        process.on = originalOn;
        process.off = originalOff;
      }
    });

    test('reports app.stop failures through onError', async () => {
      const errors: Array<{ phase: 'shutdown' | 'stop'; error: unknown; signal?: string }> = [];
      const plugin = gracefulShutdown({
        signals: ['SIGTERM'],
        onError: ({ phase, error, signal }) => {
          errors.push({ phase, error, signal });
        },
      });
      const registered = new Map<string, () => void>();
      const originalOn = process.on;
      const originalOff = process.off;

      const fakeApp = {
        stop: async () => {
          throw new Error('stop failed');
        },
      };

      process.on = ((signal: NodeJS.Signals, handler: () => void) => {
        registered.set(signal, handler);
        return process;
      }) as typeof process.on;

      process.off = ((signal: NodeJS.Signals) => {
        registered.delete(signal);
        return process;
      }) as typeof process.off;

      try {
        const startHook = getHook(plugin.event.start?.[0], 'start');

        await startHook.fn(fakeApp);

        const handler = registered.get('SIGTERM');

        expect(handler).toBeDefined();

        handler?.();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(errors).toHaveLength(1);
        expect(errors[0]?.phase).toBe('stop');
        expect(errors[0]?.signal).toBe('SIGTERM');
        expect(errors[0]?.error).toBeInstanceOf(Error);
      } finally {
        process.on = originalOn;
        process.off = originalOff;
      }
    });

    test('swallows errors thrown by onError to preserve fail-safe shutdown', async () => {
      const plugin = gracefulShutdown({
        signals: ['SIGTERM'],
        onShutdown: () => {
          throw new Error('cleanup failed');
        },
        onError: () => {
          throw new Error('reporting failed');
        },
      });
      const registered = new Map<string, () => void>();
      const originalOn = process.on;
      const originalOff = process.off;
      let stopCalls = 0;

      const fakeApp = {
        stop: async () => {
          stopCalls += 1;
        },
      };

      process.on = ((signal: NodeJS.Signals, handler: () => void) => {
        registered.set(signal, handler);
        return process;
      }) as typeof process.on;

      process.off = ((signal: NodeJS.Signals) => {
        registered.delete(signal);
        return process;
      }) as typeof process.off;

      try {
        const startHook = getHook(plugin.event.start?.[0], 'start');

        await startHook.fn(fakeApp);

        const handler = registered.get('SIGTERM');

        expect(handler).toBeDefined();

        handler?.();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(stopCalls).toBe(1);
      } finally {
        process.on = originalOn;
        process.off = originalOff;
      }
    });
  });
});
