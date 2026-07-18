# create-rovebeacon

Create a new RoveBeacon project with one command. RoveBeacon provides GPS location tracking with Three.js visualization.

## Quick Start

```bash
npx create-rovebeacon my-app
cd my-app
npm install
npm run dev
```

## Usage

```bash
npx create-rovebeacon [project-name] [options]
```

### Options

- `--template, -t <template>` - Template to use (vanilla, react, svelte)
- `--help, -h` - Show help message

### Examples

```bash
# Interactive mode (prompts for options)
npx create-rovebeacon

# Create with project name
npx create-rovebeacon my-app

# Create with specific template
npx create-rovebeacon my-app --template react
npx create-rovebeacon my-app -t svelte
```

## Templates

### vanilla
Plain TypeScript + Three.js setup with OrbitControls. Best for custom integrations or learning.

### react
React 18 + React Three Fiber with the `useYouAreHere` hook. Includes drei helpers for easy 3D setup.

### svelte
Svelte 5 + Three.js with reactive state management. Lightweight and fast.

## What's Included

Each template includes:
- Vite dev server with HTTPS (required for geolocation)
- TypeScript configuration
- Three.js setup with lighting, grid, and controls
- RoveBeacon marker with GPS tracking
- Start/stop tracking controls
- Responsive canvas

## HTTPS Requirement

The Geolocation API requires HTTPS. The dev server uses `@vitejs/plugin-basic-ssl` to provide a self-signed certificate. You may need to accept the browser's security warning on first load.

## Next Steps

After creating your project:

1. Update the `MAP_CENTER` coordinates in the main file to your target location
2. Customize the marker appearance using `ThreeUserMarker` options
3. Add your own 3D content to the scene
4. Connect to your map tile provider for background context

## Links

- [RoveBeacon Documentation](https://github.com/russellmiddleton33/RoveBeacon)
- [Three.js Documentation](https://threejs.org/docs/)
- [React Three Fiber Documentation](https://docs.pmnd.rs/react-three-fiber/)
