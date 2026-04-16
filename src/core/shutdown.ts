import type { GracefulShutdownOptions, GracefulShutdownReason, Signal } from '../types';
import type { GracefulShutdownStore } from './store';

const DEFAULT_TIMEOUT = 30_000;

async function waitForActiveWorkToFinish(store: GracefulShutdownStore, timeout: number) {
  const until = Date.now() + timeout;

  while (store.hasActiveWork()) {
    if (Date.now() >= until) {
      store.markTimedOut();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function shutdown({
  store,
  options,
  reason,
  signal,
}: {
  store: GracefulShutdownStore;
  options: GracefulShutdownOptions;
  reason: GracefulShutdownReason;
  signal?: Signal;
}) {
  if (!store.canStart()) return;

  store.begin({ reason, signal });

  try {
    await options.preShutdown?.(store.toContext());

    await waitForActiveWorkToFinish(store, options.timeout ?? DEFAULT_TIMEOUT);

    await options.onShutdown?.(store.toContext());
  } finally {
    store.complete();

    await options.finally?.(store.toContext());
  }
}
