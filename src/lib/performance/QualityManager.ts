/**
 * QualityManager - Adaptive quality detection and management
 *
 * Automatically detects optimal quality settings based on device capabilities,
 * or allows manual preset selection.
 */

import {
  type QualityPreset,
  type QualitySettings,
  QUALITY_PRESETS,
} from './QualityPresets';

export interface QualityManagerOptions {
  /**
   * Initial quality preset
   * @default 'auto'
   */
  preset?: QualityPreset;

  /**
   * Callback when quality changes (manual or automatic)
   */
  onQualityChange?: (settings: QualitySettings, preset: Exclude<QualityPreset, 'auto'>) => void;
}

/**
 * Manages quality settings with automatic device detection
 *
 * @example
 * ```typescript
 * const quality = new QualityManager({ preset: 'auto' });
 * const settings = quality.getSettings();
 * console.log(settings.ringSegments); // 16, 32, or 64 based on device
 * ```
 */
export class QualityManager {
  private currentPreset: QualityPreset;
  private detectedPreset: Exclude<QualityPreset, 'auto'>;
  private onQualityChange?: (settings: QualitySettings, preset: Exclude<QualityPreset, 'auto'>) => void;

  constructor(options: QualityManagerOptions = {}) {
    this.currentPreset = options.preset ?? 'auto';
    this.onQualityChange = options.onQualityChange;
    this.detectedPreset = this.detectOptimalQuality();
  }

  /**
   * Detect optimal quality based on device capabilities
   *
   * Uses multiple signals:
   * - navigator.hardwareConcurrency (CPU cores)
   * - navigator.deviceMemory (RAM in GB, Chrome only)
   * - User agent for mobile detection
   * - Screen resolution as fallback signal
   */
  private detectOptimalQuality(): Exclude<QualityPreset, 'auto'> {
    // Default to medium if detection fails
    if (typeof navigator === 'undefined') {
      return 'medium';
    }

    // Get hardware signals
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as any).deviceMemory ?? 4; // Chrome only
    const isMobile = this.detectMobile();
    const isLowResScreen = this.detectLowResScreen();

    // Score-based detection
    let score = 0;

    // CPU cores: 1-2 = 0, 3-4 = 1, 5+ = 2
    if (cores <= 2) score += 0;
    else if (cores <= 4) score += 1;
    else score += 2;

    // Memory: <=2GB = 0, <=4GB = 1, >4GB = 2
    if (memory <= 2) score += 0;
    else if (memory <= 4) score += 1;
    else score += 2;

    // Mobile penalty
    if (isMobile) score -= 1;

    // Low-res screen bonus (less pixels to push)
    if (isLowResScreen) score += 1;

    // Map score to preset
    // 0-1 = low, 2-3 = medium, 4+ = high
    if (score <= 1) return 'low';
    if (score <= 3) return 'medium';
    return 'high';
  }

  /**
   * Detect if running on mobile device
   */
  private detectMobile(): boolean {
    if (typeof navigator === 'undefined') return false;

    // Check user agent for mobile devices
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      return true;
    }

    // Don't use maxTouchPoints alone - Macs with trackpads report > 0
    // Only consider it mobile if UA also suggests mobile OR it's a small screen
    if (typeof window !== 'undefined' && 'ontouchstart' in window) {
      // Check if screen size suggests mobile (< 768px width is typical mobile breakpoint)
      const screenWidth = window.screen?.width ?? 1920;
      if (screenWidth < 768) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect low-resolution screen
   */
  private detectLowResScreen(): boolean {
    if (typeof window === 'undefined') return false;

    const width = window.screen?.width ?? 1920;
    const height = window.screen?.height ?? 1080;
    const pixels = width * height;

    // Less than 720p is considered low-res
    return pixels < 1280 * 720;
  }

  /**
   * Get current quality settings
   */
  getSettings(): QualitySettings {
    const preset = this.getEffectivePreset();
    return { ...QUALITY_PRESETS[preset] };
  }

  /**
   * Get the effective preset (resolves 'auto' to detected preset)
   */
  getEffectivePreset(): Exclude<QualityPreset, 'auto'> {
    return this.currentPreset === 'auto' ? this.detectedPreset : this.currentPreset;
  }

  /**
   * Get the detected preset (what 'auto' resolves to)
   */
  getDetectedPreset(): Exclude<QualityPreset, 'auto'> {
    return this.detectedPreset;
  }

  /**
   * Get the current preset setting (may be 'auto')
   */
  getCurrentPreset(): QualityPreset {
    return this.currentPreset;
  }

  /**
   * Set quality preset
   *
   * @param preset Quality preset to use ('auto', 'low', 'medium', 'high')
   */
  setPreset(preset: QualityPreset): void {
    const previousEffective = this.getEffectivePreset();
    this.currentPreset = preset;
    const newEffective = this.getEffectivePreset();

    if (previousEffective !== newEffective) {
      this.onQualityChange?.(this.getSettings(), newEffective);
    }
  }

  /**
   * Force re-detection of device capabilities
   * Useful if device state changes (e.g., power mode)
   */
  redetect(): void {
    const previousDetected = this.detectedPreset;
    this.detectedPreset = this.detectOptimalQuality();

    // Only notify if auto mode and detected changed
    if (this.currentPreset === 'auto' && previousDetected !== this.detectedPreset) {
      this.onQualityChange?.(this.getSettings(), this.detectedPreset);
    }
  }

  /**
   * Check if current device is detected as mobile
   */
  isMobile(): boolean {
    return this.detectMobile();
  }

  /**
   * Get device capability info for debugging
   */
  getDeviceInfo(): {
    cores: number;
    memory: number | null;
    isMobile: boolean;
    isLowRes: boolean;
    detectedPreset: Exclude<QualityPreset, 'auto'>;
  } {
    return {
      cores: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 0) : 0,
      memory: typeof navigator !== 'undefined' ? ((navigator as any).deviceMemory ?? null) : null,
      isMobile: this.detectMobile(),
      isLowRes: this.detectLowResScreen(),
      detectedPreset: this.detectedPreset,
    };
  }
}

// Export singleton for global quality management
let globalQualityManager: QualityManager | null = null;

/**
 * Get the global QualityManager instance
 * Creates one if it doesn't exist
 */
export function getGlobalQualityManager(): QualityManager {
  if (!globalQualityManager) {
    globalQualityManager = new QualityManager();
  }
  return globalQualityManager;
}

/**
 * Set the global QualityManager instance
 * Useful for configuring quality at app startup
 */
export function setGlobalQualityManager(manager: QualityManager): void {
  globalQualityManager = manager;
}
