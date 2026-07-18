import { useState, useEffect, useCallback, useRef } from 'react';
import { GeolocationProvider } from '../GeolocationProvider';
import type { LocationData, GeolocationOptions, PermissionState } from '../types';
import type { LocationSource } from '../sources';
import type { RoveError } from '../errors';

export interface UseLocationOptions extends GeolocationOptions {
  /**
   * Custom location source (for testing or replay).
   *
   * When provided, the caller owns the source: on unmount the hook neither
   * stops nor disposes it (it only unsubscribes its own listeners). When
   * omitted, the hook creates and owns an internal GeolocationProvider and
   * stops + disposes it.
   */
  locationSource?: LocationSource;

  /**
   * Auto-start tracking on mount
   * @default false
   */
  autoStart?: boolean;

  /**
   * Enable compass/device orientation
   * @default true
   */
  enableCompass?: boolean;
}

export interface UseLocationResult {
  /** Current location data (null until first update) */
  location: LocationData | null;

  /** Last error that occurred */
  error: RoveError | null;

  /** Current permission state */
  permission: PermissionState;

  /** Whether actively tracking */
  isTracking: boolean;

  /** Whether currently requesting permission */
  isRequesting: boolean;

  /** Start tracking location */
  start: () => Promise<void>;

  /** Stop tracking location */
  stop: () => void;

  /** Request permissions (for iOS compass) */
  requestPermissions: () => Promise<void>;

  /** Current device heading from compass (degrees, 0-360) */
  deviceHeading: number | null;
}

/**
 * React hook for geolocation tracking
 *
 * @example
 * ```tsx
 * function LocationDisplay() {
 *   const { location, error, isTracking, start, stop } = useLocation({
 *     enableHighAccuracy: true,
 *     autoStart: true,
 *   });
 *
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!location) return <div>Waiting for location...</div>;
 *
 *   return (
 *     <div>
 *       <p>Lat: {location.latitude.toFixed(6)}</p>
 *       <p>Lng: {location.longitude.toFixed(6)}</p>
 *       <p>Accuracy: {location.accuracy}m</p>
 *       <button onClick={isTracking ? stop : start}>
 *         {isTracking ? 'Stop' : 'Start'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useLocation(options: UseLocationOptions = {}): UseLocationResult {
  const {
    locationSource,
    autoStart = false,
    enableCompass = true,
    ...geolocationOptions
  } = options;

  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<RoveError | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [isTracking, setIsTracking] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);

  const providerRef = useRef<LocationSource | null>(null);

  // Create provider on mount
  useEffect(() => {
    const ownsProvider = !locationSource;
    const provider = locationSource ?? new GeolocationProvider(geolocationOptions);
    providerRef.current = provider;
    const unsubscribers: Array<() => void> = [];

    // Wire up events
    unsubscribers.push(provider.on('update', (loc) => {
      setLocation(loc);
      setError(null);
    }));

    unsubscribers.push(provider.on('error', (err) => {
      setError(err as RoveError);
    }));

    unsubscribers.push(provider.on('permissionChange', (state) => {
      setPermission(state);
      if (state === 'requesting') {
        setIsRequesting(true);
      } else {
        setIsRequesting(false);
      }
    }));

    // Device orientation for compass
    if (enableCompass && provider instanceof GeolocationProvider) {
      unsubscribers.push(provider.on('deviceOrientation', (event) => {
        let heading: number | null = null;
        if ((event as any).webkitCompassHeading !== undefined) {
          heading = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
          heading = (360 - event.alpha) % 360;
        }
        setDeviceHeading(heading);
      }));
    }

    // Auto-start if requested
    if (autoStart) {
      provider.start().then(() => {
        setIsTracking(true);
        if (enableCompass && provider instanceof GeolocationProvider) {
          provider.startDeviceOrientation();
        }
      }).catch((err) => {
        setError(err as RoveError);
      });
    }

    // Cleanup on unmount
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (ownsProvider) {
        provider.stop();
        provider.dispose();
      }
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const start = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider) return;

    try {
      setError(null);
      await provider.start();
      setIsTracking(true);

      if (enableCompass && provider instanceof GeolocationProvider) {
        provider.startDeviceOrientation();
      }
    } catch (err) {
      setError(err as RoveError);
      throw err;
    }
  }, [enableCompass]);

  const stop = useCallback(() => {
    const provider = providerRef.current;
    if (!provider) return;

    provider.stop();
    if (provider instanceof GeolocationProvider) {
      provider.stopDeviceOrientation();
    }
    setIsTracking(false);
  }, []);

  const requestPermissions = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider || !(provider instanceof GeolocationProvider)) return;

    try {
      await provider.requestDeviceOrientationPermission();
    } catch (err) {
      setError(err as RoveError);
      throw err;
    }
  }, []);

  return {
    location,
    error,
    permission,
    isTracking,
    isRequesting,
    start,
    stop,
    requestPermissions,
    deviceHeading,
  };
}
