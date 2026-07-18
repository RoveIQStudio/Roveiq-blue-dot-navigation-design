import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocation } from './useLocation';
import { GeolocationProvider } from '../GeolocationProvider';
import { RoveError, RoveErrorCode } from '../errors';
import type { LocationSource } from '../sources';
import type { LocationData } from '../types';

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
        // Emit granted permission
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

    // Helper to simulate location update
    simulateLocationUpdate(location: LocationData): void {
        this.lastLocation = location;
        this.emit('update', location);
    }

    // Helper to simulate error
    simulateError(error: Error): void {
        this.emit('error', error);
    }
}

describe('useLocation', () => {
    let mockSource: MockLocationSource;

    beforeEach(() => {
        mockSource = new MockLocationSource();
    });

    afterEach(() => {
        mockSource.dispose();
    });

    const testLocation: LocationData = {
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 10,
        altitude: null,
        heading: null,
        speed: null,
        timestamp: Date.now(),
    };

    describe('initial state', () => {
        it('returns null location initially', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(result.current.location).toBeNull();
        });

        it('returns null error initially', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(result.current.error).toBeNull();
        });

        it('returns prompt permission initially', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(result.current.permission).toBe('prompt');
        });

        it('returns false isTracking initially', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(result.current.isTracking).toBe(false);
        });

        it('returns null deviceHeading initially', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(result.current.deviceHeading).toBeNull();
        });
    });

    describe('start()', () => {
        it('starts tracking', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            await act(async () => {
                await result.current.start();
            });

            expect(result.current.isTracking).toBe(true);
        });

        it('updates permission state', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            await act(async () => {
                await result.current.start();
            });

            expect(result.current.permission).toBe('granted');
        });
    });

    describe('stop()', () => {
        it('stops tracking', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

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
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            await act(async () => {
                await result.current.start();
            });

            act(() => {
                mockSource.simulateLocationUpdate(testLocation);
            });

            expect(result.current.location).not.toBeNull();
            expect(result.current.location?.latitude).toBe(40.7128);
            expect(result.current.location?.longitude).toBe(-74.006);
            expect(result.current.location?.accuracy).toBe(10);
        });

        it('clears error on successful update', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            await act(async () => {
                await result.current.start();
            });

            // First simulate an error
            act(() => {
                mockSource.simulateError(new Error('Test error'));
            });

            expect(result.current.error).not.toBeNull();

            // Then a successful update
            act(() => {
                mockSource.simulateLocationUpdate(testLocation);
            });

            expect(result.current.error).toBeNull();
        });
    });

    describe('error handling', () => {
        it('updates error when source emits error', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            await act(async () => {
                await result.current.start();
            });

            act(() => {
                mockSource.simulateError(new Error('Geolocation unavailable'));
            });

            expect(result.current.error).not.toBeNull();
            expect(result.current.error?.message).toBe('Geolocation unavailable');
        });

        it('wraps a non-RoveError event into a RoveError (INTERNAL_ERROR)', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            act(() => {
                mockSource.simulateError(new Error('boom'));
            });

            expect(result.current.error).toBeInstanceOf(RoveError);
            expect(result.current.error?.code).toBe(RoveErrorCode.INTERNAL_ERROR);
            expect(result.current.error?.message).toBe('boom');
        });
    });

    describe('autoStart option', () => {
        it('auto-starts tracking when autoStart is true', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource, autoStart: true })
            );

            // Wait for auto-start to complete
            await waitFor(() => {
                expect(result.current.isTracking).toBe(true);
            });
        });

        it('does not auto-start when autoStart is false', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource, autoStart: false })
            );

            // Give it a moment to potentially start
            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(result.current.isTracking).toBe(false);
        });
    });

    describe('cleanup', () => {
        // Ownership: the hook only tears down a provider it created itself.
        // (An injected locationSource is the caller's to stop/dispose — covered
        // by the "neither stops nor disposes an injected locationSource" test
        // below.)
        it('stops and disposes a hook-owned provider on unmount', () => {
            const stopSpy = vi.spyOn(GeolocationProvider.prototype, 'stop');
            const disposeSpy = vi.spyOn(GeolocationProvider.prototype, 'dispose');

            try {
                // No locationSource -> the hook creates and owns a GeolocationProvider.
                const { unmount } = renderHook(() => useLocation());

                unmount();

                expect(stopSpy).toHaveBeenCalled();
                expect(disposeSpy).toHaveBeenCalled();
            } finally {
                // Restore in finally so a failed assertion can't leak prototype spies.
                stopSpy.mockRestore();
                disposeSpy.mockRestore();
            }
        });

        it('neither stops nor disposes an injected locationSource on unmount', () => {
            const source = new MockLocationSource();
            const stopSpy = vi.spyOn(source, 'stop');
            const disposeSpy = vi.spyOn(source, 'dispose');
            const { unmount } = renderHook(() =>
                useLocation({ locationSource: source })
            );
            unmount();
            expect(stopSpy).not.toHaveBeenCalled();
            expect(disposeSpy).not.toHaveBeenCalled();
        });
    });

    describe('permission changes', () => {
        it('updates permission when source emits permissionChange', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            act(() => {
                mockSource.emit('permissionChange', 'denied');
            });

            expect(result.current.permission).toBe('denied');
        });

        it('sets isRequesting when permission is requesting', async () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            act(() => {
                mockSource.emit('permissionChange', 'requesting');
            });

            expect(result.current.isRequesting).toBe(true);

            act(() => {
                mockSource.emit('permissionChange', 'granted');
            });

            expect(result.current.isRequesting).toBe(false);
        });
    });

    describe('returned functions', () => {
        it('provides start function', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(typeof result.current.start).toBe('function');
        });

        it('provides stop function', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(typeof result.current.stop).toBe('function');
        });

        it('provides requestPermissions function', () => {
            const { result } = renderHook(() =>
                useLocation({ locationSource: mockSource })
            );

            expect(typeof result.current.requestPermissions).toBe('function');
        });
    });
});
