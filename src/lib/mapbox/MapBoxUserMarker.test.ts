import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapBoxUserMarker } from './MapBoxUserMarker';
import { QualityManager, setGlobalQualityManager } from '../performance/QualityManager';

describe('MapBoxUserMarker', () => {
    let mockCtx: any;

    beforeEach(() => {
        // Mock canvas 2d context
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

        // Mock document.createElement so canvas.getContext returns our mock
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const element = originalCreateElement(tagName);
            if (tagName === 'canvas') {
                (element as HTMLCanvasElement).getContext = vi.fn(() => mockCtx);
            }
            return element;
        });

        // Mock window.matchMedia (used by the DPR listener)
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
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('MapBox parity', () => {
        it('applies quality-manager defaults like the MapLibre marker does', () => {
            // The `low` preset disables smooth position/heading interpolation.
            setGlobalQualityManager(new QualityManager({ preset: 'low' }));
            try {
                const marker = new MapBoxUserMarker();
                // Quality settings win over DEFAULT_OPTIONS (true) when the user didn't opt in.
                expect((marker as any).options.smoothPosition).toBe(false);
                expect((marker as any).options.smoothHeading).toBe(false);
                marker.dispose();
            } finally {
                setGlobalQualityManager(new QualityManager()); // restore auto-detection
            }
        });

        it('zeroes pulseSpeed when the quality manager disables pulsing', () => {
            // No built-in preset reports pulseEnabled:false, so simulate a device
            // profile where the manager disables pulsing entirely.
            const manager = new QualityManager({ preset: 'high' });
            const base = manager.getSettings();
            vi.spyOn(manager, 'getSettings').mockReturnValue({ ...base, pulseEnabled: false });
            setGlobalQualityManager(manager);
            try {
                const marker = new MapBoxUserMarker();
                expect((marker as any).options.pulseSpeed).toBe(0);
                marker.dispose();
            } finally {
                setGlobalQualityManager(new QualityManager()); // restore auto-detection
            }
        });

        it('lets explicit user options beat quality settings', () => {
            setGlobalQualityManager(new QualityManager({ preset: 'low' }));
            try {
                // User explicitly asks for smoothing + pulsing despite the low preset.
                const marker = new MapBoxUserMarker({
                    smoothPosition: true,
                    smoothHeading: true,
                    pulseSpeed: 0.42,
                });
                expect((marker as any).options.smoothPosition).toBe(true);
                expect((marker as any).options.smoothHeading).toBe(true);
                expect((marker as any).options.pulseSpeed).toBe(0.42);
                marker.dispose();
            } finally {
                setGlobalQualityManager(new QualityManager());
            }
        });

        it('uses an injected mapbox-gl module instead of requiring a global', () => {
            const markerInstance = { setLngLat: vi.fn(), addTo: vi.fn(), remove: vi.fn() };
            // Use a non-arrow implementation so `new mapboxgl.Marker(...)` is constructable
            // (mockReturnValue yields an arrow function, which cannot be used with `new`).
            const fakeModule = {
                Marker: vi.fn().mockImplementation(function () {
                    return markerInstance;
                }),
            };
            const marker = new MapBoxUserMarker({ mapBoxModule: fakeModule });

            const fakeMap = { on: vi.fn(), off: vi.fn() };
            marker.addTo(fakeMap as any);

            expect(fakeModule.Marker).toHaveBeenCalled();
            marker.dispose();
        });
    });
});
