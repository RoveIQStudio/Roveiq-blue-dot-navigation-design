// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { createLocationStore } from './index';
import { GeolocationProvider } from '../GeolocationProvider';
import { RoveErrorCode } from '../errors';

describe('createLocationStore', () => {
  beforeEach(() => {
    const watchPosition = vi.fn().mockImplementation((success: PositionCallback) => {
      success({
        coords: { longitude: 1, latitude: 2, accuracy: 5, altitude: null, speed: null,
                  heading: null, altitudeAccuracy: null, toJSON: () => ({}) },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
      return 1;
    });
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } });
  });

  it('can be created outside a Svelte component without throwing', () => {
    expect(() => createLocationStore()).not.toThrow();
  });

  it('tracks location, loading, and isTracking through start/stop', async () => {
    const store = createLocationStore();
    expect(get(store).isTracking).toBe(false);

    await store.start();
    const state = get(store);
    expect(state.location?.longitude).toBe(1);
    expect(state.isTracking).toBe(true);
    expect(state.loading).toBe(false);

    store.stop();
    expect(get(store).isTracking).toBe(false);
    store.dispose();
  });

  it('exposes deviceHeading from device orientation events', async () => {
    const store = createLocationStore();
    await store.start();
    // Reach the internal provider and fire a deviceOrientation event
    const provider = (store as any)._provider as GeolocationProvider;
    (provider as any).emit('deviceOrientation', { alpha: 90, beta: 0, gamma: 0 });
    expect(get(store).deviceHeading).toBe(270); // (360 - alpha) % 360
    store.dispose();
  });

  it('wraps unknown errors with a valid RoveErrorCode', async () => {
    const store = createLocationStore();
    await store.start();
    const provider = (store as any)._provider as GeolocationProvider;
    (provider as any).emit('error', new Error('boom'));
    expect(get(store).error?.code).toBe(RoveErrorCode.INTERNAL_ERROR);
    store.dispose();
  });
});
