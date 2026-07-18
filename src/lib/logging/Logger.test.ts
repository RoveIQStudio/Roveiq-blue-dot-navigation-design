import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, ComponentLogger, logger } from './Logger';
import { configureSDK } from '../types';

describe('Logger', () => {
  let consoleSpy: {
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    log: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('logs errors when level is error', () => {
      const log = new Logger({ level: 'error' });

      log.error('Test', 'Error message');
      log.warn('Test', 'Warn message');
      log.info('Test', 'Info message');
      log.debug('Test', 'Debug message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('logs errors and warnings when level is warn', () => {
      const log = new Logger({ level: 'warn' });

      log.error('Test', 'Error message');
      log.warn('Test', 'Warn message');
      log.info('Test', 'Info message');
      log.debug('Test', 'Debug message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('logs all when level is debug', () => {
      const log = new Logger({ level: 'debug' });

      log.error('Test', 'Error message');
      log.warn('Test', 'Warn message');
      log.info('Test', 'Info message');
      log.debug('Test', 'Debug message');

      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    it('logs nothing when level is none', () => {
      const log = new Logger({ level: 'none' });

      log.error('Test', 'Error message');
      log.warn('Test', 'Warn message');
      log.info('Test', 'Info message');
      log.debug('Test', 'Debug message');

      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('formatting', () => {
    it('formats messages with prefix and component', () => {
      const log = new Logger({ level: 'error', prefix: 'TestPrefix' });

      log.error('MyComponent', 'Something broke');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[TestPrefix:MyComponent] Something broke',
        ''
      );
    });

    it('includes data when provided', () => {
      const log = new Logger({ level: 'error' });
      const data = { key: 'value' };

      log.error('Test', 'Error with data', data);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[RoveBeacon:Test] Error with data',
        data
      );
    });
  });

  describe('custom handler', () => {
    it('calls onLog handler with log entry', () => {
      const onLog = vi.fn();
      const log = new Logger({ level: 'debug', onLog });

      log.info('GPS', 'Location updated', { lat: 40.7 });

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Location updated',
          component: 'GPS',
          data: { lat: 40.7 },
        })
      );
      expect(onLog.mock.calls[0][0].timestamp).toBeGreaterThan(0);
    });

    it('can be used with silent mode for external-only logging', () => {
      const onLog = vi.fn();
      const log = new Logger({ level: 'debug', onLog, silent: true });

      log.error('Test', 'Error message');

      expect(onLog).toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe('runtime configuration', () => {
    it('allows changing level at runtime', () => {
      const log = new Logger({ level: 'none' });

      log.error('Test', 'Before');
      expect(consoleSpy.error).not.toHaveBeenCalled();

      log.setLevel('error');
      log.error('Test', 'After');
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('allows setting/clearing handler', () => {
      const onLog = vi.fn();
      const log = new Logger({ level: 'debug' });

      log.setHandler(onLog);
      log.info('Test', 'With handler');
      expect(onLog).toHaveBeenCalledTimes(1);

      log.setHandler(undefined);
      log.info('Test', 'Without handler');
      expect(onLog).toHaveBeenCalledTimes(1); // Still only 1
    });

    it('allows toggling silent mode', () => {
      const log = new Logger({ level: 'debug' });

      log.info('Test', 'Before silent');
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);

      log.setSilent(true);
      log.info('Test', 'During silent');
      expect(consoleSpy.info).toHaveBeenCalledTimes(1); // Still 1

      log.setSilent(false);
      log.info('Test', 'After silent');
      expect(consoleSpy.info).toHaveBeenCalledTimes(2);
    });

    it('reports current level', () => {
      const log = new Logger({ level: 'info' });
      expect(log.getLevel()).toBe('info');

      log.setLevel('debug');
      expect(log.getLevel()).toBe('debug');
    });
  });

  describe('child logger', () => {
    it('creates child with fixed component', () => {
      const log = new Logger({ level: 'debug' });
      const gpsLog = log.child('GPS');

      gpsLog.info('Position updated');
      gpsLog.error('Signal lost');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        '[RoveBeacon:GPS] Position updated',
        ''
      );
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[RoveBeacon:GPS] Signal lost',
        ''
      );
    });
  });

  describe('global logger', () => {
    it('is a Logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    it('defaults to warn level', () => {
      // Default level is warn, so info should not log
      logger.info('Test', 'Info message');
      expect(consoleSpy.info).not.toHaveBeenCalled();

      logger.warn('Test', 'Warn message');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });
  });

  describe('production mode', () => {
    it('defaults to silent when the SDK is in production mode', () => {
      configureSDK({ productionMode: true });
      try {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const productionLogger = new Logger();
        productionLogger.warn('Test', 'should not print');
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      } finally {
        configureSDK({ productionMode: false });
      }
    });

    it('honors explicit silent:false even in production mode', () => {
      configureSDK({ productionMode: true });
      try {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const loudLogger = new Logger({ silent: false });
        loudLogger.warn('Test', 'should print');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      } finally {
        configureSDK({ productionMode: false });
      }
    });
  });
});

describe('ComponentLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs with fixed component name', () => {
    const parent = new Logger({ level: 'debug' });
    const child = new ComponentLogger(parent, 'MyModule');

    child.debug('Test message', { data: 1 });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[RoveBeacon:MyModule] Test message',
      { data: 1 }
    );
  });
});
