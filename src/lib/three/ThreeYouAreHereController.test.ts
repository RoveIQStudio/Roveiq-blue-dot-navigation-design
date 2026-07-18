import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ThreeYouAreHereController } from './ThreeYouAreHereController';
import { GeolocationProvider } from '../GeolocationProvider';
import type { LocationSource } from '../sources';
import type { LocationData, PermissionState, GeolocationEvents } from '../types';

// Mock location source for testing
class MockLocationSource implements LocationSource {
    private listeners: {
        update: Set<(data: LocationData) => void>;
        error: Set<(data: GeolocationPositionError | Error) => void>;
        permissionChange: Set<(data: PermissionState) => void>;
        deviceOrientation: Set<(data: DeviceOrientationEvent) => void>;
        resume: Set<(data: void) => void>;
    } = {
            update: new Set(),
            error: new Set(),
            permissionChange: new Set(),
            deviceOrientation: new Set(),
            resume: new Set(),
        };

    private lastLocation: LocationData | null = null;
    private permissionState: PermissionState = 'prompt';
    public startCalled = false;
    public stopCalled = false;
    public disposeCalled = false;
    public shouldFailStart = false;

    async start(): Promise<void> {
        this.startCalled = true;
        if (this.shouldFailStart) {
            throw new Error('Mock start failure');
        }
        this.permissionState = 'granted';
    }

    stop(): void {
        this.stopCalled = true;
    }

    getLastLocation(): LocationData | null {
        return this.lastLocation;
    }

    getPermissionState(): PermissionState {
        return this.permissionState;
    }

    on<K extends keyof GeolocationEvents>(
        event: K,
        callback: (data: GeolocationEvents[K]) => void
    ): () => void {
        const set = this.listeners[event] as Set<(data: GeolocationEvents[K]) => void>;
        set.add(callback);
        return () => set.delete(callback);
    }

    off<K extends keyof GeolocationEvents>(
        event: K,
        callback: (data: GeolocationEvents[K]) => void
    ): void {
        const set = this.listeners[event] as Set<(data: GeolocationEvents[K]) => void>;
        set.delete(callback);
    }

    dispose(): void {
        this.disposeCalled = true;
    }

    // Test helpers to emit events
    emitUpdate(location: LocationData): void {
        this.lastLocation = location;
        this.listeners.update.forEach(cb => cb(location));
    }

    emitError(error: Error): void {
        this.listeners.error.forEach(cb => cb(error));
    }

    emitPermissionChange(state: PermissionState): void {
        this.permissionState = state;
        this.listeners.permissionChange.forEach(cb => cb(state));
    }

    emitDeviceOrientation(event: Partial<DeviceOrientationEvent>): void {
        this.listeners.deviceOrientation.forEach(cb => cb(event as DeviceOrientationEvent));
    }
}

