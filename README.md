<p align="center">
  <img src="https://img.shields.io/badge/RoveMaps-YouAreHere-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white" alt="RoveMaps YouAreHere" />
</p>

<h1 align="center">RoveMaps YouAreHere SDK</h1>

<p align="center">
  <strong>A professional "blue dot" user location SDK for Three.js and MapLibre GL</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rovemaps-you-are-here">
    <img src="https://img.shields.io/npm/v/rovemaps-you-are-here.svg?style=flat-square" alt="npm version" />
  </a>
  <a href="https://bundlephobia.com/package/rovemaps-you-are-here">
    <img src="https://img.shields.io/bundlephobia/minzip/rovemaps-you-are-here?style=flat-square" alt="bundle size" />
  </a>
  <a href="https://github.com/russellmiddleton33/RoveBeacon/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" />
  </a>
  <a href="https://russellmiddleton33.github.io/RoveBeacon/">
    <img src="https://img.shields.io/badge/demo-live-success?style=flat-square" alt="live demo" />
  </a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#examples">Examples</a> ·
  <a href="https://russellmiddleton33.github.io/RoveBeacon/">Live Demo</a>
</p>

---

## Overview

RoveMaps YouAreHere provides a production-ready "blue dot" user location marker for mapping applications. Drop it into any Three.js scene or MapLibre GL map and get a polished, Google Maps-style location indicator with GPS accuracy visualization and smooth animations.

```typescript
import { ThreeYouAreHereController } from 'rovemaps-you-are-here';

const controller = new ThreeYouAreHereController({
  center: [-74.006, 40.7128], // NYC
});

await controller.start(scene);
```

**[Try the Live Demo →](https://russellmiddleton33.github.io/RoveBeacon/)**

---

## Features

| Feature | Description |
|---------|-------------|
| **Blue Dot Marker** | Clean, Google Maps-style user location indicator |
| **Accuracy Ring** | Pulsing ring that scales with GPS precision |
| **Direction Cone** | Heading indicator when user is moving |
| **Compass Support** | Device orientation for heading when stationary |
| **Confidence States** | Visual feedback for GPS signal quality |
| **Smooth Animations** | Frame-rate independent position and heading interpolation |
| **Auto Staleness** | Automatic confidence degradation when GPS signal is lost |
| **Battery Aware** | Pauses tracking when tab is hidden, smart resume when visible |
| **Multi-Platform** | Three.js, MapLibre GL JS, and MapBox GL JS support |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Application                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │  ThreeYouAreHere     │    │  MapLibreYouAreHere  │          │
│  │  Controller          │    │  Controller          │          │
│  └──────────┬───────────┘    └──────────┬───────────┘          │
│             │                           │                        │
│             └─────────┬─────────────────┘                        │
│                       │                                          │
│             ┌─────────▼─────────┐                               │
│             │ GeolocationProvider│ ◄── Shared location source    │
│             └─────────┬─────────┘                               │
│                       │                                          │
│  ┌────────────────────┼────────────────────┐                    │
│  │                    │                    │                    │
│  ▼                    ▼                    ▼                    │
│ GPS API          Compass API        Visibility API              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Components:**

- **Controllers** — High-level API that manages marker + geolocation together
- **Markers** — Visual components (Three.js meshes or MapLibre custom layers)
- **GeolocationProvider** — Unified location source with events and permissions
- **MercatorProjection** — GPS → scene coordinate conversion

---

## Installation

### npm (Recommended)

```bash
npm install rovemaps-you-are-here
```

### CDN (ESM)

The package ships as ES modules only. Load it in the browser with an import map so
the `three` peer dependency resolves to a single instance:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js"
    }
  }
</script>
<script type="module">
  import { ThreeYouAreHereController } from 'https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@3/dist/index.js';

  const controller = new ThreeYouAreHereController({ center: [-74.006, 40.7128] });
  // await controller.start(scene);
</script>
```

| CDN | ESM entry |
|-----|-----------|
| jsDelivr | `https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@3/dist/index.js` |
| unpkg | `https://unpkg.com/rovemaps-you-are-here@3/dist/index.js` |

> The UMD/global `<script>` build was removed in v3. Use `<script type="module">` with the ESM build above.

---

