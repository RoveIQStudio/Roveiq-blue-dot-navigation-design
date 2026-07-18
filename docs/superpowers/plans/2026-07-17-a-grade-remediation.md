# roveBeacon A-Grade Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take rovemaps-you-are-here from the audit's C+/B− to an A: fix the two verified criticals (bundled React, y-up desync), the lifecycle/state bugs, delete dead subsystems, close adapter parity gaps, and harden tooling — shipping as v3.0.0.

**Architecture:** The SDK stays a single package with three build entries (`.` core, `./react`, `./svelte`), all framework deps externalized. Correctness fixes are surgical patches with regression tests. The unwired adaptive-quality loop (FrameMonitor/AnimationManager) is **deleted**, not fixed (per Russ's deletion-first direction). The MapLibre/MapBox dedup refactor is explicitly deferred to a follow-up plan.

**Tech Stack:** TypeScript 5.9, Vite 7 lib mode, Vitest 4, Playwright, ESLint 9 flat config, Three.js (peer), MapLibre/Mapbox (optional peers), React 19 / Svelte 5 bindings.

## Global Constraints

- This is a **breaking release: v3.0.0**. Breaking changes are allowed but must be listed in the CHANGELOG task (Task 19).
- Before EVERY commit: `npm run check && npx vitest run` must pass (after Task 1, also `npm run lint`).
- Bundle budgets (gzip): `dist/index.js` ≤ 40 KB. CI enforces via size-limit.
- No new runtime dependencies. New devDependencies limited to the ESLint toolchain (Task 1).
- Conventional commit messages (`feat:`, `fix:`, `chore:`, with `!` for breaking).
- Node 20, npm. Do not modify `packages/create-rovebeacon/templates/*` except where a task says so.
- Do not start the deferred canvas-marker unification refactor (see "Deferred" section) inside this plan.

## Decisions already made (Russ can veto before execution)

1. **v3.0.0 breaking release** — packaging and API fixes below cannot land cleanly in a 2.x patch.
2. **UMD build is dropped.** CDN users get ESM via `<script type="module">` (README rewritten in Task 19). Rationale: Vite lib mode cannot do multi-entry UMD, and multi-entry is the correct fix for the bundled-React critical.
3. **FrameMonitor + AnimationManager are deleted**, not repaired. They are exported nowhere else, wired to nothing, and broken as designed (no rAF-gap rejection, no hysteresis). If adaptive quality is ever wanted, it gets designed fresh.
4. **Repo URL standardized** to `https://github.com/russellmiddleton33/RoveBeacon` (matches README badges). Swap if wrong.
5. **Package keeps its name** `rovemaps-you-are-here`. The roveBeacon/rovemaps/rovebeacon naming sprawl is flagged in Task 19 as an open question, not resolved here.

---

## Phase A — Guardrails & Packaging

### Task 1: ESLint baseline + CI lint step

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (scripts, devDependencies)
- Modify: `.github/workflows/ci.yml`
- Modify: `src/lib/performance/QualityManager.ts:12` (unused import)
- Modify: `src/lib/react/useYouAreHere.test.ts:2` (unused import)

**Interfaces:**
- Produces: `npm run lint` (used by every later task's commit gate and by CI).

- [ ] **Step 1: Install the toolchain**

```bash
npm install -D eslint@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5 globals@^15
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'docs/**',
      'packages/create-rovebeacon/templates/**',
      'playwright-report/**',
      '**/*.svelte', // covered by svelte-check
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // The codebase intentionally uses `as any` for private-state tests and
      // module-injection escape hatches; keep it a warning, not an error.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/lib/react/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  }
);
```

- [ ] **Step 3: Add the script to `package.json`** (in `"scripts"`, after `"check"`):

```json
    "lint": "eslint .",
```

- [ ] **Step 4: Run and fix the known offenders**

Run: `npm run lint`

Expected initial failures include (fix each):
- `src/lib/performance/QualityManager.ts:12` — unused import `getDefaultQualitySettings`: delete it from the import statement.
- `src/lib/react/useYouAreHere.test.ts:2` — unused import `waitFor`: delete it from the import statement.
- Any other `no-unused-vars` hits: delete the unused symbol.

If a rule fires on a pattern that is genuinely intentional, add a targeted inline `// eslint-disable-next-line <rule>` with a reason — never a blanket file disable.

Run again: `npm run lint` → exit 0 (warnings allowed, errors none).

- [ ] **Step 5: Add lint to CI**

In `.github/workflows/ci.yml`, after the "Run type checks" step, insert:

```yaml
      - name: Lint
        run: npm run lint
```

Also delete the three trailing blank lines at the end of the file (uncommitted noise currently in the working tree).

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run lint && npx vitest run` → all pass.

```bash
git add eslint.config.js package.json package-lock.json .github/workflows/ci.yml src/lib/performance/QualityManager.ts src/lib/react/useYouAreHere.test.ts
git commit -m "chore: add ESLint flat config and CI lint step"
```

---

### Task 2: Multi-entry library build with real externals

Fixes the **critical**: React (and Svelte) are currently inlined into the published bundle because `src/lib/index.ts` re-exports them and `external` only lists `three`.

**Files:**
- Modify: `vite.lib.config.ts` (full replacement below)
- Modify: `src/lib/index.ts:56-66` (remove React/Svelte re-exports)
- Modify: `package.json` (exports map, main/module, sideEffects, size-limit)

**Interfaces:**
- Produces: `dist/index.js|.cjs`, `dist/react.js|.cjs`, `dist/svelte.js|.cjs`; import specifiers `rovemaps-you-are-here`, `rovemaps-you-are-here/react`, `rovemaps-you-are-here/svelte`. Task 3's verify script and Task 14/19's docs depend on these names.

- [ ] **Step 1: Replace `vite.lib.config.ts` entirely with:**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

// Library build configuration - builds only the SDK.
// Three entries so framework bindings never contaminate the core bundle.
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/lib/index.ts'),
        react: resolve(__dirname, 'src/lib/react/index.ts'),
        svelte: resolve(__dirname, 'src/lib/svelte/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Everything a consumer must provide themselves.
      external: [
        'three',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'svelte',
        'svelte/store',
        'maplibre-gl',
        'mapbox-gl',
      ],
    },
    sourcemap: true,
    minify: 'esbuild',
  },
});
```

- [ ] **Step 2: Remove framework re-exports from the core barrel**

In `src/lib/index.ts`, delete these lines (currently 56–66):

```ts
// Svelte Helpers
export { createLocationStore } from './svelte';

// React Helpers (also available via 'rovemaps-you-are-here/react')
export { useLocation, useYouAreHere } from './react';
export type {
  UseLocationOptions,
  UseLocationResult,
  UseYouAreHereOptions,
  UseYouAreHereResult,
} from './react';
```

(BREAKING: React hooks are now only at `/react`, Svelte store only at `/svelte`. Task 19 documents this.)

- [ ] **Step 3: Update `package.json` packaging fields**

Replace the current `"main"`, `"module"`, `"types"`, `"exports"` block with:

```json
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/lib/index.d.ts",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/lib/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./react": {
      "types": "./dist/lib/react/index.d.ts",
      "import": "./dist/react.js",
      "require": "./dist/react.cjs"
    },
    "./svelte": {
      "types": "./dist/lib/svelte/index.d.ts",
      "import": "./dist/svelte.js",
      "require": "./dist/svelte.cjs"
    }
  },
```

(Declaration paths are correct as-is: `tsconfig.lib.json` has `declarationDir: "./dist"` with root `src/`, so declarations land at `dist/lib/...`.)

Replace the `"size-limit"` array with:

```json
  "size-limit": [
    { "name": "Core ESM", "path": "dist/index.js", "limit": "40 KB", "gzip": true },
    { "name": "Core CJS", "path": "dist/index.cjs", "limit": "40 KB", "gzip": true },
    { "name": "React entry", "path": "dist/react.js", "limit": "40 KB", "gzip": true },
    { "name": "Svelte entry", "path": "dist/svelte.js", "limit": "10 KB", "gzip": true }
  ],
```

- [ ] **Step 4: Build and verify React is gone from the core bundle**

Run: `npm run build:lib`
Then:

```bash
grep -c "react.transitional.element" dist/index.js || echo "CLEAN"
```
Expected: `CLEAN` (grep finds nothing).

```bash
grep -o 'from"react"\|require("react")' dist/react.js dist/react.cjs | head -2
```
Expected: at least one match — the react entry now *imports* React instead of bundling it.

- [ ] **Step 5: Full check and commit**

Run: `npm run check && npm run lint && npx vitest run && npm run size` → all pass.

```bash
git add vite.lib.config.ts src/lib/index.ts package.json
git commit -m "fix!: externalize react/svelte and split build into core, /react, /svelte entries"
```

---

### Task 3: Dist verification script wired into CI and publish

The test suite runs against `src/`, so packaging bugs are invisible to it. This gate makes the bundled-React class of bug impossible to ship again.

**Files:**
- Create: `scripts/verify-dist.mjs`
- Modify: `package.json` (script)
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`

**Interfaces:**
- Produces: `npm run verify:dist` — fails (exit 1) if framework code is bundled or core exports are missing.

- [ ] **Step 1: Create `scripts/verify-dist.mjs`**

```js
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
```

- [ ] **Step 2: Add script to `package.json`** (after `"build:lib"`):

```json
    "verify:dist": "node scripts/verify-dist.mjs",
```

- [ ] **Step 3: Wire into both workflows**

`.github/workflows/ci.yml` — after the "Build library" step, insert:

```yaml
      - name: Verify build artifacts are clean
        run: npm run verify:dist
```

`.github/workflows/publish.yml` — replace the run steps so a type error, lint error, oversized or dirty bundle can never publish:

```yaml
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm run test -- --run
      - run: npm run build:lib
      - run: npm run verify:dist
      - run: npm run size
      - run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 4: Verify locally**

Run: `npm run build:lib && npm run verify:dist`
Expected: `dist verification passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-dist.mjs package.json .github/workflows/ci.yml .github/workflows/publish.yml
git commit -m "ci: verify built bundles contain no inlined framework code before publish"
```

---

### Task 4: LICENSE file and repository metadata

**Files:**
- Create: `LICENSE`
- Modify: `package.json:114-117` (repository)
- Modify: `packages/create-rovebeacon/package.json` (repository, if the field is empty there too)

- [ ] **Step 1: Create `LICENSE`** with the standard MIT text:

```
MIT License

Copyright (c) 2026 Russ Middleton

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Fill in `package.json` repository field**

```json
  "repository": {
    "type": "git",
    "url": "git+https://github.com/russellmiddleton33/RoveBeacon.git"
  },
```

Do the same in `packages/create-rovebeacon/package.json` if its repository field is empty or absent.

- [ ] **Step 3: Verify and commit**

Run: `npm pack --dry-run 2>&1 | grep -i license` — expected: LICENSE listed in the tarball.

```bash
git add LICENSE package.json packages/create-rovebeacon/package.json
git commit -m "chore: add MIT LICENSE file and repository metadata"
```

---

## Phase B — Correctness Criticals

### Task 5: Fix the y-up default-orientation desync

Fixes the **critical**: `ThreeUserMarker` defaults `orientation: 'y-up'` and rotates itself, but the controller (and the React hook) gate axis remapping on the caller's *raw* options, so the default path positions the marker with z-up math on a y-up-rotated mesh.

**Files:**
- Modify: `src/lib/three/ThreeUserMarker.ts` (add `getOrientation()`)
- Modify: `src/lib/three/ThreeYouAreHereController.ts:93`
- Modify: `src/lib/react/useYouAreHere.ts:193`
- Test: `src/lib/three/ThreeYouAreHereController.test.ts` (add test)

**Interfaces:**
- Produces: `ThreeUserMarker.getOrientation(): 'y-up' | 'z-up'` — the ONLY sanctioned way for consumers to learn the marker's effective orientation. Task 14's hook rewrite must use it.

- [ ] **Step 1: Write the failing regression test**

Append to `src/lib/three/ThreeYouAreHereController.test.ts`:

```ts
import type { LocationData, PermissionState, GeolocationEvents } from '../types';
import type { LocationSource } from '../sources';

class OrientationMockSource implements LocationSource {
  private updateListeners = new Set<(data: LocationData) => void>();
  async start(): Promise<void> {}
  stop(): void {}
  getLastLocation(): LocationData | null { return null; }
  getPermissionState(): PermissionState { return 'granted'; }
  on<K extends keyof GeolocationEvents>(event: K, callback: (data: GeolocationEvents[K]) => void): () => void {
    if (event === 'update') this.updateListeners.add(callback as (data: LocationData) => void);
    return () => this.off(event, callback);
  }
  off<K extends keyof GeolocationEvents>(event: K, callback: (data: GeolocationEvents[K]) => void): void {
    if (event === 'update') this.updateListeners.delete(callback as (data: LocationData) => void);
  }
  dispose(): void {}
  emitUpdate(location: LocationData): void {
    for (const cb of this.updateListeners) cb(location);
  }
}

describe('default orientation consistency (y-up regression)', () => {
  it('positions the marker with y-up axis mapping when orientation is defaulted', () => {
    const source = new OrientationMockSource();
    const controller = new ThreeYouAreHereController({
      center: [0, 0],
      locationSource: source,
    });

    // Marker default is y-up: mesh is rotated onto the XZ plane
    expect(controller.marker.rotation.x).toBeCloseTo(-Math.PI / 2);

    // A fix north of center must move the marker along -Z (north), NOT +Y (up)
    source.emitUpdate({
      longitude: 0,
      latitude: 0.001,
      altitude: null,
      accuracy: 5,
      speed: null,
      heading: null,
      timestamp: Date.now(),
    });

    expect(controller.marker.position.y).toBeCloseTo(0, 3);
    expect(controller.marker.position.z).toBeLessThan(0);

    controller.dispose();
  });
});
```

(Adjust the import list to merge with the file's existing imports rather than duplicating them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/three/ThreeYouAreHereController.test.ts -t "y-up regression"`
Expected: FAIL — `position.y` is > 0 (marker floated up instead of moving north).

- [ ] **Step 3: Add the accessor to `ThreeUserMarker`**

In `src/lib/three/ThreeUserMarker.ts`, after the constructor (line 222), add:

```ts
  /**
   * The effective coordinate-system orientation after defaults are applied.
   * Anything positioning this marker must consult this — never the raw
   * options it was constructed with.
   */
  getOrientation(): 'y-up' | 'z-up' {
    return this.options.orientation;
  }
```

- [ ] **Step 4: Fix both gates**

`src/lib/three/ThreeYouAreHereController.ts:93` — change:

```ts
      if (options.markerOptions?.orientation === 'y-up') {
```
to:
```ts
      if (this.marker.getOrientation() === 'y-up') {
```

`src/lib/react/useYouAreHere.ts:193` — change:

```ts
        if (markerOptions?.orientation === 'y-up') {
```
to:
```ts
        if (marker.getOrientation() === 'y-up') {
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/lib/three src/lib/react`
Expected: PASS (if an existing test asserted the old z-up default positioning, update it to match the y-up default — the new behavior is the intended one).

- [ ] **Step 6: Commit**

```bash
git add src/lib/three/ThreeUserMarker.ts src/lib/three/ThreeYouAreHereController.ts src/lib/react/useYouAreHere.ts src/lib/three/ThreeYouAreHereController.test.ts
git commit -m "fix: position marker using effective (merged) orientation, not raw caller options"
```

---

### Task 6: GeolocationProvider lifecycle — stop-while-paused and start-timeout

Fixes the two majors: (1) `stop()` never resets `isPaused`, so a visibility resume silently restarts tracking after an explicit stop; (2) the hardcoded 5 s start timeout is shorter than the browser `timeout` option and leaves an orphaned live watch that blocks retries.

**Files:**
- Modify: `src/lib/GeolocationProvider.ts:19-20` (delete const), `:395-445` (doStart), `:570-577` (stop)
- Test: `src/lib/GeolocationProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/GeolocationProvider.test.ts` (reuse the file's existing navigator/geolocation mock helpers; the shapes below show intent — merge with existing setup style):

```ts
describe('stop() while paused (visibility)', () => {
  it('does not auto-resume tracking after stop() when tab becomes visible again', async () => {
    const watchPosition = vi.fn().mockReturnValue(1);
    const clearWatch = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });

    const provider = new GeolocationProvider();
    // Begin watching: first success callback resolves start()
    watchPosition.mockImplementation((success: PositionCallback) => {
      success({
        coords: { longitude: 0, latitude: 0, accuracy: 5, altitude: null, speed: null, heading: null,
                  altitudeAccuracy: null, toJSON: () => ({}) },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
      return 1;
    });
    await provider.start();

    // Simulate tab hidden -> pause
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Explicit stop while hidden
    provider.stop();
    const watchCallsAfterStop = watchPosition.mock.calls.length;

    // Tab visible again -> must NOT restart the watch
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(watchPosition.mock.calls.length).toBe(watchCallsAfterStop);
    expect(provider.isWatching()).toBe(false);
    provider.dispose();
  });
});

describe('start() timeout hygiene', () => {
  it('clears the orphaned watch on timeout and allows retry', async () => {
    vi.useFakeTimers();
    const clearWatch = vi.fn();
    // watchPosition that never delivers a fix
    const watchPosition = vi.fn().mockReturnValue(42);
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });

    const provider = new GeolocationProvider({ timeout: 10000 });
    const startAttempt = provider.start();
    const rejection = expect(startAttempt).rejects.toMatchObject({ code: 'TIMEOUT' });

    // Timeout must be derived from options.timeout, not a shorter hardcoded value
    await vi.advanceTimersByTimeAsync(10000 + 1000);
    await rejection;

    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(provider.isWatching()).toBe(false);

    // Retry must reach watchPosition again (old bug: watchId stayed set, start() no-oped)
    void provider.start().catch(() => {});
    expect(watchPosition).toHaveBeenCalledTimes(2);

    provider.dispose();
    vi.useRealTimers();
  });
});
```

(Match the `RoveErrorCode.TIMEOUT` string to the enum's actual value in `src/lib/errors.ts` when writing the `toMatchObject` — check the enum, don't guess.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/GeolocationProvider.test.ts -t "stop() while paused"`
Run: `npx vitest run src/lib/GeolocationProvider.test.ts -t "timeout hygiene"`
Expected: both FAIL (first: watchPosition called again after resume; second: rejects at 5 s with clearWatch never called).

- [ ] **Step 3: Implement the fixes**

(a) `stop()` (currently lines 570–577) — replace with:

```ts
  stop(): void {
    if (this.watchId !== null) {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
    }
    // A stopped provider must not auto-resume on the next visibility change.
    this.isPaused = false;
  }
```

(b) Delete the constant at lines 19–20:

```ts
/** Maximum time to wait for concurrent start() operations (ms) */
const START_TIMEOUT_MS = 5000;
```

(c) In `doStart()` (lines 395–445), replace the promise body with:

```ts
    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const clearOrphanedWatch = () => {
        if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.clearWatch(this.watchId);
          this.watchId = null;
        }
      };

      // Give the browser its full configured timeout, plus a grace period,
      // before declaring the start dead.
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearOrphanedWatch();
          const error = new RoveError(
            RoveErrorCode.TIMEOUT,
            'Geolocation start timed out'
          );
          this.emit('error', error);
          reject(error);
        }
      }, this.options.timeout + 1000);

      this.watchId = navigator.geolocation.watchPosition(
        (position) => {
          this.handlePositionUpdate(position);

          // Resolve on first successful position
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
        },
        (error) => {
          this.handlePositionError(error);

          // Reject if this is the first callback (permission denied or other error).
          // The watch is dead for our purposes — clear it so isWatching() is
          // truthful and a later start() can retry.
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            clearOrphanedWatch();
            let code = RoveErrorCode.INTERNAL_ERROR;
            if (error.code === error.PERMISSION_DENIED) code = RoveErrorCode.PERMISSION_DENIED;
            else if (error.code === error.TIMEOUT) code = RoveErrorCode.TIMEOUT;
            else if (error.code === error.POSITION_UNAVAILABLE) code = RoveErrorCode.GPS_SIGNAL_LOST;

            reject(new RoveError(code, error.message, error));
          }
        },
        {
          enableHighAccuracy: this.options.enableHighAccuracy,
          maximumAge: this.options.maximumAge,
          timeout: this.options.timeout,
        }
      );
    });
