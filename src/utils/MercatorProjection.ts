/**
 * Web Mercator projection utilities
 * EPSG:3857 projection for Three.js compatibility
 */

import { isValidNumber } from './validation';
import { sdkWarn } from '../lib/types';

/** Maximum valid latitude for Web Mercator projection */
const MAX_MERCATOR_LATITUDE = 85.05112878;

/** Minimum valid latitude for Web Mercator projection */
const MIN_MERCATOR_LATITUDE = -85.05112878;

/**
 * Normalizes longitude to [-180, 180] range
 */
function normalizeLongitude(lng: number): number {
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return lng;
}

export class MercatorProjection {
  private centerLng: number;
  private centerLat: number;
  private centerX: number;  // Mercator X of center
  private centerY: number;  // Mercator Y of center
  private scale: number;

  constructor(center: [number, number], scale: number = 1) {
    // Validate center coordinates
    if (!Array.isArray(center) || center.length !== 2) {
      throw new Error('MercatorProjection: center must be [longitude, latitude] array');
    }

    const [lng, lat] = center;

    if (!isValidNumber(lng)) {
      throw new Error(`MercatorProjection: invalid longitude: ${lng}`);
    }
    if (!isValidNumber(lat)) {
      throw new Error(`MercatorProjection: invalid latitude: ${lat}`);
    }
    if (!isValidNumber(scale) || scale <= 0) {
      throw new Error(`MercatorProjection: scale must be a positive number, got: ${scale}`);
    }

    // Normalize and clamp coordinates
    this.centerLng = normalizeLongitude(lng);
    this.centerLat = Math.max(MIN_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));

    // Calculate Mercator coordinates of center point
    this.centerX = this.lngToMercatorX(this.centerLng);
    this.centerY = this.latToMercatorY(this.centerLat);

    this.scale = scale;
  }

  /**
   * Convert longitude to Mercator X
   * Range: [0, 1] where 0 = -180°, 0.5 = 0°, 1 = 180°
   */
  private lngToMercatorX(lng: number): number {
    return (lng + 180) / 360;
  }

  /**
   * Convert latitude to Mercator Y
   * Uses the Web Mercator projection formula
   * Range: [0, 1] where 0 = 85.05°N, 0.5 = 0°, 1 = 85.05°S
   */
  private latToMercatorY(lat: number): number {
    // Clamp latitude to valid Mercator range
    const clampedLat = Math.max(MIN_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
    const y = Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360));
    return (1 - y / Math.PI) / 2;
  }

  /**
   * Convert WGS84 coordinates to Three.js scene coordinates
   * Matches MapLibre's Web Mercator projection
   *
   * @param lng Longitude in degrees
   * @param lat Latitude in degrees
   * @param altitude Altitude in meters (optional) - NOT scaled by Mercator distortion
   * @returns [x, y, z] coordinates in Three.js scene units, or [0, 0, 0] for invalid input
   */
  lngLatToScene(lng: number, lat: number, altitude: number = 0): [number, number, number] {
    // Validate inputs - return origin for invalid coordinates
    if (!isValidNumber(lng) || !isValidNumber(lat)) {
      sdkWarn(`MercatorProjection.lngLatToScene: invalid coordinates (${lng}, ${lat}), returning origin`);
      return [0, 0, 0];
    }

    // Normalize longitude and clamp latitude
    const normalizedLng = normalizeLongitude(lng);
    const clampedLat = Math.max(MIN_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));

    // Convert to Mercator coordinates
    const mercX = this.lngToMercatorX(normalizedLng);
    const mercY = this.latToMercatorY(clampedLat);

    // Calculate offset from center in Mercator units
    const deltaX = mercX - this.centerX;
    const deltaY = mercY - this.centerY;

    // Convert to scene units (matching MapLibre's scale)
    // The 512 factor comes from MapLibre's tile coordinate system
    const MERCATOR_COORDINATE_SCALE = 512 * this.scale;
    const x = deltaX * MERCATOR_COORDINATE_SCALE;
    // In MapLibre, Y increases downward (south), but in Three.js Z-up, Y increases north
    // So we negate Y to match the coordinate system
    const y = -deltaY * MERCATOR_COORDINATE_SCALE;

    // Altitude: Return as-is without scaling. GPS altitude is notoriously inaccurate
    // and scaling it by the Mercator factor would produce unusably large values.
    // Callers should generally pass 0 and handle elevation separately if needed.
    const z = isValidNumber(altitude) ? altitude : 0;

    return [x, y, z];
  }

  /**
   * Convert Three.js scene coordinates back to WGS84
   * @param x Scene X coordinate
   * @param y Scene Y coordinate
   * @param z Scene Z coordinate (optional, for altitude)
   * @returns [longitude, latitude] in degrees, or [0, 0] for invalid input
   */
  sceneToLngLat(x: number, y: number, _z?: number): [number, number] {
    // Validate inputs
    if (!isValidNumber(x) || !isValidNumber(y)) {
      sdkWarn(`MercatorProjection.sceneToLngLat: invalid coordinates (${x}, ${y}), returning origin`);
      return [0, 0];
    }

    const MERCATOR_COORDINATE_SCALE = 512 * this.scale;

    // Convert from scene units to Mercator offset
    const deltaX = x / MERCATOR_COORDINATE_SCALE;
    // Negate Y because we negated it in lngLatToScene
    const deltaY = -y / MERCATOR_COORDINATE_SCALE;

    // Add to center Mercator coordinates
    const mercX = this.centerX + deltaX;
    const mercY = this.centerY + deltaY;

    // Convert back to lng/lat
    const lng = normalizeLongitude(mercX * 360 - 180);

    // Inverse Mercator Y to latitude conversion
    const y2 = (1 - mercY * 2) * Math.PI;
    const lat = Math.max(MIN_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE,
      Math.atan(Math.sinh(y2)) * 180 / Math.PI));

    return [lng, lat];
  }

  /**
   * Convert scene Z coordinate back to altitude in meters
   * Note: Since altitude is no longer scaled, this just returns z as-is
   */
  sceneZToAltitude(z: number): number {
    if (!isValidNumber(z)) {
      return 0;
    }
    return z;  // No longer scaled
  }

  /**
   * Update the projection center
   * @throws Error if center coordinates are invalid
   */
  setCenter(center: [number, number]): void {
    if (!Array.isArray(center) || center.length !== 2) {
      throw new Error('MercatorProjection.setCenter: center must be [longitude, latitude] array');
    }

    const [lng, lat] = center;

    if (!isValidNumber(lng)) {
      throw new Error(`MercatorProjection.setCenter: invalid longitude: ${lng}`);
    }
    if (!isValidNumber(lat)) {
      throw new Error(`MercatorProjection.setCenter: invalid latitude: ${lat}`);
    }

    this.centerLng = normalizeLongitude(lng);
    this.centerLat = Math.max(MIN_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
    this.centerX = this.lngToMercatorX(this.centerLng);
    this.centerY = this.latToMercatorY(this.centerLat);
  }

  /**
   * Update the scale factor
   * @throws Error if scale is not a positive number
   */
  setScale(scale: number): void {
    if (!isValidNumber(scale) || scale <= 0) {
      throw new Error(`MercatorProjection.setScale: scale must be a positive number, got: ${scale}`);
    }
    this.scale = scale;
  }

  getCenter(): [number, number] {
    return [this.centerLng, this.centerLat];
  }

  getScale(): number {
    return this.scale;
  }
}