## Migrating from 2.x

v3.0.0 is a correctness-and-packaging release. The runtime API of the controllers and markers is unchanged; the breaking changes are about imports, packaging, and types.

- **React hooks moved to a subpath.** Import `useYouAreHere` / `useLocation` from `rovemaps-you-are-here/react`. The Svelte store moved to `rovemaps-you-are-here/svelte`. Neither is re-exported from the package root anymore.
- **UMD bundle removed.** Load the ESM build from a CDN with `<script type="module">` (see [CDN (ESM)](#cdn-esm)).
- **`useYouAreHere().marker` is now `ThreeUserMarker | null`.** The marker is created after mount (StrictMode-safe), so guard for null before rendering it.
- **`error` is now `RoveError | null`** in both React hooks and the Svelte store.
- **Injected `locationSource` is no longer disposed by the SDK.** If you pass your own source, you own its lifecycle.
- **Removed unwired exports** `FrameMonitor` and `AnimationManager` (and their option/stat types).
- **Removed never-emitted error codes:** `PERMISSION_DISMISSED`, `PERMISSION_UNAVAILABLE`, `SENSORS_UNAVAILABLE`, `NETWORK_ERROR`, `INVALID_CONFIGURATION`, `NOT_INITIALIZED`, `ALREADY_STARTED`.
- **`svelte` is now an optional peer dependency** (`>=4.0.0`); install it only if you use the Svelte store.

See the [CHANGELOG](./CHANGELOG.md) for the full list of fixes and additions.

---

## Quick Start

### Three.js

```typescript
import * as THREE from 'three';
import { ThreeYouAreHereController } from 'rovemaps-you-are-here';

// Create your scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight);
const renderer = new THREE.WebGLRenderer();

// Initialize the controller
const controller = new ThreeYouAreHereController({
  center: [-74.006, 40.7128], // [longitude, latitude] of your map center
  scale: 1,
  markerOptions: {
    color: 0x4285F4,
    showAccuracyRing: true,
    showDirectionCone: true,
  },
  onUpdate: (location) => {
    console.log('Location:', location.latitude, location.longitude);
  },
  onError: (error) => {
    console.error('GPS Error:', error.message);
  },
});

// Start tracking (requests GPS permission)
await controller.start(scene);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Cleanup when done
controller.dispose();
```

### MapLibre GL JS

```typescript
import maplibregl from 'maplibre-gl';
import { MapLibreYouAreHereController } from 'rovemaps-you-are-here';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-74.006, 40.7128],
  zoom: 14,
});

const controller = new MapLibreYouAreHereController({
  markerOptions: { color: 0x4285F4 },
  flyToOnFirstFix: true,
  flyToZoom: 16,
});

map.on('load', async () => {
  await controller.start(map);
});
```

### React + React Three Fiber

```tsx
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useYouAreHere } from 'rovemaps-you-are-here/react';

function YouAreHereMarker() {
  const { camera } = useThree();

  const { marker, update, start } = useYouAreHere({
    center: [-74.006, 40.7128], // NYC
    autoStart: true,
    markerOptions: {
      color: 0x4285f4,
      showAccuracyRing: true,
    },
  });

  useFrame((_, delta) => {
    update(delta, camera);
  });

  // `marker` is `ThreeUserMarker | null` — it is created inside a mount effect
  // (StrictMode-safe), so guard for null before rendering it.
  if (!marker) return null;
  return <primitive object={marker} />;
}

function App() {
  return (
    <Canvas camera={{ position: [0, 200, 200] }}>
      <ambientLight />
      <YouAreHereMarker />
    </Canvas>
  );
}
```

**Available React Hooks** (import from `rovemaps-you-are-here/react`):

| Hook | Description |
|------|-------------|
| `useYouAreHere` | Full marker + geolocation integration for Three.js. `marker` is `ThreeUserMarker \| null` (guard before rendering); `error` is `RoveError \| null`. |
| `useLocation` | Standalone geolocation hook (no marker). `error` is `RoveError \| null`. |

> Options other than `center` / `scale` / `locationSource` are read once at mount — changing them later requires remounting the component.

See [examples/react](./examples/react) for a complete working example.

### Svelte

```svelte
<script lang="ts">
  import { createLocationStore } from 'rovemaps-you-are-here/svelte';

  // Created inside a component, the store auto-disposes on destroy.
  const location = createLocationStore({ enableHighAccuracy: true });
</script>

<button on:click={() => location.start()}>Start</button>
<button on:click={() => location.stop()}>Stop</button>

{#if $location.error}
  <p>Error: {$location.error.message}</p>   <!-- error is RoveError | null -->
{:else if $location.location}
  <p>Lat: {$location.location.latitude.toFixed(6)}</p>
  <p>Lng: {$location.location.longitude.toFixed(6)}</p>
  {#if $location.isTracking}<p>Tracking…</p>{/if}
  {#if $location.deviceHeading !== null}<p>Heading: {$location.deviceHeading.toFixed(0)}°</p>{/if}
{/if}
```

The Svelte store state exposes `location`, `error` (`RoveError | null`), `permission`, `loading`, `isTracking`, and `deviceHeading`.

---

## API Reference

### ThreeYouAreHereController

The all-in-one controller for Three.js applications.

```typescript
const controller = new ThreeYouAreHereController(options);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `center` | `[number, number]` | **Required** | Map center as `[longitude, latitude]` |
| `scale` | `number` | `1` | Coordinate scale factor |
| `markerOptions` | `UserMarkerOptions` | `{}` | Visual appearance options |
| `geolocationOptions` | `GeolocationOptions` | `{}` | GPS configuration |
| `enableCompass` | `boolean` | `true` | Enable device compass |
| `onUpdate` | `(location) => void` | — | Location update callback |
| `onError` | `(error) => void` | — | Error callback |
| `onPermissionChange` | `(state) => void` | — | Permission state callback |

#### Methods

| Method | Description |
|--------|-------------|
| `start(scene)` | Add marker to scene and start GPS tracking |
| `stop()` | Stop tracking and remove marker |
| `dispose()` | Clean up all resources |
| `requestPermissions()` | Request compass permission (iOS) |
| `isActive()` | Check if controller is running |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `marker` | `ThreeUserMarker` | Direct access to the marker |
| `geolocation` | `GeolocationProvider` | Direct access to location provider |

---

### MapLibreYouAreHereController

The all-in-one controller for MapLibre GL JS.

```typescript
const controller = new MapLibreYouAreHereController(options);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `markerOptions` | `UserMarkerOptions` | `{}` | Visual appearance options |
| `geolocationOptions` | `GeolocationOptions` | `{}` | GPS configuration |
| `enableCompass` | `boolean` | `true` | Enable device compass |
| `flyToOnFirstFix` | `boolean` | `true` | Auto-fly to user on first GPS fix |
| `flyToZoom` | `number` | `16` | Zoom level for fly-to |
| `onUpdate` | `(location) => void` | — | Location update callback |
| `onError` | `(error) => void` | — | Error callback |
| `onPermissionChange` | `(state) => void` | — | Permission state callback |

#### Methods

| Method | Description |
|--------|-------------|
| `start(map)` | Add marker to map and start GPS tracking |
| `stop()` | Stop tracking and remove marker |
| `dispose()` | Clean up all resources |
| `flyToUser(options?)` | Fly camera to user location |

---

### UserMarkerOptions

Visual configuration for the marker.

```typescript
interface UserMarkerOptions {
  // Colors (hex values)
  color?: number;              // Main dot color (default: 0x4285F4)
  borderColor?: number;        // Border color (default: 0xFFFFFF)
  coneColor?: number;          // Direction cone color
  accuracyRingColor?: number;  // Accuracy ring color

  // Sizes (scene units)
  dotSize?: number;            // Dot radius (default: 9)
  borderWidth?: number;        // Border width (default: 3)
  coneLength?: number;         // Cone length (default: 45)
  coneWidth?: number;          // Cone width (default: 70)

  // Visibility
  showAccuracyRing?: boolean;  // Show pulsing ring (default: true)
  showDirectionCone?: boolean; // Show heading cone (default: true)

  // Animation
  pulseSpeed?: number;         // Ring pulse speed (default: 0.3)
  smoothPosition?: boolean;    // Smooth position updates (default: true)
  smoothHeading?: boolean;     // Smooth heading updates (default: true)

  // Behavior
  minSpeedForDirection?: number;  // Min speed to show cone (default: 0.5 m/s)
  orientation?: 'z-up' | 'y-up';  // Coordinate system (default: 'z-up')
}
```

---

### GeolocationProvider

Low-level location provider with event-based updates.

```typescript
const geo = new GeolocationProvider(options);

geo.on('update', (location) => { /* ... */ });
geo.on('error', (error) => { /* ... */ });
geo.on('permissionChange', (state) => { /* ... */ });

await geo.start();
```

#### Methods

| Method | Description |
|--------|-------------|
| `start()` | Start watching location |
| `stop()` | Stop watching |
| `dispose()` | Clean up resources |
| `getCurrentPosition()` | Get single position fix |
| `getLastLocation()` | Get cached last location |
| `getPermissionState()` | Get current permission state |
| `isWatching()` | Check if actively watching |

#### Mock Mode (Development)

```typescript
// Set a single mock location
geo.setMockLocation({
  longitude: -74.006,
  latitude: 40.7128,
  accuracy: 10,
  heading: 90,
  speed: 1.5,
});

// Simulate movement along a path
const stop = geo.startMockPath([
  { longitude: -74.006, latitude: 40.7128 },
  { longitude: -74.005, latitude: 40.7130 },
  { longitude: -74.004, latitude: 40.7132 },
], 1000); // 1 second between points

// Stop simulation
stop();
```

> **Note:** Mock mode is automatically disabled when `productionMode: true` is set.

---

### Confidence States

Visual feedback for GPS signal quality.

```typescript
type ConfidenceState = 'high' | 'low' | 'lost' | 'warning' | 'danger';

// Manual control
controller.marker.setConfidence('low');

// Automatic (default behavior)
// - 'low' after 30s without update or accuracy > 100m
// - 'lost' after 60s without update or accuracy > 500m
```

| State | Appearance | Trigger |
|-------|------------|---------|
| `high` | Blue dot, normal pulse | Good GPS signal |
| `low` | Blue dot, reduced opacity | 30s stale or >100m accuracy |
| `lost` | Grey dot, growing ring | 60s stale or >500m accuracy |
| `warning` | Orange dot, fast pulse | Manual trigger (geofence, etc.) |
| `danger` | Red dot, fastest pulse | Manual trigger (emergency) |

---

### Error Handling

The SDK uses structured errors with machine-readable codes.

```typescript
import { RoveError, RoveErrorCode } from 'rovemaps-you-are-here';

controller.geolocation.on('error', (error) => {
  if (RoveError.is(error, RoveErrorCode.PERMISSION_DENIED)) {
    showPermissionPrompt();
  } else if (RoveError.is(error, RoveErrorCode.GPS_SIGNAL_LOST)) {
    showSignalLostBanner();
  }
});
```

#### Error Codes

| Code | Description |
|------|-------------|
| `PERMISSION_DENIED` | User denied location permission |
| `GPS_SIGNAL_LOST` | Location temporarily unavailable |
| `TIMEOUT` | Location request timed out |
| `GEOLOCATION_UNSUPPORTED` | Browser doesn't support geolocation |
| `INSECURE_CONTEXT` | HTTPS required for geolocation |
| `INVALID_COORDINATES` | Invalid latitude/longitude values |
| `INTERNAL_ERROR` | Unexpected internal failure |

---

## Examples

### Custom Colors

```typescript
const controller = new ThreeYouAreHereController({
  center: [-74.006, 40.7128],
  markerOptions: {
    color: 0xFF6B6B,           // Coral red
    borderColor: 0xFFFFFF,
    accuracyRingColor: 0xFF6B6B,
    coneColor: 0xFF6B6B,
  },
});
```

### Disable Animations (Low Power Mode)

```typescript
const controller = new ThreeYouAreHereController({
  center: [-74.006, 40.7128],
  markerOptions: {
    smoothPosition: false,
    smoothHeading: false,
    pulseSpeed: 0,              // Disable pulse animation
    showAccuracyRing: false,    // Hide ring entirely
  },
});
```

### Custom Coordinate System (Y-Up)

```typescript
// Standard Three.js Y-up scene
const controller = new ThreeYouAreHereController({
  center: [-74.006, 40.7128],
  markerOptions: {
    orientation: 'y-up',
  },
});
```

### React Integration

```tsx
import { useEffect, useRef } from 'react';
import { ThreeYouAreHereController } from 'rovemaps-you-are-here';

function LocationMarker({ scene, center }) {
  const controllerRef = useRef<ThreeYouAreHereController | null>(null);

  useEffect(() => {
    const controller = new ThreeYouAreHereController({ center });
    controllerRef.current = controller;

    controller.start(scene).catch(console.error);

    return () => {
      controller.dispose();
    };
  }, [scene, center]);

  return null;
}
```

---

## Project Structure

```
rovemaps-you-are-here/
├── src/
│   ├── lib/
│   │   ├── index.ts              # Main exports
│   │   ├── types.ts              # TypeScript interfaces
│   │   ├── errors.ts             # Error codes and RoveError class
│   │   ├── sources.ts            # LocationSource interface
│   │   ├── GeolocationProvider.ts
│   │   ├── three/
│   │   │   ├── ThreeUserMarker.ts
│   │   │   └── ThreeYouAreHereController.ts
│   │   ├── maplibre/
│   │   │   ├── MapLibreUserMarker.ts
│   │   │   └── MapLibreYouAreHereController.ts
│   │   ├── mapbox/
│   │   │   ├── MapBoxUserMarker.ts
│   │   │   └── MapBoxYouAreHereController.ts
│   │   └── svelte/
│   │       └── index.ts          # Svelte store helpers
│   └── utils/
│       ├── MercatorProjection.ts
│       └── validation.ts
├── examples/
│   ├── cdn-example.html
│   └── fleet-tracking.html
├── dist/                         # Built output
├── docs/
│   └── plans/
└── tests/
```

---

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/russellmiddleton33/RoveBeacon.git
cd RoveBeacon
npm install
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build demo application |
| `npm run build:lib` | Build library for npm |
| `npm run check` | Run TypeScript type checks |
| `npm test` | Run unit tests |
| `npm test -- --coverage` | Run tests with coverage |

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- GeolocationProvider
```

---

## Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 80+ | Full support |
| Firefox | 78+ | Full support |
| Safari | 14+ | Requires HTTPS; compass needs user gesture |
| Edge | 80+ | Full support |
| iOS Safari | 14+ | Requires HTTPS; compass permission prompt |
| Chrome Android | 80+ | Full support |

> **Important:** Geolocation requires HTTPS in production. `localhost` is allowed for development.

---

## Performance Tips

### Mobile Optimization

```typescript
// For mobile devices, consider reducing visual complexity
const controller = new ThreeYouAreHereController({
  center: [-74.006, 40.7128],
  markerOptions: {
    pulseSpeed: 0.15,           // Slower pulse
    showDirectionCone: false,   // Hide cone to reduce draw calls
  },
  geolocationOptions: {
    enableHighAccuracy: true,   // Better accuracy but more battery
    timeout: 15000,             // Longer timeout for weak signals
  },
});
```

### Memory Management

Always call `dispose()` when removing the marker:

```typescript
// Cleanup on unmount
controller.dispose();
```

---

## Troubleshooting

### "Permission denied" on iOS

iOS requires a user gesture to request location permission. Wrap `start()` in a click handler:

```typescript
button.addEventListener('click', async () => {
  await controller.requestPermissions(); // Compass permission
  await controller.start(scene);         // Location permission
});
```

### Marker not showing

1. Ensure GPS permission is granted
2. Check that `center` coordinates are valid
3. Verify the marker is within camera view
4. Check console for error messages

### Jittery compass heading

Increase the heading smoothing factor:

```typescript
markerOptions: {
  headingSmoothingFactor: 0.08, // Lower = smoother (default: 0.15)
}
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT © [Russell Middleton](https://github.com/russellmiddleton33)

---

<p align="center">
  <a href="https://russellmiddleton33.github.io/RoveBeacon/">Live Demo</a> ·
  <a href="https://github.com/russellmiddleton33/RoveBeacon/issues">Report Bug</a> ·
  <a href="https://github.com/russellmiddleton33/RoveBeacon/issues">Request Feature</a>
</p>
