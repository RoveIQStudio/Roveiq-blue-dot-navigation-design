import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useYouAreHere } from './useYouAreHere';
import { ThreeUserMarker } from '../three/ThreeUserMarker';
import { GeolocationProvider } from '../GeolocationProvider';
import { RoveError, RoveErrorCode } from '../errors';
import type { LocationSource } from '../sources';
import type { LocationData } from '../types';

// Mock the ThreeUserMarker module - factory must be self-contained due to hoisting
vi.mock('../three/ThreeUserMarker', () => {
    // Create mock class inside factory to avoid hoisting issues
    class MockThreeUserMarker {
        // Track every constructed instance so tests can assert that each one
        // is disposed (StrictMode double-mount creates two markers).
        static instances: MockThreeUserMarker[] = [];

        private _confidence: 'high' | 'medium' | 'low' | 'lost' = 'high';
        disposed = false;

        setProjectionCenter = vi.fn().mockReturnThis();
        setPosition = vi.fn().mockReturnThis();
        setAccuracy = vi.fn().mockReturnThis();
        setHeading = vi.fn().mockReturnThis();
        setDeviceHeading = vi.fn().mockReturnThis();
        setConfidence = vi.fn().mockImplementation((conf: any) => {
            this._confidence = conf;
            return this;
        });
        getConfidence = vi.fn().mockImplementation(() => this._confidence);
        getOrientation = vi.fn().mockReturnValue('y-up');
        update = vi.fn();

        // Three.js Object3D-like properties
        position = { x: 0, y: 0, z: 0, set: vi.fn() };
        scale = { x: 1, y: 1, z: 1, set: vi.fn() };
        visible = true;
        add = vi.fn();
        remove = vi.fn();
        children: any[] = [];

        constructor() {
            MockThreeUserMarker.instances.push(this);
        }

        // Defined on the prototype (not an instance vi.fn) so that
        // vi.spyOn(ThreeUserMarker.prototype, 'dispose') counts dispose calls
        // across ALL instances, and instance-level spies still work.
        dispose(): void {
            this.disposed = true;
        }
    }

    return {
        ThreeUserMarker: MockThreeUserMarker,
    };
});

// Mock location source for testing
class MockLocationSource implements LocationSource {
    private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
    private started = false;
    private lastLocation: LocationData | null = null;
    private permissionState: 'prompt' | 'granted' | 'denied' = 'prompt';

    on(event: string, listener: (...args: any[]) => void): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
        return () => this.off(event, listener);
    }

    off(event: string, listener: (...args: any[]) => void): void {
        this.listeners.get(event)?.delete(listener);
    }

    emit(event: string, ...args: any[]): void {
        this.listeners.get(event)?.forEach((listener) => listener(...args));
    }

    async start(): Promise<void> {
        this.started = true;
        this.permissionState = 'granted';
        this.emit('permissionChange', 'granted');
    }

    stop(): void {
        this.started = false;
    }

    getLastLocation(): LocationData | null {
        return this.lastLocation;
    }

    getPermissionState(): 'prompt' | 'granted' | 'denied' {
        return this.permissionState;
    }

    dispose(): void {
        this.listeners.clear();
        this.started = false;
    }

    isStarted(): boolean {
        return this.started;
    }

    simulateLocationUpdate(location: LocationData): void {
        this.lastLocation = location;
        this.emit('update', location);
    }

    // Alias matching Task 5's OrientationMockSource API.
    emitUpdate(location: LocationData): void {
        this.lastLocation = location;
        this.emit('update', location);
    }

    simulateError(error: Error): void {
        this.emit('error', error);
    }
}

