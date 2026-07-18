// Guards the built artifacts: no framework code may be inlined into the
// core bundle, and the public surface must actually be exported.
import { readFile } from 'node:fs/promises';

const esm = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');

const bannedMarkers = [
  'react.transitional.element', // React 19 element symbol
  'react.forward_ref',
  'svelte/store',
];
for (const marker of bannedMarkers) {
  if (esm.includes(marker)) {
    console.error(`FAIL: dist/index.js contains bundled dependency marker "${marker}"`);
    process.exit(1);
  }
}

const core = await import('../dist/index.js');
const requiredExports = [
  'ThreeUserMarker',
  'ThreeYouAreHereController',
  'GeolocationProvider',
  'MapLibreUserMarker',
  'MapLibreYouAreHereController',
  'MapBoxUserMarker',
  'MercatorProjection',
  'RoveError',
];
for (const name of requiredExports) {
  if (typeof core[name] !== 'function') {
    console.error(`FAIL: dist/index.js missing export ${name}`);
    process.exit(1);
  }
}

console.log('dist verification passed');
