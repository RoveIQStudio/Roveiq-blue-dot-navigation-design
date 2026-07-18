import { writable } from 'svelte/store';
import { GeolocationProvider } from '../GeolocationProvider';
import type { LocationData, PermissionState } from '../types';
import { RoveError } from '../errors';

export interface LocationStoreState {
  location: LocationData | null;
  error: RoveError | null;
  permission: PermissionState;
  loading: boolean;
}

const INITIAL_STATE: LocationStoreState = {
  location: null,
  error: null,
  permission: 'prompt',
  loading: false
};

/**
 * Svelte store wrapper for RoveMaps GeolocationProvider
 */
export function createLocationStore(options: ConstructorParameters<typeof GeolocationProvider>[0] = {}) {
  const { subscribe, set, update } = writable<LocationStoreState>(INITIAL_STATE);
  let provider: GeolocationProvider | null = null;

  async function start() {
    update(s => ({ ...s, loading: true, error: null }));
    
    if (!provider) {
      provider = new GeolocationProvider(options);

      provider.on('update', (location) => {
        update(s => ({ ...s, location, loading: false, error: null }));
      });

      provider.on('error', (err) => {
        // Wrap generic errors if necessary, though Provider now emits RoveError
        const roveError = err instanceof RoveError ? err : new RoveError((err as any).code || 'UNKNOWN', err.message);
        update(s => ({ ...s, error: roveError, loading: false }));
      });

      provider.on('permissionChange', (permission) => {
        update(s => ({ ...s, permission }));
      });
    }

    try {
      await provider.start();
    } catch {
      // Error is already handled by 'error' listener above, but start() rejects too
      // We don't need to double-set state here usually
    }
  }

  function stop() {
    if (provider) {
      provider.stop();
      update(s => ({ ...s, loading: false }));
    }
  }

  function dispose() {
    if (provider) {
      provider.dispose();
      provider = null;
    }
    set(INITIAL_STATE);
  }

  return {
    subscribe,
    start,
    stop,
    dispose,
    requestPermissions: () => provider?.requestDeviceOrientationPermission()
  };
}
