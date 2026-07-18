import type {
  GeolocationOptions,
  LocationData,
  PermissionState,
  GeolocationEvents
} from './types';
import { getSDKConfig, sdkWarn, sdkDebug } from './types';
import { RoveError, RoveErrorCode } from './errors';
import type { LocationSource } from './sources';

type EventCallback<K extends keyof GeolocationEvents> = (data: GeolocationEvents[K]) => void;

/** Maximum number of listeners per event before warning */
const MAX_LISTENERS_WARNING = 10;

/** Default minimum interval between location updates in ms (throttling) */
const DEFAULT_MIN_UPDATE_INTERVAL_MS = 100;

const DEFAULT_OPTIONS: Required<GeolocationOptions> = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10000,
  maxUpdateRate: 10,
};

/**
 * GeolocationProvider - Wraps browser geolocation API with events and permission handling
 *
 * Features:
 * - Event-based location updates with proper TypeScript types
 * - Permission state tracking (where browser supports it)
 * - Automatic throttling of rapid updates (100ms minimum interval)
 * - Protection against concurrent start() calls
 * - Memory leak prevention with max listener warnings
 * - Last known position storage
 */
export class GeolocationProvider implements LocationSource {
  private options: Required<GeolocationOptions>;
  private watchId: number | null = null;
  private permissionState: PermissionState = 'prompt';
  private updateCount = 0;
  private permissionStatus: PermissionStatus | null = null;
  private lastLocation: LocationData | null = null;
  private lastUpdateTime = 0;
  private isDisposed = false;
  private isMocking = false; // When true, mock locations are active
  private mockIntervalId: ReturnType<typeof setInterval> | null = null;

  // Promise-based mutex for concurrent start() protection
  private startPromise: Promise<void> | null = null;

  // Visibility state management
  private isPaused = false;
  private boundHandleVisibilityChange: (() => void) | null = null;

  // Properly typed event listeners
  private listeners: {
    update: Set<EventCallback<'update'>>;
    error: Set<EventCallback<'error'>>;
    permissionChange: Set<EventCallback<'permissionChange'>>;
    deviceOrientation: Set<EventCallback<'deviceOrientation'>>;
    resume: Set<EventCallback<'resume'>>;
  } = {
      update: new Set(),
      error: new Set(),
      permissionChange: new Set(),
      deviceOrientation: new Set(),
      resume: new Set(),
    };

  constructor(options: GeolocationOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.setupVisibilityListener();
  }

  /**
   * Setup listener for page visibility changes
   * Pauses location updates when tab is hidden to save battery
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    this.boundHandleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.pause();
      } else if (document.visibilityState === 'visible') {
        this.resume();
      }
    };

    document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);
  }

  /**
   * Pause location tracking (called when tab hidden)
   * Preserves state so it can be resumed
   */
  private pause(): void {
    if (this.isPaused || this.watchId === null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    this.isPaused = true;
    sdkDebug('GeolocationProvider: Pausing due to visibility change');

    // Stop the watch but preserve the watchId marker
    navigator.geolocation.clearWatch(this.watchId);
  }

  /**
   * Resume location tracking (called when tab visible)
   */
  private resume(): void {
    if (!this.isPaused) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    this.isPaused = false;
    sdkDebug('GeolocationProvider: Resuming after visibility change');

    // Emit resume event so listeners can reset staleness timers
    this.emit('resume', undefined as void);

    // Restart watching
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionUpdate(position),
      (error) => this.handlePositionError(error),
      {
        enableHighAccuracy: this.options.enableHighAccuracy,
        maximumAge: this.options.maximumAge,
        timeout: this.options.timeout,
      }
    );
  }

  /**
   * Check if tracking is currently paused (tab hidden)
   */
  isPausedForVisibility(): boolean {
    return this.isPaused;
  }

