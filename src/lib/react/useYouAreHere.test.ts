import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useYouAreHere } from './useYouAreHere';
import type { LocationSource } from '../sources';
import type { LocationData } from '../types';

// Mock the ThreeUserMarker module - factory must be self-contained due to hoisting
vi.mock('../three/ThreeUserMarker', () => {
    // Create mock class inside factory to avoid hoisting issues
    class MockThreeUserMarker {
        private _confidence: 'high' | 'medium' | 'low' | 'lost' = 'high';

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
        update = vi.fn();
        dispose = vi.fn();

        // Three.js Object3D-like properties
        position = { x: 0, y: 0, z: 0, set: vi.fn() };
        scale = { x: 1, y: 1, z: 1, set: vi.fn() };
        visible = true;
        add = vi.fn();
        remove = vi.fn();
        children: any[] = [];
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

            expect(onError).toHaveBeenCalledWith(testError);
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

            const disposeSpy = vi.spyOn(result.current.marker, 'dispose');

            unmount();

            expect(disposeSpy).toHaveBeenCalled();
        });

        it('stops and disposes source on unmount', () => {
            const stopSpy = vi.spyOn(mockSource, 'stop');
            const disposeSpy = vi.spyOn(mockSource, 'dispose');

            const { unmount } = renderHook(() => useYouAreHere(getOptions()));

            unmount();

            expect(stopSpy).toHaveBeenCalled();
            expect(disposeSpy).toHaveBeenCalled();
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
