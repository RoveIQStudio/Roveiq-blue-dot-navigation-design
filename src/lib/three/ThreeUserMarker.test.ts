import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ThreeUserMarker } from './ThreeUserMarker';

describe('ThreeUserMarker', () => {
    let marker: ThreeUserMarker;

    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        marker = new ThreeUserMarker({
            color: 0x4285f4,
            showAccuracyRing: true,
            showDirectionCone: true,
        });
    });

    afterEach(() => {
        marker.dispose();
        vi.restoreAllMocks();
    });

    describe('initialization', () => {
        it('creates a Three.js Group', () => {
            expect(marker).toBeInstanceOf(THREE.Group);
            expect(marker.isGroup).toBe(true);
        });

        it('is initially invisible', () => {
            expect(marker.visible).toBe(false);
        });

        it('accepts custom options', () => {
            const customMarker = new ThreeUserMarker({
                color: 0xff0000,
                dotSize: 12,
                borderWidth: 5,
                coneLength: 60,
            });
            expect(customMarker).toBeDefined();
            customMarker.dispose();
        });

        it('handles z-up orientation', () => {
            const zUpMarker = new ThreeUserMarker({ orientation: 'z-up' });
            expect(zUpMarker.rotation.x).toBeCloseTo(0);
            zUpMarker.dispose();
        });

        it('defaults to y-up orientation', () => {
            expect(marker.rotation.x).toBeCloseTo(-Math.PI / 2);
        });
    });

    describe('setPosition()', () => {
        it('sets target position', () => {
            marker.setPosition(100, 200, 5);
            const target = (marker as any).targetPosition;
            expect(target.x).toBe(100);
            expect(target.y).toBe(200);
            expect(target.z).toBe(5); // No automatic elevation - controlled by height setting
        });

        it('makes marker visible on first position', () => {
            expect(marker.visible).toBe(false);
            marker.setPosition(0, 0, 0);
            expect(marker.visible).toBe(true);
        });

        it('snaps to position on first call', () => {
            marker.setPosition(100, 200, 0);
            expect(marker.position.x).toBe(100);
            expect(marker.position.y).toBe(200);
        });

        it('ignores invalid coordinates', () => {
            marker.setPosition(100, 200, 0);
            marker.setPosition(NaN, 0, 0);
            expect(marker.position.x).toBe(100);
        });

        it('returns this for chaining', () => {
            const result = marker.setPosition(0, 0, 0);
            expect(result).toBe(marker);
        });
    });

    describe('setPositionFromScene()', () => {
        it('sets position from ScenePosition object', () => {
            marker.setPositionFromScene({ x: 50, y: 75, z: 10 });
            expect(marker.position.x).toBe(50);
            expect(marker.position.y).toBe(75);
        });

        it('handles missing z coordinate', () => {
            marker.setPositionFromScene({ x: 50, y: 75 });
            expect(marker.position.x).toBe(50);
            expect(marker.position.y).toBe(75);
        });
    });

    describe('setLatLng()', () => {
        it('requires projection center first', () => {
            marker.setLatLng(-74.006, 40.7128);
            // Should warn about missing projection
            expect(console.warn).toHaveBeenCalled();
        });

        it('converts lat/lng to scene coordinates', () => {
            marker.setProjectionCenter([-74.006, 40.7128], 1);
            marker.setLatLng(-74.006, 40.7128);

            const target = (marker as any).targetPosition;
            expect(target.x).toBeCloseTo(0, 1);
            expect(target.y).toBeCloseTo(0, 1);
        });

        it('ignores invalid coordinates', () => {
            marker.setProjectionCenter([-74.006, 40.7128], 1);
            marker.setPosition(100, 100, 0);
            marker.setLatLng(NaN, 40);

            expect(marker.position.x).toBe(100);
        });
    });

    describe('setProjectionCenter()', () => {
        it('creates projection for coordinate conversion', () => {
            marker.setProjectionCenter([-74.006, 40.7128], 1);
            expect(marker.getProjection()).not.toBeNull();
        });

        it('returns this for chaining', () => {
            const result = marker.setProjectionCenter([0, 0], 1);
            expect(result).toBe(marker);
        });
    });

    describe('setAccuracy()', () => {
        it('sets accuracy value', () => {
            marker.setAccuracy(25);
            expect((marker as any).currentAccuracy).toBe(25);
        });

        it('clamps to maximum', () => {
            marker.setAccuracy(20000);
            expect((marker as any).currentAccuracy).toBe(10000);
        });

        it('clamps to minimum (0)', () => {
            marker.setAccuracy(-10);
            expect((marker as any).currentAccuracy).toBe(0);
        });

        it('ignores invalid values', () => {
            marker.setAccuracy(50);
            marker.setAccuracy(NaN);
            expect((marker as any).currentAccuracy).toBe(50);
        });

        it('returns this for chaining', () => {
            const result = marker.setAccuracy(10);
            expect(result).toBe(marker);
        });
    });

    describe('setHeading()', () => {
        it('shows cone when moving with valid heading', () => {
            marker.setPosition(0, 0, 0);
            marker.setHeading(90, 5); // speed > minSpeedForDirection
            expect((marker as any).coneGroup.visible).toBe(true);
        });

        it('hides cone when stationary without compass', () => {
            marker.setPosition(0, 0, 0);
            marker.setHeading(90, 0.1); // speed < minSpeedForDirection
            expect((marker as any).coneGroup.visible).toBe(false);
        });

        it('normalizes heading to [0, 360)', () => {
            marker.setPosition(0, 0, 0);
            marker.setHeading(450, 5);
            expect((marker as any).currentHeading).toBe(90);
        });

        it('returns this for chaining', () => {
            const result = marker.setHeading(45, 1);
            expect(result).toBe(marker);
        });
    });

    describe('setDeviceHeading()', () => {
        it('sets device heading for compass', () => {
            marker.setDeviceHeading(180);
            expect((marker as any).deviceHeading).toBe(180);
        });

        it('smooths subsequent readings', () => {
            marker.setDeviceHeading(0);
            marker.setDeviceHeading(10);
            // Should be smoothed, not immediately 10
            expect((marker as any).deviceHeading).toBeGreaterThan(0);
            expect((marker as any).deviceHeading).toBeLessThan(10);
        });

        it('handles null values', () => {
            marker.setDeviceHeading(90);
            marker.setDeviceHeading(null);
            expect((marker as any).deviceHeading).toBeNull();
        });

        it('returns this for chaining', () => {
            const result = marker.setDeviceHeading(45);
            expect(result).toBe(marker);
        });
    });

    describe('resetDeviceHeading()', () => {
        it('clears device heading', () => {
            marker.setDeviceHeading(90);
            marker.resetDeviceHeading();
            expect((marker as any).deviceHeading).toBeNull();
        });

        it('returns this for chaining', () => {
            const result = marker.resetDeviceHeading();
            expect(result).toBe(marker);
        });
    });

    describe('update()', () => {
        it('handles position smoothing', () => {
            marker.setPosition(0, 0, 0);
            marker.setPosition(100, 0, 0);

            marker.update(0.016);

            expect(marker.position.x).toBeGreaterThan(0);
            expect(marker.position.x).toBeLessThan(100);
        });

        it('handles heading smoothing', () => {
            marker.setPosition(0, 0, 0);
            marker.setHeading(0, 5);
            marker.update(0.016);

            marker.setHeading(90, 5);
            marker.update(0.016);

            const rotation = (marker as any).currentHeadingRadians;
            expect(rotation).not.toBe(0);
        });

        it('defaults to 16ms delta', () => {
            marker.setPosition(0, 0, 0);
            marker.setPosition(100, 0, 0);

            marker.update(); // No delta provided
            expect(marker.position.x).toBeGreaterThan(0);
        });

        it('updates pulse animation', () => {
            marker.setPosition(0, 0, 0);
            const initialPhase = (marker as any).pulsePhase;

            marker.update(0.1);

            expect((marker as any).pulsePhase).toBeGreaterThan(initialPhase);
        });

        it('updates scale based on camera distance', () => {
            marker.setPosition(0, 0, 0);

            const camera = new THREE.PerspectiveCamera();
            camera.position.set(0, 100, 100);

            const target = new THREE.Vector3(0, 0, 0);

            marker.update(0.016, camera, target);

            expect(marker.scale.x).not.toBe(1);
        });

        it('does nothing when disposed', () => {
            marker.setPosition(0, 0, 0);
            marker.dispose();
            expect(() => marker.update(0.016)).not.toThrow();
        });
    });

    describe('confidence state', () => {
        it('setConfidence() changes state', () => {
            marker.setConfidence('low');
            expect(marker.getConfidence()).toBe('low');
        });

        it('setConfidence() disables auto-confidence', () => {
            marker.setConfidence('lost');
            expect(marker.isAutoConfidenceEnabled()).toBe(false);
        });

        it('resetAutoConfidence() re-enables auto-confidence', () => {
            marker.setConfidence('low');
            marker.resetAutoConfidence();
            expect(marker.isAutoConfidenceEnabled()).toBe(true);
        });

        it('handles warning state', () => {
            marker.setConfidence('warning');
            expect(marker.getConfidence()).toBe('warning');
        });

        it('handles danger state', () => {
            marker.setConfidence('danger');
            expect(marker.getConfidence()).toBe('danger');
        });

        it('transitions between states correctly', () => {
            marker.setConfidence('high');
            marker.setConfidence('warning');
            marker.setConfidence('high');
            expect(marker.getConfidence()).toBe('high');
        });
    });

    describe('visibility methods', () => {
        it('hide() makes marker invisible', () => {
            marker.setPosition(0, 0, 0);
            expect(marker.visible).toBe(true);

            marker.hide();
            expect(marker.visible).toBe(false);
        });

        it('show() makes marker visible if position was set', () => {
            marker.setPosition(0, 0, 0);
            marker.hide();
            marker.show();
            expect(marker.visible).toBe(true);
        });

        it('show() does not show if position never set', () => {
            marker.show();
            expect(marker.visible).toBe(false);
        });

        it('setAccuracyRingVisible() controls ring visibility', () => {
            marker.setAccuracyRingVisible(false);
            expect((marker as any).glowMesh.visible).toBe(false);

            marker.setAccuracyRingVisible(true);
            expect((marker as any).glowMesh.visible).toBe(true);
        });

        it('setDirectionConeEnabled() controls cone visibility', () => {
            marker.setDirectionConeEnabled(false);
            expect((marker as any).options.showDirectionCone).toBe(false);

            marker.setDirectionConeEnabled(true);
            expect((marker as any).options.showDirectionCone).toBe(true);
        });
    });

    describe('color methods', () => {
        it('setColor() updates dot color', () => {
            marker.setColor(0xff0000);
            expect((marker as any).options.color).toBe(0xff0000);
        });

        it('setDotColor() updates dot color', () => {
            marker.setDotColor(0x00ff00);
            expect((marker as any).options.color).toBe(0x00ff00);
        });

        it('setBorderColor() updates border', () => {
            marker.setBorderColor(0x000000);
            const borderMat = (marker as any).borderMesh.material;
            expect(borderMat.color.getHex()).toBe(0x000000);
        });

        it('setRingColor() updates ring color', () => {
            marker.setRingColor(0x0000ff);
            expect((marker as any).options.accuracyRingColor).toBe(0x0000ff);
        });

        it('setConeColor() updates cone color', () => {
            marker.setConeColor(0xffff00);
            expect((marker as any).options.coneColor).toBe(0xffff00);
        });

        it('ignores invalid color values', () => {
            marker.setColor(0xff0000);
            marker.setColor(NaN);
            expect((marker as any).options.color).toBe(0xff0000);
        });
    });

    describe('scale and pulse methods', () => {
        it('setOverallScale() updates scale', () => {
            marker.setOverallScale(2);
            expect(marker.getOverallScale()).toBe(2);
        });

        it('setOverallScale() ignores invalid values', () => {
            marker.setOverallScale(2);
            marker.setOverallScale(-1);
            expect(marker.getOverallScale()).toBe(2);
        });

        it('setPulseSpeed() updates pulse speed', () => {
            marker.setPulseSpeed(0.5);
            expect(marker.getPulseSpeed()).toBe(0.5);
        });

        it('setPulseSpeed() ignores invalid values', () => {
            marker.setPulseSpeed(0.3);
            marker.setPulseSpeed(-1);
            expect(marker.getPulseSpeed()).toBe(0.3);
        });

        it('setRingScale() updates ring scale', () => {
            marker.setRingScale(1.5);
            expect(marker.getRingScale()).toBe(1.5);
        });

        it('setRingScale() ignores invalid values', () => {
            marker.setRingScale(1.5);
            marker.setRingScale(0);
            expect(marker.getRingScale()).toBe(1.5);
        });

        it('setDotStrokeWidth() updates border width', () => {
            marker.setDotStrokeWidth(5);
            expect(marker.getDotStrokeWidth()).toBe(5);
        });

        it('setDotStrokeWidth() ignores invalid values', () => {
            marker.setDotStrokeWidth(5);
            marker.setDotStrokeWidth(-1);
            expect(marker.getDotStrokeWidth()).toBe(5);
        });
    });

    describe('dispose()', () => {
        it('cleans up resources', () => {
            marker.setPosition(0, 0, 0);
            marker.setProjectionCenter([0, 0], 1);

            marker.dispose();

            expect(marker.getProjection()).toBeNull();
            expect((marker as any).isDisposed).toBe(true);
        });

        it('is idempotent', () => {
            marker.dispose();
            expect(() => marker.dispose()).not.toThrow();
        });

        it('prevents update after dispose', () => {
            marker.dispose();
            marker.update(0.016);
            // Should not throw
        });
    });

    describe('auto-confidence', () => {
        it('degrades confidence based on staleness', () => {
            vi.useFakeTimers();

            marker.setPosition(0, 0, 0);
            marker.resetAutoConfidence();

            // Advance time past staleness threshold
            vi.advanceTimersByTime(35000);
            marker.update(0.016);

            expect(marker.getConfidence()).toBe('low');

            vi.useRealTimers();
        });

        it('degrades confidence based on accuracy', () => {
            marker.setPosition(0, 0, 0);
            marker.resetAutoConfidence();
            marker.setAccuracy(150); // > 100m threshold

            marker.update(0.016);

            expect(marker.getConfidence()).toBe('low');
        });

        it('degrades to lost confidence with very poor accuracy', () => {
            marker.setPosition(0, 0, 0);
            marker.resetAutoConfidence();
            marker.setAccuracy(600); // > 500m lost threshold

            marker.update(0.016);

            expect(marker.getConfidence()).toBe('lost');
        });

        it('degrades to lost confidence with very stale data', () => {
            vi.useFakeTimers();

            marker.setPosition(0, 0, 0);
            marker.resetAutoConfidence();

            // Advance time past lost threshold (60 seconds default)
            vi.advanceTimersByTime(65000);
            marker.update(0.016);

            expect(marker.getConfidence()).toBe('lost');

            vi.useRealTimers();
        });
    });
});

