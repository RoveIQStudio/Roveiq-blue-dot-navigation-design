import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useYouAreHere } from 'rovemaps-you-are-here';

interface YouAreHereMarkerProps {
  center: [number, number];
  isTracking: boolean;
  onTrackingChange: (tracking: boolean) => void;
  onPermissionChange: (hasPermission: boolean) => void;
}

export default function YouAreHereMarker({
  center,
  isTracking,
  onTrackingChange,
  onPermissionChange,
}: YouAreHereMarkerProps) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const hasStartedRef = useRef(false);

  const {
    marker,
    location,
    error,
    permission,
    start,
    stop,
    update,
    requestPermissions,
  } = useYouAreHere({
    center,
    scale: 1,
    markerOptions: {
      color: 0x4285f4,
      showAccuracyRing: true,
      showDirectionCone: true,
      orientation: 'z-up',
    },
    geolocationOptions: {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    },
    enableCompass: true,
    onError: (err) => {
      console.error('Location error:', err);
    },
  });

  // Handle tracking state changes
  useEffect(() => {
    if (isTracking && !hasStartedRef.current) {
      hasStartedRef.current = true;
      requestPermissions()
        .catch(() => {})
        .finally(() => {
          start()
            .then(() => {
              onPermissionChange(true);
            })
            .catch((err) => {
              console.error('Failed to start:', err);
              onTrackingChange(false);
              hasStartedRef.current = false;
            });
        });
    } else if (!isTracking && hasStartedRef.current) {
      stop();
      hasStartedRef.current = false;
    }
  }, [isTracking, start, stop, requestPermissions, onTrackingChange, onPermissionChange]);

  // Update permission state
  useEffect(() => {
    onPermissionChange(permission === 'granted');
  }, [permission, onPermissionChange]);

  // Log errors
  useEffect(() => {
    if (error) {
      console.error('Location error:', error.message);
    }
  }, [error]);

  // Update marker animation every frame
  useFrame((_, delta) => {
    if (location && marker) {
      targetRef.current.copy(marker.position);
    }
    update(delta, camera, targetRef.current);
  });

  // `marker` is null until the hook's mount effect runs (StrictMode-safe).
  if (!marker) return null;
  return <primitive object={marker} />;
}
