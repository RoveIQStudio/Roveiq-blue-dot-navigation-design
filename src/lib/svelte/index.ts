import { writable } from 'svelte/store';
import { onDestroy } from 'svelte';
import { GeolocationProvider } from '../GeolocationProvider';
import type { LocationData, PermissionState } from '../types';
import { RoveError, RoveErrorCode } from '../errors';

export interface LocationStoreState {
  location: LocationData | null;
  error: RoveError | null;
  permission: PermissionState;
  loading: boolean;
  isTracking: boolean;
  /** Compass heading in degrees (0 = north), null until an orientation event arrives */
  deviceHeading: number | null;
}

const INITIAL_STATE: LocationStoreState = {
  location: null,
  error: null,
  permission: 'prompt',
  loading: false,
  isTracking: false,
  deviceHeading: null,
};

/**
 * Svelte store wrapper for the RoveMaps GeolocationProvider.
 *
 * When created inside a Svelte component, resources are released automatically
 * on component destroy. When created outside component context (e.g. a plain
 * module), the caller owns cleanup and must call `dispose()`.
 */
export function createLocationStore(options: ConstructorParameters<typeof GeolocationProvider>[0] = {}) {
  const { subscribe, set, update } = writable<LocationStoreState>(INITIAL_STATE);
  let provider: GeolocationProvider | null = null;

  function ensureProvider(): GeolocationProvider {
    if (provider) return provider;
    provider = new GeolocationProvider(options);

    provider.on('update', (location) => {
      update((s) => ({ ...s, location, loading: false, error: null }));
    });

    provider.on('error', (err) => {
      const roveError = err instanceof RoveError
        ? err
        : new RoveError(RoveErrorCode.INTERNAL_ERROR, (err as Error).message ?? String(err));
      update((s) => ({ ...s, error: roveError, loading: false }));
    });

    provider.on('permissionChange', (permission) => {
      update((s) => ({ ...s, permission }));
    });

    provider.on('deviceOrientation', (event) => {
      let heading: number | null = null;
      if ((event as any).webkitCompassHeading !== undefined) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = (360 - event.alpha) % 360;
      }
      update((s) => ({ ...s, deviceHeading: heading }));
    });

    return provider;
  }

  async function start() {
    update((s) => ({ ...s, loading: true, error: null }));
    const p = ensureProvider();

    try {
      await p.start();
      p.startDeviceOrientation();
      update((s) => ({ ...s, isTracking: true, loading: false }));
    } catch {
      // The 'error' listener above has already captured the failure state.
      update((s) => ({ ...s, loading: false }));
    }
  }

  function stop() {
    if (provider) {
      provider.stop();
      provider.stopDeviceOrientation();
      update((s) => ({ ...s, loading: false, isTracking: false }));
    }
  }

  function dispose() {
    if (provider) {
      provider.dispose();
      provider = null;
    }
    set(INITIAL_STATE);
  }

  // Auto-teardown when used inside a component; harmless no-op outside.
  try {
    onDestroy(dispose);
  } catch {
    // Created outside component context — caller owns dispose().
  }

  const store = {
    subscribe,
    start,
    stop,
    dispose,
    requestPermissions: () => ensureProvider().requestDeviceOrientationPermission(),
  };

  // Test-only escape hatch for reaching the internal provider.
  Object.defineProperty(store, '_provider', { get: () => provider, enumerable: false });

  return store;
}
