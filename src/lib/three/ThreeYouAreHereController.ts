import * as THREE from 'three';
import { ThreeUserMarker } from './ThreeUserMarker';
import { GeolocationProvider } from '../GeolocationProvider';
import { isValidNumber } from '../../utils/validation';
import type { YouAreHereControllerOptions } from '../types';

import type { LocationSource } from '../sources';

/**
 * All-in-one controller that manages geolocation + marker together.
 * Handles coordinate conversion, animation loop, and cleanup automatically.
 *
 * Features:
 * - Automatic coordinate conversion from GPS to scene coordinates
 * - Frame-rate independent animation loop
 * - Proper cleanup and resource management
 * - Thread-safe start/stop operations
 * - Concurrent start() protection with timeout
 *
 * @example
 * ```typescript
 * const controller = new ThreeYouAreHereController({
 *   center: [-74.006, 40.7128], // NYC [lng, lat]
 *   markerOptions: { color: 0x4285F4 },
 *   onUpdate: (location) => console.log(location),
 * });
 *
 * await controller.start(scene);
 * // ... later
 * controller.stop(scene);
 * controller.dispose();
 * ```
 */
export class ThreeYouAreHereController {
  /** The ThreeUserMarker instance - access for customization */
  public readonly marker: ThreeUserMarker;

  /** The LocationSource instance - access for advanced control */
  public readonly geolocation: LocationSource;

  private options: YouAreHereControllerOptions;

  private animationId: number | null = null;
  private isStarted = false;
  private isStarting = false; // Mutex for concurrent start() protection
  private isDisposed = false;
  private isStopping = false; // Flag to stop animation loop cleanly
  private currentScene: THREE.Scene | null = null;

  constructor(options: YouAreHereControllerOptions) {
    this.options = options;

    // Validate required center parameter
    if (!options.center) {
      throw new Error('ThreeYouAreHereController: center option is required');
    }

    if (!Array.isArray(options.center) || options.center.length !== 2) {
      throw new Error('ThreeYouAreHereController: center must be [longitude, latitude] array');
    }

    const [lng, lat] = options.center;
    if (!isValidNumber(lng) || !isValidNumber(lat)) {
      throw new Error(`ThreeYouAreHereController: invalid center coordinates (${lng}, ${lat})`);
    }

    if (options.scale !== undefined && (!isValidNumber(options.scale) || options.scale <= 0)) {
      throw new Error(`ThreeYouAreHereController: scale must be a positive number, got: ${options.scale}`);
    }

    // Create marker with projection pre-configured
    this.marker = new ThreeUserMarker(options.markerOptions);
    this.marker.setProjectionCenter(options.center, options.scale ?? 1);

    // Use injected source or create default GeolocationProvider
    this.geolocation = options.locationSource ?? new GeolocationProvider(options.geolocationOptions);

    // Wire up location updates to marker
    this.geolocation.on('update', (location) => {
      if (this.isDisposed) return;

      // IMPORTANT: Pass altitude as 0 to lngLatToScene because the scale factor
      // is for Mercator projection (horizontal), not altitude (vertical).
      // Altitude would be scaled incorrectly (e.g., 50m * 78271 = millions of units).
      // The marker already adds a small z-offset internally for visibility.
      const [x, y, z] = this.marker.getProjection()?.lngLatToScene(
        location.longitude,
        location.latitude,
        0  // Ignore GPS altitude - it causes marker to be positioned too high
      ) ?? [0, 0, 0];

      // Handle coordinate system based on marker orientation
      if (this.marker.getOrientation() === 'y-up') {
        // Standard Three.js: Y is up, -Z is North
        // Map data: x=East, y=North, z=Altitude
        // We map: x->x, y->-z, z->y
        this.marker.setPosition(x, z, -y);
      } else {
        // Z-up (MapLibre/GIS default): x=East, y=North, z=Up
        this.marker.setPosition(x, y, z);
      }
      this.marker.setAccuracy(location.accuracy);
      this.marker.setHeading(location.heading, location.speed);
      options.onUpdate?.(location);
    });

    // Wire up error handling
    this.geolocation.on('error', (error) => {
      if (this.isDisposed) return;
      options.onError?.(error as Error);
    });

    // Wire up permission changes
    this.geolocation.on('permissionChange', (state) => {
      if (this.isDisposed) return;
      options.onPermissionChange?.(state);
    });

    // Wire up device orientation (compass)
    // Note: The marker's setDeviceHeading() handles smoothing internally,
    // so we pass the raw heading values directly without pre-smoothing
    this.geolocation.on('deviceOrientation', (event) => {
      if (this.isDisposed) return;

      // Calculate compass heading from device orientation event
      // webkitCompassHeading is available on iOS and provides true north heading
      // alpha provides rotation around z-axis on Android/standard browsers
      let heading: number | null = null;

      if ((event as any).webkitCompassHeading !== undefined) {
        // iOS - webkitCompassHeading is already compass heading (0=N, 90=E)
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Android / Standard
        // alpha is degrees [0, 360) where 0 = North, increasing counter-clockwise
        // Convert to compass heading where 0=N, increasing clockwise (90=E)
        heading = (360 - event.alpha) % 360;
      }

      // Pass raw heading - marker handles smoothing
      this.marker.setDeviceHeading(heading);
    });

    // Wire up visibility resume - reset staleness timer so marker doesn't
    // immediately show "lost" state while waiting for GPS to get a new fix
    this.geolocation.on('resume', () => {
      if (this.isDisposed) return;
      this.marker.resetStalenessTimer();
    });
  }