describe('ThreeYouAreHereController', () => {
    let controller: ThreeYouAreHereController;
    let scene: THREE.Scene;
    let mockSource: MockLocationSource;

    const defaultCenter: [number, number] = [-74.006, 40.7128];

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => { });

        scene = new THREE.Scene();
        mockSource = new MockLocationSource();
    });

    afterEach(() => {
        if (controller) {
            controller.dispose();
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('constructor', () => {
        it('creates controller with valid options', () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });

            expect(controller).toBeDefined();
            expect(controller.marker).toBeDefined();
            expect(controller.geolocation).toBe(mockSource);
        });

        it('throws when center is missing', () => {
            expect(() => {
                new ThreeYouAreHereController({} as any);
            }).toThrow(/center option is required/);
        });

        it('throws when center is not an array', () => {
            expect(() => {
                new ThreeYouAreHereController({ center: 'invalid' as any });
            }).toThrow(/must be \[longitude, latitude\] array/);
        });

        it('throws when center has wrong length', () => {
            expect(() => {
                new ThreeYouAreHereController({ center: [-74] as any });
            }).toThrow(/must be \[longitude, latitude\] array/);
        });

        it('throws when center has invalid coordinates', () => {
            expect(() => {
                new ThreeYouAreHereController({ center: [NaN, 40] });
            }).toThrow(/invalid center coordinates/);
        });

        it('throws when scale is invalid', () => {
            expect(() => {
                new ThreeYouAreHereController({
                    center: defaultCenter,
                    scale: -1,
                });
            }).toThrow(/scale must be a positive number/);
        });

        it('throws when scale is zero', () => {
            expect(() => {
                new ThreeYouAreHereController({
                    center: defaultCenter,
                    scale: 0,
                });
            }).toThrow(/scale must be a positive number/);
        });

        it('accepts valid scale', () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                scale: 2,
                locationSource: mockSource,
            });
            expect(controller).toBeDefined();
        });

        it('creates default GeolocationProvider when no source provided', () => {
            // Mock navigator.geolocation
            vi.stubGlobal('navigator', {
                geolocation: {
                    watchPosition: vi.fn(() => 123),
                    clearWatch: vi.fn(),
                },
            });

            controller = new ThreeYouAreHereController({
                center: defaultCenter,
            });

            expect(controller.geolocation).toBeInstanceOf(GeolocationProvider);
        });

        it('passes marker options to marker', () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
                markerOptions: {
                    color: 0xff0000,
                    dotSize: 15,
                },
            });

            expect(controller.marker).toBeDefined();
        });
    });

    describe('start()', () => {
        beforeEach(() => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });
        });

        it('adds marker to scene', async () => {
            await controller.start(scene);

            expect(scene.children).toContain(controller.marker);
        });

        it('starts geolocation', async () => {
            await controller.start(scene);

            expect(mockSource.startCalled).toBe(true);
        });

        it('sets isActive to true', async () => {
            expect(controller.isActive()).toBe(false);

            await controller.start(scene);

            expect(controller.isActive()).toBe(true);
        });

        it('is idempotent - second call is no-op', async () => {
            await controller.start(scene);
            mockSource.startCalled = false;

            await controller.start(scene);

            expect(mockSource.startCalled).toBe(false);
        });

        it('throws when disposed', async () => {
            controller.dispose();

            await expect(controller.start(scene)).rejects.toThrow(/disposed/);
        });

        it('removes marker from scene on start failure', async () => {
            mockSource.shouldFailStart = true;

            await expect(controller.start(scene)).rejects.toThrow(/Mock start failure/);

            expect(scene.children).not.toContain(controller.marker);
        });

        it('handles concurrent start calls', async () => {
            // Start two calls simultaneously
            const start1 = controller.start(scene);
            const start2 = controller.start(scene);

            // Advance timers enough to complete both starts
            await vi.advanceTimersByTimeAsync(100);

            await Promise.all([start1, start2]);

            // Both should resolve and source should only be started once
            expect(mockSource.startCalled).toBe(true);
            expect(controller.isActive()).toBe(true);
        });

        it('concurrent start waits for first to complete', async () => {
            // Create a source with controlled start timing
            let resolveStart: () => void;
            const delayedSource: LocationSource = {
                start: () => new Promise<void>((resolve) => {
                    resolveStart = resolve;
                }),
                stop: vi.fn(),
                getLastLocation: () => null,
                getPermissionState: () => 'prompt',
                on: () => () => { },
                off: vi.fn(),
                dispose: vi.fn(),
            };

            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: delayedSource,
            });

            // Start first call
            const start1 = controller.start(scene);

            // Let isStarting become true
            await vi.advanceTimersByTimeAsync(10);

            // Start second call (should wait)
            const start2 = controller.start(scene);

            // First hasn't completed yet, neither should second
            expect(controller.isActive()).toBe(false);

            // Now resolve the first start
            resolveStart!();
            await vi.advanceTimersByTimeAsync(100);

            // Both should complete
            await start1;
            await start2;

            expect(controller.isActive()).toBe(true);
        });
    });

    describe('stop()', () => {
        beforeEach(async () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });
            await controller.start(scene);
        });

        it('removes marker from scene', () => {
            expect(scene.children).toContain(controller.marker);

            controller.stop();

            expect(scene.children).not.toContain(controller.marker);
        });

        it('stops geolocation', () => {
            controller.stop();

            expect(mockSource.stopCalled).toBe(true);
        });

        it('sets isActive to false', () => {
            expect(controller.isActive()).toBe(true);

            controller.stop();

            expect(controller.isActive()).toBe(false);
        });

        it('is idempotent - second call is no-op', () => {
            controller.stop();
            mockSource.stopCalled = false;

            controller.stop();

            expect(mockSource.stopCalled).toBe(false);
        });

        it('accepts optional scene parameter', () => {
            const otherScene = new THREE.Scene();
            otherScene.add(controller.marker);

            controller.stop(otherScene);

            expect(otherScene.children).not.toContain(controller.marker);
        });
    });

    describe('dispose()', () => {
        beforeEach(() => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });
        });

        it('disposes geolocation provider', () => {
            controller.dispose();

            expect(mockSource.disposeCalled).toBe(true);
        });

        it('sets isActive to false', async () => {
            await controller.start(scene);
            expect(controller.isActive()).toBe(true);

            controller.dispose();

            expect(controller.isActive()).toBe(false);
        });

        it('is idempotent', () => {
            controller.dispose();

            expect(() => controller.dispose()).not.toThrow();
        });

        it('stops animation loop', async () => {
            await controller.start(scene);

            const cancelAnimationFrameSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');

            controller.dispose();

            expect(cancelAnimationFrameSpy).toHaveBeenCalled();
        });
    });

    describe('isActive()', () => {
        beforeEach(() => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });
        });

        it('returns false initially', () => {
            expect(controller.isActive()).toBe(false);
        });

        it('returns true after start', async () => {
            await controller.start(scene);
            expect(controller.isActive()).toBe(true);
        });

        it('returns false after stop', async () => {
            await controller.start(scene);
            controller.stop();
            expect(controller.isActive()).toBe(false);
        });

        it('returns false after dispose', async () => {
            await controller.start(scene);
            controller.dispose();
            expect(controller.isActive()).toBe(false);
        });
    });

    describe('location updates', () => {
        let onUpdateSpy: ReturnType<typeof vi.fn<(location: LocationData) => void>>;

        beforeEach(async () => {
            onUpdateSpy = vi.fn<(location: LocationData) => void>();
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
                onUpdate: onUpdateSpy,
            });
            await controller.start(scene);
        });

        it('calls onUpdate callback with location data', () => {
            const location: LocationData = {
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 10,
                accuracy: 15,
                speed: 1.5,
                heading: 90,
                timestamp: Date.now(),
            };

            mockSource.emitUpdate(location);

            expect(onUpdateSpy).toHaveBeenCalledWith(location);
        });

        it('updates marker position from location', () => {
            const setPositionSpy = vi.spyOn(controller.marker, 'setPosition');

            mockSource.emitUpdate({
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 0,
                accuracy: 10,
                speed: 0,
                heading: null,
                timestamp: Date.now(),
            });

            expect(setPositionSpy).toHaveBeenCalled();
        });

        it('updates marker accuracy from location', () => {
            const setAccuracySpy = vi.spyOn(controller.marker, 'setAccuracy');

            mockSource.emitUpdate({
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 0,
                accuracy: 25,
                speed: 0,
                heading: null,
                timestamp: Date.now(),
            });

            expect(setAccuracySpy).toHaveBeenCalledWith(25);
        });

        it('updates marker heading from location', () => {
            const setHeadingSpy = vi.spyOn(controller.marker, 'setHeading');

            mockSource.emitUpdate({
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 0,
                accuracy: 10,
                speed: 5,
                heading: 90,
                timestamp: Date.now(),
            });

            expect(setHeadingSpy).toHaveBeenCalledWith(90, 5);
        });

        it('ignores updates after dispose', () => {
            controller.dispose();
            onUpdateSpy.mockClear();

            mockSource.emitUpdate({
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 0,
                accuracy: 10,
                speed: 0,
                heading: null,
                timestamp: Date.now(),
            });

            expect(onUpdateSpy).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        let onErrorSpy: ReturnType<typeof vi.fn<(error: Error) => void>>;

        beforeEach(async () => {
            onErrorSpy = vi.fn<(error: Error) => void>();
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
                onError: onErrorSpy,
            });
            await controller.start(scene);
        });

        it('calls onError callback', () => {
            const error = new Error('Test error');
            mockSource.emitError(error);

            expect(onErrorSpy).toHaveBeenCalledWith(error);
        });

        it('ignores errors after dispose', () => {
            controller.dispose();
            onErrorSpy.mockClear();

            mockSource.emitError(new Error('Test error'));

            expect(onErrorSpy).not.toHaveBeenCalled();
        });
    });

    describe('permission changes', () => {
        let onPermissionChangeSpy: ReturnType<typeof vi.fn<(state: PermissionState) => void>>;

        beforeEach(async () => {
            onPermissionChangeSpy = vi.fn<(state: PermissionState) => void>();
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
                onPermissionChange: onPermissionChangeSpy,
            });
            await controller.start(scene);
        });

        it('calls onPermissionChange callback', () => {
            mockSource.emitPermissionChange('denied');

            expect(onPermissionChangeSpy).toHaveBeenCalledWith('denied');
        });

        it('ignores permission changes after dispose', () => {
            controller.dispose();
            onPermissionChangeSpy.mockClear();

            mockSource.emitPermissionChange('denied');

            expect(onPermissionChangeSpy).not.toHaveBeenCalled();
        });
    });

    describe('device orientation (compass)', () => {
        beforeEach(async () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });
            await controller.start(scene);
        });

        it('updates marker device heading from iOS webkitCompassHeading', () => {
            const setDeviceHeadingSpy = vi.spyOn(controller.marker, 'setDeviceHeading');

            mockSource.emitDeviceOrientation({
                webkitCompassHeading: 180,
            } as any);

            expect(setDeviceHeadingSpy).toHaveBeenCalledWith(180);
        });

        it('converts Android alpha to compass heading', () => {
            const setDeviceHeadingSpy = vi.spyOn(controller.marker, 'setDeviceHeading');

            mockSource.emitDeviceOrientation({
                alpha: 90, // Counter-clockwise from north
                beta: 0,
                gamma: 0,
            } as any);

            // (360 - 90) % 360 = 270 (clockwise compass heading)
            expect(setDeviceHeadingSpy).toHaveBeenCalledWith(270);
        });

        it('handles null alpha', () => {
            const setDeviceHeadingSpy = vi.spyOn(controller.marker, 'setDeviceHeading');

            mockSource.emitDeviceOrientation({
                alpha: null,
                beta: 0,
                gamma: 0,
            } as any);

            expect(setDeviceHeadingSpy).toHaveBeenCalledWith(null);
        });

        it('ignores orientation updates after dispose', () => {
            const setDeviceHeadingSpy = vi.spyOn(controller.marker, 'setDeviceHeading');
            controller.dispose();
            setDeviceHeadingSpy.mockClear();

            mockSource.emitDeviceOrientation({
                alpha: 90,
                beta: 0,
                gamma: 0,
            } as any);

            expect(setDeviceHeadingSpy).not.toHaveBeenCalled();
        });
    });

    describe('coordinate systems', () => {
        it('uses y-up coordinates by default', async () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });

            const setPositionSpy = vi.spyOn(controller.marker, 'setPosition');
            await controller.start(scene);

            mockSource.emitUpdate({
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 100,
                accuracy: 10,
                speed: 0,
                heading: null,
                timestamp: Date.now(),
            });

            // Y-up: x, z, -y transformation applied (default)
            expect(setPositionSpy).toHaveBeenCalled();
        });

        it('uses z-up coordinates when specified', async () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
                markerOptions: {
                    orientation: 'z-up',
                },
            });

            const setPositionSpy = vi.spyOn(controller.marker, 'setPosition');
            await controller.start(scene);

            mockSource.emitUpdate({
                longitude: -74.006,
                latitude: 40.7128,
                altitude: 100,
                accuracy: 10,
                speed: 0,
                heading: null,
                timestamp: Date.now(),
            });

            // Z-up: x, y, z passed directly
            const [x, y, z] = setPositionSpy.mock.calls[0];
            expect(typeof x).toBe('number');
            expect(typeof y).toBe('number');
            expect(typeof z).toBe('number');
        });
    });

    describe('requestPermissions()', () => {
        it('calls geolocation requestDeviceOrientationPermission when using GeolocationProvider', async () => {
            vi.stubGlobal('navigator', {
                geolocation: {
                    watchPosition: vi.fn(() => 123),
                    clearWatch: vi.fn(),
                },
            });

            controller = new ThreeYouAreHereController({
                center: defaultCenter,
            });

            const requestSpy = vi.spyOn(
                controller.geolocation as GeolocationProvider,
                'requestDeviceOrientationPermission'
            ).mockResolvedValue('granted');

            await controller.requestPermissions();

            expect(requestSpy).toHaveBeenCalled();
        });

        it('does nothing when compass is disabled', async () => {
            vi.stubGlobal('navigator', {
                geolocation: {
                    watchPosition: vi.fn(() => 123),
                    clearWatch: vi.fn(),
                },
            });

            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                enableCompass: false,
            });

            const requestSpy = vi.spyOn(
                controller.geolocation as GeolocationProvider,
                'requestDeviceOrientationPermission'
            );

            await controller.requestPermissions();

            expect(requestSpy).not.toHaveBeenCalled();
        });

        it('does nothing when using custom LocationSource', async () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });

            // Should not throw - mockSource doesn't have requestDeviceOrientationPermission
            await expect(controller.requestPermissions()).resolves.toBeUndefined();
        });
    });

    describe('animation loop', () => {
        beforeEach(async () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });
        });

        it('starts animation loop on start()', async () => {
            const requestAnimationFrameSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

            await controller.start(scene);

            expect(requestAnimationFrameSpy).toHaveBeenCalled();
        });

        it('stops animation loop on stop()', async () => {
            await controller.start(scene);

            const cancelAnimationFrameSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');

            controller.stop();

            expect(cancelAnimationFrameSpy).toHaveBeenCalled();
        });

        it('calls marker.update() in animation loop', async () => {
            const updateSpy = vi.spyOn(controller.marker, 'update');

            await controller.start(scene);

            // Advance to trigger animation frame
            vi.advanceTimersByTime(16);

            expect(updateSpy).toHaveBeenCalled();
        });

        it('clamps delta time to prevent large jumps', async () => {
            const updateSpy = vi.spyOn(controller.marker, 'update');

            await controller.start(scene);

            // Simulate long pause (e.g., tab was inactive)
            vi.advanceTimersByTime(5000);

            // Delta should be clamped to 0.1 (100ms)
            const lastCall = updateSpy.mock.calls[updateSpy.mock.calls.length - 1];
            if (lastCall) {
                expect(lastCall[0]).toBeLessThanOrEqual(0.1);
            }
        });
    });

    describe('public properties', () => {
        it('exposes marker for customization', () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });

            expect(controller.marker).toBeDefined();
            expect(controller.marker.setColor).toBeDefined();
        });

        it('exposes geolocation for advanced control', () => {
            controller = new ThreeYouAreHereController({
                center: defaultCenter,
                locationSource: mockSource,
            });

            expect(controller.geolocation).toBe(mockSource);
        });
    });
});

describe('default orientation consistency (y-up regression)', () => {
    it('positions the marker with y-up axis mapping when orientation is defaulted', () => {
        const source = new MockLocationSource();
        const controller = new ThreeYouAreHereController({
            center: [0, 0],
            locationSource: source,
        });

        // Marker default is y-up: mesh is rotated onto the XZ plane
        expect(controller.marker.rotation.x).toBeCloseTo(-Math.PI / 2);

        // A fix north of center must move the marker along -Z (north), NOT +Y (up)
        source.emitUpdate({
            longitude: 0,
            latitude: 0.001,
            altitude: null,
            accuracy: 5,
            speed: null,
            heading: null,
            timestamp: Date.now(),
        });

        expect(controller.marker.position.y).toBeCloseTo(0, 3);
        expect(controller.marker.position.z).toBeLessThan(0);

        controller.dispose();
    });
});
