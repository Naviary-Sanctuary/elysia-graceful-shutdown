import type { GracefulShutdownContext, GracefulShutdownReason, GracefulShutdownState, Signal } from '../types';

export class GracefulShutdownStore {
  state: GracefulShutdownState;
  reason?: GracefulShutdownReason;
  signal?: Signal;
  startedAt?: number;

  constructor() {
    this.state = 'idle';
  }

  canStart() {
    return this.state === 'idle';
  }

  begin({ reason, signal }: { reason: GracefulShutdownReason; signal?: Signal }) {
    this.state = 'shutting_down';
    this.reason = reason;
    this.signal = signal;
    this.startedAt = Date.now();
  }

  complete() {
    this.state = 'completed';
  }

  toContext(): GracefulShutdownContext {
    return {
      signal: this.signal,
      state: this.state,
      reason: this.reason!,
      startedAt: this.startedAt!,
    };
  }
}
