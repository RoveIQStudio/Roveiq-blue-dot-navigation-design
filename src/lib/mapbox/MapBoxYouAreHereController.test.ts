import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapBoxYouAreHereController } from './MapBoxYouAreHereController';
import { GeolocationProvider } from '../GeolocationProvider';

// Mock mapboxgl Marker class
class MockMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    remove = vi.fn();
    constructor(_options: any) { }
}

// Mock mapboxgl module
const mockMapBox = {
    Marker: MockMarker,
    LngLat: vi.fn((lng: number, lat: number) => ({ lng, lat })),
};

describe('MapBoxYouAreHereController', () => {
    let controller: MapBoxYouAreHereController;
    let mockMap: any;
    let mockCtx: any;

    // Geolocation mocks
    const mockWatchPosition = vi.fn();
    const mockClearWatch = vi.fn();
    const mockGetCurrentPosition = vi.fn();
    const mockPermissionsQuery = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => { });

        // Mock canvas context
        mockCtx = {
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            closePath: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            rotate: vi.fn(),
            scale: vi.fn(),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1,
            setLineDash: vi.fn(),
            lineCap: 'round',
            lineJoin: 'round',
        };

        // Mock document.createElement for canvas BEFORE any other document manipulation
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const element = originalCreateElement(tagName);
            if (tagName === 'canvas') {
                (element as HTMLCanvasElement).getContext = vi.fn(() => mockCtx);
            }
            return element;
        });

        // Mock window.matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        // Mock permissions
        mockPermissionsQuery.mockResolvedValue({ state: 'granted', onchange: null });

        // Mock navigator.geolocation
        mockWatchPosition.mockImplementation((success) => {
            setTimeout(() => success({
                coords: {
                    latitude: 40.7128,
                    longitude: -74.006,
                    accuracy: 10,
                    altitude: null,
                    speed: null,
                    heading: null,
                },
                timestamp: Date.now()
            }), 0);
            return 123;
        });

        vi.stubGlobal('navigator', {
            geolocation: {
                watchPosition: mockWatchPosition,
                clearWatch: mockClearWatch,
                getCurrentPosition: mockGetCurrentPosition,
            },
            permissions: {
                query: mockPermissionsQuery,
            }
        });

        // Mock map instance - include _mapboxgl for MapBoxUserMarker to find
        mockMap = {
            _mapboxgl: mockMapBox,
            project: vi.fn(() => ({ x: 100, y: 100 })),
            getContainer: vi.fn(() => document.createElement('div')),
            on: vi.fn(),
            off: vi.fn(),
            getZoom: vi.fn(() => 15),
            getPitch: vi.fn(() => 0),
            getBearing: vi.fn(() => 0),
            flyTo: vi.fn(),
        };
    });

    afterEach(() => {
        if (controller) {
            controller.dispose();
        }
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const createController = (options = {}) => {
        return new MapBoxYouAreHereController({
            markerOptions: {
                enableAutoConfidence: false,
            },
            ...options,
        });
    };

    describe('constructor', () => {
        it('creates controller with default options', () => {
            controller = createController();

            expect(controller).toBeDefined();
            expect(controller.marker).toBeDefined();
            expect(controller.geolocation).toBeDefined();
            expect(controller.geolocation).toBeInstanceOf(GeolocationProvider);
        });

        it('accepts custom options', () => {
            const onUpdate = vi.fn();
            const onError = vi.fn();

            controller = createController({
                flyToOnFirstFix: false,
                flyToZoom: 18,
                enableCompass: false,
                onUpdate,
                onError,
            });

            expect(controller).toBeDefined();
        });
    });

    describe('start()', () => {
        beforeEach(() => {
            controller = createController();
        });

        it('adds marker to map', async () => {
            const addToSpy = vi.spyOn(controller.marker, 'addTo');

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(addToSpy).toHaveBeenCalledWith(mockMap);
        });

        it('starts geolocation', async () => {
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(mockWatchPosition).toHaveBeenCalled();
        });

        it('sets isActive to true', async () => {
            expect(controller.isActive()).toBe(false);

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(controller.isActive()).toBe(true);
        });

        it('is idempotent', async () => {
            const startPromise1 = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise1;

            mockWatchPosition.mockClear();

            await controller.start(mockMap);

            expect(mockWatchPosition).not.toHaveBeenCalled();
        });

        it('throws when disposed', async () => {
            controller.dispose();

            await expect(controller.start(mockMap)).rejects.toThrow(/disposed/);
        });

        it('removes marker on start failure', async () => {
            mockWatchPosition.mockImplementation((_, error) => {
                error({ code: 1, message: 'Permission denied', PERMISSION_DENIED: 1 });
                return 123;
            });

            const removeSpy = vi.spyOn(controller.marker, 'remove');

            await expect(controller.start(mockMap)).rejects.toThrow();

            expect(removeSpy).toHaveBeenCalled();
        });

        it('handles concurrent start calls with same promise', async () => {
            const start1 = controller.start(mockMap);
            const start2 = controller.start(mockMap);

            await vi.advanceTimersByTimeAsync(100);
            await Promise.all([start1, start2]);

            expect(controller.isActive()).toBe(true);
        });
    });

    describe('stop()', () => {
        beforeEach(async () => {
            controller = createController();
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;
        });

        it('stops geolocation', () => {
            controller.stop();

            expect(mockClearWatch).toHaveBeenCalled();
        });

        it('removes marker from map', () => {
            const removeSpy = vi.spyOn(controller.marker, 'remove');

            controller.stop();

            expect(removeSpy).toHaveBeenCalled();
        });

        it('sets isActive to false', () => {
            expect(controller.isActive()).toBe(true);

            controller.stop();

            expect(controller.isActive()).toBe(false);
        });

        it('is idempotent', () => {
            controller.stop();
            mockClearWatch.mockClear();

            controller.stop();

            expect(mockClearWatch).not.toHaveBeenCalled();
        });
    });

    describe('dispose()', () => {
        beforeEach(() => {
            controller = createController();
        });

        it('disposes marker', () => {
            const disposeSpy = vi.spyOn(controller.marker, 'dispose');

            controller.dispose();

            expect(disposeSpy).toHaveBeenCalled();
        });

        it('sets isActive to false', async () => {
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(controller.isActive()).toBe(true);

            controller.dispose();

            expect(controller.isActive()).toBe(false);
        });

        it('is idempotent', () => {
            controller.dispose();

            expect(() => controller.dispose()).not.toThrow();
        });
    });

    describe('isActive()', () => {
        beforeEach(() => {
            controller = createController();
        });

        it('returns false initially', () => {
            expect(controller.isActive()).toBe(false);
        });

        it('returns true after start', async () => {
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(controller.isActive()).toBe(true);
        });

        it('returns false after stop', async () => {
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            controller.stop();
            expect(controller.isActive()).toBe(false);
        });

        it('returns false after dispose', async () => {
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            controller.dispose();
            expect(controller.isActive()).toBe(false);
        });
    });

    describe('location updates', () => {
        it('calls onUpdate callback', async () => {
            const onUpdateSpy = vi.fn();
            controller = createController({ onUpdate: onUpdateSpy });

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(onUpdateSpy).toHaveBeenCalled();
            const [location] = onUpdateSpy.mock.calls[0];
            expect(location.latitude).toBeCloseTo(40.7128);
            expect(location.longitude).toBeCloseTo(-74.006);
        });

        it('updates marker position', async () => {
            controller = createController();
            const setLngLatSpy = vi.spyOn(controller.marker, 'setLngLat');

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(setLngLatSpy).toHaveBeenCalled();
        });

        it('updates marker accuracy', async () => {
            controller = createController();
            const setAccuracySpy = vi.spyOn(controller.marker, 'setAccuracy');

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(setAccuracySpy).toHaveBeenCalledWith(10);
        });

        it('flies to user on first fix when enabled', async () => {
            controller = createController({ flyToOnFirstFix: true });

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(mockMap.flyTo).toHaveBeenCalledWith({
                center: [-74.006, 40.7128],
                zoom: 16,
                duration: 1500,
            });
        });

        it('does not fly to user when disabled', async () => {
            controller = createController({ flyToOnFirstFix: false });

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(mockMap.flyTo).not.toHaveBeenCalled();
        });

        it('uses custom flyToZoom', async () => {
            controller = createController({ flyToOnFirstFix: true, flyToZoom: 20 });

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            expect(mockMap.flyTo).toHaveBeenCalledWith(
                expect.objectContaining({ zoom: 20 })
            );
        });
    });

    describe('error handling', () => {
        it('calls onError callback', async () => {
            const onErrorSpy = vi.fn();
            controller = createController({ onError: onErrorSpy });

            mockWatchPosition.mockImplementation((_, error) => {
                error({ code: 2, message: 'Position unavailable', POSITION_UNAVAILABLE: 2 });
                return 123;
            });

            await controller.start(mockMap).catch(() => { });

            expect(onErrorSpy).toHaveBeenCalled();
        });
    });

    describe('permission changes', () => {
        it('calls onPermissionChange callback', async () => {
            const onPermissionChangeSpy = vi.fn();
            controller = createController({ onPermissionChange: onPermissionChangeSpy });

            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;

            // Permission state is set during start
            expect(onPermissionChangeSpy).toHaveBeenCalledWith('granted');
        });
    });

    describe('visibility resume', () => {
        it('resets marker staleness when the geolocation provider resumes', () => {
            controller = createController();
            const resetSpy = vi.spyOn(controller.marker, 'resetStalenessTimer');

            // Reach into the provider and fire its resume event
            (controller.geolocation as any).emit('resume', undefined);

            expect(resetSpy).toHaveBeenCalled();
        });
    });

    describe('flyToUser()', () => {
        beforeEach(async () => {
            controller = createController();
            const startPromise = controller.start(mockMap);
            await vi.advanceTimersByTimeAsync(100);
            await startPromise;
            mockMap.flyTo.mockClear();
        });

        it('flies to current marker position', () => {
            vi.spyOn(controller.marker, 'getLngLat').mockReturnValue([-74.006, 40.7128]);

            controller.flyToUser();

            expect(mockMap.flyTo).toHaveBeenCalledWith({
                center: [-74.006, 40.7128],
                zoom: 16,
                duration: 1000,
            });
        });

        it('accepts custom zoom and duration', () => {
            vi.spyOn(controller.marker, 'getLngLat').mockReturnValue([-74.006, 40.7128]);

            controller.flyToUser({ zoom: 20, duration: 2000 });

            expect(mockMap.flyTo).toHaveBeenCalledWith({
                center: [-74.006, 40.7128],
                zoom: 20,
                duration: 2000,
            });
        });

        it('does nothing when no map', () => {
            controller.stop();
            mockMap.flyTo.mockClear();

            controller.flyToUser();

            expect(mockMap.flyTo).not.toHaveBeenCalled();
        });

        it('does nothing when no position', () => {
            vi.spyOn(controller.marker, 'getLngLat').mockReturnValue(null);

            controller.flyToUser();

            expect(mockMap.flyTo).not.toHaveBeenCalled();
        });
    });

    describe('requestPermissions()', () => {
        it('calls GeolocationProvider.requestDeviceOrientationPermission when compass enabled', async () => {
            const requestSpy = vi.spyOn(GeolocationProvider, 'requestDeviceOrientationPermission')
                .mockResolvedValue('granted');

            controller = createController({ enableCompass: true });
            await controller.requestPermissions();

            expect(requestSpy).toHaveBeenCalled();
        });

        it('does nothing when compass is disabled', async () => {
            const requestSpy = vi.spyOn(GeolocationProvider, 'requestDeviceOrientationPermission');

            controller = createController({ enableCompass: false });
            await controller.requestPermissions();

            expect(requestSpy).not.toHaveBeenCalled();
        });
    });

    describe('public properties', () => {
        it('exposes marker for customization', () => {
            controller = createController();

            expect(controller.marker).toBeDefined();
            expect(typeof controller.marker.setColor).toBe('function');
        });

        it('exposes geolocation for advanced control', () => {
            controller = createController();

            expect(controller.geolocation).toBeDefined();
            expect(controller.geolocation).toBeInstanceOf(GeolocationProvider);
        });
    });
});