describe('useYouAreHere', () => {
    let mockSource: MockLocationSource;

    beforeEach(() => {
        vi.useFakeTimers();
        mockSource = new MockLocationSource();
    });

    afterEach(() => {
        mockSource.dispose();
        vi.useRealTimers();
    });

    const testLocation: LocationData = {
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 10,
        altitude: 50,
        heading: 45,
        speed: 2,
        timestamp: Date.now(),
    };

    // Helper function to create options with current mockSource
    const getOptions = (overrides = {}) => ({
        center: [-74.006, 40.7128] as [number, number],
        locationSource: mockSource,
        ...overrides,
    });

    describe('initialization', () => {
        it('returns a marker instance', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.marker).toBeDefined();
        });

        it('returns null location initially', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.location).toBeNull();
        });

        it('returns null scenePosition initially', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.scenePosition).toBeNull();
        });

        it('returns null error initially', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.error).toBeNull();
        });

        it('returns prompt permission initially', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.permission).toBe('prompt');
        });

        it('returns high confidence initially', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.confidence).toBe('high');
        });

        it('returns false isTracking initially', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(result.current.isTracking).toBe(false);
        });
    });

    describe('start()', () => {
        it('starts tracking', async () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            await act(async () => {
                await result.current.start();
            });

            expect(result.current.isTracking).toBe(true);
        });

        it('updates permission state', async () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            await act(async () => {
                await result.current.start();
            });

            expect(result.current.permission).toBe('granted');
        });
    });

    describe('stop()', () => {
        it('stops tracking', async () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            await act(async () => {
                await result.current.start();
            });

            expect(result.current.isTracking).toBe(true);

            act(() => {
                result.current.stop();
            });

            expect(result.current.isTracking).toBe(false);
        });
    });

    describe('location updates', () => {
        it('updates location when source emits update', async () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            await act(async () => {
                await result.current.start();
            });

            act(() => {
                mockSource.simulateLocationUpdate(testLocation);
            });

            expect(result.current.location).not.toBeNull();
            expect(result.current.location?.latitude).toBe(40.7128);
            expect(result.current.location?.longitude).toBe(-74.006);
        });

        it('updates scenePosition when location updates', async () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            await act(async () => {
                await result.current.start();
            });

            act(() => {
                mockSource.simulateLocationUpdate(testLocation);
            });

            expect(result.current.scenePosition).not.toBeNull();
            expect(result.current.scenePosition).toHaveLength(3);
        });

        it('calls onUpdate callback', async () => {
            const onUpdate = vi.fn();
            const { result } = renderHook(() =>
                useYouAreHere(getOptions({ onUpdate }))
            );

            await act(async () => {
                await result.current.start();
            });

            act(() => {
                mockSource.simulateLocationUpdate(testLocation);
            });

            expect(onUpdate).toHaveBeenCalledWith(testLocation);
        });
    });

    describe('error handling', () => {
        it('updates error when source emits error', async () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            await act(async () => {
                await result.current.start();
            });

            act(() => {
                mockSource.simulateError(new Error('Location unavailable'));
            });

            expect(result.current.error).not.toBeNull();
            expect(result.current.error?.message).toBe('Location unavailable');
        });

        it('wraps a non-RoveError event into a RoveError (INTERNAL_ERROR)', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            act(() => {
                mockSource.simulateError(new Error('boom'));
            });

            expect(result.current.error).toBeInstanceOf(RoveError);
            expect(result.current.error?.code).toBe(RoveErrorCode.INTERNAL_ERROR);
            expect(result.current.error?.message).toBe('boom');
        });

        it('calls onError callback', async () => {
            const onError = vi.fn();
            const { result } = renderHook(() =>
                useYouAreHere(getOptions({ onError }))
            );

            await act(async () => {
                await result.current.start();
            });

            const testError = new Error('Test error');
            act(() => {
                mockSource.simulateError(testError);
            });

            // The listener wraps non-RoveError events, so onError receives a
            // RoveError carrying the original message (not the raw Error).
            expect(onError).toHaveBeenCalledTimes(1);
            const emitted = onError.mock.calls[0][0];
            expect(emitted).toBeInstanceOf(RoveError);
            expect(emitted.code).toBe(RoveErrorCode.INTERNAL_ERROR);
            expect(emitted.message).toBe('Test error');
        });
    });

    describe('autoStart option', () => {
        it('auto-starts tracking when autoStart is true', async () => {
            const { result } = renderHook(() =>
                useYouAreHere(getOptions({ autoStart: true }))
            );

            // Let the autoStart effect run and resolve the promise
            await act(async () => {
                // Allow effects to run and promises to resolve
                await vi.advanceTimersByTimeAsync(0);
            });

            expect(result.current.isTracking).toBe(true);
        });

        it('does not auto-start when autoStart is false', async () => {
            const { result } = renderHook(() =>
                useYouAreHere(getOptions({ autoStart: false }))
            );

            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            expect(result.current.isTracking).toBe(false);
        });
    });

    describe('scale option', () => {
        it('accepts custom scale', () => {
            const { result } = renderHook(() =>
                useYouAreHere(getOptions({ scale: 100 }))
            );

            expect(result.current.marker).toBeDefined();
        });
    });

    describe('update function', () => {
        it('provides update function for animation loop', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(typeof result.current.update).toBe('function');
        });

        it('update function can be called without errors', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(() => {
                result.current.update(0.016);
            }).not.toThrow();
        });
    });

    describe('cleanup', () => {
        it('disposes marker on unmount', () => {
            const { result, unmount } = renderHook(() =>
                useYouAreHere(getOptions())
            );

            // renderHook flushes the mount effect synchronously, so the marker
            // has already settled into state (marker is now `... | null`).
            expect(result.current.marker).not.toBeNull();
            const disposeSpy = vi.spyOn(result.current.marker!, 'dispose');

            unmount();

            expect(disposeSpy).toHaveBeenCalled();
        });

        // Ownership: the hook only tears down a provider it created itself.
        // (An injected locationSource is the caller's to dispose — covered by
        // the "does not dispose an injected locationSource" test below.)
        it('stops and disposes a hook-owned provider on unmount', () => {
            const stopSpy = vi.spyOn(GeolocationProvider.prototype, 'stop');
            const disposeSpy = vi.spyOn(GeolocationProvider.prototype, 'dispose');

            // No locationSource -> the hook creates and owns a GeolocationProvider.
            const { unmount } = renderHook(() =>
                useYouAreHere({ center: [-74.006, 40.7128] })
            );

            unmount();

            expect(stopSpy).toHaveBeenCalled();
            expect(disposeSpy).toHaveBeenCalled();

            stopSpy.mockRestore();
            disposeSpy.mockRestore();
        });
    });

    describe('returned functions', () => {
        it('provides start function', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(typeof result.current.start).toBe('function');
        });

        it('provides stop function', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(typeof result.current.stop).toBe('function');
        });

        it('provides requestPermissions function', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(typeof result.current.requestPermissions).toBe('function');
        });

        it('provides update function', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            expect(typeof result.current.update).toBe('function');
        });
    });

    describe('permission changes', () => {
        it('updates permission when source emits permissionChange', () => {
            const { result } = renderHook(() => useYouAreHere(getOptions()));

            act(() => {
                mockSource.emit('permissionChange', 'denied');
            });

            expect(result.current.permission).toBe('denied');
        });
    });
});

