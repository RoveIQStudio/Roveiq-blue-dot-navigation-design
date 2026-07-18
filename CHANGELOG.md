# Changelog

All notable changes to the "rovemaps-you-are-here" project will be documented in this file.

## [3.0.0] - 2026-07-18

A correctness-and-packaging release. The runtime API of the controllers and markers is unchanged; the breaking changes are about imports, packaging, and types. See the "Migrating from 2.x" section of the README for an upgrade summary.

### Breaking Changes
- React hooks moved to `rovemaps-you-are-here/react`; the Svelte store moved to `rovemaps-you-are-here/svelte`. They are no longer re-exported from the package root.
- UMD bundle removed. Use the ESM build from a CDN with `<script type="module">`.
- `useYouAreHere().marker` is now `ThreeUserMarker | null` — the marker is created inside a mount effect (never during render), so React StrictMode's discarded first render cannot leak GPU resources. Guard for null before rendering it.
- `error` in both React hooks (`useYouAreHere`, `useLocation`) and the Svelte store is now typed `RoveError | null`; the `onError` callback receives a `RoveError`.
- React hook options other than `center`, `scale`, and `locationSource` are read once at mount; changing them later requires remounting the component.
- Controllers no longer dispose an injected `locationSource` — the caller owns injected sources.
- `svelte` is now an optional `peerDependency` (`>=4.0.0`); install it only if you use the Svelte store.
- Removed unwired exports: `FrameMonitor`, `AnimationManager` (and their option/stat types).
- Removed never-emitted error codes: `PERMISSION_DISMISSED`, `PERMISSION_UNAVAILABLE`, `SENSORS_UNAVAILABLE`, `NETWORK_ERROR`, `INVALID_CONFIGURATION`, `NOT_INITIALIZED`, `ALREADY_STARTED`.

### Fixed
- Default (`y-up`) Three.js path positioned the marker on the wrong axis.
- React was inlined into the published bundle, breaking React consumers with "Invalid hook call".
- `GeolocationProvider.stop()` while the tab was hidden let tracking silently resume on tab return.
- Start timeout no longer strands a live GPS watch or blocks retries; it now derives from `options.timeout`.
- Recoloring one marker could dispose shared cached materials used by other markers.
- Marker `dispose()` now releases the detached swap geometry, border material, and direction cone.
- Alert (warning/danger) state restores correctly when `pulseSpeed` is 0.
- MapLibre/MapBox markers reset staleness on tab-visibility resume (no more "lost" flash).
- MapBox marker honors QualityManager settings and accepts an injected `mapBoxModule` for bundlers.
- Accuracy ring re-renders on map zoom when pulsing is disabled.
- Svelte store auto-disposes with its component and emits valid error codes.
- Logger (including the exported `logger` singleton) now respects `productionMode` lazily — silent by default in production unless `silent: false` is set explicitly, even when `configureSDK({ productionMode: true })` runs after the logger is created.

### Added
- ESLint (flat config) with CI enforcement; `no-console` in library code.
- `npm run verify:dist` gate: publish fails if framework code is ever bundled again.
- LICENSE file, repository metadata, and enforced coverage thresholds (statements 77% / branches 69% / functions 84% / lines 79%).
- `resetStalenessTimer()` public method on the MapLibre and MapBox markers.
- `mapBoxModule` option on `MapBoxUserMarker` for bundler dependency injection (mirrors `mapLibreModule`).
- `getOrientation()` accessor on `ThreeUserMarker` (returns `'y-up' | 'z-up'`).
- Svelte store state gains `isTracking` and `deviceHeading` fields.

### Known open questions
- **Package naming.** The repo (`RoveBeacon`), the published package (`rovemaps-you-are-here`), and the CLI (`create-rovebeacon`) use three different names. Reconciling them is an npm-ecosystem decision (deprecations, redirects) and is intentionally deferred — nothing was renamed in this release.

### CDN (ESM)
- jsDelivr: `https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@3/dist/index.js`
- unpkg: `https://unpkg.com/rovemaps-you-are-here@3/dist/index.js`

## [2.5.0] - 2025-12-11

### New Features

#### Tab Visibility Resume Handling
- **Smart Resume**: When returning to a browser tab after it was hidden, the marker no longer immediately shows "lost" (grey) state
- **Smooth Re-acquisition**: The marker resets its staleness timer on visibility resume, giving GPS time to get a new fix
- **New `resume` Event**: GeolocationProvider now emits a `resume` event when tracking restarts after tab visibility change
- **New `resetStalenessTimer()` Method**: ThreeUserMarker now exposes this method for custom visibility handling

