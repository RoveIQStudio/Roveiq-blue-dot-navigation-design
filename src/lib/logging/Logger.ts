/**
 * Logger - Configurable logging system for the SDK
 *
 * Provides structured logging with levels, components, and custom handlers
 * for integration with external services (Sentry, Datadog, etc.)
 */

import { getSDKConfig } from '../types';

export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface LogEntry {
  /** Log severity level */
  level: LogLevel;
  /** Human-readable message */
  message: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** SDK component that generated the log */
  component: string;
  /** Optional structured data */
  data?: unknown;
}

export interface LoggerOptions {
  /**
   * Minimum level to output
   * @default 'warn'
   */
  level?: LogLevel;

  /**
   * Prefix for console output
   * @default 'RoveBeacon'
   */
  prefix?: string;

  /**
   * Custom log handler for external services
   * Called for every log entry that passes the level filter
   */
  onLog?: (entry: LogEntry) => void;

  /**
   * Disable console output (useful when using custom handler only)
   * @default the SDK's `productionMode` config (silent in production)
   */
  silent?: boolean;
}

/**
 * Structured logger with configurable levels and custom handlers
 *
 * @example
 * ```typescript
 * import { logger, Logger } from 'rovemaps-you-are-here';
 *
 * // Use global logger
 * logger.setLevel('debug');
 * logger.info('GPS', 'Location updated', { lat: 40.7, lng: -74.0 });
 *
 * // Create custom logger for Sentry integration
 * const customLogger = new Logger({
 *   level: 'error',
 *   onLog: (entry) => {
 *     Sentry.captureMessage(entry.message, {
 *       level: entry.level,
 *       extra: entry.data,
 *     });
 *   },
 * });
 * ```
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;
  private onLog?: (entry: LogEntry) => void;
  /**
   * Explicit silent override. When undefined, the effective silent state is
   * derived lazily from the SDK's `productionMode` at output time (see
   * `isSilent`). Storing only the explicit value — rather than resolving it in
   * the constructor — is what lets the pre-built `logger` singleton respect a
   * `configureSDK({ productionMode })` call that happens after module load.
   */
  private explicitSilent?: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'warn';
    this.prefix = options.prefix ?? 'RoveBeacon';
    this.onLog = options.onLog;
    this.explicitSilent = options.silent;
  }

  /**
   * Resolve the effective silent state. An explicit `silent` option/override
   * always wins; otherwise fall back to the SDK's `productionMode`, evaluated
   * at output time so late configuration is honored.
   */
  private isSilent(): boolean {
    return this.explicitSilent ?? getSDKConfig().productionMode ?? false;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    component: string,
    message: string,
    data?: unknown
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      component,
      data,
    };

    // Custom handler
    this.onLog?.(entry);

    // Console output (unless silent)
    if (!this.isSilent()) {
      const formatted = `[${this.prefix}:${component}] ${message}`;
      switch (level) {
        case 'error':
          console.error(formatted, data !== undefined ? data : '');
          break;
        case 'warn':
          console.warn(formatted, data !== undefined ? data : '');
          break;
        case 'info':
          console.info(formatted, data !== undefined ? data : '');
          break;
        case 'debug':
          console.log(formatted, data !== undefined ? data : '');
          break;
      }
    }
  }

  /**
   * Log an error message
   */
  error(component: string, message: string, data?: unknown): void {
    this.log('error', component, message, data);
  }

  /**
   * Log a warning message
   */
  warn(component: string, message: string, data?: unknown): void {
    this.log('warn', component, message, data);
  }

  /**
   * Log an info message
   */
  info(component: string, message: string, data?: unknown): void {
    this.log('info', component, message, data);
  }

  /**
   * Log a debug message
   */
  debug(component: string, message: string, data?: unknown): void {
    this.log('debug', component, message, data);
  }

  /**
   * Change the log level at runtime
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Set a custom log handler
   */
  setHandler(handler: ((entry: LogEntry) => void) | undefined): void {
    this.onLog = handler;
  }

  /**
   * Enable/disable console output.
   * Sets an explicit override that takes precedence over the SDK's
   * `productionMode`.
   */
  setSilent(silent: boolean): void {
    this.explicitSilent = silent;
  }

  /**
   * Create a child logger with a fixed component name
   */
  child(component: string): ComponentLogger {
    return new ComponentLogger(this, component);
  }
}

/**
 * Child logger bound to a specific component
 * Simplifies logging by not requiring component on every call
 */
export class ComponentLogger {
  constructor(
    private parent: Logger,
    private component: string
  ) {}

  error(message: string, data?: unknown): void {
    this.parent.error(this.component, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.parent.warn(this.component, message, data);
  }

  info(message: string, data?: unknown): void {
    this.parent.info(this.component, message, data);
  }

  debug(message: string, data?: unknown): void {
    this.parent.debug(this.component, message, data);
  }
}

/**
 * Global logger instance
 * Configure this once at app startup
 */
export const logger = new Logger();
