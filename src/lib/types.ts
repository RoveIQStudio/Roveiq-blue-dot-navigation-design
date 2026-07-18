/**
 * Confidence state for GPS signal quality and alerts
 *
 * - 'high': Good GPS signal, accurate position
 * - 'low': Degraded signal, position may be less accurate
 * - 'lost': No GPS signal, showing last known position
 * - 'warning': Orange alert state (e.g., approaching boundary)
 * - 'danger': Red alert state (e.g., out of bounds, emergency)
 */
export type ConfidenceState = 'high' | 'low' | 'lost' | 'warning' | 'danger';

import type { RoveError, ErrorContext } from './errors';

/**
 * SDK-wide configuration options
 */
export interface SDKConfig {
  /**
   * Enable production mode
   * - Disables console warnings
   * - Disables mock location functionality
   * @default false
   */
  productionMode?: boolean;

  /**
   * Enable debug logging
   * Only has effect when productionMode is false
   * @default false
   */
  debug?: boolean;

  /**
   * Error telemetry callback
   *
   * Called whenever RoveError.emit() is used, allowing integration
   * with external error tracking services like Sentry or Datadog.
   *
   * @example
   * ```typescript
   * configureSDK({
   *   onError: (error, context) => {
   *     Sentry.captureException(error, {
   *       tags: { component: context.component },
   *       extra: context.metadata,
   *     });
   *   },
   * });
   * ```
   */
  onError?: (error: RoveError, context: ErrorContext) => void;
}

/** Global SDK configuration */
let sdkConfig: SDKConfig = {
  productionMode: false,
  debug: false,
};

/**
 * Configure SDK-wide settings
 * Call this before creating any SDK instances
 */
export function configureSDK(config: SDKConfig): void {
  sdkConfig = { ...sdkConfig, ...config };
}

/**
 * Get current SDK configuration
 */
export function getSDKConfig(): Readonly<SDKConfig> {
  return sdkConfig;
}

/**
 * Internal logging utility that respects production mode
 */
export function sdkWarn(message: string, ...args: unknown[]): void {
  if (!sdkConfig.productionMode) {
    console.warn(`[RoveBeacon] ${message}`, ...args);
  }
}

/**
 * Internal debug logging utility
 */
export function sdkDebug(message: string, ...args: unknown[]): void {
  if (!sdkConfig.productionMode && sdkConfig.debug) {
    console.log(`[RoveBeacon:debug] ${message}`, ...args);
  }
}

/**
 * Configuration options for ThreeUserMarker
 *
 * All size values are in scene units (not pixels).
 * Color values are hex numbers (e.g., 0x4285F4).
 */
export interface UserMarkerOptions {
  /**
   * Main color of the marker dot and cone
   * @default 0x4285F4 (Google blue)
   */
  color?: number;

  /**
   * Border/outline color around the dot
   * @default 0xffffff (white)
   */
  borderColor?: number;

  /**
   * Radius of the center dot in scene units
   * @default 9
   */
  dotSize?: number;

  /**
   * Width of the border around the dot in scene units
   * @default 3
   */
  borderWidth?: number;

  /**
   * Whether to show the pulsing accuracy ring
   * @default true
   */
  showAccuracyRing?: boolean;

  /**
   * Whether to show the direction cone when user is moving
   * @default true
   */
  showDirectionCone?: boolean;

  /**
   * Minimum speed in m/s required to show direction cone
   * Prevents cone from appearing when user is stationary
   * @default 0.5
   */
  minSpeedForDirection?: number;

  /**
   * Length of the direction cone in scene units
   * @default 45
   */
  coneLength?: number;

  /**
   * Width of the direction cone at its widest point in scene units
   * @default 70
   */
  coneWidth?: number;

  /**
   * Opacity of the direction cone (0-1)
   * @default 0.2
   */
  coneOpacity?: number;

  /**
   * Color of the direction/heading cone (defaults to main color)
   * @default Same as color
   */
  coneColor?: number;

  /**
   * Color of the accuracy ring (defaults to main color)
   * @default Same as color
   */
  accuracyRingColor?: number;

  /**
   * Speed of the accuracy ring pulse animation in cycles per second
   * Higher values = faster pulsing. Set to 0 to disable pulsing.
   * @default 0.3 (approximately one pulse every 3.5 seconds)
   */
  pulseSpeed?: number;

  /**
   * Enable smooth position interpolation when location updates
   * @default true
   */
  smoothPosition?: boolean;

  /**
   * Enable smooth heading interpolation when direction changes
   * @default true
   */
  smoothHeading?: boolean;

  /**
   * Position interpolation speed factor (0-1)
   * Higher values = faster interpolation
   * @default 0.03
   */
  positionSmoothingFactor?: number;

