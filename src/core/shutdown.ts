import type { GracefulShutdownOptions, GracefulShutdownReason, Signal } from '../types';
import type { GracefulShutdownStore } from './store';

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

    await store.wait();

    await options.onShutdown?.(store.toContext());
  } finally {
    store.complete();

    await options.finally?.(store.toContext());
  }
}