// These run with REAL timers (outside the fake-timer describe above) so that
// waitFor can observe the marker settling into state after the mount effect.
describe('StrictMode safety, live callbacks, and source ownership', () => {
    it('disposes every marker it creates across StrictMode double-mount', async () => {
        // The mock's `dispose` lives on the prototype precisely so this spy
        // counts dispose calls across ALL instances (StrictMode creates two).
        (ThreeUserMarker as unknown as { instances: Array<{ disposed: boolean }> }).instances.length = 0;
        const disposeSpy = vi.spyOn(ThreeUserMarker.prototype, 'dispose');
        const source = new MockLocationSource();

        const { result, unmount } = renderHook(
            () => useYouAreHere({ center: [0, 0], locationSource: source }),
            { wrapper: StrictMode }
        );

        await waitFor(() => expect(result.current.marker).not.toBeNull());
        unmount();

        // Every construction must be paired with a dispose. The old useMemo
        // version leaked the marker from StrictMode's discarded first render.
        const created = (ThreeUserMarker as unknown as { instances: Array<{ disposed: boolean }> }).instances;
        expect(created.length).toBeGreaterThanOrEqual(2);
        expect(created.every((m) => m.disposed)).toBe(true);
        expect(disposeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

        disposeSpy.mockRestore();
        source.dispose();
    });

    it('does not dispose an injected locationSource on unmount', () => {
        const source = new MockLocationSource();
        const disposeSpy = vi.spyOn(source, 'dispose');
        const { unmount } = renderHook(() =>
            useYouAreHere({ center: [0, 0], locationSource: source })
        );
        unmount();
        expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('calls the LATEST onUpdate callback, not the mount-time one', async () => {
        const source = new MockLocationSource();
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender, unmount } = renderHook(
            ({ cb }) => useYouAreHere({ center: [0, 0], locationSource: source, onUpdate: cb }),
            { initialProps: { cb: first } }
        );
        await waitFor(() => expect(result.current.marker).not.toBeNull());

        rerender({ cb: second });
        act(() => {
            source.emitUpdate({
                longitude: 0, latitude: 0, altitude: null, accuracy: 5,
                speed: null, heading: null, timestamp: Date.now(),
            });
        });

        expect(second).toHaveBeenCalled();
        expect(first).not.toHaveBeenCalled();

        unmount();
        source.dispose();
    });
});
