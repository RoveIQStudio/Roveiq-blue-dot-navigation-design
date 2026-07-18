import type { Map } from 'maplibre-gl';
import { MapLibreUserMarker } from './MapLibreUserMarker';
import { GeolocationProvider } from '../GeolocationProvider';
import type {
  UserMarkerOptions,
  GeolocationOptions,
  LocationData,
  PermissionState
} from '../types';

/**
 * Options for MapLibreYouAreHereController
 */
export interface MapLibreYouAreHereControllerOptions {
  /**
   * Options for the ThreeUserMarker visual appearance
   */
  markerOptions?: UserMarkerOptions;

  /**
   * Options for the GeolocationProvider
   */
  geolocationOptions?: GeolocationOptions;

  /**
   * Callback fired on each location update
   */
  onUpdate?: (location: LocationData) => void;

  /**
   * Callback fired on geolocation errors
   */
  onError?: (error: Error) => void;

  /**
   * Callback fired when permission state changes
   */
  onPermissionChange?: (state: PermissionState) => void;

  /**
   * Enable device compass integration
   * @default true
   */
  enableCompass?: boolean;

  /**
   * Automatically fly to user location on first fix
   * @default true
   */
  flyToOnFirstFix?: boolean;

  /**
   * Zoom level when flying to user location
   * @default 16
   */
  flyToZoom?: number;
}

/**
 * All-in-one controller for MapLibre GL JS that manages geolocation + marker.
 * Handles coordinate conversion, animation, and cleanup automatically.
 *
 * Features:
 * - Automatic location tracking with MapLibre-native marker
 * - Device compass integration for heading when stationary
 * - Smooth position and heading animations
 * - Automatic fly-to on first location fix
 * - Proper cleanup and resource management
 *
 * @example
 * ```typescript
 * const controller = new MapLibreYouAreHereController({
 *   markerOptions: { color: 0x4285F4 },
 *   onUpdate: (location) => console.log(location),
 *   flyToOnFirstFix: true,
 * });
 *
 * await controller.start(map);
 * // ... later
 * controller.stop();
 * controller.dispose();
 * ```
 */
export class MapLibreYouAreHereController {
  /** The MapLibreUserMarker instance - access for customization */
  public readonly marker: MapLibreUserMarker;

  /** The GeolocationProvider instance - access for advanced control */
  public readonly geolocation: GeolocationProvider;

  private options: MapLibreYouAreHereControllerOptions;
  private map: Map | null = null;
  private isStarted = false;
  private isDisposed = false;
  private hasReceivedFirstFix = false;
  private startPromise: Promise<void> | null = null;

  constructor(options: MapLibreYouAreHereControllerOptions = {}) {
    this.options = {
      flyToOnFirstFix: true,
      flyToZoom: 16,
      enableCompass: true,
      ...options,
    };

    // Create marker
    this.marker = new MapLibreUserMarker(options.markerOptions);

    // Create geolocation provider (reuse the same one from Three.js version!)
    this.geolocation = new GeolocationProvider(options.geolocationOptions);

    // Wire up location updates
    this.geolocation.on('update', (location) => {
      if (this.isDisposed) return;

      this.marker.setLngLat([location.longitude, location.latitude]);
      this.marker.setAccuracy(location.accuracy);
      this.marker.setHeading(location.heading, location.speed);

      // Fly to user on first fix
      if (!this.hasReceivedFirstFix && this.map && this.options.flyToOnFirstFix) {
        this.hasReceivedFirstFix = true;
        this.map.flyTo({
          center: [location.longitude, location.latitude],
          zoom: this.options.flyToZoom,
          duration: 1500,
        });
      }

      this.options.onUpdate?.(location);
    });

    // Wire up error handling
    this.geolocation.on('error', (error) => {
      if (this.isDisposed) return;
      this.options.onError?.(error as Error);
    });

    // Wire up permission changes
    this.geolocation.on('permissionChange', (state) => {
      if (this.isDisposed) return;
      this.options.onPermissionChange?.(state);
    });

    // Wire up device orientation (compass)
    // Note: The marker's setDeviceHeading() handles smoothing internally,
    // so we pass the raw heading values directly without pre-smoothing
    this.geolocation.on('deviceOrientation', (event) => {
      if (this.isDisposed) return;

      // Calculate compass heading from device orientation event
      let heading: number | null = null;

      if ((event as any).webkitCompassHeading !== undefined) {
        // iOS - webkitCompassHeading is already compass heading (0=N, 90=E)
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Android / Standard - convert counter-clockwise to clockwise
        heading = (360 - event.alpha) % 360;
      }

      // Pass raw heading - marker handles smoothing
      this.marker.setDeviceHeading(heading);
    });

    // Reset staleness on visibility resume so the marker doesn't flash "lost"
    this.geolocation.on('resume', () => {
      if (this.isDisposed) return;
      this.marker.resetStalenessTimer();
    });
  }

  /**
   * Request necessary permissions (Compass on iOS 13+)
   * Must be called from a user interaction handler
   */
  async requestPermissions(): Promise<void> {
    if (this.options.enableCompass !== false) {
      await GeolocationProvider.requestDeviceOrientationPermission();
    }
  }

  /**
   * Add marker to map and start geolocation tracking
   * Thread-safe: concurrent calls will return the same promise
   * @param map The MapLibre GL map instance
   */
  async start(map: Map): Promise<void> {
    if (this.isDisposed) {
      throw new Error('MapLibreYouAreHereController: Cannot start disposed controller');
    }

    if (this.isStarted) {
      return;
    }

    // Promise-based mutex: if start is already in progress, return the same promise
    if (this.startPromise !== null) {
      return this.startPromise;
    }

    // Create the start promise
    this.startPromise = this.doStart(map);

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Internal start implementation
   */
  private async doStart(map: Map): Promise<void> {
    this.map = map;
    this.marker.addTo(map);

    try {
      // Start geolocation
      await this.geolocation.start();

      // Start compass if enabled
      if (this.options.enableCompass !== false) {
        this.geolocation.startDeviceOrientation();
      }

      this.isStarted = true;
    } catch (error) {
      this.marker.remove();
      this.map = null;
      throw error;
    }
  }

  /**
   * Stop tracking and remove marker from map
   */
  stop(): void {
    if (!this.isStarted) return;

    this.geolocation.stop();
    this.geolocation.stopDeviceOrientation();
    this.marker.remove();
    this.map = null;
    this.isStarted = false;
    this.hasReceivedFirstFix = false;
  }

  /**
   * Check if controller is currently active
   */
  isActive(): boolean {
    return this.isStarted && !this.isDisposed;
  }

  /**
   * Fly to current user location
   */
  flyToUser(options?: { zoom?: number; duration?: number }): void {
    if (!this.map) return;

    const lngLat = this.marker.getLngLat();
    if (!lngLat) return;

    this.map.flyTo({
      center: lngLat,
      zoom: options?.zoom ?? this.options.flyToZoom ?? 16,
      duration: options?.duration ?? 1000,
    });
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;
    this.stop();
    this.geolocation.dispose();
    this.marker.dispose();
  }
}
