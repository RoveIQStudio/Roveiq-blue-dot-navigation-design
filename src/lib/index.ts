// Main SDK exports (Three.js)
export { ThreeUserMarker } from './three/ThreeUserMarker';
export { GeolocationProvider } from './GeolocationProvider';
export { ThreeYouAreHereController } from './three/ThreeYouAreHereController';

// MapLibre GL JS exports
export { MapLibreUserMarker } from './maplibre/MapLibreUserMarker';
export { MapLibreYouAreHereController } from './maplibre/MapLibreYouAreHereController';
export type { MapLibreYouAreHereControllerOptions } from './maplibre/MapLibreYouAreHereController';

// MapBox GL JS exports
export { MapBoxUserMarker } from './mapbox/MapBoxUserMarker';
export { MapBoxYouAreHereController } from './mapbox/MapBoxYouAreHereController';
export type { MapBoxYouAreHereControllerOptions } from './mapbox/MapBoxYouAreHereController';

// Utilities
export { MercatorProjection } from '../utils/MercatorProjection';

// SDK Configuration
export { configureSDK, getSDKConfig } from './types';
export type { SDKConfig } from './types';

// Performance & Adaptive Quality
export {
  QualityManager,
  getGlobalQualityManager,
  setGlobalQualityManager,
  QUALITY_PRESETS,
  BatteryManager,
  getGlobalBatteryManager,
  setGlobalBatteryManager,
} from './performance';
export type {
  QualityPreset,
  QualitySettings,
  QualityManagerOptions,
  BatteryManagerOptions,
  BatteryState,
} from './performance';

// Logging
export { Logger, ComponentLogger, logger } from './logging';
export type { LogLevel, LogEntry, LoggerOptions } from './logging';

// Errors & Interfaces
export { RoveError, RoveErrorCode } from './errors';
export type { ErrorContext } from './errors';
export type { LocationSource } from './sources';

// Types
export type {
  UserMarkerOptions,
  LocationData,
  ScenePosition,
  GeolocationOptions,
  PermissionState,
  GeolocationEvents,
  CoordinateConverter,
  YouAreHereControllerOptions,
  ConfidenceState,
} from './types';

