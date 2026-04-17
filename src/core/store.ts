import type { GracefulShutdownContext, GracefulShutdownReason, GracefulShutdownState, Signal } from '../types';

export class GracefulShutdownStore {
  state: GracefulShutdownState;
  reason?: GracefulShutdownReason;
  signal?: Signal;
  startedAt?: number;
  activeRequestCount: number;
  private nextRequestToken: number;
  private readonly activeRequestTokens: Set<number>;
  private idleResolvers: Array<() => void>;

  constructor() {
    this.state = 'idle';
    this.activeRequestCount = 0;
    this.nextRequestToken = 0;
    this.activeRequestTokens = new Set<number>();
    this.idleResolvers = [];
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

  startRequest() {
    const token = ++this.nextRequestToken;

    this.activeRequestTokens.add(token);
    this.activeRequestCount += 1;

    return token;
  }

  finishRequest(token?: number) {
    if (token === undefined) return false;
    if (!this.activeRequestTokens.has(token)) return false;

    this.activeRequestTokens.delete(token);
    this.activeRequestCount -= 1;

    if (this.activeRequestCount === 0) {
      const resolvers = this.idleResolvers;
      this.idleResolvers = [];

      for (const resolve of resolvers) resolve();
    }

    return true;
  }

  wait() {
    if (this.activeRequestCount === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  toContext(): GracefulShutdownContext {
    if (this.reason === undefined || this.startedAt === undefined) {
      throw new Error('Shutdown context is not available before shutdown begins');
    }

    return {
      signal: this.signal,
      state: this.state,
      reason: this.reason,
      startedAt: this.startedAt,
      activeRequestCount: this.activeRequestCount,
    };
  }
}