```

- [ ] **Step 4: Run the full provider suite**

Run: `npx vitest run src/lib/GeolocationProvider.test.ts`
Expected: all PASS. If an existing test asserted the old 5 s timeout, update it to the new `options.timeout + 1000` behavior.

- [ ] **Step 5: Commit**

```bash
git add src/lib/GeolocationProvider.ts src/lib/GeolocationProvider.test.ts
git commit -m "fix: stop() cancels pending visibility resume; start timeout clears orphaned watch"
```

---

## Phase C — Three.js Resource Lifecycle

### Task 7: Material cache poisoning + dispose leaks in ThreeUserMarker

Fixes: `setDotColor`/`setRingColor` share one `usingCachedMaterials` flag, so calling both disposes shared CACHE materials that other markers still use. Also: dispose() leaks the detached swap geometry, the border material, and skips the cone.

**Files:**
- Modify: `src/lib/three/ThreeUserMarker.ts:167` (flag), `:281-289` (dot mesh), `:834-844` (setDotColor), `:886-895` (setRingColor), `:1271-1302` (dispose)
- Test: `src/lib/three/ThreeUserMarker.test.ts`

- [ ] **Step 1: Verify the cone assumption**

Read `createDirectionCone` and `disposeConeGroup` (`src/lib/three/ThreeUserMarker.ts` roughly lines 300–402). Confirm cone materials are created per-instance (not returned from `CACHE`). If they ARE cache-shared, do NOT add the `disposeConeGroup()` call in Step 4's dispose() — instead leave a comment stating cone resources are cache-owned. (Audit evidence says per-instance; verify before trusting.)

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/three/ThreeUserMarker.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/three/ThreeUserMarker.test.ts -t "material cache integrity"`
Expected: FAIL — shared glow disposed in test 1; `lost` and `border` missing in test 2.

