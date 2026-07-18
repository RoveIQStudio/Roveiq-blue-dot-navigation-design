import { getSDKConfig } from './types';

/**
 * Standardized error codes for the RoveMaps SDK
 */
export enum RoveErrorCode {
  // Permission Errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  // Availability Errors
  GEOLOCATION_UNSUPPORTED = 'GEOLOCATION_UNSUPPORTED',
  GPS_SIGNAL_LOST = 'GPS_SIGNAL_LOST',

  // Network/Context Errors
  INSECURE_CONTEXT = 'INSECURE_CONTEXT',
  TIMEOUT = 'TIMEOUT',

  // Input/Configuration Errors
  INVALID_COORDINATES = 'INVALID_COORDINATES',

  // Internal Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Context information for error telemetry
 */
export interface ErrorContext {
  /** SDK component where the error occurred */
  component: string;
  /** Action being performed when error occurred */
  action: string;
  /** Additional structured data */
  metadata?: Record<string, unknown>;
}

/**
 * Structured error class for RoveMaps SDK
 * Allows machine-readable error handling
 */
export class RoveError extends Error {
  public readonly code: RoveErrorCode;
  public readonly originalError?: unknown;
  public readonly context?: ErrorContext;

  constructor(
    code: RoveErrorCode,
    message: string,
    originalError?: unknown,
    context?: ErrorContext
  ) {
    super(message);
    this.name = 'RoveError';
    this.code = code;
    this.originalError = originalError;
    this.context = context;

    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, RoveError.prototype);
  }

  /**
   * Helper to determine if an error is a specific RoveError code
   */
  static is(error: unknown, code: RoveErrorCode): boolean {
    return error instanceof RoveError && error.code === code;
  }

  /**
   * Create and emit an error with telemetry
   *
   * This is the preferred way to create errors when you want them
   * reported to external services like Sentry or Datadog.
   *
   * @example
   * ```typescript
   * throw RoveError.emit(
   *   RoveErrorCode.PERMISSION_DENIED,
   *   'User denied location permission',
   *   { component: 'GeolocationProvider', action: 'requestPermission' }
   * );
   * ```
   */
  static emit(
    code: RoveErrorCode,
    message: string,
    context: ErrorContext,
    originalError?: unknown
  ): RoveError {
    const error = new RoveError(code, message, originalError, context);

    // Call telemetry hook if configured
    const config = getSDKConfig();
    if (config.onError) {
      try {
        config.onError(error, context);
      } catch {
        // Silently ignore telemetry errors to avoid cascading failures
      }
    }

    return error;
  }
}
