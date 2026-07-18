import { describe, it, expect, vi } from 'vitest';
import { MercatorProjection } from './MercatorProjection';

describe('MercatorProjection', () => {
    const CENTER: [number, number] = [-74.006, 40.7128]; // NYC

    describe('constructor', () => {
        it('initializes correctly with valid parameters', () => {
            const proj = new MercatorProjection(CENTER, 1);
            expect(proj.getCenter()).toEqual(CENTER);
            expect(proj.getScale()).toBe(1);
        });

        it('uses default scale of 1', () => {
            const proj = new MercatorProjection(CENTER);
            expect(proj.getScale()).toBe(1);
        });

        it('throws error for invalid center coordinates', () => {
            expect(() => new MercatorProjection([NaN, 0])).toThrow(/invalid longitude/);
            expect(() => new MercatorProjection([0, NaN])).toThrow(/invalid latitude/);
            expect(() => new MercatorProjection([] as any)).toThrow(/must be \[longitude, latitude\]/);
            expect(() => new MercatorProjection([0] as any)).toThrow(/must be \[longitude, latitude\]/);
            expect(() => new MercatorProjection('invalid' as any)).toThrow(/must be \[longitude, latitude\]/);
        });

        it('throws error for invalid scale', () => {
            expect(() => new MercatorProjection(CENTER, -1)).toThrow(/scale must be a positive number/);
            expect(() => new MercatorProjection(CENTER, 0)).toThrow(/scale must be a positive number/);
            expect(() => new MercatorProjection(CENTER, NaN)).toThrow(/scale must be a positive number/);
        });

        it('clamps latitude to Mercator bounds', () => {
            const proj = new MercatorProjection([0, 90], 1);
            const center = proj.getCenter();
            // Mercator max is ~85.05
            expect(center[1]).toBeLessThan(90);
            expect(center[1]).toBeCloseTo(85.05, 1);
        });

        it('normalizes longitude to [-180, 180]', () => {
            const proj = new MercatorProjection([200, 0], 1);
            const center = proj.getCenter();
            expect(center[0]).toBe(-160); // 200 - 360 = -160
        });
    });

    describe('lngLatToScene()', () => {
        it('converts center point to origin (0, 0, 0)', () => {
            const proj = new MercatorProjection(CENTER, 1);
            const [x, y, z] = proj.lngLatToScene(CENTER[0], CENTER[1], 0);
            expect(x).toBeCloseTo(0);
            expect(y).toBeCloseTo(0);
            expect(z).toBeCloseTo(0);
        });

        it('converts point slightly east correctly', () => {
            const proj = new MercatorProjection([0, 0], 1);
            const [x, y] = proj.lngLatToScene(1, 0);
            expect(x).toBeGreaterThan(0);
            expect(y).toBeCloseTo(0);
        });

        it('converts point slightly north correctly', () => {
            const proj = new MercatorProjection([0, 0], 1);
            const [x, y] = proj.lngLatToScene(0, 1);
            expect(x).toBeCloseTo(0);
            expect(y).toBeGreaterThan(0); // North is positive Y
        });

        it('handles altitude correctly (Z-axis)', () => {
            const proj = new MercatorProjection(CENTER, 1);
            const altitude = 100;
            const [_x, _y, z] = proj.lngLatToScene(CENTER[0], CENTER[1], altitude);
            expect(z).toBe(100);
        });

        it('returns altitude unscaled (GPS altitude is inaccurate)', () => {
            const proj = new MercatorProjection(CENTER, 10);
            const altitude = 50;
            const [_x, _y, z] = proj.lngLatToScene(CENTER[0], CENTER[1], altitude);
            // Altitude is no longer scaled - returned as-is
            expect(z).toBe(50);
        });

        it('returns origin for invalid coordinates', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const proj = new MercatorProjection(CENTER, 1);

            const result = proj.lngLatToScene(NaN, 40);
            expect(result).toEqual([0, 0, 0]);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid coordinates'));
        });

        it('handles invalid altitude gracefully', () => {
            const proj = new MercatorProjection(CENTER, 1);
            const [_x, _y, z] = proj.lngLatToScene(CENTER[0], CENTER[1], NaN);
            expect(z).toBe(0);
        });

        it('clamps extreme latitudes', () => {
            const proj = new MercatorProjection([0, 0], 1);
            // Should not throw for extreme latitudes
            const [_x1, y1] = proj.lngLatToScene(0, 90);
            const [_x2, y2] = proj.lngLatToScene(0, -90);
            expect(Number.isFinite(y1)).toBe(true);
            expect(Number.isFinite(y2)).toBe(true);
        });

        it('handles antimeridian longitudes', () => {
            const proj = new MercatorProjection([0, 0], 1);
            // 180 and -180 are on opposite sides of the projection from center 0
            const [x1] = proj.lngLatToScene(180, 0);
            const [x2] = proj.lngLatToScene(-180, 0);
            // Both should produce valid finite coordinates
            expect(Number.isFinite(x1)).toBe(true);
            expect(Number.isFinite(x2)).toBe(true);
            // They should have opposite signs (east vs west)
            expect(Math.sign(x1)).not.toBe(Math.sign(x2));
        });
    });

    describe('sceneToLngLat()', () => {
        it('converts origin back to center', () => {
            const proj = new MercatorProjection(CENTER, 1);
            const [lng, lat] = proj.sceneToLngLat(0, 0);
            expect(lng).toBeCloseTo(CENTER[0], 5);
            expect(lat).toBeCloseTo(CENTER[1], 5);
        });

        it('performs round-trip conversion accurately', () => {
            const proj = new MercatorProjection(CENTER, 100);
            const inputLng = -74.01;
            const inputLat = 40.72;

            const [x, y] = proj.lngLatToScene(inputLng, inputLat);
            const [outputLng, outputLat] = proj.sceneToLngLat(x, y);

            expect(outputLng).toBeCloseTo(inputLng, 5);
            expect(outputLat).toBeCloseTo(inputLat, 5);
        });

        it('returns origin for invalid coordinates', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const proj = new MercatorProjection(CENTER, 1);

            const result = proj.sceneToLngLat(NaN, 0);
            expect(result).toEqual([0, 0]);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid coordinates'));
        });

        it('handles large scene coordinates', () => {
            const proj = new MercatorProjection([0, 0], 1);
            const [lng, lat] = proj.sceneToLngLat(10000, 10000);
            // Should return valid coordinates
            expect(lng).toBeGreaterThan(-180);
            expect(lng).toBeLessThan(180);
            expect(lat).toBeGreaterThan(-90);
            expect(lat).toBeLessThan(90);
        });
    });

    describe('sceneZToAltitude()', () => {
        it('returns Z as-is (no scaling)', () => {
            const proj = new MercatorProjection(CENTER, 10);
            const altitude = proj.sceneZToAltitude(500);
            // No longer scaled - returns z as-is
            expect(altitude).toBe(500);
        });

        it('returns 0 for invalid Z', () => {
            const proj = new MercatorProjection(CENTER, 1);
            expect(proj.sceneZToAltitude(NaN)).toBe(0);
            expect(proj.sceneZToAltitude(Infinity)).toBe(0);
        });
    });

    describe('setCenter()', () => {
        it('updates center and re-projects', () => {
            const proj = new MercatorProjection([0, 0], 1);
            const [originX] = proj.lngLatToScene(0, 0);
            expect(originX).toBeCloseTo(0);

            proj.setCenter([1, 0]);

            const [x] = proj.lngLatToScene(0, 0);
            expect(x).toBeLessThan(0);
        });

        it('throws error for invalid center', () => {
            const proj = new MercatorProjection(CENTER, 1);

            expect(() => proj.setCenter([NaN, 0])).toThrow(/invalid longitude/);
            expect(() => proj.setCenter([0, NaN])).toThrow(/invalid latitude/);
            expect(() => proj.setCenter([] as any)).toThrow(/must be \[longitude, latitude\]/);
        });

        it('normalizes and clamps new center', () => {
            const proj = new MercatorProjection([0, 0], 1);
            proj.setCenter([200, 90]);

            const center = proj.getCenter();
            expect(center[0]).toBe(-160);
            expect(center[1]).toBeLessThan(90);
        });
    });

    describe('setScale()', () => {
        it('updates scale factor', () => {
            const proj = new MercatorProjection(CENTER, 1);
            proj.setScale(5);
            expect(proj.getScale()).toBe(5);
        });

        it('throws error for invalid scale', () => {
            const proj = new MercatorProjection(CENTER, 1);

            expect(() => proj.setScale(0)).toThrow(/scale must be a positive number/);
            expect(() => proj.setScale(-1)).toThrow(/scale must be a positive number/);
            expect(() => proj.setScale(NaN)).toThrow(/scale must be a positive number/);
        });
    });

    describe('getters', () => {
        it('getCenter() returns current center', () => {
            const proj = new MercatorProjection(CENTER, 1);
            expect(proj.getCenter()).toEqual(CENTER);
        });

        it('getScale() returns current scale', () => {
            const proj = new MercatorProjection(CENTER, 5);
            expect(proj.getScale()).toBe(5);
        });
    });
});