  /**
   * Request permission for iOS 13+ DeviceOrientation events
   * Must be called from a user interaction (click/tap) handler
   * @deprecated Use the instance method requestDeviceOrientationPermission() instead
   */
  static async requestDeviceOrientationPermission(): Promise<PermissionState> {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      (DeviceOrientationEvent as any).requestPermission
    ) {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        return response === 'granted' ? 'granted' : 'denied';
      } catch (error) {
        sdkWarn('Error requesting device orientation permission:', error);
        return 'denied';
      }
    }
    return 'granted'; // Non-iOS or older devices don't need permission
  }

  /**
   * Request permission for iOS 13+ DeviceOrientation events
   * Must be called from a user interaction (click/tap) handler
   *
   * @returns Promise resolving to the permission state ('granted' or 'denied')
   */
  async requestDeviceOrientationPermission(): Promise<PermissionState> {
    return GeolocationProvider.requestDeviceOrientationPermission();
  }

  private handleDeviceOrientation = (event: DeviceOrientationEvent) => {
    this.emit('deviceOrientation', event);
  };

  /**
   * Start watching device orientation (compass)
   */
  startDeviceOrientation(): void {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('deviceorientation', this.handleDeviceOrientation);
    }
  }

  /**
   * Stop watching device orientation
   */
  stopDeviceOrientation(): void {
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    }
  }

  /**
   * Subscribe to events
   * @returns Unsubscribe function
   */
  on<K extends keyof GeolocationEvents>(
    event: K,
    callback: EventCallback<K>
  ): () => void {
    if (this.isDisposed) {
      sdkWarn('GeolocationProvider: Cannot add listener to disposed instance');
      return () => { /* no-op */ };
    }

    const listenerSet = this.listeners[event] as Set<EventCallback<K>>;

    // Warn if too many listeners (possible memory leak)
    if (listenerSet.size >= MAX_LISTENERS_WARNING) {
      sdkWarn(
        `GeolocationProvider: Possible memory leak detected. ` +
        `${listenerSet.size + 1} "${event}" listeners added. ` +
        `Consider removing unused listeners.`
      );
    }

    listenerSet.add(callback);

    // Return unsubscribe function
    return () => {
      listenerSet.delete(callback);
    };
  }

  /**
   * Remove event listener
   */
  off<K extends keyof GeolocationEvents>(
    event: K,
    callback: EventCallback<K>
  ): void {
    const listenerSet = this.listeners[event] as Set<EventCallback<K>>;
    listenerSet.delete(callback);
  }

  /**
   * Remove all listeners for an event, or all events if no event specified
   */
  removeAllListeners(event?: keyof GeolocationEvents): void {
    if (event) {
      this.listeners[event].clear();
    } else {
      this.listeners.update.clear();
      this.listeners.error.clear();
      this.listeners.permissionChange.clear();
      this.listeners.deviceOrientation.clear();
      this.listeners.resume.clear();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event: keyof GeolocationEvents): number {
    return this.listeners[event].size;
  }

  private emit<K extends keyof GeolocationEvents>(
    event: K,
    data: GeolocationEvents[K]
  ): void {
    if (this.isDisposed) return;

    const listenerSet = this.listeners[event] as Set<EventCallback<K>>;
    // Create array copy to safely iterate (listeners might remove themselves)
    const callbacks = Array.from(listenerSet);
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (err) {
        sdkWarn(`GeolocationProvider: Error in "${event}" listener:`, err);
      }
    }
  }

  private setPermissionState(state: PermissionState): void {
    if (this.permissionState !== state) {
      this.permissionState = state;
      this.emit('permissionChange', state);
    }
  }

  /**
   * Check if geolocation is available in this browser
   */
  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  /**
   * Check if running on HTTPS (required for geolocation in modern browsers)
   */
  isSecureContext(): boolean {
    if (typeof window === 'undefined') return false;
    // localhost is considered secure for development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return true;
    }
    return window.location.protocol === 'https:';
  }

  /**
   * Get current permission state
   */
  getPermissionState(): PermissionState {
    return this.permissionState;
  }

  /**
   * Get number of location updates received
   */
  getUpdateCount(): number {
    return this.updateCount;
  }

  /**
   * Get the last received location (null if no updates yet)
   */
  getLastLocation(): LocationData | null {
    return this.lastLocation;
  }

  /**
   * Start watching location
   * Returns a promise that resolves when permission is granted or rejects on error
   *
   * Thread-safe: concurrent calls will return the same promise
   */
  async start(): Promise<void> {
    // Already disposed
    if (this.isDisposed) {
      throw new Error('GeolocationProvider: Cannot start disposed instance');
    }

    // Already watching - no-op
    if (this.watchId !== null && !this.isPaused) {
      return;
    }

    // If resuming from paused state, just resume
    if (this.isPaused) {
      this.resume();
      return;
    }

    // Promise-based mutex: if start is already in progress, return the same promise
    if (this.startPromise !== null) {
      return this.startPromise;
    }

    // Create the start promise
    this.startPromise = this.doStart();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Internal start implementation
   */
  private async doStart(): Promise<void> {
    if (!this.isAvailable()) {
      this.setPermissionState('unavailable');
      const error = new RoveError(
        RoveErrorCode.GEOLOCATION_UNSUPPORTED,
        'Geolocation is not supported by this browser'
      );
      this.emit('error', error);
      throw error;
    }

    // Check HTTPS requirement
    if (!this.isSecureContext()) {
      const error = new RoveError(
        RoveErrorCode.INSECURE_CONTEXT,
        'Geolocation requires HTTPS in modern browsers.'
      );
      // We warn but don't hard-fail immediately as localhost might pass isSecureContext check differently in some envs
      // or user might be on a weird browser. But most likely it will fail.
      sdkWarn(error.message);
    }

    // Check permission status if Permissions API is available
    await this.setupPermissionListener();

    this.setPermissionState('requesting');

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const clearOrphanedWatch = () => {
        if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.clearWatch(this.watchId);
          this.watchId = null;
        }
      };

      // Give the browser its full configured timeout, plus a grace period,
      // before declaring the start dead.
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearOrphanedWatch();
          const error = new RoveError(
            RoveErrorCode.TIMEOUT,
            'Geolocation start timed out'
          );
          this.emit('error', error);
          reject(error);
        }
      }, this.options.timeout + 1000);

      const id = navigator.geolocation.watchPosition(
        (position) => {
          this.handlePositionUpdate(position);

          // Resolve on first successful position
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
        },
        (error) => {
          this.handlePositionError(error);

          // Reject if this is the first callback (permission denied or other error).
          // The watch is dead for our purposes — clear it so isWatching() is
          // truthful and a later start() can retry.
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            clearOrphanedWatch();
            let code = RoveErrorCode.INTERNAL_ERROR;
            if (error.code === error.PERMISSION_DENIED) code = RoveErrorCode.PERMISSION_DENIED;
            else if (error.code === error.TIMEOUT) code = RoveErrorCode.TIMEOUT;
            else if (error.code === error.POSITION_UNAVAILABLE) code = RoveErrorCode.GPS_SIGNAL_LOST;

            reject(new RoveError(code, error.message, error));
          }
        },
        {
          enableHighAccuracy: this.options.enableHighAccuracy,
          maximumAge: this.options.maximumAge,
          timeout: this.options.timeout,
        }
      );

      // watchPosition may invoke a callback synchronously (e.g. an immediate
      // permission-denied on the first tick). If we were already settled before
      // the id came back, the watch we just created is orphaned — clearOrphanedWatch()
      // ran while this.watchId was still null and no-oped. Clear it here so
      // isWatching() stays truthful and a later start() can retry; only adopt the
      // id when the start is still pending.
      if (resolved) {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.clearWatch(id);
        }
      } else {
        this.watchId = id;
      }
    });
  }

  /**
   * Setup permission status listener (if Permissions API is available)
   */
  private async setupPermissionListener(): Promise<void> {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });

      if (result.state === 'denied') {
        this.setPermissionState('denied');
        const error = new RoveError(RoveErrorCode.PERMISSION_DENIED, 'Location permission previously denied');
        this.emit('error', error);
        throw error;
      }

      // Clean up previous listener if exists
      if (this.permissionStatus) {
        this.permissionStatus.onchange = null;
      }

      // Store reference for cleanup and listen for permission changes
      this.permissionStatus = result;
      result.onchange = () => {
        if (this.isDisposed) return;

        if (result.state === 'granted') {
          this.setPermissionState('granted');
        } else if (result.state === 'denied') {
          this.setPermissionState('denied');
          this.stop();
        }
      };
    } catch (e) {
      if (e instanceof RoveError) throw e;
      // Permissions API not fully supported or other error
      // Continue without permission state tracking
    }
  }

  /**
   * Get minimum update interval based on maxUpdateRate option
   */
  private get minUpdateInterval(): number {
    const maxRate = this.options.maxUpdateRate;
    // Convert rate (updates/sec) to interval (ms), with minimum floor
    return Math.max(DEFAULT_MIN_UPDATE_INTERVAL_MS, 1000 / maxRate);
  }

  /**
   * Handle position update with throttling
   */
  private handlePositionUpdate(position: GeolocationPosition): void {
    const now = Date.now();

    // Throttle updates to prevent performance issues on devices that fire rapidly
    if (now - this.lastUpdateTime < this.minUpdateInterval && this.updateCount > 0) {
      return;
    }

    this.lastUpdateTime = now;
    this.setPermissionState('granted');
    this.updateCount++;

    const locationData: LocationData = {
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      timestamp: position.timestamp,
    };

    this.lastLocation = locationData;
    this.emit('update', locationData);
  }

  /**
   * Handle position error
   */
  private handlePositionError(error: GeolocationPositionError): void {
    let roveError: RoveError;

    switch (error.code) {
      case error.PERMISSION_DENIED:
        this.setPermissionState('denied');
        roveError = new RoveError(
          RoveErrorCode.PERMISSION_DENIED,
          'Location permission denied by user',
          error
        );
        break;
      case error.POSITION_UNAVAILABLE:
        roveError = new RoveError(
          RoveErrorCode.GPS_SIGNAL_LOST,
          'Location unavailable',
          error
        );
        break;
      case error.TIMEOUT:
        roveError = new RoveError(
          RoveErrorCode.TIMEOUT,
          'Location request timed out',
          error
        );
        break;
      default:
        roveError = new RoveError(
          RoveErrorCode.INTERNAL_ERROR,
          error.message,
          error
        );
    }

    this.emit('error', roveError);
  }

  /**
   * Stop watching location
   */
  stop(): void {
    if (this.watchId !== null) {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
    }
    // A stopped provider must not auto-resume on the next visibility change.
    this.isPaused = false;
  }

  /**
   * Get current position once (not continuous tracking)
   */
  async getCurrentPosition(): Promise<LocationData> {
    if (this.isDisposed) {
      throw new RoveError(RoveErrorCode.INTERNAL_ERROR, 'Cannot use disposed instance');
    }

    if (!this.isAvailable()) {
      throw new RoveError(RoveErrorCode.GEOLOCATION_UNSUPPORTED, 'Geolocation not available');
    }

    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new RoveError(RoveErrorCode.GEOLOCATION_UNSUPPORTED, 'Geolocation not available'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            longitude: position.coords.longitude,
            latitude: position.coords.latitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            timestamp: position.timestamp,
          };
          this.lastLocation = locationData;
          resolve(locationData);
        },
        (error) => {
          let code = RoveErrorCode.INTERNAL_ERROR;
          if (error.code === error.PERMISSION_DENIED) code = RoveErrorCode.PERMISSION_DENIED;
          else if (error.code === error.TIMEOUT) code = RoveErrorCode.TIMEOUT;
          else if (error.code === error.POSITION_UNAVAILABLE) code = RoveErrorCode.GPS_SIGNAL_LOST;

          reject(new RoveError(code, error.message, error));
        },
        {
          enableHighAccuracy: this.options.enableHighAccuracy,
          maximumAge: this.options.maximumAge,
          timeout: this.options.timeout,
        }
      );
    });
  }

  /**
   * Check if currently watching
   */
  isWatching(): boolean {
    return this.watchId !== null || this.isMocking;
  }

  /**
   * Check if mock mode is active
   */
  isMockMode(): boolean {
    return this.isMocking;
  }

  /**
   * Set a mock location for testing/demo purposes
   * This emits a location update event with the provided coordinates
   *
   * Note: Disabled when SDK is in production mode
   *
   * @param location The mock location data
   * @example
   * ```typescript
   * geo.setMockLocation({
   *   longitude: -74.006,
   *   latitude: 40.7128,
   *   altitude: 10,
   *   accuracy: 5,
   *   speed: 1.5,
   *   heading: 90,
   *   timestamp: Date.now()
   * });
   * ```
   */
  setMockLocation(location: LocationData): void {
    if (this.isDisposed) {
      sdkWarn('GeolocationProvider: Cannot set mock location on disposed instance');
      return;
    }

    // Disable mock mode in production
    if (getSDKConfig().productionMode) {
      sdkWarn('GeolocationProvider: Mock location disabled in production mode');
      return;
    }

    this.isMocking = true;
    this.setPermissionState('granted');

    // Simulate the position update flow
    const now = Date.now();
    this.lastUpdateTime = now;
    this.updateCount++;

    // Use provided timestamp or current time
    const locationWithTimestamp: LocationData = {
      ...location,
      timestamp: location.timestamp ?? now
    };

    this.lastLocation = locationWithTimestamp;
    this.emit('update', locationWithTimestamp);
  }

  /**
   * Start a mock location simulation that moves along a path
   * Useful for demos and testing movement scenarios
   *
   * Note: Disabled when SDK is in production mode
   *
   * @param locations Array of locations to cycle through
   * @param intervalMs Time between location updates in milliseconds (default: 1000)
   * @returns Function to stop the simulation
   *
   * @example
   * ```typescript
   * const stopMock = geo.startMockPath([
   *   { longitude: -74.006, latitude: 40.7128, accuracy: 5, speed: 1.5, heading: 90 },
   *   { longitude: -74.005, latitude: 40.7130, accuracy: 5, speed: 1.5, heading: 45 },
   * ], 1000);
   *
   * // Later, stop the simulation
   * stopMock();
   * ```
   */
  startMockPath(locations: Partial<LocationData>[], intervalMs: number = 1000): () => void {
    if (this.isDisposed) {
      sdkWarn('GeolocationProvider: Cannot start mock path on disposed instance');
      return () => { };
    }

    // Disable mock mode in production
    if (getSDKConfig().productionMode) {
      sdkWarn('GeolocationProvider: Mock path disabled in production mode');
      return () => { };
    }

    if (!locations || locations.length === 0) {
      sdkWarn('GeolocationProvider: Mock path requires at least one location');
      return () => { };
    }

    // Stop any existing mock simulation
    this.stopMockPath();

    this.isMocking = true;
    this.setPermissionState('granted');

    let index = 0;
    const emitLocation = () => {
      const partial = locations[index];
      const location: LocationData = {
        longitude: partial.longitude ?? 0,
        latitude: partial.latitude ?? 0,
        altitude: partial.altitude ?? null,
        accuracy: partial.accuracy ?? 10,
        speed: partial.speed ?? null,
        heading: partial.heading ?? null,
        timestamp: Date.now()
      };

      this.setMockLocation(location);
      index = (index + 1) % locations.length; // Loop back to start
    };

    // Emit first location immediately
    emitLocation();

    // Continue emitting at interval
    this.mockIntervalId = setInterval(emitLocation, intervalMs);

    // Return stop function
    return () => this.stopMockPath();
  }

  /**
   * Stop mock path simulation
   */
  stopMockPath(): void {
    if (this.mockIntervalId !== null) {
      clearInterval(this.mockIntervalId);
      this.mockIntervalId = null;
    }
  }

  /**
   * Exit mock mode and return to real geolocation
   * Note: You'll need to call start() again to resume real tracking
   */
  stopMocking(): void {
    this.stopMockPath();
    this.isMocking = false;
  }

  /**
   * Clear the cached last location
   * Useful for privacy when the user logs out or for testing
   */
  clearLastLocation(): void {
    this.lastLocation = null;
  }

  /**
   * Clean up all resources and listeners
   * After calling dispose(), the instance cannot be reused
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;
    this.stop();
    this.stopMockPath();
    this.isMocking = false;

    // Clean up permission status listener to prevent memory leak
    if (this.permissionStatus) {
      this.permissionStatus.onchange = null;
      this.permissionStatus = null;
    }

    // Clean up visibility change listener
    if (this.boundHandleVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
      this.boundHandleVisibilityChange = null;
    }

    // Clear all listeners
    this.listeners.update.clear();
    this.listeners.error.clear();
    this.listeners.permissionChange.clear();
    this.listeners.deviceOrientation.clear();
    this.listeners.resume.clear();
    this.stopDeviceOrientation();

    this.lastLocation = null;
  }
}

