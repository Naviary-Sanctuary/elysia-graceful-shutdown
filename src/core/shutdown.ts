import type { GracefulShutdownOptions, GracefulShutdownReason, Signal } from '../types';
import type { GracefulShutdownStore } from './store';

const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;

async function waitForDrain(store: GracefulShutdownStore, timeout: number) {
  if (timeout <= 0) return;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      store.waitActivatedRequest(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
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

    await waitForDrain(store, options.drainTimeout ?? DEFAULT_DRAIN_TIMEOUT_MS);

    await options.onShutdown?.(store.toContext());
  } finally {
    store.complete();

    await options.finally?.(store.toContext());
  }
}