- [ ] **Step 4: Implement**

(a) Replace the single flag (line 167):

```ts
  // Track per-category whether materials are borrowed from the shared CACHE
  // (never disposed by this instance) or custom-created (owned, disposed here).
  private usingCachedDotMaterials = true;
  private usingCachedGlowMaterials = true;
```

(b) In `createMarker()` (lines 281–289), use the pre-created confidence material for the dot instead of a loose orphan material:

```ts
    // Blue Dot (main marker) - top layer
    const dotGeometry = new THREE.CircleGeometry(dotSize, 32);
    this.dotMesh = new THREE.Mesh(dotGeometry, this.dotMaterials.high);
    this.dotMesh.position.z = 0.3;
    this.dotMesh.renderOrder = 102;
```

(Delete the `const dotMaterial = new THREE.MeshBasicMaterial({...})` block — that material was orphaned the moment confidence state changed.)

(c) In `setDotColor` (lines 838–843), replace the flag logic:

```ts
    // Dispose old custom materials to prevent memory leak
    if (!this.usingCachedDotMaterials) {
      this.dotMaterials.high?.dispose();
      this.dotMaterials.low?.dispose();
    }
    this.usingCachedDotMaterials = false;
```

(d) In `setRingColor` (lines 890–895), same shape:

```ts
    // Dispose old custom materials to prevent memory leak
    if (!this.usingCachedGlowMaterials) {
      this.glowMaterials.high?.dispose();
      this.glowMaterials.low?.dispose();
    }
    this.usingCachedGlowMaterials = false;
```

(e) Replace `dispose()` (lines 1271–1302) entirely:

```ts
  /**
   * Clean up all Three.js resources this instance owns.
   * Shared CACHE materials are never disposed here — other markers use them.
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.disposeConeGroup();

    // Both swappable glow geometries — only one is attached at a time,
    // so a traverse() would always miss the detached one.
    this.ringGeometry.dispose();
    this.lostCircleGeometry.dispose();
    this.borderMesh.geometry.dispose();
    this.dotMesh.geometry.dispose();

    // Border material is always per-instance.
    (this.borderMesh.material as THREE.Material).dispose();

    // high/low dot+glow materials are owned only after a custom recolor.
    if (!this.usingCachedDotMaterials) {
      this.dotMaterials.high.dispose();
      this.dotMaterials.low.dispose();
    }
    if (!this.usingCachedGlowMaterials) {
      this.glowMaterials.high.dispose();
      this.glowMaterials.low.dispose();
    }
    // lost/warning/danger materials are always CACHE-shared.

    // Clear references
    this.projection = null;
  }
```

- [ ] **Step 5: Run the full marker suite**

