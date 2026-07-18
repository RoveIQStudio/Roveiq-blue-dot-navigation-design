import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoveError, RoveErrorCode } from './errors';
import { configureSDK } from './types';

describe('RoveError', () => {
    beforeEach(() => {
        configureSDK({ productionMode: false, onError: undefined });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('creates error with code and message', () => {
            const error = new RoveError(RoveErrorCode.PERMISSION_DENIED, 'Access denied');

            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(RoveError);
            expect(error.code).toBe(RoveErrorCode.PERMISSION_DENIED);
            expect(error.message).toBe('Access denied');
            expect(error.name).toBe('RoveError');
        });

        it('stores original error', () => {
            const originalError = new Error('Original');
            const error = new RoveError(RoveErrorCode.INTERNAL_ERROR, 'Wrapped', originalError);

            expect(error.originalError).toBe(originalError);
        });

        it('stores context', () => {
            const context = { component: 'Test', action: 'testing' };
            const error = new RoveError(RoveErrorCode.TIMEOUT, 'Timed out', undefined, context);

            expect(error.context).toEqual(context);
        });

        it('maintains prototype chain for instanceof', () => {
            const error = new RoveError(RoveErrorCode.GPS_SIGNAL_LOST, 'Lost');

            expect(error instanceof RoveError).toBe(true);
            expect(error instanceof Error).toBe(true);
        });
    });

    describe('RoveError.is()', () => {
        it('returns true for matching RoveError code', () => {
            const error = new RoveError(RoveErrorCode.PERMISSION_DENIED, 'Denied');

            expect(RoveError.is(error, RoveErrorCode.PERMISSION_DENIED)).toBe(true);
        });

        it('returns false for non-matching code', () => {
            const error = new RoveError(RoveErrorCode.PERMISSION_DENIED, 'Denied');

            expect(RoveError.is(error, RoveErrorCode.TIMEOUT)).toBe(false);
        });

        it('returns false for non-RoveError', () => {
            const error = new Error('Regular error');

            expect(RoveError.is(error, RoveErrorCode.INTERNAL_ERROR)).toBe(false);
        });

        it('returns false for null/undefined', () => {
            expect(RoveError.is(null, RoveErrorCode.INTERNAL_ERROR)).toBe(false);
            expect(RoveError.is(undefined, RoveErrorCode.INTERNAL_ERROR)).toBe(false);
        });

        it('returns false for non-error objects', () => {
            expect(RoveError.is({ code: RoveErrorCode.TIMEOUT }, RoveErrorCode.TIMEOUT)).toBe(false);
            expect(RoveError.is('error string', RoveErrorCode.TIMEOUT)).toBe(false);
        });
    });

    describe('RoveError.emit()', () => {
        it('creates error with context', () => {
            const error = RoveError.emit(
                RoveErrorCode.PERMISSION_DENIED,
                'User denied',
                { component: 'GeolocationProvider', action: 'requestPermission' }
            );

            expect(error.code).toBe(RoveErrorCode.PERMISSION_DENIED);
            expect(error.message).toBe('User denied');
            expect(error.context).toEqual({
                component: 'GeolocationProvider',
                action: 'requestPermission'
            });
        });

        it('includes original error', () => {
            const originalError = new Error('Root cause');
            const error = RoveError.emit(
                RoveErrorCode.INTERNAL_ERROR,
                'Something failed',
                { component: 'Test', action: 'test' },
                originalError
            );

            expect(error.originalError).toBe(originalError);
        });

        it('calls onError callback when configured', () => {
            const onErrorSpy = vi.fn();
            configureSDK({ onError: onErrorSpy });

            const context = { component: 'Test', action: 'testing' };
            const error = RoveError.emit(RoveErrorCode.TIMEOUT, 'Timed out', context);

            expect(onErrorSpy).toHaveBeenCalledWith(error, context);
        });

        it('silently ignores errors in onError callback', () => {
            const onErrorSpy = vi.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });
            configureSDK({ onError: onErrorSpy });

            expect(() => {
                RoveError.emit(
                    RoveErrorCode.TIMEOUT,
                    'Timed out',
                    { component: 'Test', action: 'test' }
                );
            }).not.toThrow();
        });

        it('works without onError callback', () => {
            configureSDK({ onError: undefined });

            const error = RoveError.emit(
                RoveErrorCode.GPS_SIGNAL_LOST,
                'Lost signal',
                { component: 'GPS', action: 'track' }
            );

            expect(error).toBeInstanceOf(RoveError);
        });

        it('includes metadata in context', () => {
            const error = RoveError.emit(
                RoveErrorCode.INVALID_COORDINATES,
                'Bad coordinates',
                {
                    component: 'Projection',
                    action: 'convert',
                    metadata: { lat: 999, lng: 999 }
                }
            );

            expect(error.context?.metadata).toEqual({ lat: 999, lng: 999 });
        });
    });

    describe('error codes', () => {
        it('has all expected error codes', () => {
            expect(RoveErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
            expect(RoveErrorCode.GEOLOCATION_UNSUPPORTED).toBe('GEOLOCATION_UNSUPPORTED');
            expect(RoveErrorCode.GPS_SIGNAL_LOST).toBe('GPS_SIGNAL_LOST');
            expect(RoveErrorCode.INSECURE_CONTEXT).toBe('INSECURE_CONTEXT');
            expect(RoveErrorCode.TIMEOUT).toBe('TIMEOUT');
            expect(RoveErrorCode.INVALID_COORDINATES).toBe('INVALID_COORDINATES');
            expect(RoveErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
        });
    });
});