  /**
   * Heading interpolation speed factor (0-1)
   * Higher values = faster interpolation
   * @default 0.15
   */
  headingSmoothingFactor?: number;

  /**
   * Coordinate system orientation
   * - 'y-up': Y axis points up (standard Three.js convention)
   * - 'z-up': Z axis points up (common in GIS/mapping applications)
   * @default 'y-up'
   */
  orientation?: 'z-up' | 'y-up';

  /**
   * Enable automatic confidence state based on staleness and accuracy
   * When enabled, confidence will automatically degrade to 'low' or 'lost'
   * based on time since last update and GPS accuracy
   * @default true
   */
  enableAutoConfidence?: boolean;

  /**
   * Time in milliseconds after which confidence degrades to 'low'
   * @default 30000 (30 seconds)
   */
  stalenessLowThresholdMs?: number;

  /**
   * Time in milliseconds after which confidence degrades to 'lost'
   * @default 60000 (60 seconds)
   */
  stalenessLostThresholdMs?: number;

  /**
   * Accuracy in meters above which confidence degrades to 'low'
   * @default 100
   */
  accuracyLowThresholdMeters?: number;

  /**
   * Accuracy in meters above which confidence degrades to 'lost'
   * @default 500
   */
  accuracyLostThresholdMeters?: number;

  /**
   * Minimum scale for the marker (prevents disappearing when zoomed out very far)
   * @default 0.5
   */
  minScale?: number;

  /**
   * Maximum scale for the marker (prevents becoming too large when zoomed in close)
   * @default 10
   */
  maxScale?: number;

  /**
   * Reference distance at which scale equals 1.0
   * Adjust this based on your scene's typical viewing distance
   * @default 1000
   */
  scaleReferenceDistance?: number;

  /**
   * Scaling curve exponent for zoom-adaptive sizing
   * Lower values (e.g., 0.3) = more gradual scaling (marker stays more consistent across zoom levels)
   * Higher values (e.g., 1.0) = linear scaling (marker size changes more dramatically with zoom)
   * @default 0.5 (square root curve - good balance)
   */
  scaleCurveExponent?: number;

  /**
   * When true, marker maintains a fixed screen size regardless of camera distance
   * (similar to MapLibre behavior). When false, uses zoom-adaptive scaling.
   * @default true
   */
  fixedScreenSize?: boolean;

  /**
   * Overall scale multiplier for the entire marker (dot, border, ring, cone)
   * Use this to make the entire beacon larger or smaller uniformly.
   * Values > 1 make it larger, < 1 make it smaller.
   * @default 1.0
   */
  overallScale?: number;

  /**
   * Independent scale multiplier for the accuracy ring/pulse
   * Use this to make the ring larger or smaller independently of the dot.
   * Values > 1 make it larger, < 1 make it smaller.
   * @default 0.5
   */
  ringScale?: number;

  /**
   * Inner radius of the accuracy ring in scene units.
   * This is the hole in the center of the ring (donut shape).
   * @default 15
   */
  ringInnerRadius?: number;

  /**
   * Outer radius of the accuracy ring in scene units.
   * This determines how large the ring appears before scaling.
   * @default 35
   */
  ringOuterRadius?: number;

  /**
   * Optional reference to the maplibre-gl library.
   * Providing this avoids reliance on the global `window.maplibregl` or internal `_maplibregl` properties,
   * which is safer and recommended for modular environments.
   */
  mapLibreModule?: any;

  /**
   * The mapbox-gl module for creating the native marker. Pass your imported
   * module when using a bundler (Vite/webpack) where no global is available.
   * @default null (falls back to window.mapboxgl)
   */
  mapBoxModule?: any;
}

/**
 * Location data received from the Geolocation API
 *
 * All coordinates are in WGS84 (standard GPS coordinates).
 */
export interface LocationData {
  /**
   * Longitude in degrees (-180 to 180)
   * Negative values are west of the Prime Meridian
   */
  longitude: number;

  /**
   * Latitude in degrees (-90 to 90)
   * Negative values are south of the Equator
   */
  latitude: number;

  /**
   * Altitude in meters above the WGS84 ellipsoid
   * May be null if the device doesn't support altitude
   */
  altitude: number | null;

  /**
   * Accuracy of the position in meters
   * Represents the radius of a circle within which the true position lies
   */
  accuracy: number;

  /**
   * Speed in meters per second
   * May be null if the device doesn't support speed
   */
  speed: number | null;

  /**
   * Heading in degrees from true north (0-360), clockwise
   * 0 = North, 90 = East, 180 = South, 270 = West
   * May be null if the device doesn't support heading or user is stationary
   */
  heading: number | null;

