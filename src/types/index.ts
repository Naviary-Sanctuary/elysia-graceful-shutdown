/**
 * OS signal name used to trigger graceful shutdown.
 *
 * Relies on process signals such as `SIGINT` and `SIGTERM`.
 */
export type Signal = NodeJS.Signals;

/**
 * Current lifecycle state of the graceful shutdown procedure.
 *
 * - `idle`: shutdown has not started yet
 * - `shutting_down`: shutdown is currently in progress
 * - `completed`: shutdown flow has completed
 */
export type GracefulShutdownState = 'idle' | 'shutting_down' | 'completed';

/**
 * Reason why the shutdown flow started.
 *
 * - `signal`: shutdown started from an OS signal
 * - `manual`: shutdown started programmatically
 */
export type GracefulShutdownReason = 'signal' | 'manual';

/**
 * Context object passed to graceful shutdown lifecycle hooks.
 */
export type GracefulShutdownContext = {
  /**
   * Process signal that triggered shutdown.
   *
   * This is expected to be present when shutdown starts from a signal.
   */
  signal?: Signal;

  /**
   * Current lifecycle state of the shutdown flow.
   */
  state: GracefulShutdownState;

  /**
   * Reason why shutdown started.
   */
  reason: GracefulShutdownReason;

  /**
   * Unix timestamp in milliseconds for when shutdown started.
   */
  startedAt: number;
};

/**
 * Error details emitted when the plugin encounters a shutdown failure.
 */
export type GracefulShutdownErrorContext = {
  /**
   * Phase where the failure happened.
   */
  phase: 'shutdown' | 'stop';

  /**
   * The original failure value.
   */
  error: unknown;

  /**
   * The signal that triggered shutdown, if any.
   */
  signal?: Signal;
};

/**
 * Options for configuring the graceful shutdown plugin.
 */
export type GracefulShutdownOptions = {
  /**
   * Signals that should trigger graceful shutdown.
   *
   * @default ['SIGTERM', 'SIGINT']
   */
  signals?: Signal[];

  /**
   * Called when the plugin catches an error during signal-driven shutdown.
   *
   * This lets the host application decide how shutdown failures should be
   * reported instead of the plugin writing directly to stdout/stderr.
   */
  onError?: (context: GracefulShutdownErrorContext) => void;

  /**
   * Hook that runs at the beginning of the shutdown flow.
   *
   * @example
   *
   * gracefulShutdown({
   *   preShutdown: (context) => {
   *     console.log('Shutdown begin');
   *     console.log('Shutdown Signal: ', context.signal);
   *   },
   * })
   */
  preShutdown?: (context: GracefulShutdownContext) => void | Promise<void>;

  /**
   * Hook that runs during the main cleanup phase.
   *
   * @example
   *
   * gracefulShutdown({
   *   onShutdown: async (context) => {
   *     console.log('Clean up');
   *     await datasource.destroy();
   *     await eventStore.end();
   *   },
   * })
   */
  onShutdown?: (context: GracefulShutdownContext) => void | Promise<void>;

  /**
   * Hook that runs at the end of the shutdown flow.
   *
   * @example
   *
   * gracefulShutdown({
   *   finally: async ({ signal, state }) => {
   *     console.log('Shutdown finished');
   *     console.log('Shutdown state: ', state);
   *     console.log('Shutdown Signal: ', signal);
   *   },
   * })
   */
  finally?: (context: GracefulShutdownContext) => void | Promise<void>;
};
