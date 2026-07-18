import type { Map, Marker, LngLatLike } from 'mapbox-gl';
import { getGlobalQualityManager } from '../performance/QualityManager';
import type { UserMarkerOptions, ConfidenceState } from '../types';
import { sdkWarn } from '../types';
import { isValidNumber, normalizeAngleDegrees } from '../../utils/validation';

/**
 * Default pulse speed in cycles per second
 */
const DEFAULT_PULSE_SPEED = 0.3;

/**
 * Maximum iterations for angle normalization loops
 */
const MAX_ANGLE_ITERATIONS = 10;

/**
 * Default options for MapBox marker
 */
const DEFAULT_OPTIONS: Required<Omit<UserMarkerOptions, 'orientation'>> = {
  color: 0x4285F4,
  borderColor: 0xffffff,
  dotSize: 22,
  borderWidth: 3,
  showAccuracyRing: true,
  showDirectionCone: true,
  minSpeedForDirection: 0.5,
  coneLength: 60,
  coneWidth: 40,
  coneOpacity: 0.3,
  coneColor: 0x4285F4,
  accuracyRingColor: 0x4285F4,
  smoothPosition: true,
  smoothHeading: true,
  positionSmoothingFactor: 0.1,
  headingSmoothingFactor: 0.15,
  enableAutoConfidence: true,
  stalenessLowThresholdMs: 30000,
  stalenessLostThresholdMs: 60000,
  accuracyLowThresholdMeters: 100,
  accuracyLostThresholdMeters: 500,
  // Three.js-specific options (not used in MapBox, included for type compatibility)
  minScale: 0.5,
  maxScale: 10,
  scaleReferenceDistance: 1000,
  scaleCurveExponent: 0.5,
  pulseSpeed: 0.3,
  fixedScreenSize: true,
  overallScale: 1.0,
  ringScale: 0.2,
  ringInnerRadius: 15,
  ringOuterRadius: 35,
  mapLibreModule: null,
  mapBoxModule: null,
};

/**
 * Convert hex number to CSS color string
 */
