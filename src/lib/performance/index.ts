/**
 * Performance module exports
 *
 * Provides quality management and battery-aware power management
 * for optimal mobile performance.
 */

// Quality presets and settings
export {
  type QualityPreset,
  type QualitySettings,
  QUALITY_PRESETS,
  getDefaultQualitySettings,
} from './QualityPresets';

// Quality manager
export {
  QualityManager,
  type QualityManagerOptions,
  getGlobalQualityManager,
  setGlobalQualityManager,
} from './QualityManager';

// Battery monitoring
export {
  BatteryManager,
  type BatteryManagerOptions,
  type BatteryState,
  getGlobalBatteryManager,
  setGlobalBatteryManager,
} from './BatteryManager';
