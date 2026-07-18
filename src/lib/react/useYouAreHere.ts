import { useState, useEffect, useCallback, useRef } from 'react';
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
import type { RoveError } from '../errors';

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
   * Custom location source (for testing or replay).
   *
   * When provided, the caller owns the source: the hook will not dispose it on
   * unmount (it only unsubscribes its own listeners). When omitted, the hook
   * creates and owns an internal GeolocationProvider and disposes it.
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
  onError?: (error: RoveError) => void;
}

export interface UseYouAreHereResult {
  /**
   * The ThreeUserMarker instance to add to your scene.
   *
   * `null` until the mount effect runs — the marker is created inside an effect
   * (never during render) so React StrictMode's discarded first render cannot
   * leak GPU resources. Guard for null before rendering it.
   */
  marker: ThreeUserMarker | null;

  /** Current location data */
  location: LocationData | null;

  /** Scene position [x, y, z] */
  scenePosition: [number, number, number] | null;

  /** Last error */
  error: RoveError | null;

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
 *   // `marker` is null until the mount effect runs — guard before rendering.
 *   if (!marker) return null;
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
  const [error, setError] = useState<RoveError | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [confidence, setConfidence] = useState<ConfidenceState>('high');
  const [isTracking, setIsTracking] = useState(false);

  // Refs for stable instances
  const providerRef = useRef<LocationSource | null>(null);
  const markerRef = useRef<ThreeUserMarker | null>(null);
  const projectionRef = useRef<MercatorProjection | null>(null);

  // Marker is created in the mount effect (never during render) so StrictMode's
  // discarded render can't leak GPU resources. Null until the effect runs.
  const [marker, setMarker] = useState<ThreeUserMarker | null>(null);

  // Always call the latest callbacks — consumers pass inline arrows every render.
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
  });

  // Keep the projection in sync with props. Depend on the center's components
  // (not the array identity) so a fresh `[lng, lat]` literal with unchanged
  // values doesn't needlessly rebuild the projection — while keeping
  // react-hooks/exhaustive-deps satisfied without an eslint-disable.
  const [centerLng, centerLat] = center;
  useEffect(() => {
    const nextCenter: [number, number] = [centerLng, centerLat];
    projectionRef.current = new MercatorProjection(nextCenter, scale);
    markerRef.current?.setProjectionCenter(nextCenter, scale);
  }, [centerLng, centerLat, scale]);

  // Create marker + provider together; tear both down symmetrically.
  useEffect(() => {
    const m = new ThreeUserMarker(markerOptions);
    m.setProjectionCenter(center, scale);
    markerRef.current = m;
    setMarker(m);

    const ownsProvider = !locationSource;
    const provider = locationSource ?? new GeolocationProvider(geolocationOptions);
    providerRef.current = provider;
    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(provider.on('update', (loc) => {
      setLocation(loc);
      setError(null);

      const projection = projectionRef.current;
      if (projection) {
        const [x, y, z] = projection.lngLatToScene(
          loc.longitude,
          loc.latitude,
          loc.altitude ?? 0
        );
        setScenePosition([x, y, z]);

        if (m.getOrientation() === 'y-up') {
          m.setPosition(x, z, -y);
        } else {
          m.setPosition(x, y, z);
        }
        m.setAccuracy(loc.accuracy);
        m.setHeading(loc.heading, loc.speed);
      }

      onUpdateRef.current?.(loc);
    }));

    unsubscribers.push(provider.on('error', (err) => {
      const roveError = err as RoveError;
      setError(roveError);
      onErrorRef.current?.(roveError);
    }));

    unsubscribers.push(provider.on('permissionChange', (state) => {
      setPermission(state);
    }));

    if (enableCompass && provider instanceof GeolocationProvider) {
      unsubscribers.push(provider.on('deviceOrientation', (event) => {
        let heading: number | null = null;
        if ((event as any).webkitCompassHeading !== undefined) {
          heading = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
          heading = (360 - event.alpha) % 360;
        }
        m.setDeviceHeading(heading);
      }));
    }

    if (autoStart) {
      provider.start().then(() => {
        setIsTracking(true);
        if (enableCompass && provider instanceof GeolocationProvider) {
          provider.startDeviceOrientation();
        }
      }).catch((err) => {
        setError(err as RoveError);
        onErrorRef.current?.(err as RoveError);
      });
    }

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (ownsProvider) {
        provider.stop();
        provider.dispose();
      }
      providerRef.current = null;

      m.dispose();
      markerRef.current = null;
      setMarker(null);
    };
    // Intentionally mount-only: option changes require a remount (documented);
    // callbacks flow through refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSource]);

  // Track confidence changes
  useEffect(() => {
    if (!marker) return;

    const checkConfidence = () => {
      setConfidence(marker.getConfidence());
    };

    // Poll confidence (it can change from staleness)
    const interval = setInterval(checkConfidence, 1000);
    return () => clearInterval(interval);
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
      setError(err as RoveError);
      onErrorRef.current?.(err as RoveError);
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

  // Update function for animation loop
  const update = useCallback(
    (deltaTime: number, camera?: THREE.Camera, target?: THREE.Vector3) => {
      markerRef.current?.update(deltaTime, camera, target);
    },
    []
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
