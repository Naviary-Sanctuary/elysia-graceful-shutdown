# elysia-graceful-shutdown

Graceful shutdown plugin for Elysia.

This plugin helps your Elysia app shut down in a predictable way when it receives termination signals such as SIGTERM or SIGINT.

It provides:

- signal handling
- shutdown lifecycle hooks
- timeout-based shutdown flow

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Shutdown Flow](#shutdown-flow)
- [Options](#options)
  - [`signals`](#signals)
  - [`timeout`](#timeout)
  - [`preShutdown(context)`](#preshutdowncontext)
  - [`onShutdown(context)`](#onshutdowncontext)
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
      timeout: 30_000,
      preShutdown: () => {
        console.log('shutdown begin');
      },
      onShutdown: async () => {
        await db.destroy();
      },
      finally: async ({ timedOut, signal }) => {
        console.log('shutdown finished', { timedOut, signal });
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

    Note over S: (4) begin shutdown flow
    Note over S: stop accepting new incoming work

    C->>S: Request during shutdown
    S-->>C: Rejected / unavailable

    Note over S: (5) wait for active work to complete

    S->>S: (6) onShutdown()
    S->>S: (7) finally()

    Note over S: (8) process terminates naturally
```

## Options

### `signals`

Signals that trigger the shutdown flow.

Deafult:

```typescript
['SIGTERM', 'SIGINT'];
```

### `timeout`

Maximum time allowed for the shutdown flow, in milliseconds

Default:

```typescript
30_000; // 30 seconds
```

### `preShutdown(context)`

Runs at the beginning of the shutdown flow.

Use this when you need to perform very early shutdown work before the main cleanup phase.

Examples:

- marming internal state as shutting down
- stopping schedulers
- preparing the app for connection draining
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

Runs during the main cleanup phase.

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

### `finally(context)`

Runs at the end of the shutdown flow.

Use this for short final work such as:

- final logging
- metrics markers
- lightweight finalization

This hook may run whether shutdown completed normally or timed out.

```typescript
new Elysia().use(
  gracefulShutdown({
    finally: async ({ timedOut, signal }) => {
      console.log('Shutdown finished');
      console.log('Shutdown timed out: ', timedOut);
      console.log('Shutdown Signal: ', signal);
    },
  }),
);
```
