import type { Map } from 'mapbox-gl';
import { MapBoxUserMarker } from './MapBoxUserMarker';
import { GeolocationProvider } from '../GeolocationProvider';
import type {
  UserMarkerOptions,
  GeolocationOptions,
  LocationData,
  PermissionState
} from '../types';

/**
 * Options for MapBoxYouAreHereController
 */
export interface MapBoxYouAreHereControllerOptions {
  /**
   * Options for the MapBoxUserMarker visual appearance
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
 * All-in-one controller for MapBox GL JS that manages geolocation + marker.
 * Handles coordinate conversion, animation, and cleanup automatically.
 *
 * Features:
 * - Automatic location tracking with MapBox-native marker
 * - Device compass integration for heading when stationary
 * - Smooth position and heading animations
 * - Automatic fly-to on first location fix
 * - Proper cleanup and resource management
 *
 * @example
 * ```typescript
 * const controller = new MapBoxYouAreHereController({
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
export class MapBoxYouAreHereController {
  /** The MapBoxUserMarker instance - access for customization */
  public readonly marker: MapBoxUserMarker;

  /** The GeolocationProvider instance - access for advanced control */
  public readonly geolocation: GeolocationProvider;

  private options: MapBoxYouAreHereControllerOptions;
  private map: Map | null = null;
  private isStarted = false;
  private isDisposed = false;
  private hasReceivedFirstFix = false;
  private startPromise: Promise<void> | null = null;

  constructor(options: MapBoxYouAreHereControllerOptions = {}) {
    this.options = {
      flyToOnFirstFix: true,
      flyToZoom: 16,
      enableCompass: true,
      ...options,
    };

    // Create marker
    this.marker = new MapBoxUserMarker(options.markerOptions);

    // Create geolocation provider
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
    this.geolocation.on('deviceOrientation', (event) => {
      if (this.isDisposed) return;

      let heading: number | null = null;

      if ((event as any).webkitCompassHeading !== undefined) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = (360 - event.alpha) % 360;
      }

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
   * @param map The MapBox GL map instance
   */
  async start(map: Map): Promise<void> {
    if (this.isDisposed) {
      throw new Error('MapBoxYouAreHereController: Cannot start disposed controller');
    }

    if (this.isStarted) {
      return;
    }

    if (this.startPromise !== null) {
      return this.startPromise;
    }

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
      await this.geolocation.start();

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