describe('material cache integrity', () => {
  it('recoloring one marker never disposes shared cached materials used by another', () => {
    const m1 = new ThreeUserMarker();
    const m2 = new ThreeUserMarker();

    const sharedGlow = (m2 as any).glowMaterials.high as THREE.Material;
    let sharedGlowDisposed = false;
    sharedGlow.addEventListener('dispose', () => { sharedGlowDisposed = true; });

    // setColor calls setDotColor then setRingColor — the old single flag made
    // the second call dispose the OTHER category's still-shared materials.
    m1.setColor(0xff0000);

    expect(sharedGlowDisposed).toBe(false);
    m1.dispose();
    m2.dispose();
  });

  it('dispose() releases both swap geometries and the per-instance border material', () => {
    const marker = new ThreeUserMarker();
    const ringGeometry = (marker as any).ringGeometry as THREE.BufferGeometry;
    const lostGeometry = (marker as any).lostCircleGeometry as THREE.BufferGeometry;
    const borderMaterial = (marker as any).borderMesh.material as THREE.Material;

    const disposed: string[] = [];
    ringGeometry.addEventListener('dispose', () => disposed.push('ring'));
    lostGeometry.addEventListener('dispose', () => disposed.push('lost'));
    borderMaterial.addEventListener('dispose', () => disposed.push('border'));

    marker.dispose();

    expect(disposed).toContain('ring');
    expect(disposed).toContain('lost'); // detached swap geometry leaked before
    expect(disposed).toContain('border'); // per-instance material leaked before
  });
});
