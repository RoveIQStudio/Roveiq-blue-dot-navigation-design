import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeUserMarker } from '../three/ThreeUserMarker';
import { GeolocationProvider } from '../GeolocationProvider';
import { MercatorProjection } from '../../utils/MercatorProjection';
import type {
  LocationData,
  UserMarkerOptions,
  GeolocationOptions,
  PermissionState,
  ConfidenceState,
} from '../types';
import type { LocationSource } from '../sources';

export interface UseYouAreHereOptions {
  /**
   * Center point for coordinate conversion [longitude, latitude]
   * @required
   */
  center: [number, number];

  /**
   * Scale factor for coordinate conversion
   * @default 1
   */
  scale?: number;

  /**
   * Options for the ThreeUserMarker visual appearance
   */
  markerOptions?: UserMarkerOptions;

  /**
   * Options for geolocation (ignored if locationSource provided)
   */
  geolocationOptions?: GeolocationOptions;

  /**
   * Custom location source (for testing or replay)
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

  /**
   * Callback fired on each location update
   */
  onUpdate?: (location: LocationData) => void;

  /**
   * Callback fired on errors
   */
  onError?: (error: Error) => void;
}

export interface UseYouAreHereResult {
  /** The ThreeUserMarker instance to add to your scene */
  marker: ThreeUserMarker;

  /** Current location data */
  location: LocationData | null;

  /** Scene position [x, y, z] */
  scenePosition: [number, number, number] | null;

  /** Last error */
  error: Error | null;

  /** Permission state */
  permission: PermissionState;

  /** Confidence state */
  confidence: ConfidenceState;

  /** Whether actively tracking */
  isTracking: boolean;

  /** Start tracking */
  start: () => Promise<void>;

  /** Stop tracking */
  stop: () => void;

  /** Request permissions (iOS compass) */
  requestPermissions: () => Promise<void>;

  /** Update marker animation (call in useFrame) */
  update: (deltaTime: number, camera?: THREE.Camera, target?: THREE.Vector3) => void;
}

/**
 * React hook for "You Are Here" marker with geolocation
 *
 * @example
 * ```tsx
 * import { Canvas, useFrame, useThree } from '@react-three/fiber';
 * import { useYouAreHere } from 'rovemaps-you-are-here/react';
 *
 * function YouAreHereMarker() {
 *   const { marker, update, start } = useYouAreHere({
 *     center: [-74.006, 40.7128], // NYC
 *     autoStart: true,
 *   });
 *
 *   const { camera } = useThree();
 *
 *   useFrame((_, delta) => {
 *     update(delta, camera);
 *   });
 *
 *   return <primitive object={marker} />;
 * }
 *
 * function App() {
 *   return (
 *     <Canvas>
 *       <YouAreHereMarker />
 *     </Canvas>
 *   );
 * }
 * ```
 */
export function useYouAreHere(options: UseYouAreHereOptions): UseYouAreHereResult {
  const {
    center,
    scale = 1,
    markerOptions,
    geolocationOptions,
    locationSource,
    autoStart = false,
    enableCompass = true,
    onUpdate,
    onError,
  } = options;

  // State
  const [location, setLocation] = useState<LocationData | null>(null);
  const [scenePosition, setScenePosition] = useState<[number, number, number] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [confidence, setConfidence] = useState<ConfidenceState>('high');
  const [isTracking, setIsTracking] = useState(false);

  // Refs for stable instances
  const providerRef = useRef<LocationSource | null>(null);
  const projectionRef = useRef<MercatorProjection | null>(null);

  // Create marker once (memoized)
  const marker = useMemo(() => {
    const m = new ThreeUserMarker(markerOptions);
    m.setProjectionCenter(center, scale);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only create once

  // Create projection for coordinate conversion
  useEffect(() => {
    projectionRef.current = new MercatorProjection(center, scale);
  }, [center, scale]);

  // Setup provider and event handlers
  useEffect(() => {
    const provider = locationSource ?? new GeolocationProvider(geolocationOptions);
    providerRef.current = provider;

    // Location updates
    provider.on('update', (loc) => {
      setLocation(loc);
      setError(null);

      // Convert to scene coordinates
      const projection = projectionRef.current;
      if (projection) {
        const [x, y, z] = projection.lngLatToScene(
          loc.longitude,
          loc.latitude,
          loc.altitude ?? 0
        );

        setScenePosition([x, y, z]);

        // Update marker position
        if (marker.getOrientation() === 'y-up') {
          marker.setPosition(x, z, -y);
        } else {
          marker.setPosition(x, y, z);
        }
        marker.setAccuracy(loc.accuracy);
        marker.setHeading(loc.heading, loc.speed);
      }

      onUpdate?.(loc);
    });

    // Errors
    provider.on('error', (err) => {
      const error = err as Error;
      setError(error);
      onError?.(error);
    });

    // Permission changes
    provider.on('permissionChange', (state) => {
      setPermission(state);
    });

    // Device orientation (compass)
    if (enableCompass && provider instanceof GeolocationProvider) {
      provider.on('deviceOrientation', (event) => {
        let heading: number | null = null;
        if ((event as any).webkitCompassHeading !== undefined) {
          heading = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
          heading = (360 - event.alpha) % 360;
        }
        marker.setDeviceHeading(heading);
      });
    }

    // Auto-start
    if (autoStart) {
      provider.start().then(() => {
        setIsTracking(true);
        if (enableCompass && provider instanceof GeolocationProvider) {
          provider.startDeviceOrientation();
        }
      }).catch((err) => {
        setError(err);
        onError?.(err);
      });
    }

    // Cleanup
    return () => {
      provider.stop();
      provider.dispose();
      providerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Track confidence changes
  useEffect(() => {
    const checkConfidence = () => {
      setConfidence(marker.getConfidence());
    };

    // Poll confidence (it can change from staleness)
    const interval = setInterval(checkConfidence, 1000);
    return () => clearInterval(interval);
  }, [marker]);

  // Cleanup marker on unmount
  useEffect(() => {
    return () => {
      marker.dispose();
    };
  }, [marker]);

  // Actions
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
      setError(err as Error);
      onError?.(err as Error);
      throw err;
    }
  }, [enableCompass, onError]);

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
      setError(err as Error);
      throw err;
    }
  }, []);

  // Update function for animation loop
  const update = useCallback(
    (deltaTime: number, camera?: THREE.Camera, target?: THREE.Vector3) => {
      marker.update(deltaTime, camera, target);
    },
    [marker]
  );

  return {
    marker,
    location,
    scenePosition,
    error,
    permission,
    confidence,
    isTracking,
    start,
    stop,
    requestPermissions,
    update,
  };
}
