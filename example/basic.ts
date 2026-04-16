import { Elysia } from 'elysia';
import { gracefulShutdown } from '../src';

const connections = new Set<string>();

const closeConnections = async () => {
  for (const id of connections) {
    console.log(`closing connection: ${id}`);
    connections.delete(id);
  }
};

const app = new Elysia()
  .use(
    gracefulShutdown({
      signals: ['SIGINT', 'SIGTERM'],
      timeout: 10_000,
      preShutdown: ({ signal }) => {
        console.log(`shutdown started by ${signal ?? 'manual trigger'}`);
      },
      onShutdown: async ({ reason }) => {
        console.log(`running cleanup for ${reason}`);
        await closeConnections();
      },
      finally: ({ timedOut, state }) => {
        console.log('shutdown finished', { timedOut, state });
      },
    }),
  )
  .get('/', () => 'hello graceful shutdown')
  .get('/connect/:id', ({ params }) => {
    connections.add(params.id);

    return {
      connected: params.id,
      activeConnections: connections.size,
    };
  });

app.listen(3000);

console.log('server listening on http://localhost:3000');
console.log('try GET /connect/demo and then press Ctrl+C');