function hexToColor(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/**
 * MapBoxUserMarker - A MapBox GL JS marker that displays user location
 * with accuracy ring and direction indicator.
 *
 * Features:
 * - Smooth position and heading animations
 * - Pulsing accuracy ring that reflects GPS precision
 * - Direction cone that shows heading when moving
 * - Canvas-based rendering for high performance
 * - Automatic confidence state based on staleness/accuracy
 *
 * @example
 * ```typescript
 * const marker = new MapBoxUserMarker({ color: 0x4285F4 });
 * marker.addTo(map);
 *
 * // Update position
 * marker.setLngLat([longitude, latitude]);
 * marker.setAccuracy(15); // meters
 * marker.setHeading(45, 1.5); // degrees, speed m/s
 * ```
 */
export class MapBoxUserMarker {
  private options: Required<Omit<UserMarkerOptions, 'orientation'>>;
  private map: Map | null = null;
  private marker: Marker | null = null;
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // State
  private currentLngLat: [number, number] | null = null;
  private targetLngLat: [number, number] | null = null;
  private currentAccuracy = 10;
  private currentHeading: number | null = null;
  private targetHeading: number | null = null;
  private deviceHeading: number | null = null;
  private currentSpeed = 0;
  private confidenceState: ConfidenceState = 'high';
  private manualConfidenceOverride = false;
  private lastPositionUpdateTime = 0;
  private isVisible = true;
  private isDisposed = false;
  private isDirty = true; // Track if canvas needs redraw

  // Animation
  private animationId: number | null = null;
  private pulsePhase = 0;
  private lastFrameTime = 0;
  private effectivePulseSpeed = 0; // Confidence-aware pulse speed

  // Canvas size (accounts for accuracy ring)
  private canvasSize = 200;
  private currentDpr = 1;
  private dprMediaQuery: MediaQueryList | null = null;
  private boundHandleDprChange: (() => void) | null = null;

  constructor(options: UserMarkerOptions = {}) {
    // Get quality settings and apply defaults if not overridden
    const qualityManager = getGlobalQualityManager();
    const qualitySettings = qualityManager.getSettings();

    // Merge defaults -> quality settings -> user options
    const mergedOptions: UserMarkerOptions = {
      ...DEFAULT_OPTIONS,
      // Apply quality-dependent defaults
      pulseSpeed: options.pulseSpeed ?? (qualitySettings.pulseEnabled ? DEFAULT_PULSE_SPEED : 0),
      smoothPosition: options.smoothPosition ?? qualitySettings.smoothPosition,
      smoothHeading: options.smoothHeading ?? qualitySettings.smoothHeading,
      positionSmoothingFactor: options.positionSmoothingFactor ?? qualitySettings.positionSmoothingFactor,
      headingSmoothingFactor: options.headingSmoothingFactor ?? qualitySettings.headingSmoothingFactor,
      ...options
    };

    this.options = mergedOptions as Required<Omit<UserMarkerOptions, 'orientation'>>;
    this.currentDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

    // Create container element
    this.container = document.createElement('div');
    this.container.className = 'mapbox-user-marker';
    this.container.style.cssText = `
      width: ${this.canvasSize}px;
      height: ${this.canvasSize}px;
      pointer-events: none;
    `;

    // Create canvas for rendering
    this.canvas = document.createElement('canvas');
    this.updateCanvasSize();
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas 2d context');
    this.ctx = ctx;
    this.ctx.scale(this.currentDpr, this.currentDpr);

    // Listen for DPI changes (moving between displays, browser zoom)
    this.setupDprListener();
  }

  /**
   * Update canvas size based on current device pixel ratio
   */
  private updateCanvasSize(): void {
    this.canvas.width = this.canvasSize * this.currentDpr;
    this.canvas.height = this.canvasSize * this.currentDpr;
    this.canvas.style.cssText = `
      width: ${this.canvasSize}px;
      height: ${this.canvasSize}px;
    `;
  }

  /**
   * Setup listener for device pixel ratio changes
   */
  private setupDprListener(): void {
    if (typeof window === 'undefined') return;

    // Clean up previous listener
    this.cleanupDprListener();

    this.boundHandleDprChange = () => {
      const newDpr = window.devicePixelRatio;
      if (newDpr !== this.currentDpr) {
        this.handleDprChange(newDpr);
      }
    };

    this.dprMediaQuery = window.matchMedia(`(resolution: ${this.currentDpr}dppx)`);
    this.dprMediaQuery.addEventListener('change', this.boundHandleDprChange);
  }

  /**
   * Clean up DPR listener
   */
  private cleanupDprListener(): void {
    if (this.dprMediaQuery && this.boundHandleDprChange) {
      this.dprMediaQuery.removeEventListener('change', this.boundHandleDprChange);
      this.dprMediaQuery = null;
      this.boundHandleDprChange = null;
    }
  }

  /**
   * Handle device pixel ratio change
   */
  private handleDprChange(newDpr: number): void {
    this.currentDpr = newDpr;
    this.updateCanvasSize();

    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      this.ctx = ctx;
      this.ctx.scale(this.currentDpr, this.currentDpr);
    }

    this.isDirty = true;
    this.setupDprListener();
  }

  /**
   * Add marker to a MapBox map
   */
  addTo(map: Map): this {
    if (this.isDisposed) {
      sdkWarn('MapBoxUserMarker: Cannot add disposed marker to map');
      return this;
    }

    this.map = map;

    // Resolve mapbox-gl to create the native marker.
    // Prioritize the injected module, then globals — matching MapLibreUserMarker.
    let mapboxgl = this.options.mapBoxModule;

    if (!mapboxgl) {
      mapboxgl = (map as any)._mapboxgl || (window as any).mapboxgl;
    }

    if (!mapboxgl) {
      throw new Error('MapBoxUserMarker: mapbox-gl not found. Provide it via options.mapBoxModule or ensure it is loaded globally.');
    }

    this.marker = new mapboxgl.Marker({
      element: this.container,
      anchor: 'center',
      rotationAlignment: 'map',
      pitchAlignment: 'map',
    });

    this.startAnimation();
    return this;
  }

  /**
   * Remove marker from map
   */
  remove(): this {
    this.stopAnimation();
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    this.map = null;
    return this;
  }

  /**
   * Set position in longitude/latitude
   */
  setLngLat(lngLat: LngLatLike): this {
    if (this.isDisposed) return this;

    let lng: number, lat: number;
    if (Array.isArray(lngLat)) {
      [lng, lat] = lngLat;
    } else if ('lng' in lngLat && 'lat' in lngLat) {
      lng = lngLat.lng;
      lat = lngLat.lat;
    } else if ('lon' in lngLat) {
      lng = (lngLat as any).lon;
      lat = lngLat.lat;
    } else {
      sdkWarn('MapBoxUserMarker.setLngLat: Invalid coordinates');
      return this;
    }

    if (!isValidNumber(lng) || !isValidNumber(lat)) {
      sdkWarn('MapBoxUserMarker.setLngLat: Invalid coordinates');
      return this;
    }

    this.lastPositionUpdateTime = Date.now();
    this.targetLngLat = [lng, lat];

    if (this.currentLngLat === null) {
      this.currentLngLat = [lng, lat];
      if (this.marker && this.map) {
        this.marker.setLngLat(this.currentLngLat);
        this.marker.addTo(this.map);
      }
    }

    return this;
  }

  /**
   * Set GPS accuracy in meters
   */
  setAccuracy(meters: number): this {
    if (!isValidNumber(meters)) return this;
    this.currentAccuracy = Math.max(0, Math.min(10000, meters));
    this.isDirty = true;
    return this;
  }

  /**
   * Set heading from device orientation (compass)
   */
  setDeviceHeading(heading: number | null): this {
    if (!isValidNumber(heading)) {
      this.deviceHeading = null;
      return this;
    }

    const normalizedHeading = normalizeAngleDegrees(heading);

    if (this.deviceHeading === null) {
      this.deviceHeading = normalizedHeading;
    } else {
      let diff = normalizedHeading - this.deviceHeading;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      this.deviceHeading = normalizeAngleDegrees(
        this.deviceHeading + diff * this.options.headingSmoothingFactor
      );
    }
    return this;
  }

  /**
   * Set heading and speed
   */
  setHeading(heading: number | null, speed: number | null): this {
    this.currentSpeed = speed ?? 0;
    const isMoving = isValidNumber(speed) && speed > this.options.minSpeedForDirection;

    if (isMoving && isValidNumber(heading)) {
      this.targetHeading = normalizeAngleDegrees(heading);
      if (this.currentHeading === null) {
        this.currentHeading = this.targetHeading;
      }
    } else if (this.deviceHeading !== null) {
      this.targetHeading = this.deviceHeading;
      if (this.currentHeading === null) {
        this.currentHeading = this.targetHeading;
      }
    } else {
      this.targetHeading = null;
    }

    return this;
  }

  /**
   * Set confidence state manually
   */
  setConfidence(state: ConfidenceState): this {
    this.manualConfidenceOverride = true;
    if (this.confidenceState !== state) {
      this.confidenceState = state;
      this.isDirty = true;
    }
    return this;
  }

  /**
   * Reset auto confidence
   */
  resetAutoConfidence(): this {
    this.manualConfidenceOverride = false;
    return this;
  }

  /**
   * Reset the staleness timer, e.g. after a tab-visibility resume, so the
   * marker doesn't flash the "lost" state while waiting for a fresh fix.
   */
  resetStalenessTimer(): void {
    this.lastPositionUpdateTime = Date.now();
    this.isDirty = true;
  }

  /**
   * Set dot color
   */
  setDotColor(color: number): this {
    if (isValidNumber(color)) {
      this.options.color = color;
      this.isDirty = true;
    }
    return this;
  }

  /**
   * Set border color
   */
  setBorderColor(color: number): this {
    if (isValidNumber(color)) {
      this.options.borderColor = color;
      this.isDirty = true;
    }
    return this;
  }

  /**
   * Set ring color
   */
  setRingColor(color: number): this {
    if (isValidNumber(color)) {
      this.options.accuracyRingColor = color;
      this.isDirty = true;
    }
    return this;
  }

  /**
   * Set main color (affects dot and ring)
   */
  setColor(color: number): this {
    if (isValidNumber(color)) {
      this.options.color = color;
      this.options.accuracyRingColor = color;
      this.isDirty = true;
    }
    return this;
  }

  /**
   * Hide marker
   */
  hide(): this {
    this.isVisible = false;
    this.container.style.display = 'none';
    return this;
  }

  /**
   * Show marker
   */
  show(): this {
    this.isVisible = true;
    this.container.style.display = 'block';
    return this;
  }

  /**
   * Get current confidence state
   */
  getConfidence(): ConfidenceState {
    return this.confidenceState;
  }

  /**
   * Get last known location
   */
  getLngLat(): [number, number] | null {
    return this.currentLngLat;
  }

  private startAnimation(): void {
    if (this.animationId !== null) return;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  private stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private animate = (): void => {
    if (this.isDisposed) return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    const dt = Math.min(deltaTime, 0.1);

    // Update auto-confidence
    if (this.options.enableAutoConfidence && !this.manualConfidenceOverride && this.lastPositionUpdateTime > 0) {
      const prevConfidence = this.confidenceState;
      this.updateAutoConfidence();
      if (prevConfidence !== this.confidenceState) {
        this.isDirty = true;
      }
    }

    // Smooth position interpolation
    if (this.currentLngLat && this.targetLngLat && this.options.smoothPosition) {
      const factor = this.options.positionSmoothingFactor;
      const prevLng = this.currentLngLat[0];
      const prevLat = this.currentLngLat[1];
      this.currentLngLat[0] += (this.targetLngLat[0] - this.currentLngLat[0]) * factor;
      this.currentLngLat[1] += (this.targetLngLat[1] - this.currentLngLat[1]) * factor;

      if (Math.abs(this.currentLngLat[0] - prevLng) > 0.0000001 ||
        Math.abs(this.currentLngLat[1] - prevLat) > 0.0000001) {
        this.isDirty = true;
      }

      if (this.marker) {
        this.marker.setLngLat(this.currentLngLat);
      }
    }

    // Smooth heading interpolation
    if (this.currentHeading !== null && this.targetHeading !== null && this.options.smoothHeading) {
      if (!Number.isFinite(this.currentHeading)) {
        this.currentHeading = 0;
      }
      if (!Number.isFinite(this.targetHeading)) {
        this.targetHeading = 0;
      }

      const prevHeading = this.currentHeading;
      let diff = this.targetHeading - this.currentHeading;
      let iterations = 0;
      while (diff > 180 && iterations < MAX_ANGLE_ITERATIONS) { diff -= 360; iterations++; }
      iterations = 0;
      while (diff < -180 && iterations < MAX_ANGLE_ITERATIONS) { diff += 360; iterations++; }
      this.currentHeading = normalizeAngleDegrees(
        this.currentHeading + diff * this.options.headingSmoothingFactor
      );

      if (Math.abs(this.currentHeading - prevHeading) > 0.1) {
        this.isDirty = true;
      }
    }

    // Calculate effective pulse speed based on confidence state
    this.effectivePulseSpeed = this.getEffectivePulseSpeed();

    // Update pulse animation
    if (this.effectivePulseSpeed > 0) {
      const pulseRadiansPerSecond = this.effectivePulseSpeed * Math.PI * 2;
      this.pulsePhase += pulseRadiansPerSecond * dt;
      if (this.pulsePhase > Math.PI * 2) {
        this.pulsePhase -= Math.PI * 2;
      }
    }

    const needsPulseRender = this.options.showAccuracyRing && this.effectivePulseSpeed > 0 && this.currentLngLat !== null;
    if (this.isDirty || needsPulseRender) {
      this.render();
      this.isDirty = false;
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  private updateAutoConfidence(): void {
    const now = Date.now();
    const timeSinceUpdate = now - this.lastPositionUpdateTime;

    let stalenessConfidence: ConfidenceState = 'high';
    if (timeSinceUpdate >= this.options.stalenessLostThresholdMs) {
      stalenessConfidence = 'lost';
    } else if (timeSinceUpdate >= this.options.stalenessLowThresholdMs) {
      stalenessConfidence = 'low';
    }

    let accuracyConfidence: ConfidenceState = 'high';
    if (this.currentAccuracy >= this.options.accuracyLostThresholdMeters) {
      accuracyConfidence = 'lost';
    } else if (this.currentAccuracy >= this.options.accuracyLowThresholdMeters) {
      accuracyConfidence = 'low';
    }

    const confidencePriority: Record<ConfidenceState, number> = {
      'high': 0,
      'low': 1,
      'lost': 2,
      'warning': 3,
      'danger': 4
    };
    this.confidenceState = confidencePriority[stalenessConfidence] >= confidencePriority[accuracyConfidence]
      ? stalenessConfidence
      : accuracyConfidence;
  }

  /**
   * Get the effective pulse speed based on current confidence state
   */
  private getEffectivePulseSpeed(): number {
    switch (this.confidenceState) {
      case 'warning':
        return 0.35;
      case 'danger':
        return 0.55;
      case 'lost':
        return 0;
      default:
        return this.options.pulseSpeed;
    }
  }

  private render(): void {
    if (!this.isVisible || this.currentLngLat === null) return;

    const ctx = this.ctx;
    const size = this.canvasSize;
    const center = size / 2;

    ctx.clearRect(0, 0, size, size);

    let dotColor = hexToColor(this.options.color);
    let ringColor = hexToColor(this.options.accuracyRingColor);
    const borderColor = hexToColor(this.options.borderColor);
    let coneColor = hexToColor(this.options.coneColor);
    let dotOpacity = 1;

    switch (this.confidenceState) {
      case 'low':
        dotOpacity = 0.7;
        break;
      case 'lost':
        dotColor = '#888888';
        ringColor = '#888888';
        dotOpacity = 0.5;
        break;
      case 'warning':
        dotColor = '#ff9500';
        ringColor = '#ff9500';
        coneColor = '#ff9500';
        break;
      case 'danger':
        dotColor = '#ff3b30';
        ringColor = '#ff3b30';
        coneColor = '#ff3b30';
        break;
    }

    const scale = this.options.overallScale;

    // Calculate accuracy ring size
    let ringRadius = 0;
    if (this.options.showAccuracyRing && this.map) {
      const metersPerPixel = this.getMetersPerPixel();
      ringRadius = Math.min(this.currentAccuracy / metersPerPixel, size / 2 - 10);
      ringRadius = Math.max(ringRadius, (this.options.dotSize + 10) * scale);

      if (this.effectivePulseSpeed > 0) {
        const pulseAmount = 1 + Math.sin(this.pulsePhase) * 0.1;
        ringRadius *= pulseAmount;
      }

      ringRadius *= scale;

      const ringOpacity = Math.max(0.1, 0.3 - (this.currentAccuracy / 500));
      const pulseOpacity = this.effectivePulseSpeed > 0 ? Math.sin(this.pulsePhase) * 0.05 : 0;
      ctx.beginPath();
      ctx.arc(center, center, ringRadius, 0, Math.PI * 2);
      ctx.fillStyle = this.hexToRgba(ringColor, ringOpacity + pulseOpacity);
      ctx.fill();
    }

    // Draw direction cone
    const showCone = this.confidenceState === 'high' || this.confidenceState === 'warning' || this.confidenceState === 'danger';
    if (this.options.showDirectionCone && this.currentHeading !== null && showCone) {
      const isMoving = this.currentSpeed > this.options.minSpeedForDirection;
      if (isMoving || this.deviceHeading !== null) {
        this.drawDirectionCone(ctx, center, this.currentHeading, coneColor, scale);
      }
    }

    // Draw border
    const scaledDotSize = this.options.dotSize * scale;
    const scaledBorderWidth = this.options.borderWidth * scale;
    ctx.beginPath();
    ctx.arc(center, center, scaledDotSize / 2 + scaledBorderWidth, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.globalAlpha = dotOpacity;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Draw dot
    ctx.beginPath();
    ctx.arc(center, center, scaledDotSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.globalAlpha = dotOpacity;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawDirectionCone(ctx: CanvasRenderingContext2D, center: number, heading: number, color: string, scale: number = 1): void {
    const { coneLength, coneWidth, coneOpacity } = this.options;
    const scaledLength = coneLength * scale;
    const scaledWidth = coneWidth * scale;

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((heading - 90) * Math.PI / 180);

    const layers = 5;
    for (let i = layers - 1; i >= 0; i--) {
      const t = i / (layers - 1);
      const layerLength = scaledLength * (1 - t * 0.3);
      const layerWidth = scaledWidth * (1 - t * 0.5);
      const opacity = coneOpacity * (1 - t * 0.6);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(layerLength, -layerWidth / 2);
      ctx.lineTo(layerLength, layerWidth / 2);
      ctx.closePath();
      ctx.fillStyle = this.hexToRgba(color, opacity);
      ctx.fill();
    }

    ctx.restore();
  }

  private getMetersPerPixel(): number {
    if (!this.map || !this.currentLngLat) return 1;

    const lat = this.currentLngLat[1];
    const zoom = this.map.getZoom();
    return 156543.03 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Set the overall scale multiplier for the entire marker
   */
  setOverallScale(scale: number): this {
    if (!isValidNumber(scale) || scale <= 0) {
      sdkWarn(`MapBoxUserMarker.setOverallScale: Invalid scale value: ${scale}`);
      return this;
    }
    this.options.overallScale = scale;
    this.isDirty = true;
    return this;
  }

  /**
   * Get the current overall scale
   */
  getOverallScale(): number {
    return this.options.overallScale;
  }

  /**
   * Set the pulse animation speed
   */
  setPulseSpeed(speed: number): this {
    if (!isValidNumber(speed) || speed < 0) {
      sdkWarn(`MapBoxUserMarker.setPulseSpeed: Invalid speed value: ${speed}`);
      return this;
    }
    this.options.pulseSpeed = speed;
    this.isDirty = true;
    return this;
  }

  /**
   * Get the current pulse speed
   */
  getPulseSpeed(): number {
    return this.options.pulseSpeed;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.stopAnimation();
    this.remove();
    this.cleanupDprListener();

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