  /**
   * Timestamp of when this reading was taken
   * Milliseconds since Unix epoch (Date.now() format)
   */
  timestamp: number;
}

/**
 * Position in Three.js scene coordinates
 */
export interface ScenePosition {
  /** X coordinate in scene units */
  x: number;
  /** Y coordinate in scene units */
  y: number;
  /** Z coordinate in scene units (altitude) */
  z?: number;
}

/**
 * Options for the GeolocationProvider
 *
 * These options are passed directly to the browser's Geolocation API.
 */
export interface GeolocationOptions {
  /**
   * Use high accuracy mode (GPS vs cell tower/WiFi)
   * High accuracy uses more battery but provides better precision
   * @default true
   */
  enableHighAccuracy?: boolean;

  /**
   * Maximum age of a cached position to accept in milliseconds
   * Set to 0 to always get a fresh position
   * @default 0
   */
  maximumAge?: number;

  /**
   * Maximum time to wait for a position in milliseconds
   * @default 10000 (10 seconds)
   */
  timeout?: number;

  /**
   * Maximum GPS updates per second
   * Lower values reduce battery drain on high-frequency GPS devices
   * @default 10 (100ms minimum interval)
   */
  maxUpdateRate?: number;
}

/**
 * Permission states for geolocation access
 *
 * - 'prompt': User hasn't been asked yet
 * - 'granted': User has granted permission
 * - 'denied': User has denied permission
 * - 'unavailable': Geolocation is not available (e.g., no GPS hardware)
 * - 'requesting': Currently requesting permission from user
 */
export type PermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'requesting';

/**
 * Event types emitted by GeolocationProvider
 *
 * Use with GeolocationProvider.on() to listen for events.
 */
export interface GeolocationEvents {
  /** Fired when a new location is received */
  update: LocationData;
  /** Fired when a geolocation error occurs */
  error: GeolocationPositionError | Error;
  /** Fired when the permission state changes */
  permissionChange: PermissionState;
  /** Fired when device orientation changes (compass) */
  deviceOrientation: DeviceOrientationEvent;
  /** Fired when tracking resumes after visibility change (tab becomes visible) */
  resume: void;
}

/**
 * Interface for custom coordinate conversion implementations
 *
 * Implement this interface to use a custom projection system
 * instead of the built-in Web Mercator projection.
 */
export interface CoordinateConverter {
  /**
   * Convert WGS84 coordinates to scene coordinates
   * @param longitude Longitude in degrees
   * @param latitude Latitude in degrees
   * @param altitude Altitude in meters (optional)
   * @returns Scene position object
   */
  toScene(longitude: number, latitude: number, altitude?: number): ScenePosition;

  /**
   * Convert scene coordinates back to WGS84 (optional)
   * @param x Scene X coordinate
   * @param y Scene Y coordinate
   * @returns Object with longitude and latitude
   */
  fromScene?(x: number, y: number): { longitude: number; latitude: number };
}

import type { LocationSource } from './sources';

/**
 * Options for ThreeYouAreHereController
 *
 * The controller combines ThreeUserMarker and GeolocationProvider into
 * a single, easy-to-use interface with automatic coordinate conversion.
 */
export interface YouAreHereControllerOptions {
  /**
   * Options for the ThreeUserMarker visual appearance
   */
  markerOptions?: UserMarkerOptions;

  /**
   * Options for the GeolocationProvider (ignored if locationSource is provided)
   */
  geolocationOptions?: GeolocationOptions;

  /**
   * Custom location source to use instead of default GeolocationProvider
   * Useful for testing, replays, or custom location providers
   */
  locationSource?: LocationSource;

  /**
   * Center point for coordinate conversion [longitude, latitude]
   *
   * This should be the center of your venue/map. All GPS coordinates
   * will be converted to scene coordinates relative to this point.
   *
   * @required
   * @example [-74.006, 40.7128] // New York City
   */
  center: [number, number];

  /**
   * Scale factor for coordinate conversion
   *
   * Adjust this to match your scene's coordinate system.
   * Larger values = larger scene coordinates for the same GPS distance.
   *
   * @default 1
   */
  scale?: number;

  /**
   * Callback fired on each location update
   * @param location The new location data
   */
  onUpdate?: (location: LocationData) => void;

  /**
   * Callback fired on geolocation errors
   * @param error The error that occurred
   */
  onError?: (error: Error) => void;

  /**
   * Callback fired when permission state changes
   * @param state The new permission state
   */
  onPermissionChange?: (state: PermissionState) => void;

  /**
   * Enable device compass (magnetometer) integration
   * 
   * If true, the SDK will listen for device orientation events to rotate the marker
   * when stationary. On iOS, this requires calling `requestPermissions()` from a user action.
   * 
   * @default true
   */
  enableCompass?: boolean;
}
