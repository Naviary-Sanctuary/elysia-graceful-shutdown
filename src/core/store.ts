import type { GracefulShutdownContext, GracefulShutdownReason, GracefulShutdownState, Signal } from '../types';

export class GracefulShutdownStore {
  state: GracefulShutdownState;
  reason?: GracefulShutdownReason;
  timedOut: boolean;
  signal?: Signal;
  startedAt?: number;

  private activeWorkCount: number;

  constructor() {
    this.state = 'idle';
    this.timedOut = false;
    this.activeWorkCount = 0;
  }

  canStart() {
    return this.state === 'idle';
  }

  begin({ reason, signal }: { reason: GracefulShutdownReason; signal?: Signal }) {
    this.state = 'shutting_down';
    this.reason = reason;
    this.signal = signal;
    this.timedOut = false;
    this.startedAt = Date.now();
  }

  markTimedOut() {
    this.timedOut = true;
  }

  startWork() {
    this.activeWorkCount += 1;
  }

  finishWork() {
    if (this.activeWorkCount > 0) {
      this.activeWorkCount -= 1;
    }
  }

  hasActiveWork() {
    return this.activeWorkCount > 0;
  }

  complete() {
    this.state = 'completed';
  }

  toContext(): GracefulShutdownContext {
    return {
      signal: this.signal,
      state: this.state,
      reason: this.reason!,
      timedOut: this.timedOut,
      startedAt: this.startedAt!,
    };
  }
}
