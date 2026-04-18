# elysia-graceful-shutdown

Graceful shutdown plugin for Elysia.

This plugin helps your Elysia app shut down in a predictable way when it receives termination signals such as SIGTERM or SIGINT.

It provides:

- signal handling
- shutdown lifecycle hooks
- in-flight request draining before cleanup

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Shutdown Flow](#shutdown-flow)
- [Options](#options)
  - [`signals`](#signals)
  - [`drainTimeout`](#draintimeout)
  - [`preShutdown(context)`](#preshutdowncontext)
  - [`onShutdown(context)`](#onshutdowncontext)
  - [`onError(context)`](#onerrorcontext)
  - [`finally(context)`](#finallycontext)

## Installation

```bash
bun add elysia-graceful-shutdown
```

## Usage

```typescript
import { Elysia } from 'elysia';
import { gracefulShutdown } from 'elysia-graceful-shutdown';

const app = new Elysia()
  .use(
    gracefulShutdown({
      signals: ['SIGTERM', 'SIGINT'],
      drainTimeout: 10000,
      preShutdown: ({ activeRequestCount }) => {
        console.log('shutdown begin', { activeRequestCount });
      },
      onShutdown: async ({ activeRequestCount }) => {
        console.log('all in-flight requests finished', { activeRequestCount });
        await db.destroy();
      },
      finally: async ({ signal, state, activeRequestCount }) => {
        console.log('shutdown finished', { signal, state, activeRequestCount });
      },
    }),
  )
  .get('/', () => 'hello');

app.listen(3000);
```

## Shutdown Flow

```mermaid
sequenceDiagram
    participant P as Parent Process
    participant S as Elysia Server
    participant C as Client

    Note over S,C: (1) Server is running normally

    C->>S: Request
    S-->>C: Response

    P->>S: (2) SIGINT / SIGTERM
    Note over S: shutdown initiated

    S->>S: (3) preShutdown()
    Note over S: state changes to shutting_down

    Note over S: (4) reject new incoming requests

    C->>S: Request during shutdown
    S-->>C: Rejected / unavailable

    Note over S: (5) wait for in-flight requests to finish
    Note over S: continue after drainTimeout if requests are still running

    S->>S: (6) onShutdown()
    S->>S: (7) finally()

    Note over S: (8) process terminates naturally
```

The shutdown hooks receive `activeRequestCount`, which reflects the number of
tracked in-flight HTTP requests at that phase of the shutdown flow.

For runnable demos, see `example/request-drain.ts` and `example/request-timeout.ts`.

## Options

### `signals`

Signals that trigger the shutdown flow.

Deafult:

```typescript
['SIGTERM', 'SIGINT'];
```

### `drainTimeout`

Maximum time to wait for tracked in-flight HTTP requests to drain before the
shutdown flow continues.

Value is in milliseconds.

Default:

```typescript
30_000; // 30 seconds
```

```typescript
new Elysia().use(
  gracefulShutdown({
    drainTimeout: 30_000,
  }),
);
```

### `preShutdown(context)`

Runs at the beginning of the shutdown flow.

Use this when you need to perform very early shutdown work before the plugin
waits for tracked in-flight requests to drain and before the main cleanup phase.

Examples:

- marming internal state as shutting down
- stopping schedulers
- preparing the app for shutdown
- loggin shutdown start

```typescript
new Elysia().use(
  gracefulShutdown({
    preShutdown: (context) => {
      console.log('Shutdown begin');
      console.log('Shutdown Signal: ', context.signal);
    },
  }),
);
```

### `onShutdown(context)`

Runs during the main cleanup phase, after tracked in-flight requests have
finished or after the configured `drainTimeout` has elapsed.

Use this for resource cleanup such as:

- Closing database connections
- Disconnecting Redis
- Stoping queue consumeer
- Shutting down background workers

```typescript
new Elysia().use(
  gracefulShutdown({
    onShutdown: async (context) => {
      console.log('Clean up');
      await datasource.destroy();
      await eventStore.end();
    },
  }),
);
```

### `onError(context)`

Runs when the plugin catches an error during signal-driven shutdown.

Use this to forward shutdown failures to your application's logger or
observability pipeline instead of letting the plugin write directly to stderr.

```typescript
new Elysia().use(
  gracefulShutdown({
    onError: ({ phase, error, signal }) => {
      logger.error('graceful shutdown failed', {
        phase,
        signal,
        error,
      });
    },
  }),
);
```

### `finally(context)`

Runs at the end of the shutdown flow.

Use this for short final work such as:

- final logging
- metrics markers
- lightweight finalization

```typescript
new Elysia().use(
  gracefulShutdown({
    finally: async ({ signal, state }) => {
      console.log('Shutdown finished');
      console.log('Shutdown state: ', state);
      console.log('Shutdown Signal: ', signal);
    },
  }),
);
```