This fixes the issue where returning to a tab would show a grey/lost marker while waiting for GPS to re-acquire.

### Breaking Changes
- **Default Orientation Changed**: Default coordinate system is now `'y-up'` (standard Three.js) instead of `'z-up'` (GIS convention)
  - If you're using this SDK with GIS/mapping tiles, add `orientation: 'z-up'` to your marker options
  - Standard Three.js users no longer need to specify orientation

### Bug Fixes
- **Memory Leaks Fixed**: Fixed memory leaks in `setDotColor()`, `setRingColor()`, `setConeColor()`, and `applyConfidenceState()` where materials and geometries weren't being disposed before recreation
- **Browser Compatibility**: Fixed `process.env.NODE_ENV` reference that broke direct browser usage via CDN

### Performance
- **Smaller Bundle**: Bundle reduced from 157KB to 125KB by eliminating dev-only code paths

### CDN
- **unpkg**: `https://unpkg.com/rovemaps-you-are-here@2.5.0/dist/rovemaps-you-are-here.js`
- **jsDelivr**: `https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@2.5.0/dist/rovemaps-you-are-here.js`

## [2.2.0] - 2025-12-10

### New Features - MapLibre GL JS Support

The SDK now supports **both Three.js and MapLibre GL JS**! You can use the same familiar API pattern with either rendering engine.

#### MapLibre Components
- **MapLibreUserMarker**: Canvas-based blue dot marker for MapLibre maps
  - All the same features as the Three.js version
  - Smooth position and heading animations
  - Pulsing accuracy ring
  - Direction cone when moving
  - Automatic confidence degradation
  - Canvas rendering for high performance

- **MapLibreYouAreHereController**: All-in-one controller for MapLibre
  - Automatic geolocation tracking
  - Fly-to-user on first location fix
  - Device compass integration
  - Same API as the Three.js controller

#### Usage
```typescript
// MapLibre GL JS
import { MapLibreYouAreHereController } from 'rovemaps-you-are-here';

const controller = new MapLibreYouAreHereController({
  markerOptions: { color: 0x4285F4 },
  flyToOnFirstFix: true,
});

await controller.start(map); // Pass your MapLibre map instance
```

#### Peer Dependencies
- Both `three` and `maplibre-gl` are now **optional** peer dependencies
- Install only what you need for your project

### Demo
- Added tab switcher to demo app to toggle between Three.js and MapLibre demos
- Both demos have the same SDK controls panel for testing

### CDN
- **unpkg**: `https://unpkg.com/rovemaps-you-are-here@2.2.0/dist/rovemaps-you-are-here.umd.cjs`
- **jsDelivr**: `https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@2.2.0/dist/rovemaps-you-are-here.umd.cjs`

## [2.1.0] - 2025-12-10

### Bug Fixes
- **removeAllListeners() Memory Leak**: Fixed missing cleanup of `deviceOrientation` listeners when clearing all events
- **setConfidence() Transparency**: Fixed transparency not working for 'low' and 'lost' states (missing `transparent: true` and `needsUpdate: true`)
- **Concurrent Start Timeout**: Added 5-second timeout to concurrent `start()` polling to prevent infinite loops
- **Duplicate Line**: Removed duplicate `group.position.z = 0.05` in direction cone creation

### New Features
- **Automatic Staleness Detection**: Marker confidence now automatically degrades based on time and accuracy
  - 30 seconds without update → 'low' confidence
  - 60 seconds without update → 'lost' confidence
  - Accuracy > 100m → 'low' confidence
  - Accuracy > 500m → 'lost' confidence
  - Fully configurable via `UserMarkerOptions`
  - `resetAutoConfidence()` to re-enable after manual override
  - `isAutoConfidenceEnabled()` to check current state

- **Device Orientation Smoothing**: Compass readings are now smoothed to reduce jitter
  - Uses same smoothing factor as GPS heading
  - New `resetDeviceHeading()` method to clear smoothing state

- **Mock Location Support**: Full testing/demo support for simulated locations
  - `setMockLocation(location)` - Set a single mock location
  - `startMockPath(locations, interval)` - Cycle through waypoints
  - `stopMockPath()` - Stop path simulation
  - `stopMocking()` - Exit mock mode entirely
  - `isMockMode()` - Check if mock mode is active
  - `clearLastLocation()` - Privacy helper to clear cached location

### Performance Improvements
- **Optimized Direction Cone**: Reduced draw calls from 9 to 2 using merged BufferGeometry with vertex colors
- **Fewer Material Objects**: Cone now uses 2 materials instead of 9

