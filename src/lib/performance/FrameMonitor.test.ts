import { describe, it, expect, vi } from 'vitest';
import { FrameMonitor } from './FrameMonitor';

describe('FrameMonitor', () => {
  describe('basic tracking', () => {
    it('tracks frame times', () => {
      const monitor = new FrameMonitor({ sampleSize: 10 });

      // Simulate frames at 60fps (16.67ms each)
      // First tick establishes baseline (must be > 0), subsequent ticks record frame times
      // The check is "if (lastFrameTime > 0)" so timestamp 0 won't work as baseline
      let time = 1000; // Start at 1 second
      monitor.tick(time); // First tick - sets lastFrameTime to 1000, no frame recorded
      for (let i = 0; i < 5; i++) {
        time += 16.67;
        monitor.tick(time); // Each of these records a frame delta
      }

      const stats = monitor.getStats();
      expect(stats.avgFrameTime).toBeCloseTo(16.67, 1);
      expect(stats.fps).toBeCloseTo(60, 0);
      // After baseline + 5 ticks, we have 5 frame deltas recorded
      expect(stats.totalFrames).toBe(5);
    });

    it('calculates FPS correctly', () => {
      const monitor = new FrameMonitor({ sampleSize: 10 });

      // Simulate 30fps
      let time = 0;
      for (let i = 0; i < 11; i++) {
        monitor.tick(time);
        time += 33.33;
      }

      expect(monitor.getFPS()).toBeCloseTo(30, 0);
    });

    it('tracks dropped frames', () => {
      const monitor = new FrameMonitor({
        sampleSize: 10,
        targetFrameTime: 16.67,
      });

      let time = 0;
      monitor.tick(time);

      // Normal frame
      time += 16.67;
      monitor.tick(time);

      // Dropped frame (>2x target = >33.34ms)
      time += 50;
      monitor.tick(time);

      // Another normal frame
      time += 16.67;
      monitor.tick(time);

      expect(monitor.getStats().droppedFrames).toBe(1);
    });

    it('tracks best and worst frame times', () => {
      const monitor = new FrameMonitor({ sampleSize: 10 });

      // Generate frames at different intervals
      // Must start with non-zero timestamp for baseline to be recorded
      monitor.tick(1000);    // Baseline - sets lastFrameTime to 1000
      monitor.tick(1010);    // 10ms frame (fast)
      monitor.tick(1060);    // 50ms frame (slow)
      monitor.tick(1076.67); // 16.67ms frame (normal)

      const stats = monitor.getStats();
      // Best should be 10ms (the fast frame)
      expect(stats.bestFrameTime).toBe(10);
      // Worst should be 50ms (the slow frame)
      expect(stats.worstFrameTime).toBe(50);
    });
  });

  describe('performance warnings', () => {
    it('fires warning when threshold exceeded', () => {
      const onWarning = vi.fn();
      const monitor = new FrameMonitor({
        sampleSize: 3, // Small sample size for testing
        targetFrameTime: 16.67,
        warningThreshold: 1.5, // Warn at ~25ms+
        onPerformanceWarning: onWarning,
      });

      // Need to fill the sample buffer (sampleSize frames) before warning can fire
      // Baseline + 3 slow frames = 3 frame deltas in buffer
      // Timestamps must be > 0 for baseline to register
      let time = 1000;
      monitor.tick(time); // Baseline (sets lastFrameTime to 1000)
      for (let i = 0; i < 3; i++) {
        time += 30; // 30ms frames exceed 25ms threshold (16.67 * 1.5 = 25)
        monitor.tick(time);
      }

      expect(onWarning).toHaveBeenCalled();
      expect(monitor.isWarning()).toBe(true);
    });

    it('fires recovery when performance improves', () => {
      const onRecovered = vi.fn();
      const onWarning = vi.fn();
      const monitor = new FrameMonitor({
        sampleSize: 3,
        targetFrameTime: 16.67,
        warningThreshold: 1.5,
        warningCooldownMs: 0,
        onPerformanceWarning: onWarning,
        onPerformanceRecovered: onRecovered,
      });

      // Fill buffer with slow frames to trigger warning
      // Timestamps must be > 0 for baseline to register
      let time = 1000;
      monitor.tick(time); // Baseline at 1000
      for (let i = 0; i < 3; i++) {
        time += 50;
        monitor.tick(time);
      }
      expect(monitor.isWarning()).toBe(true);

      // Push out all slow samples with fast frames
      // Need sampleSize fast frames to completely replace the slow ones
      for (let i = 0; i < 3; i++) {
        time += 10;
        monitor.tick(time);
      }

      expect(onRecovered).toHaveBeenCalled();
      expect(monitor.isWarning()).toBe(false);
    });

    it('respects warning cooldown', () => {
      const onWarning = vi.fn();
      const monitor = new FrameMonitor({
        sampleSize: 3,
        targetFrameTime: 16.67,
        warningThreshold: 1.5,
        warningCooldownMs: 5000,
        onPerformanceWarning: onWarning,
      });

      // First batch of slow frames
      let time = 0;
      for (let i = 0; i < 4; i++) {
        monitor.tick(time);
        time += 50;
      }

      // More slow frames but within cooldown
      for (let i = 0; i < 4; i++) {
        monitor.tick(time);
        time += 50;
      }

      // Should only fire once (initial warning)
      expect(onWarning).toHaveBeenCalledTimes(1);

      // After cooldown, should fire again
      time += 5001;
      monitor.tick(time);
      time += 50;
      monitor.tick(time);

      expect(onWarning).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('clears all statistics', () => {
      const monitor = new FrameMonitor({ sampleSize: 5 });

      // Generate some data
      let time = 0;
      for (let i = 0; i < 6; i++) {
        monitor.tick(time);
        time += 50;
      }

      expect(monitor.getStats().totalFrames).toBeGreaterThan(0);

      monitor.reset();

      const stats = monitor.getStats();
      expect(stats.totalFrames).toBe(0);
      expect(stats.droppedFrames).toBe(0);
      expect(stats.avgFrameTime).toBe(0);
      expect(monitor.isWarning()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('allows changing target frame time', () => {
      const onWarning = vi.fn();
      const monitor = new FrameMonitor({
        sampleSize: 3,
        targetFrameTime: 16.67,
        warningThreshold: 1.5,
        onPerformanceWarning: onWarning,
      });

      // 30fps should trigger warning at 60fps target
      // Timestamps must be > 0 for baseline to register
      let time = 1000;
      monitor.tick(time); // Baseline at 1000
      for (let i = 0; i < 3; i++) {
        time += 33.33;
        monitor.tick(time);
      }
      expect(onWarning).toHaveBeenCalled();

      // Reset and change target to 30fps
      monitor.reset();
      onWarning.mockClear();
      monitor.setTargetFrameTime(33.33);

      // Now 30fps should not trigger warning
      time = 2000; // Start at non-zero again after reset
      monitor.tick(time); // Baseline at 2000
      for (let i = 0; i < 3; i++) {
        time += 33.33;
        monitor.tick(time);
      }
      expect(onWarning).not.toHaveBeenCalled();
    });
  });
});