Run: `npx vitest run src/lib/three/ThreeUserMarker.test.ts`
Expected: all PASS (including pre-existing dispose-idempotency tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/three/ThreeUserMarker.ts src/lib/three/ThreeUserMarker.test.ts
git commit -m "fix: per-category material ownership prevents shared-cache disposal; dispose all owned resources"
```

---

### Task 8: Alert-state restore when pulsing is disabled

Fixes: leaving warning/danger is gated on `savedPulseSpeed > 0`, so a marker configured with `pulseSpeed: 0` gets stuck pulsing at alert speed with an orange/red cone forever.

**Files:**
- Modify: `src/lib/three/ThreeUserMarker.ts:187` (field), `:1016-1031` (applyConfidenceState)
- Test: `src/lib/three/ThreeUserMarker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('alert state restore with pulsing disabled', () => {
  it('restores pulseSpeed 0 and original cone color after leaving warning state', () => {
    const marker = new ThreeUserMarker({ pulseSpeed: 0, coneColor: 0x4285f4 });

    marker.setConfidence('warning');
    expect((marker as any).options.pulseSpeed).toBe(0.35);

    marker.setConfidence('high');
    expect((marker as any).options.pulseSpeed).toBe(0); // stuck at 0.35 before the fix
    expect((marker as any).options.coneColor).toBe(0x4285f4);

    marker.dispose();
  });
});
```

(If the public setter is named differently than `setConfidence`, use the file's actual public confidence setter — check the section around line 960.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/three/ThreeUserMarker.test.ts -t "alert state restore"`
Expected: FAIL — pulseSpeed stays 0.35.

- [ ] **Step 3: Implement**

Add a field next to `savedPulseSpeed` (line 187):

```ts
  private hasSavedAlertState = false; // True while savedPulseSpeed/savedConeColor hold real values
```

In `applyConfidenceState` (lines 1016–1031), replace the save/restore blocks:

```ts
    if (isEnteringAlert) {
      // Save current settings
      this.savedPulseSpeed = this.options.pulseSpeed;
      this.savedConeColor = this.options.coneColor;
      this.hasSavedAlertState = true;
    }

    if (isLeavingAlert && this.hasSavedAlertState) {
      this.hasSavedAlertState = false;
      // Restore original settings
      this.options.pulseSpeed = this.savedPulseSpeed;
      this.options.coneColor = this.savedConeColor;
      // Dispose old cone and recreate with original color
      this.disposeConeGroup();
      this.remove(this.coneGroup);
      this.coneGroup = this.createDirectionCone();
      this.add(this.coneGroup);
    }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/three/ThreeUserMarker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/three/ThreeUserMarker.ts src/lib/three/ThreeUserMarker.test.ts
git commit -m "fix: restore saved marker state after alert even when pulsing was disabled"
```

---

### Task 9: Controller ownership, scene removal, promise-mutex start

Fixes: `ThreeYouAreHereController.dispose()` destroys an injected caller-owned `LocationSource`, never removes the marker from the scene, and `start()` uses a 5 s polling loop instead of the promise mutex the other controllers use.

**Files:**
- Modify: `src/lib/three/ThreeYouAreHereController.ts`
- Test: `src/lib/three/ThreeYouAreHereController.test.ts`

**Interfaces:**
- Consumes: `OrientationMockSource` test helper from Task 5 (extend it with spies as shown).

- [ ] **Step 1: Write the failing tests**

```ts
describe('controller resource ownership', () => {
  it('does not dispose an injected LocationSource, but detaches its own listeners', () => {
    const source = new OrientationMockSource();
    const disposeSpy = vi.spyOn(source, 'dispose');

    const controller = new ThreeYouAreHereController({ center: [0, 0], locationSource: source });
    controller.dispose();

    expect(disposeSpy).not.toHaveBeenCalled();
    // Listeners are detached: an update after dispose must not move the marker
    const positionBefore = controller.marker.position.clone();
    source.emitUpdate({
      longitude: 0.001, latitude: 0.001, altitude: null, accuracy: 5,
      speed: null, heading: null, timestamp: Date.now(),
    });
    expect(controller.marker.position.equals(positionBefore)).toBe(true);
  });

  it('removes the marker from the scene on dispose', async () => {
    const source = new OrientationMockSource();
    const controller = new ThreeYouAreHereController({ center: [0, 0], locationSource: source });
    const scene = new THREE.Scene();

    await controller.start(scene);
    expect(scene.children).toContain(controller.marker);

    controller.dispose();
    expect(scene.children).not.toContain(controller.marker);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/three/ThreeYouAreHereController.test.ts -t "resource ownership"`
Expected: FAIL on both.

- [ ] **Step 3: Implement**

(a) Add fields after `currentScene` (line 48):

```ts
  private readonly ownsLocationSource: boolean;
  private readonly unsubscribers: Array<() => void> = [];
  private startPromise: Promise<void> | null = null;
```

Delete the `private isStarting = false;` field (line 45).

(b) In the constructor, set ownership right after creating `this.geolocation` (line 76):

```ts
    this.ownsLocationSource = !options.locationSource;
```

(c) Capture every listener's unsubscribe function. Each of the five `this.geolocation.on(...)` wiring calls in the constructor (update, error, permissionChange, deviceOrientation, resume) becomes:

```ts
    this.unsubscribers.push(this.geolocation.on('update', (location) => {
      // ... existing body unchanged ...
    }));
```

(`LocationSource.on` already returns `() => void` — see `src/lib/sources.ts:31`.)

(d) Replace the polling block in `start()` (lines 182–233) with a promise mutex, mirroring `GeolocationProvider.start()`:

```ts
  async start(scene: THREE.Scene): Promise<void> {
    if (this.isDisposed) {
      throw new Error('ThreeYouAreHereController: Cannot start disposed controller');
    }
    if (this.isStarted) return;
    if (this.startPromise !== null) return this.startPromise;

    this.startPromise = this.doStart(scene);
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async doStart(scene: THREE.Scene): Promise<void> {
    try {
      this.currentScene = scene;
      scene.add(this.marker);

      // Start geolocation (may throw on permission denied)
      await this.geolocation.start();

      // Start compass listener (no-op if not supported)
      if (this.options.enableCompass !== false && this.geolocation instanceof GeolocationProvider) {
        this.geolocation.startDeviceOrientation();
      }

      // Only start animation after geolocation succeeds
      this.isStopping = false;
      this.startAnimation();
      this.isStarted = true;
    } catch (error) {
      // Clean up on failure
      scene.remove(this.marker);
      this.currentScene = null;
      throw error;
    }
  }
```

(e) Replace `dispose()` (lines 307–316):

```ts
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;
    this.isStopping = true;
    this.stopAnimation();

    // Detach our listeners regardless of ownership
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;

    // Only destroy the source if we created it — injected sources belong to the caller
    if (this.ownsLocationSource) {
      this.geolocation.dispose();
    }

    if (this.currentScene) {
      this.currentScene.remove(this.marker);
    }
    this.marker.dispose();
    this.currentScene = null;
  }
```

- [ ] **Step 4: Run the controller suite**

Run: `npx vitest run src/lib/three/ThreeYouAreHereController.test.ts`
Expected: all PASS. If existing tests relied on `dispose()` disposing an injected source, update them — the new ownership contract is the intended behavior (BREAKING: callers injecting a source must now dispose it themselves; note for Task 19).

- [ ] **Step 5: Commit**

```bash
git add src/lib/three/ThreeYouAreHereController.ts src/lib/three/ThreeYouAreHereController.test.ts
git commit -m "fix!: controller only disposes owned location sources, removes marker from scene, promise-mutex start"
```

---

## Phase D — Deletions

### Task 10: Delete dead code and dead tooling

Deletes (all verified unreferenced outside their own tests and barrels): the divergent example projection copy, the unwired FrameMonitor/AnimationManager subsystem, unwired release-it, 7 never-emitted error codes, the dead `lostGrowDuration` field, and the leftover AI-confusion comment.

**Files:**
- Delete: `src/example/MercatorProjection.ts`
- Delete: `src/lib/performance/FrameMonitor.ts`, `src/lib/performance/FrameMonitor.test.ts`
- Delete: `src/lib/performance/AnimationManager.ts`, `src/lib/performance/AnimationManager.test.ts`
- Modify: `src/lib/performance/index.ts`, `src/lib/index.ts:23-45`
- Modify: `src/lib/errors.ts:8-29`, plus any test files referencing removed codes
- Modify: `src/lib/three/ThreeUserMarker.ts:182` and `:246-250`
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: Pre-deletion safety greps** (each must return only hits inside the files being deleted, their tests, or the barrels edited below):

```bash
grep -rn "FrameMonitor\|AnimationManager" src packages docs README.md --include="*.ts" --include="*.tsx" --include="*.md" -l
grep -rn "example/MercatorProjection" src tests packages docs README.md
grep -rn "PERMISSION_DISMISSED\|PERMISSION_UNAVAILABLE\|SENSORS_UNAVAILABLE\|NETWORK_ERROR\|INVALID_CONFIGURATION\|NOT_INITIALIZED\|ALREADY_STARTED" src docs README.md
grep -rn "lostGrowDuration" src
```

If a grep surfaces a production-code usage the audit missed, STOP deleting that item and flag it in the commit message instead.

- [ ] **Step 2: Delete files**

```bash
git rm src/example/MercatorProjection.ts
git rm src/lib/performance/FrameMonitor.ts src/lib/performance/FrameMonitor.test.ts
git rm src/lib/performance/AnimationManager.ts src/lib/performance/AnimationManager.test.ts
```

- [ ] **Step 3: Update the barrels**

Replace `src/lib/performance/index.ts` entirely with:

```ts
/**
 * Performance module exports
 *
 * Provides quality management and battery-aware power management
 * for optimal mobile performance.
 */

// Quality presets and settings
export {
  type QualityPreset,
  type QualitySettings,
  QUALITY_PRESETS,
  getDefaultQualitySettings,
} from './QualityPresets';

// Quality manager
export {
  QualityManager,
  type QualityManagerOptions,
  getGlobalQualityManager,
  setGlobalQualityManager,
} from './QualityManager';

// Battery monitoring
export {
  BatteryManager,
  type BatteryManagerOptions,
  type BatteryState,
  getGlobalBatteryManager,
  setGlobalBatteryManager,
} from './BatteryManager';
```

In `src/lib/index.ts` (lines 23–45), replace the performance export block with:

```ts
// Performance & Adaptive Quality
export {
  QualityManager,
  getGlobalQualityManager,
  setGlobalQualityManager,
  QUALITY_PRESETS,
  BatteryManager,
  getGlobalBatteryManager,
  setGlobalBatteryManager,
} from './performance';
export type {
  QualityPreset,
  QualitySettings,
  QualityManagerOptions,
  BatteryManagerOptions,
  BatteryState,
} from './performance';
```

(BREAKING: `FrameMonitor`, `AnimationManager`, and their types are removed from the public API — Task 19 documents it.)

- [ ] **Step 4: Trim never-emitted error codes**

In `src/lib/errors.ts` (enum at lines 8–29), delete these members: `PERMISSION_DISMISSED`, `PERMISSION_UNAVAILABLE`, `SENSORS_UNAVAILABLE`, `NETWORK_ERROR`, `INVALID_CONFIGURATION`, `NOT_INITIALIZED`, `ALREADY_STARTED`. Then:

```bash
grep -rn "PERMISSION_DISMISSED\|SENSORS_UNAVAILABLE\|NETWORK_ERROR\|INVALID_CONFIGURATION\|NOT_INITIALIZED\|ALREADY_STARTED\|PERMISSION_UNAVAILABLE" src
```

Update every remaining hit (they will be in `errors.test.ts`/`types.test.ts`): delete the test cases exercising removed codes, or retarget them to a surviving code like `PERMISSION_DENIED`.

- [ ] **Step 5: Clean ThreeUserMarker leftovers**

Delete line 182: `private lostGrowDuration = 60000; // 60 seconds to reach max size`

Replace the comment block at lines 246–250:

```ts
  /*
   * @deprecated Private method refactored to use createMaterials and build mesh in constructor or init
   * But wait, createMarker was called in constructor. We must restore the mesh creation logic
   * that was deleted/replaced incorrectly.
   */
```

with:

```ts
  /**
   * Build all meshes. Called once from the constructor.
   */
```

- [ ] **Step 6: Remove dead release tooling**

```bash
npm uninstall release-it @release-it/conventional-changelog
```

- [ ] **Step 7: Full verification and commit**

Run: `npm run check && npm run lint && npx vitest run && npm run build:lib && npm run verify:dist` → all pass.

```bash
git add -A
git commit -m "chore!: delete unwired FrameMonitor/AnimationManager, dead projection copy, unused error codes, release-it"
```

---

## Phase E — Map Adapter Parity

> These fixes are intentionally applied to BOTH canvas markers even though the files are ~85–90% duplicates. The unification refactor is deferred (see end of plan); correctness ships first.

### Task 11: Smart resume for MapLibre and MapBox

Fixes: only the Three path got the tab-visibility resume fix — the map markers flash grey "lost" after returning from a backgrounded tab.

**Files:**
- Modify: `src/lib/maplibre/MapLibreUserMarker.ts` (add method), `src/lib/maplibre/MapLibreYouAreHereController.ts` (wire event)
- Modify: `src/lib/mapbox/MapBoxUserMarker.ts` (add method), `src/lib/mapbox/MapBoxYouAreHereController.ts` (wire event)
- Test: `src/lib/maplibre/MapLibreUserMarker.test.ts`, `src/lib/mapbox/MapBoxYouAreHereController.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/maplibre/MapLibreUserMarker.test.ts`:

```ts
describe('resetStalenessTimer', () => {
  it('clears staleness-driven low/lost confidence after a visibility resume', () => {
    vi.useFakeTimers();
    const marker = new MapLibreUserMarker();
    marker.setLngLat([0, 0]);
    marker.setAccuracy(5);

    // Age the fix past the lost threshold
    vi.advanceTimersByTime(120_000);
    (marker as any).updateAutoConfidence();
    expect((marker as any).confidenceState).toBe('lost');

    // Tab came back: staleness must reset so we don't flash "lost"
    marker.resetStalenessTimer();
    (marker as any).updateAutoConfidence();
    expect((marker as any).confidenceState).toBe('high');

    marker.dispose();
    vi.useRealTimers();
  });
});
```

(Use the file's existing construction/mocking helpers; `vi.setSystemTime` instead of `advanceTimersByTime` if the file's existing staleness tests do it that way — `updateAutoConfidence` uses `Date.now()`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/maplibre/MapLibreUserMarker.test.ts -t resetStalenessTimer`
Expected: FAIL — `resetStalenessTimer is not a function`.

- [ ] **Step 3: Add the method to BOTH canvas markers**

In `src/lib/maplibre/MapLibreUserMarker.ts` AND `src/lib/mapbox/MapBoxUserMarker.ts`, next to their confidence methods (near `updateAutoConfidence`), add the identical method:

```ts
  /**
   * Reset the staleness timer, e.g. after a tab-visibility resume, so the
   * marker doesn't flash the "lost" state while waiting for a fresh fix.
   */
  resetStalenessTimer(): void {
    this.lastPositionUpdateTime = Date.now();
    this.isDirty = true;
  }
```

- [ ] **Step 4: Wire the resume event in BOTH controllers**

In `src/lib/maplibre/MapLibreYouAreHereController.ts` AND `src/lib/mapbox/MapBoxYouAreHereController.ts`, in the constructor after the `deviceOrientation` wiring block, add:

```ts
    // Reset staleness on visibility resume so the marker doesn't flash "lost"
    this.geolocation.on('resume', () => {
      if (this.isDisposed) return;
      this.marker.resetStalenessTimer();
    });
```

- [ ] **Step 5: Add a controller-level wiring test** in `src/lib/mapbox/MapBoxYouAreHereController.test.ts` (mirroring that file's existing mocking style):

```ts
  it('resets marker staleness when the geolocation provider resumes', () => {
    const controller = new MapBoxYouAreHereController();
    const resetSpy = vi.spyOn(controller.marker, 'resetStalenessTimer');
    // Reach into the provider and fire its resume event
    (controller.geolocation as any).emit('resume', undefined);
    expect(resetSpy).toHaveBeenCalled();
    controller.dispose();
  });
```

(If `emit` is private and inaccessible even via `as any` in the file's style, trigger it via the same visibilitychange simulation used in `GeolocationProvider.test.ts`.)

- [ ] **Step 6: Run and commit**

Run: `npx vitest run src/lib/maplibre src/lib/mapbox` → PASS.

```bash
git add src/lib/maplibre src/lib/mapbox
git commit -m "fix: port smart tab-visibility resume to MapLibre and MapBox markers"
```

---

### Task 12: MapBox parity — quality settings and module injection

Fixes: MapBoxUserMarker ignores the QualityManager (low-end devices get full effects) and cannot be used from a bundler (global-only module lookup).

**Files:**
- Modify: `src/lib/mapbox/MapBoxUserMarker.ts:114-116` (constructor), `:204-227` (addTo)
- Modify: `src/lib/types.ts` (add `mapBoxModule` option next to `mapLibreModule`, ~line 315)
- Test: `src/lib/mapbox/MapBoxUserMarker.test.ts`

- [ ] **Step 1: Add the option to `src/lib/types.ts`**

Directly below the existing `mapLibreModule?: any;` member of `UserMarkerOptions` (~line 315), add (matching its JSDoc style):

```ts
  /**
   * The mapbox-gl module for creating the native marker. Pass your imported
   * module when using a bundler (Vite/webpack) where no global is available.
   * @default null (falls back to window.mapboxgl)
   */
  mapBoxModule?: any;
```

Add `mapBoxModule: null,` to `DEFAULT_OPTIONS` in `src/lib/mapbox/MapBoxUserMarker.ts` (mirroring `mapLibreModule: null` in the MapLibre marker's defaults) — and to the MapLibre/Three DEFAULT_OPTIONS only if `Required<UserMarkerOptions>` makes the compiler demand it.

- [ ] **Step 2: Write the failing tests**

In `src/lib/mapbox/MapBoxUserMarker.test.ts`:

```ts
describe('MapBox parity', () => {
  it('applies quality-manager defaults like the MapLibre marker does', () => {
    setGlobalQualityManager(new QualityManager({ preset: 'low' }));
    try {
      const marker = new MapBoxUserMarker();
      // Low preset disables pulsing when the user didn't ask for it
      expect((marker as any).options.pulseSpeed).toBe(0);
      marker.dispose();
    } finally {
      setGlobalQualityManager(new QualityManager()); // restore auto-detection
    }
  });

  it('uses an injected mapbox-gl module instead of requiring a global', () => {
    const markerInstance = { setLngLat: vi.fn(), addTo: vi.fn(), remove: vi.fn() };
    const fakeModule = { Marker: vi.fn().mockReturnValue(markerInstance) };
    const marker = new MapBoxUserMarker({ mapBoxModule: fakeModule });

    const fakeMap = { on: vi.fn(), off: vi.fn() };
    marker.addTo(fakeMap as any);

    expect(fakeModule.Marker).toHaveBeenCalled();
    marker.dispose();
  });
});
```

(Check `QualityManager`'s actual constructor signature in `src/lib/performance/QualityManager.ts` for how to force a preset — if it takes a different option name than `preset`, use that; the existing `QualityManager.test.ts` shows the pattern.)

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/mapbox/MapBoxUserMarker.test.ts -t "MapBox parity"`
Expected: FAIL on both (no quality merge; throws "mapbox-gl not found").

- [ ] **Step 4: Implement**

(a) Replace the constructor's first line (`MapBoxUserMarker.ts:115`) with the MapLibre-style merge (add `import { getGlobalQualityManager } from '../performance/QualityManager';` and the same `DEFAULT_PULSE_SPEED` constant reference the file already has):

```ts
    // Get quality settings and apply defaults if not overridden
    const qualityManager = getGlobalQualityManager();
    const qualitySettings = qualityManager.getSettings();

    // Merge defaults -> quality settings -> user options
    const mergedOptions: UserMarkerOptions = {
      ...DEFAULT_OPTIONS,
      // Apply quality-dependent defaults
      pulseSpeed: options.pulseSpeed ?? (qualitySettings.pulseEnabled ? DEFAULT_PULSE_SPEED : 0),
      smoothPosition: options.smoothPosition ?? qualitySettings.smoothPosition,
      smoothHeading: options.smoothHeading ?? qualitySettings.smoothHeading,
      positionSmoothingFactor: options.positionSmoothingFactor ?? qualitySettings.positionSmoothingFactor,
      headingSmoothingFactor: options.headingSmoothingFactor ?? qualitySettings.headingSmoothingFactor,
      ...options
    };

    this.options = mergedOptions as Required<Omit<UserMarkerOptions, 'orientation'>>;
```

(Match the exact `Required<...>` cast the file currently uses on line 115.)

(b) In `addTo` (lines 212–216), replace the module lookup:

```ts
    // Prioritize injected module, then globals — matching MapLibreUserMarker
    let mapboxgl = this.options.mapBoxModule;

    if (!mapboxgl) {
      mapboxgl = (map as any)._mapboxgl || (window as any).mapboxgl;
    }

    if (!mapboxgl) {
      throw new Error('MapBoxUserMarker: mapbox-gl not found. Provide it via options.mapBoxModule or ensure it is loaded globally.');
    }
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/lib/mapbox && npm run check` → PASS.

```bash
git add src/lib/mapbox src/lib/types.ts
git commit -m "fix: MapBox marker honors quality settings and accepts injected mapbox-gl module"
```

---

### Task 13: Re-render accuracy ring on zoom when pulsing is off

Fixes: with `pulseSpeed: 0` the canvas only redraws when dirty, and nothing marks it dirty on map zoom — the accuracy ring keeps its stale pixel size until the next GPS tick.

**Files:**
- Modify: `src/lib/maplibre/MapLibreUserMarker.ts`, `src/lib/mapbox/MapBoxUserMarker.ts`
- Test: `src/lib/maplibre/MapLibreUserMarker.test.ts`

- [ ] **Step 1: Write the failing test** (MapLibre file; the fix is duplicated to MapBox):

```ts
describe('zoom invalidation', () => {
  it('marks the canvas dirty when the map zooms', () => {
    const marker = new MapLibreUserMarker({ pulseSpeed: 0 });
    const listeners: Record<string, () => void> = {};
    const fakeMap = {
      on: vi.fn((event: string, cb: () => void) => { listeners[event] = cb; }),
      off: vi.fn(),
      getZoom: vi.fn().mockReturnValue(15),
    };
    // Provide the module so addTo doesn't throw
    const fakeModule = { Marker: vi.fn().mockReturnValue({ setLngLat: vi.fn(), addTo: vi.fn(), remove: vi.fn() }) };
    (marker as any).options.mapLibreModule = fakeModule;

    marker.addTo(fakeMap as any);
    (marker as any).isDirty = false;

    expect(listeners['zoom']).toBeDefined();
    listeners['zoom']();
    expect((marker as any).isDirty).toBe(true);

    marker.dispose();
    expect(fakeMap.off).toHaveBeenCalledWith('zoom', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/maplibre/MapLibreUserMarker.test.ts -t "zoom invalidation"`
Expected: FAIL — `listeners['zoom']` undefined.

- [ ] **Step 3: Implement in BOTH markers**

Add a field next to `boundHandleDprChange`:

```ts
  private boundHandleMapZoom: (() => void) | null = null;
```

In `addTo`, immediately after `this.map = map;`:

```ts
    // Ring radius depends on zoom (meters-per-pixel); redraw on zoom even when
    // pulsing is disabled and no GPS tick arrives.
    this.boundHandleMapZoom = () => { this.isDirty = true; };
    map.on('zoom', this.boundHandleMapZoom);
```

Add a private cleanup helper next to `cleanupDprListener`:

```ts
  private cleanupMapZoomListener(): void {
    if (this.map && this.boundHandleMapZoom) {
      this.map.off('zoom', this.boundHandleMapZoom);
    }
    this.boundHandleMapZoom = null;
  }
```

Call `this.cleanupMapZoomListener();` in BOTH `remove()` and `dispose()` — place it immediately before each method's existing `this.map = null` / marker-teardown line (locate the `remove()` and `dispose()` implementations in each file; they already call `cleanupDprListener()` in dispose — add this call adjacent to it, and in `remove()` before the map reference is dropped).

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/lib/maplibre src/lib/mapbox` → PASS.

```bash
git add src/lib/maplibre src/lib/mapbox
git commit -m "fix: redraw accuracy ring on map zoom when pulsing is disabled"
```

---

## Phase F — Framework Bindings

### Task 14: useYouAreHere overhaul — StrictMode-safe marker, live callbacks, ownership

Fixes three majors: marker constructed in `useMemo` (disposables created during render leak under StrictMode), `onUpdate`/`onError` captured once at mount (stale closures), and injected `locationSource` disposed by the hook.

**BREAKING:** `UseYouAreHereResult.marker` becomes `ThreeUserMarker | null` (null until the mount effect runs).

**Files:**
- Modify: `src/lib/react/useYouAreHere.ts` (substantial rewrite of the body; interfaces below)
- Modify: `packages/create-rovebeacon/templates/react/src/YouAreHereMarker.tsx`
- Test: `src/lib/react/useYouAreHere.test.ts`

**Interfaces:**
- Produces: `UseYouAreHereResult` unchanged except `marker: ThreeUserMarker | null` and `error: RoveError | null` (Task 15 applies the same error type to `useLocation`).
- Consumes: `ThreeUserMarker.getOrientation()` from Task 5.

- [ ] **Step 1: Write the failing StrictMode test**

Append to `src/lib/react/useYouAreHere.test.ts` (reusing its existing `MockLocationSource`):

```tsx
import { StrictMode } from 'react';

describe('StrictMode safety', () => {
  it('disposes every marker it creates across StrictMode double-mount', async () => {
    const disposeSpy = vi.spyOn(ThreeUserMarker.prototype, 'dispose');
    const source = new MockLocationSource();

    const { result, unmount } = renderHook(
      () => useYouAreHere({ center: [0, 0], locationSource: source }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.marker).not.toBeNull());
    unmount();

    // Every construction must be paired with a dispose. The old useMemo
    // version leaked the marker from StrictMode's discarded first render.
    expect(disposeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    disposeSpy.mockRestore();
  });

  it('does not dispose an injected locationSource on unmount', () => {
    const source = new MockLocationSource();
    const disposeSpy = vi.spyOn(source, 'dispose');
    const { unmount } = renderHook(() => useYouAreHere({ center: [0, 0], locationSource: source }));
    unmount();
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('calls the LATEST onUpdate callback, not the mount-time one', async () => {
    const source = new MockLocationSource();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }) => useYouAreHere({ center: [0, 0], locationSource: source, onUpdate: cb }),
      { initialProps: { cb: first } }
    );
    await waitFor(() => expect(result.current.marker).not.toBeNull());

    rerender({ cb: second });
    source.emitUpdate({
      longitude: 0, latitude: 0, altitude: null, accuracy: 5,
      speed: null, heading: null, timestamp: Date.now(),
    });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
```

(If the existing `MockLocationSource` lacks `emitUpdate`, add it exactly as in Task 5's `OrientationMockSource`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/react/useYouAreHere.test.ts -t "StrictMode safety"`
Expected: FAIL — dispose count 1; injected source disposed; `first` (stale) called.

- [ ] **Step 3: Rewrite the hook body**

Interface changes in `useYouAreHere.ts`:
- `UseYouAreHereResult.marker: ThreeUserMarker | null;`
- `UseYouAreHereResult.error: RoveError | null;` and `UseYouAreHereOptions.onError?: (error: RoveError) => void;` (add `import type { RoveError } from '../errors';`)

Replace the implementation from the `// Refs for stable instances` comment (line 154) through the mount effect (line 250) with:

```ts
  // Refs for stable instances
  const providerRef = useRef<LocationSource | null>(null);
  const markerRef = useRef<ThreeUserMarker | null>(null);
  const projectionRef = useRef<MercatorProjection | null>(null);

  // Marker is created in the mount effect (never during render) so StrictMode's
  // discarded render can't leak GPU resources. Null until the effect runs.
  const [marker, setMarker] = useState<ThreeUserMarker | null>(null);

  // Always call the latest callbacks — consumers pass inline arrows every render.
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
  });

  // Keep the projection in sync with props
  useEffect(() => {
    projectionRef.current = new MercatorProjection(center, scale);
    markerRef.current?.setProjectionCenter(center, scale);
  }, [center[0], center[1], scale]);

  // Create marker + provider together; tear both down symmetrically.
  useEffect(() => {
    const m = new ThreeUserMarker(markerOptions);
    m.setProjectionCenter(center, scale);
    markerRef.current = m;
    setMarker(m);

    const ownsProvider = !locationSource;
    const provider = locationSource ?? new GeolocationProvider(geolocationOptions);
    providerRef.current = provider;
    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(provider.on('update', (loc) => {
      setLocation(loc);
      setError(null);

      const projection = projectionRef.current;
      if (projection) {
        const [x, y, z] = projection.lngLatToScene(
          loc.longitude,
          loc.latitude,
          loc.altitude ?? 0
        );
        setScenePosition([x, y, z]);

        if (m.getOrientation() === 'y-up') {
          m.setPosition(x, z, -y);
        } else {
          m.setPosition(x, y, z);
        }
        m.setAccuracy(loc.accuracy);
        m.setHeading(loc.heading, loc.speed);
      }

      onUpdateRef.current?.(loc);
    }));

    unsubscribers.push(provider.on('error', (err) => {
      const roveError = err as RoveError;
      setError(roveError);
      onErrorRef.current?.(roveError);
    }));

    unsubscribers.push(provider.on('permissionChange', (state) => {
      setPermission(state);
    }));

    if (enableCompass && provider instanceof GeolocationProvider) {
      unsubscribers.push(provider.on('deviceOrientation', (event) => {
        let heading: number | null = null;
        if ((event as any).webkitCompassHeading !== undefined) {
          heading = (event as any).webkitCompassHeading;
        } else if (event.alpha !== null) {
          heading = (360 - event.alpha) % 360;
        }
        m.setDeviceHeading(heading);
      }));
    }

    if (autoStart) {
      provider.start().then(() => {
        setIsTracking(true);
        if (enableCompass && provider instanceof GeolocationProvider) {
          provider.startDeviceOrientation();
        }
      }).catch((err) => {
        setError(err as RoveError);
        onErrorRef.current?.(err as RoveError);
      });
    }

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (ownsProvider) {
        provider.stop();
        provider.dispose();
      }
      providerRef.current = null;

      m.dispose();
      markerRef.current = null;
      setMarker(null);
    };
    // Intentionally mount-only: option changes require a remount (documented);
    // callbacks flow through refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSource]);
```

Then:
- Delete the old `useMemo` marker block (lines 158–164), the old separate projection effect (167–169), and the old "Cleanup marker on unmount" effect (263–268).
- Change the confidence-poll effect to guard null: `if (!marker) return;` as its first line, keep `[marker]` deps.
- Change the `update` callback to use the ref:

```ts
  const update = useCallback(
    (deltaTime: number, camera?: THREE.Camera, target?: THREE.Vector3) => {
      markerRef.current?.update(deltaTime, camera, target);
    },
    []
  );
```

- In `start`, replace `onError?.(err as Error)` with `onErrorRef.current?.(err as RoveError)` and `setError(err as Error)` with `setError(err as RoveError)`; update the `error` state declaration to `useState<RoveError | null>(null)`.
- `stop` gains ownership awareness:

```ts
  const stop = useCallback(() => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.stop();
    if (provider instanceof GeolocationProvider) {
      provider.stopDeviceOrientation();
    }
    setIsTracking(false);
  }, []);
```

(`stop()` on an injected source is fine — stop is a caller-visible action, unlike unmount cleanup.)

- [ ] **Step 4: Update the scaffolding template**

In `packages/create-rovebeacon/templates/react/src/YouAreHereMarker.tsx`, the component must handle the nullable marker: wrap the `<primitive>` render as

```tsx
  if (!marker) return null;
  return <primitive object={marker} />;
```

(Adapt to the file's actual structure — read it first; only the null-guard is the required change.)

- [ ] **Step 5: Run the full react suite**

Run: `npx vitest run src/lib/react`
Expected: PASS. Existing tests asserting `result.current.marker` synchronously must be updated to `await waitFor(...)` for the non-null marker first.

- [ ] **Step 6: Commit**

```bash
git add src/lib/react/useYouAreHere.ts src/lib/react/useYouAreHere.test.ts packages/create-rovebeacon/templates/react/src/YouAreHereMarker.tsx
git commit -m "fix!: StrictMode-safe marker lifecycle, live callbacks, and source ownership in useYouAreHere"
```

---

### Task 15: useLocation ownership + RoveError typing

**Files:**
- Modify: `src/lib/react/useLocation.ts`
- Test: `src/lib/react/useLocation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('does not dispose an injected locationSource on unmount', () => {
  const source = new MockLocationSource();
  const disposeSpy = vi.spyOn(source, 'dispose');
  const { unmount } = renderHook(() => useLocation({ locationSource: source }));
  unmount();
  expect(disposeSpy).not.toHaveBeenCalled();
});
```

Run: `npx vitest run src/lib/react/useLocation.test.ts -t "injected locationSource"` → FAIL.

- [ ] **Step 2: Implement**

In `src/lib/react/useLocation.ts`:

(a) `import type { RoveError } from '../errors';`; change `UseLocationResult.error` to `RoveError | null`; change the state to `useState<RoveError | null>(null)`; change every `setError(err as Error)` to `setError(err as RoveError)`.

(b) In the mount effect (lines 99–154), collect unsubscribers and respect ownership — apply the same pattern as Task 14:

```ts
    const ownsProvider = !locationSource;
    const provider = locationSource ?? new GeolocationProvider(geolocationOptions);
    providerRef.current = provider;
    const unsubscribers: Array<() => void> = [];
```

Wrap each `provider.on(...)` in `unsubscribers.push(...)`, and replace the cleanup with:

```ts
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (ownsProvider) {
        provider.stop();
        provider.dispose();
      }
      providerRef.current = null;
    };
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/lib/react && npm run check` → PASS.

```bash
git add src/lib/react/useLocation.ts src/lib/react/useLocation.test.ts
git commit -m "fix!: useLocation respects injected-source ownership; error state typed as RoveError"
```

---

### Task 16: Svelte store — auto-teardown, compass heading, tracking state, tests

Fixes: no lifecycle teardown (GPS watch leaks if the consumer forgets `dispose()`), `requestPermissions` is vestigial (no orientation listener ever attached), invalid `'UNKNOWN'` error code, and the file has 0% test coverage.

**Files:**
- Modify: `src/lib/svelte/index.ts` (full replacement below)
- Create: `src/lib/svelte/index.test.ts`

**Interfaces:**
- Produces: `createLocationStore(options?)` returning `{ subscribe, start, stop, dispose, requestPermissions }` with state `{ location, error, permission, loading, isTracking, deviceHeading }`. (BREAKING: state gains `isTracking`/`deviceHeading`; import path becomes `rovemaps-you-are-here/svelte` per Task 2.)

- [ ] **Step 1: Write the failing tests** — create `src/lib/svelte/index.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { createLocationStore } from './index';
import { GeolocationProvider } from '../GeolocationProvider';
import { RoveErrorCode } from '../errors';

describe('createLocationStore', () => {
  beforeEach(() => {
    const watchPosition = vi.fn().mockImplementation((success: PositionCallback) => {
      success({
        coords: { longitude: 1, latitude: 2, accuracy: 5, altitude: null, speed: null,
                  heading: null, altitudeAccuracy: null, toJSON: () => ({}) },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition);
      return 1;
    });
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } });
  });

  it('can be created outside a Svelte component without throwing', () => {
    expect(() => createLocationStore()).not.toThrow();
  });

  it('tracks location, loading, and isTracking through start/stop', async () => {
    const store = createLocationStore();
    expect(get(store).isTracking).toBe(false);

    await store.start();
    const state = get(store);
    expect(state.location?.longitude).toBe(1);
    expect(state.isTracking).toBe(true);
    expect(state.loading).toBe(false);

    store.stop();
    expect(get(store).isTracking).toBe(false);
    store.dispose();
  });

  it('exposes deviceHeading from device orientation events', async () => {
    const store = createLocationStore();
    await store.start();
    // Reach the internal provider and fire a deviceOrientation event
    const provider = (store as any)._provider as GeolocationProvider;
    (provider as any).emit('deviceOrientation', { alpha: 90, beta: 0, gamma: 0 });
    expect(get(store).deviceHeading).toBe(270); // (360 - alpha) % 360
    store.dispose();
  });

  it('wraps unknown errors with a valid RoveErrorCode', async () => {
    const store = createLocationStore();
    await store.start();
    const provider = (store as any)._provider as GeolocationProvider;
    (provider as any).emit('error', new Error('boom'));
    expect(get(store).error?.code).toBe(RoveErrorCode.INTERNAL_ERROR);
    store.dispose();
  });
});
```

Run: `npx vitest run src/lib/svelte` → FAIL (no `isTracking`, no `deviceHeading`, no `_provider`, `'UNKNOWN'` code).

- [ ] **Step 2: Replace `src/lib/svelte/index.ts` entirely with:**

```ts
import { writable } from 'svelte/store';
import { onDestroy } from 'svelte';
import { GeolocationProvider } from '../GeolocationProvider';
import type { LocationData, PermissionState } from '../types';
import { RoveError, RoveErrorCode } from '../errors';

export interface LocationStoreState {
  location: LocationData | null;
  error: RoveError | null;
  permission: PermissionState;
  loading: boolean;
  isTracking: boolean;
  /** Compass heading in degrees (0 = north), null until an orientation event arrives */
  deviceHeading: number | null;
}

const INITIAL_STATE: LocationStoreState = {
  location: null,
  error: null,
  permission: 'prompt',
  loading: false,
  isTracking: false,
  deviceHeading: null,
};

/**
 * Svelte store wrapper for the RoveMaps GeolocationProvider.
 *
 * When created inside a Svelte component, resources are released automatically
 * on component destroy. When created outside component context (e.g. a plain
 * module), the caller owns cleanup and must call `dispose()`.
 */
export function createLocationStore(options: ConstructorParameters<typeof GeolocationProvider>[0] = {}) {
  const { subscribe, set, update } = writable<LocationStoreState>(INITIAL_STATE);
  let provider: GeolocationProvider | null = null;

  function ensureProvider(): GeolocationProvider {
    if (provider) return provider;
    provider = new GeolocationProvider(options);

    provider.on('update', (location) => {
      update((s) => ({ ...s, location, loading: false, error: null }));
    });

    provider.on('error', (err) => {
      const roveError = err instanceof RoveError
        ? err
        : new RoveError(RoveErrorCode.INTERNAL_ERROR, (err as Error).message ?? String(err));
      update((s) => ({ ...s, error: roveError, loading: false }));
    });

    provider.on('permissionChange', (permission) => {
      update((s) => ({ ...s, permission }));
    });

    provider.on('deviceOrientation', (event) => {
      let heading: number | null = null;
      if ((event as any).webkitCompassHeading !== undefined) {
        heading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = (360 - event.alpha) % 360;
      }
      update((s) => ({ ...s, deviceHeading: heading }));
    });

    return provider;
  }

  async function start() {
    update((s) => ({ ...s, loading: true, error: null }));
    const p = ensureProvider();

    try {
      await p.start();
      p.startDeviceOrientation();
      update((s) => ({ ...s, isTracking: true, loading: false }));
    } catch {
      // The 'error' listener above has already captured the failure state.
      update((s) => ({ ...s, loading: false }));
    }
  }

  function stop() {
    if (provider) {
      provider.stop();
      provider.stopDeviceOrientation();
      update((s) => ({ ...s, loading: false, isTracking: false }));
    }
  }

  function dispose() {
    if (provider) {
      provider.dispose();
      provider = null;
    }
    set(INITIAL_STATE);
  }

  // Auto-teardown when used inside a component; harmless no-op outside.
  try {
    onDestroy(dispose);
  } catch {
    // Created outside component context — caller owns dispose().
  }

  const store = {
    subscribe,
    start,
    stop,
    dispose,
    requestPermissions: () => ensureProvider().requestDeviceOrientationPermission(),
  };

  // Test-only escape hatch for reaching the internal provider.
  Object.defineProperty(store, '_provider', { get: () => provider, enumerable: false });

  return store;
}
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/lib/svelte && npm run check` → PASS.

```bash
git add src/lib/svelte/index.ts src/lib/svelte/index.test.ts
git commit -m "feat!: svelte store auto-teardown, compass heading, tracking state, valid error codes"
```

---

## Phase G — Consistency, Coverage, Docs

### Task 17: Logging discipline and error-API consistency

Fixes: raw `console.*` calls bypassing `productionMode` suppression, `Logger` ignoring `productionMode` entirely, and `RoveError.emit()`'s parameter order being the reverse of the constructor's.

**Files:**
- Modify: `src/utils/MercatorProjection.ts:91,133`, `src/lib/GeolocationProvider.ts:158`, `src/lib/logging/Logger.ts:86-91`, `src/lib/errors.ts:91-96` (+ call sites), `eslint.config.js`

- [ ] **Step 1: Route stray console calls through sdkWarn**

- `src/utils/MercatorProjection.ts` — add `import { sdkWarn } from '../lib/types';` and replace the `console.warn(...)` calls at lines 91 and 133 with `sdkWarn(...)` (same message arguments). First confirm no import cycle: `src/lib/types.ts` must not import from `src/utils/MercatorProjection.ts` (check its imports; if a cycle exists, move `sdkWarn`/`sdkDebug` into a new `src/lib/logging/sdkLog.ts` and re-export from types).
- `src/lib/GeolocationProvider.ts:158` — replace `console.error(...)` with `sdkWarn(...)` (the file already imports `sdkWarn`).

- [ ] **Step 2: Logger respects productionMode by default**

In `src/lib/logging/Logger.ts`, add `import { getSDKConfig } from '../types';` and change the constructor (line 90):

```ts
    this.silent = options.silent ?? getSDKConfig().productionMode;
```

Add a test to `src/lib/logging/Logger.test.ts`:

```ts
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
```

(Match `configureSDK`'s actual signature from `src/lib/types.ts` and the Logger method signature from existing tests in the file.)

- [ ] **Step 3: Align `RoveError.emit()` parameter order with the constructor**

In `src/lib/errors.ts` (lines 91–96), reorder emit's parameters to `(code, message, originalError?, context?)` — identical to the constructor (lines 53–58). Then find and fix every call site:

```bash
grep -rn "RoveError.emit(" src
```

For each hit, swap the 3rd/4th arguments to the new order (the old order was `context, originalError`). Run the type check — the compiler won't catch transposition (both are loosely typed), so verify each call site by eye.

- [ ] **Step 4: Enforce it going forward**

In `eslint.config.js`, add a scoped block after the react-hooks block:

```js
  {
    files: ['src/lib/**/*.ts', 'src/utils/**/*.ts'],
    ignores: ['src/lib/logging/**', '**/*.test.ts'],
    rules: {
      'no-console': 'error',
    },
  },
```

Run: `npm run lint` → 0 errors (any remaining console call in library code is either fixed or explicitly justified inline).

- [ ] **Step 5: Run and commit**

Run: `npm run check && npm run lint && npx vitest run` → PASS.

```bash
git add src/utils/MercatorProjection.ts src/lib/GeolocationProvider.ts src/lib/logging src/lib/errors.ts eslint.config.js
git commit -m "fix: unify logging through sdkWarn/productionMode; align RoveError.emit with constructor"
```

---

### Task 18: Coverage configuration and a real e2e assertion

Fixes: coverage counts type-only files as 0%, thresholds aren't enforced, and e2e tests assert only "a canvas exists" behind fixed 2-second sleeps.

**Files:**
- Modify: `vitest.config.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Coverage exclusions + thresholds**

In `vitest.config.ts`, inside the existing `test.coverage` block (merge with what's there — read the file first), ensure:

```ts
    coverage: {
      exclude: [
        'src/lib/sources.ts',        // interface-only, no executable code
        'src/main.ts',               // demo entry
        'src/App.svelte',
        'src/components/**',
        'src/example/**',
        'dist/**',
        'packages/**',
        '**/*.test.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 82,
        lines: 80,
      },
    },
```

(Thresholds are set at the current floor so coverage can only ratchet up. If the post-deletion numbers run higher, raise the thresholds to 2 points below actual.)

Run: `npx vitest run --coverage` → passes thresholds.

- [ ] **Step 2: Replace timing-based e2e waits with a location-verifying test**

In `tests/e2e/smoke.spec.ts`, add Playwright's built-in geolocation mocking and a marker-visibility assertion (merge with the file's existing start-interaction steps — if the demo needs a button click to begin tracking, reuse the exact steps the current spec performs):

```ts
test.use({
  geolocation: { latitude: 40.7128, longitude: -74.006 },
  permissions: ['geolocation'],
});

test('user marker appears after a mocked GPS fix', async ({ page }) => {
  await page.goto('/');
  // (reuse the existing spec's steps to start tracking here, if any)

  const marker = page.locator('.maplibre-user-marker');
  await expect(marker).toBeVisible({ timeout: 15000 });

  const box = await marker.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
});
```

Also replace every `page.waitForTimeout(2000)` in the file with a condition-based wait (`expect(locator).toBeVisible(...)` or `page.waitForSelector`), keeping what each wait was actually waiting for.

- [ ] **Step 3: Run e2e locally**

Run: `npx playwright test tests/e2e/smoke.spec.ts`
Expected: PASS. (If the demo app renders the Three.js view by default instead of MapLibre, target whichever marker the default view produces — the `.maplibre-user-marker` class exists only in the MapLibre view; switch the demo tab in the test first if needed, mirroring how `example.spec.ts` navigates.)

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/e2e/smoke.spec.ts
git commit -m "test: enforce coverage thresholds; e2e verifies marker renders from mocked GPS"
```

---

### Task 19: Docs, versions, and the v3.0.0 changelog

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `package.json` (version), `packages/create-rovebeacon/README.md`, `packages/create-rovebeacon/templates/*/package.json`

- [ ] **Step 1: Version bump**

In `package.json`: `"version": "3.0.0"`.

- [ ] **Step 2: README sweep**

- Replace the CDN/UMD section (the `@2.2.0` script-tag examples around lines 120–130) with an ESM example:

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js" } }
</script>
<script type="module">
  import { ThreeYouAreHereController } from 'https://cdn.jsdelivr.net/npm/rovemaps-you-are-here@3/dist/index.js';
</script>
```

- Update every React example to import from `rovemaps-you-are-here/react` and handle the nullable marker (`{marker && <primitive object={marker} />}`).
- Update every Svelte example to import from `rovemaps-you-are-here/svelte`.
- Remove any references to `FrameMonitor` / `AnimationManager` (grep the README).
- Standardize all GitHub URLs on `github.com/russellmiddleton33/RoveBeacon` (README badges already use it); fix `packages/create-rovebeacon/README.md` which currently points at `github.com/rovemaps/rovebeacon`.
- Add a "Migrating from 2.x" section listing the breaking changes (copy the CHANGELOG list from Step 4).

- [ ] **Step 3: Template versions**

In each `packages/create-rovebeacon/templates/*/package.json`, bump the `rovemaps-you-are-here` dependency to `^3.0.0`.

- [ ] **Step 4: CHANGELOG entry** — prepend to `CHANGELOG.md`:

```markdown
## 3.0.0 (2026-07-XX)

### Breaking Changes
- React hooks moved to `rovemaps-you-are-here/react`; Svelte store to `rovemaps-you-are-here/svelte`. They are no longer re-exported from the package root.
- UMD bundle removed. Use the ESM build from a CDN with `<script type="module">`.
- `useYouAreHere().marker` is now `ThreeUserMarker | null` (created after mount; StrictMode-safe).
- `error` in both React hooks and the Svelte store is typed `RoveError | null`.
- Controllers no longer dispose an injected `locationSource` — the caller owns injected sources.
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
- Svelte store auto-disposes with its component, exposes `isTracking`/`deviceHeading`, and emits valid error codes.

### Added
- ESLint (flat config) with CI enforcement; `no-console` in library code.
- `npm run verify:dist` gate: publish fails if framework code is ever bundled again.
- LICENSE file, repository metadata, coverage thresholds.
```

(Fill in the actual date.)

- [ ] **Step 5: Final full gate**

Run: `npm run check && npm run lint && npx vitest run --coverage && npm run build:lib && npm run verify:dist && npm run size && npm run build`
Expected: everything passes.

```bash
git add README.md CHANGELOG.md package.json packages/create-rovebeacon
git commit -m "docs: v3.0.0 changelog, migration guide, ESM CDN usage, version sweep"
```

---

## Deferred (separate plans — do NOT start here)

1. **Canvas marker unification.** `MapLibreUserMarker` and `MapBoxUserMarker` are ~85–90% line-for-line identical (~700 duplicated lines), and the controllers ~95%. Extract a shared `CanvasUserMarker` base + shared confidence/staleness module (which `ThreeUserMarker` can also consume). This is the single highest-leverage refactor left after this plan, but it reshapes the adapter layer and deserves its own brainstorm + plan. Estimated net: −600 to −700 lines.
2. **Adaptive quality v2** — only if product ever wants runtime quality adaptation again. Requirements learned from the deleted v1: rAF-gap rejection, hysteresis band between warn/recover thresholds, visibility awareness.
3. **Package naming** — `roveBeacon` repo vs `rovemaps-you-are-here` package vs `create-rovebeacon` CLI. A rename is an npm-ecosystem decision (deprecations, redirects); decide separately.

## Self-Review Notes

- Every audit finding maps to a task except: MapLibre canvas copy-paste artifacts (duplicate `ctx.arc`/`closePath` — cosmetic, swept up by the deferred unification), `normalizeLongitude` unbounded-loop nit and `hardwareConcurrency === 0` nit (accepted as debt; both are theoretical inputs), and `mapLibreModule: any` typing (kept deliberately — Task 12 note).
- Tasks 5/14 both touch `useYouAreHere.ts:193` — Task 5 makes the minimal gate fix; Task 14's rewrite already incorporates `m.getOrientation()`. Executed in order, no conflict.
- Tasks 7/8/10 all touch `ThreeUserMarker.ts` at disjoint line ranges; execute in order.
- Type consistency: `getOrientation(): 'y-up' | 'z-up'` (Task 5) is what Tasks 14 uses; `resetStalenessTimer(): void` (Task 11) matches the Three marker's existing method name; `mapBoxModule` naming matches `mapLibreModule` convention.