  /**
   * Request necessary permissions (specifically Compass on iOS 13+).
   * Call this from a user interaction event handler (like a button click).
   * 
   * On iOS, this triggers the "Allow access to Motion & Orientation?" prompt.
   * On Android/Desktop, this is usually a no-op (resolves immediately).
   */
  async requestPermissions(): Promise<void> {
    if (this.options.enableCompass !== false) {
      if (this.geolocation instanceof GeolocationProvider) {
        await this.geolocation.requestDeviceOrientationPermission();
      }
    }
  }

  /**
   * Add marker to scene and start geolocation tracking + animation loop
   * Thread-safe: concurrent calls are handled properly
   * @param scene The Three.js scene to add the marker to
   */
  async start(scene: THREE.Scene): Promise<void> {
    if (this.isDisposed) {
      throw new Error('ThreeYouAreHereController: Cannot start disposed controller');
    }

    // Already started - no-op
    if (this.isStarted) {
      return;
    }

    // Prevent concurrent start() race condition
    if (this.isStarting) {
      // Wait for the existing start to complete (with timeout)
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 100; // 5 second timeout (100 * 50ms)
        const checkInterval = setInterval(() => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(checkInterval);
            reject(new Error('ThreeYouAreHereController: Start timed out waiting for concurrent operation'));
            return;
          }
          if (!this.isStarting) {
            clearInterval(checkInterval);
            if (this.isStarted) {
              resolve();
            } else {
              reject(new Error('ThreeYouAreHereController: Start failed'));
            }
          }
        }, 50);
      });
    }

    this.isStarting = true;

    try {
      this.currentScene = scene;
      scene.add(this.marker);

      // Start geolocation (may throw on permission denied)
      await this.geolocation.start();

      // Start compass listener (no-op if not supported)
      // Only if enabled in options (default: true) and provider supports it
      if (this.options.enableCompass !== false && this.geolocation instanceof GeolocationProvider) {
        this.geolocation.startDeviceOrientation();
      }

      // Only start animation after geolocation succeeds
      this.isStopping = false;
      this.startAnimation();
      this.isStarted = true;
    } catch (error) {
      // Clean up on failure
      scene.remove(this.marker);
      this.currentScene = null;
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop tracking and remove marker from scene
   * @param scene The Three.js scene to remove the marker from (optional if same as start)
   */
  stop(scene?: THREE.Scene): void {
    if (!this.isStarted) return;

    // Signal animation loop to stop
    this.isStopping = true;
    this.stopAnimation();
    this.geolocation.stop();
    
    if (this.geolocation instanceof GeolocationProvider) {
      this.geolocation.stopDeviceOrientation();
    }

    // Use provided scene or the one from start()
    const targetScene = scene ?? this.currentScene;
    if (targetScene) {
      targetScene.remove(this.marker);
    }

    this.currentScene = null;
    this.isStarted = false;
  }

  /**
   * Check if controller is currently active
   */
  isActive(): boolean {
    return this.isStarted && !this.isDisposed;
  }

  private startAnimation(): void {
    // Cancel any existing animation loop first
    this.stopAnimation();

    let lastTime = performance.now();

    const animate = () => {
      // Check if we should stop (disposed or stop() called)
      if (this.isDisposed || this.isStopping) {
        this.animationId = null;
        return;
      }

      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Clamp deltaTime to prevent huge jumps if tab was inactive
      const clampedDt = Math.min(dt, 0.1); // Max 100ms

      this.marker.update(clampedDt);
      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  private stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Clean up all resources (marker, geolocation, animation)
   * After calling dispose(), the controller cannot be reused
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;
    this.isStopping = true;
    this.stopAnimation();
    this.geolocation.dispose();
    this.marker.dispose();
    this.currentScene = null;
  }
}