### New Options (UserMarkerOptions)
```typescript
enableAutoConfidence?: boolean;          // default: true
stalenessLowThresholdMs?: number;        // default: 30000 (30s)
stalenessLostThresholdMs?: number;       // default: 60000 (60s)
accuracyLowThresholdMeters?: number;     // default: 100
accuracyLostThresholdMeters?: number;    // default: 500
```

### CDN
- **unpkg**: `https://unpkg.com/rovemaps-you-are-here@2.1.0/dist/rovemaps-you-are-here.umd.cjs`
- **jsDelivr**: `https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@2.1.0/dist/rovemaps-you-are-here.umd.cjs`

## [2.0.0] - 2025-12-10

### Breaking Changes
- **Input Validation**: Invalid coordinates now throw errors or return safe defaults instead of silently failing
- **MercatorProjection**: Constructor now validates all inputs and throws on invalid center/scale
- **ThreeYouAreHereController**: Constructor now validates center option and throws if invalid

### Critical Bug Fixes
- **Memory Leak - Animation Loop**: Fixed animation loop continuing after `stop()` in ThreeYouAreHereController
- **Race Condition - Concurrent start()**: Fixed race condition when calling `start()` multiple times concurrently
- **Heading Math**: Fixed heading normalization for GPS values > 360 or < 0 degrees
- **Altitude Scaling**: Fixed incorrect Mercator distortion applied to altitude values
- **Event Listener Leak**: Fixed potential memory leak when adding many event listeners
- **Disposed State**: All classes now track disposed state and prevent use after disposal

### Performance Improvements
- **Frame-Rate Independent Animations**: All animations now use deltaTime for consistent behavior across devices
- **Update Throttling**: GeolocationProvider now throttles updates to 100ms minimum interval
- **Camera Distance Caching**: ThreeUserMarker caches camera distance to reduce per-frame calculations
- **Set-based Event Listeners**: GeolocationProvider uses Set instead of Array for O(1) listener operations

### New Features
- **setConfidence()**: New method to indicate GPS signal quality ('high', 'low', 'lost')
- **getLastLocation()**: New method to retrieve the most recent location without subscribing
- **isSecureContext()**: New method to check if HTTPS is available (required for geolocation)
- **setDotColor/setBorderColor/setRingColor**: Individual color setters for marker components
- **hide()/show()**: Methods to toggle marker visibility
- **removeAllListeners()**: Method to clear all event listeners at once
- **listenerCount()**: Method to get current listener count per event

### Security
- **HTTPS Warning**: SDK now warns when running on non-HTTPS origins
- **Max Listener Warning**: Warns when > 10 listeners are added (potential memory leak)
- **Input Sanitization**: All public methods validate inputs before processing

### Documentation
- **Comprehensive JSDoc**: All public APIs now have detailed JSDoc with examples
- **Type Safety**: Improved TypeScript types with better documentation
- **CDN Examples**: Added static HTML examples for CDN usage

### CDN Support
- **UMD Build**: Available at `dist/rovemaps-you-are-here.umd.cjs`
- **Global**: Exposes `RoveMapsYouAreHere` global when loaded via script tag
- **unpkg**: `https://unpkg.com/rovemaps-you-are-here@2.0.0/dist/rovemaps-you-are-here.umd.cjs`
- **jsDelivr**: `https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@2.0.0/dist/rovemaps-you-are-here.umd.cjs`

## [1.1.0] - 2025-12-10

### 🚀 Major Improvements
- **New Name**: The main controller is now called `ThreeYouAreHereController` (formerly `LocationMarkerController`). This is a breaking change for imports.
- **Orientation Support**: Added `orientation` option to `ThreeUserMarker`. Supports `'z-up'` (default) and `'y-up'` (standard Three.js).
- **Simpler Quick Start**: Documentation updated to prioritize `ThreeYouAreHereController` for easier setup.

### ⚡ Performance
- **Object Reuse**: `ThreeUserMarker` now reuses internal Vector3 objects, reducing garbage collection during high-frequency GPS updates.

### 🐛 Bug Fixes
- **Memory Leak**: Fixed a critical issue where calling `start()` multiple times on `GeolocationProvider` would create overlapping watchers.
- **Permission Cleanup**: Fixed potential listener leaks when permission status changes.

### 📦 Dependencies
- **Peer Dependency**: Moved `three` to `peerDependencies` to prevent "multiple instances of Three.js" errors.

## [1.0.0] - 2025-12-09
- Initial release.
