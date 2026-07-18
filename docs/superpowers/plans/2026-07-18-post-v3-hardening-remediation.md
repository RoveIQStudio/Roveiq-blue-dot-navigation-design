# roveBeacon Post-v3 Hardening Remediation Plan

> **For implementation workers:** Execute this plan in order. Use an isolated branch/worktree per parallel lane. Keep each task reviewable and add a failing regression test before changing runtime behavior. Do not publish until the Release Certification phase is green.

**Goal:** Resolve every confirmed finding from the 2026-07-18 post-v3 audit, restore ordinary consumer workflows, make first-party examples/scaffolds executable, and raise the whole-repository score from 58/100 to at least 85/100.

**Recommended release:** `3.1.0` if the existing root exports remain compatible and renderer-specific subpaths are additive. Use `4.0.0` instead if implementation removes renderer exports from `.` or makes another breaking import/ownership change. **2026-07-18 update:** npm `latest` is still `2.5.0` — v3.0.0 was never published or tagged — so the remediated result may ship as `3.0.0` itself; reserve `4.0.0` for the breaking cases above.

**2026-07-18 second-review addendum:** A five-thread blind re-review independently confirmed this audit's major findings and added the items marked **[NEW 2026-07-18]** throughout, plus Tasks 23–26 (Phase A2). Status: the vulnerability portion of Task 2 is COMPLETE and the lockfile-version portion of Task 1 is COMPLETE (see task notes). The second review also *cleared* several suspicions: canvas accuracy-ring Mercator math is correct, no map-library code is inlined in any bundle, coverage excludes/thresholds are legitimate, `sideEffects: false` is safe, and publish CI provenance is sound — do not spend remediation effort there.

**Architecture direction:** Keep behavior fixes small and regression-tested first. Then expose dependency-isolated `./core`, `./three`, `./maplibre`, and `./mapbox` entries while preserving the current root during 3.x. Unify duplicated MapLibre/MapBox behavior only after both adapters have parity tests. Treat the demo, examples, CDN examples, and every CLI template as first-party product code.

**Runtime floor:** Node `^20.19.0 || >=22.12.0`, npm, TypeScript 5.9, Vite 7, Vitest 4, Playwright.

---

## Global constraints and gates

- Preserve compatibility unless a task explicitly declares a breaking change.
- No publication from a tag until the Release Certification phase passes.
- Use test-first fixes for every confirmed defect.
- No tracked generated `dist/`, coverage, scaffold output, or Playwright artifacts.
- Use a unique E2E port; never trust an unrelated process on `5173`.
- Before each task handoff, run its focused test plus:

```bash
PATH=/opt/homebrew/bin:$PATH npm run check
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npm run test -- --run
```

- Before each phase handoff, additionally run:

```bash
PATH=/opt/homebrew/bin:$PATH npm run test -- --coverage --run
PATH=/opt/homebrew/bin:$PATH npm run build:lib
PATH=/opt/homebrew/bin:$PATH npm run verify:dist
PATH=/opt/homebrew/bin:$PATH npm run size
PATH=/opt/homebrew/bin:$PATH npm run build
```

- Commit by bounded task. Suggested prefixes: `fix:`, `feat:`, `test:`, `docs:`, `chore:`.
- Do not combine dependency upgrades, lifecycle changes, and adapter refactors in one commit.
- **No accretion:** any task that replaces a behavior, API, or code path deletes the superseded one in the same PR. Deprecate-then-remove is acceptable only for *public* API with a documented timeline; internal code is removed immediately. Task 27 sweeps whatever slips through.

## Completion targets

The remediation is complete only when all of these are true:

- [ ] Disabled smoothing applies every new position and heading immediately.
- [ ] Cross-antimeridian projection places nearby points nearby for centers at ±180°.
- [ ] A configured `onError` hook receives every SDK-origin error exactly once.
- [ ] The newest GPS fix is always eventually applied (trailing throttle flush).
- [ ] MapLibre and MapBox markers survive add/remove/re-add and controller stop/restart.
- [ ] `stop()` and teardown cancel pending provider/controller/framework startup.
- [ ] No listener, timer, RAF, watch, or orientation callback can be attached after disposal.
- [ ] Vanilla, React, and Svelte scaffolds are generated, installed against the packed local SDK, typechecked, and built in CI.
- [ ] Demo and standalone examples build against the packed local SDK.
- [ ] MapLibre/MapBox ESM usage requires no `window.*` mutation.
- [ ] Every quality setting either changes measurable renderer output or is removed from the public API.
- [ ] Library tarball contains only approved runtime bundles, declarations, maps, README, and LICENSE.
- [ ] Package, lockfile, tag, and changelog versions agree.
- [ ] Production audit is clean; critical/high development audit findings are zero or formally documented with expiry.
- [ ] Node 20.19 and Node 22 CI lanes pass.
- [ ] Chromium and WebKit lifecycle E2E lanes pass on isolated ports.
- [ ] Lint warning count is zero for runtime, adapters, examples, and scaffolds.
- [ ] Knip (or equivalent) reports zero unused files, exports, and dependencies, and the check runs in CI.
- [ ] Accessibility checks cover the demo control/status surface.
- [ ] Repository remains clean after the full verification matrix.

---

# Phase 0 — Baseline, versions, and dependency safety

## Task 1: Establish a reproducible baseline and repair release metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CONTRIBUTING.md`
- Create: `scripts/verify-version.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`

**Findings covered:** undeclared Node floor; lockfile still identifying v2.5.0; missing tag/manifest/lockfile/changelog consistency gate.

*2026-07-18 update: the lockfile now reports `3.0.0` (rewritten during the Task 2 audit fix). The remaining items below are still open.*

- [ ] Add `engines.node` with `^20.19.0 || >=22.12.0` and document the same floor.
- [ ] Regenerate the root lockfile under a supported Node/npm pair; verify both root version fields equal `package.json`.
- [ ] Add `scripts/verify-version.mjs` to compare `package.json`, root lockfile metadata, latest changelog heading, and optional `GITHUB_REF_NAME` tag.
- [ ] Add `verify:version` to root scripts and both CI/publish workflows.
- [ ] Add a Node 20.19 and Node 22 CI matrix. Keep one lockfile and use `npm ci` in both.
- [ ] Capture baseline bundle sizes, coverage, pack file list, and audit counts in the PR description—not as durable generated files.

**Verification:**

```bash
npm run verify:version
npm ci
npm run check
```

**Acceptance:** Node 20.11 is rejected clearly by npm; supported versions install and check successfully; all version sources agree.

---

## Task 2: Refresh vulnerable development dependencies without mixing behavior changes

**Files:**
- Modify: `package.json` only if ranges must change
- Modify: `package-lock.json`

**Findings covered:** 22 development-tool vulnerabilities; stale patch versions; dependency-health score.

*2026-07-18 update: vulnerability portion COMPLETE — `npm audit fix` resolved all 22 in-range (`npm audit` now reports 0), re-verified green via check, test (517/517), build:lib, and verify:dist. Still open: Dependabot/Renovate configuration and the scheduled audit workflow.*

- [ ] Save machine-readable before/after `npm audit --json` output outside the repository.
- [ ] Update lockfile-resolved Vitest, coverage, Vite, Svelte, and transitive tooling to patched compatible versions first.
- [ ] If critical/high findings require a major upgrade, isolate each major in its own commit and run the full matrix.
- [ ] Add Dependabot or Renovate configuration for monthly grouped development-tool updates.
- [ ] Add a scheduled full audit workflow. Keep `npm audit --omit=dev` as a publish blocker; define an explicit temporary allowlist process for unavoidable dev-only advisories.

**Verification:**

```bash
npm audit --omit=dev
npm audit
npm run check
npm run lint
npm run test -- --coverage --run
npm run build:lib && npm run verify:dist && npm run size
npm run build
```

**Acceptance:** production vulnerabilities remain zero; critical/high development findings are zero unless a reviewed, time-bounded exception is documented.

---

# Phase A — Correctness and lifecycle release blockers

## Task 3: Fix disabled-smoothing position and heading updates

**Files:**
- Modify: `src/lib/maplibre/MapLibreUserMarker.ts`
- Modify: `src/lib/mapbox/MapBoxUserMarker.ts`
- Modify: `src/lib/three/ThreeUserMarker.ts`
- Test: corresponding `*.test.ts` files
- Test: `src/lib/performance/QualityPresets.test.ts` or nearest quality test

**Findings covered:** marker freezes when `smoothPosition`/`smoothHeading` is false; low preset freezes after first fix. **[NEW 2026-07-18]:** heading is frozen with `smoothHeading: false` in ALL three renderers, Three included — `ThreeUserMarker.ts:600` has a no-smoothing snap branch for position (`:445-447`) but not heading; canvas `setLngLat()` never sets `isDirty`, so a first fix may not render when `pulseSpeed: 0` and no accuracy is set (`MapLibreUserMarker.ts:367-379`).

- [ ] Add failing tests that apply two distinct positions with `smoothPosition: false` and assert the second reaches the native marker immediately.
- [ ] Add failing tests that apply two headings with `smoothHeading: false` and assert the rendered heading changes immediately.
- [ ] Repeat both tests through `qualityPreset: 'low'` so public preset integration is covered.
- [ ] In setters or the animation path, immediately copy target state into current/rendered state when smoothing is disabled.
- [ ] Preserve interpolated behavior when smoothing is enabled.
- [ ] **[NEW]** Extend the no-smoothing snap path to heading in `ThreeUserMarker` too: when `smoothHeading` is false, copy the target heading into current state on every `setHeading` (mirror the position `else` branch at `:445-447`).
- [ ] **[NEW]** Make canvas `setLngLat()` set `isDirty = true`; add a test that a first fix with `pulseSpeed: 0` and no `setAccuracy` call still draws the dot.

**Verification:**

```bash
npx vitest run src/lib/maplibre/MapLibreUserMarker.test.ts src/lib/mapbox/MapBoxUserMarker.test.ts src/lib/three/ThreeUserMarker.test.ts
```

**Acceptance:** at least two sequential fixes/headings work under low and explicit no-smoothing configurations for both map adapters.

---

## Task 4: Make map marker attachment transactional and restart-safe

**Files:**
- Modify: `src/lib/maplibre/MapLibreUserMarker.ts`
- Modify: `src/lib/mapbox/MapBoxUserMarker.ts`
- Modify if needed: both map controllers
- Test: marker and controller tests for both adapters

**Findings covered:** remove/re-add leaves marker detached; controller stop/restart invisibility; failed/repeated `addTo()` leaks zoom listeners.

- [ ] Add marker tests for `addTo → setLngLat → remove → addTo` and assert the newly created native marker is positioned and attached.
- [ ] Add controller tests for `start → stop → start` with an existing location.
- [ ] Add failure tests where module resolution/native marker construction throws and assert map/listener state is rolled back.
- [ ] Add repeated/switch-map `addTo()` tests and assert exactly one zoom listener remains.
- [ ] Resolve/validate the injected map module before committing `this.map` or subscribing.
- [ ] On re-add with existing coordinates, synchronously position and attach the native marker.
- [ ] Make `addTo()` either idempotent or explicitly remove prior attachment before switching maps.

**Verification:**

```bash
npx vitest run src/lib/maplibre src/lib/mapbox
```

**Acceptance:** no lost marker and no extra map listener across failure, retry, restart, repeated add, and map switch paths.

---

## Task 5: Introduce cancellable provider/controller lifecycle state

**Files:**
- Modify: `src/lib/GeolocationProvider.ts`
- Modify: all three `*YouAreHereController.ts` files
- Modify: `src/lib/sources.ts` only if cancellation is added to the source contract
- Test: provider/controller tests

**Findings covered:** `stop()` cannot cancel pending start; startup timers/watch state survive some stop/dispose/throw paths. **[NEW 2026-07-18]:** `stop()` leaves an active mock path running and `isWatching()` truthy via `isMocking` (`GeolocationProvider.ts:592-601`, `:656`); `resume()` emits before re-creating the watch, so a listener that synchronously calls `dispose()`/`stop()` leaks a fresh un-clearable watch (`:120-131`); successful `getCurrentPosition()` never sets permission state to `granted` or increments `updateCount`, unlike the watch path (`:621-634`).

**Required state model:** `idle | starting | active | stopping | disposed`, or an equivalent generation-token design with externally equivalent behavior.

- [ ] Add deferred-source tests: call `start()`, then `stop()` before resolution, resolve the source, and assert the controller stays inactive.
- [ ] Repeat with `dispose()` and with a rejecting/throwing source.
- [ ] Add provider tests for synchronous `watchPosition()` throw, timeout, stop-before-fix, dispose-before-fix, and successful retry.
- [ ] Store startup timer/watch/generation state on the instance so every exit can clear it deterministically.
- [ ] Make `stop()` invalidate an in-progress generation and stop owned provider work even before active state is reached.
- [ ] After every `await`, verify that the generation is still current and the instance is not stopped/disposed.
- [ ] Normalize cancellation behavior: resolve harmlessly or reject with one documented cancellation `RoveError`; use the same policy across controllers and hooks.
- [ ] **[NEW]** Make `stop()` also stop mock paths and clear `isMocking`; test that `startMockPath → stop()` halts interval emissions and `isWatching()` returns false.
- [ ] **[NEW]** Re-check stopped/disposed state after every internal `emit()` before mutating watch state (fixes the `resume()` re-entrancy leak); test with a `resume` listener that disposes synchronously and assert no watch survives.
- [ ] **[NEW]** Align `getCurrentPosition()` success with the watch path: set permission `granted` (and define `updateCount` behavior); test that `getPermissionState()` reports `granted` after a successful one-shot fix.

**Verification:**

```bash
npx vitest run src/lib/GeolocationProvider.test.ts src/lib/three/ThreeYouAreHereController.test.ts src/lib/maplibre/MapLibreYouAreHereController.test.ts src/lib/mapbox/MapBoxYouAreHereController.test.ts
```

**Acceptance:** no late transition to active, no orphan timeout/watch, and retry works after cancellation or failure.

---

## Task 6: Guard React/Svelte async continuations and disposed orientation startup

**Files:**
- Modify: `src/lib/react/useLocation.ts`
- Modify: `src/lib/react/useYouAreHere.ts`
- Modify: `src/lib/svelte/index.ts`
- Modify: `src/lib/GeolocationProvider.ts`
- Test: React/Svelte/provider tests

**Findings covered:** framework teardown can attach orientation listeners or update state after disposal. **[NEW 2026-07-18]:** `start()`/`autoStart` catch paths store and callback raw errors with a bare `as RoveError` cast, breaking the "always a RoveError" contract the event listeners enforce (`useLocation.ts:156,187`, `useYouAreHere.ts:266,314-315`); the wrap helpers dereference `.message` before `??` and throw on a null/undefined payload (`useLocation.ts:122`, `useYouAreHere.ts:237`, `svelte/index.ts:48`); the Svelte store has no compass opt-out (always attaches `deviceorientation`) and ships a `_provider` test escape hatch (`svelte/index.ts:75,115`).

- [ ] Add tests with a deferred `locationSource.start()`; unmount/unsubscribe before it resolves.
- [ ] Assert no later orientation listener, state write, tracking flag, or user callback.
- [ ] Use per-mount generation/cancel guards around every async continuation.
- [ ] Make `startDeviceOrientation()` reject or no-op after provider disposal; document the contract.
- [ ] Keep ownership semantics intact: injected sources are still caller-owned and must not be stopped/disposed by adapters.
- [ ] **[NEW]** Route every `start()`/`autoStart` rejection through the same RoveError wrap helper the `error` event listeners use; test with an injected source rejecting a plain `Error` and assert `error.code` is defined in both state and `onError`.
- [ ] **[NEW]** Guard wrap helpers with `err?.message` so a null/undefined payload cannot throw inside a handler.
- [ ] **[NEW]** Add an `enableCompass`-style opt-out to the Svelte store (parity with the React hooks) and gate or strip the `_provider` escape hatch from production builds.

**Acceptance:** resolving any pending start after teardown has zero externally observable effect and adds no global listener; every error surfaced through framework state or callbacks is a `RoveError`.

---

## Task 7: Align React altitude behavior with controller ground-marker behavior

**Files:**
- Modify: `src/lib/react/useYouAreHere.ts`
- Test: `src/lib/react/useYouAreHere.test.ts`
- Test/reference: `src/lib/three/ThreeYouAreHereController.test.ts`
- Document: README API behavior

**Findings covered:** React passes GPS altitude while controller intentionally grounds the marker.

- [ ] Add exact-coordinate tests for altitude `50` in both `y-up` and `z-up` modes.
- [ ] Decide and document one policy. Recommended: user-location marker ignores noisy GPS altitude by default.
- [ ] If altitude support is desired, add an explicit option such as `useAltitude` with a safe default instead of adapter drift.
- [ ] Make hook and controller use the same conversion helper/policy.

**Acceptance:** identical location/options produce identical scene coordinates through hook and controller.

---

## Task 8: Close remaining async resource races

**Files:**
- Modify: `src/lib/performance/BatteryManager.ts`
- Modify: `src/lib/logging/Logger.ts`
- Test: corresponding tests

**Findings covered:** battery listeners can attach after disposal; logger callbacks can throw through SDK operations. **[NEW 2026-07-18]:** the initial battery state transition only reaches the constructor callback — subscribers added via `onStateChange()` after async init miss it, and `unavailable` is never emitted at all (`BatteryManager.ts:116-142`, `176-179`); the test comment at `BatteryManager.test.ts:142` ("should not fire callback") is factually wrong — it fires `normal`.

- [ ] Add a deferred `getBattery()` test, dispose before resolution, then assert no listener is attached and no battery is retained.
- [ ] Recheck `isDisposed` immediately after the battery await.
- [ ] Validate battery threshold ordering/range while touching this surface.
- [ ] Add logger tests where `onLog` and console sinks throw; SDK callers must not fail because telemetry failed.
- [ ] Isolate sink errors without recursively logging them.
- [ ] **[NEW]** Emit the current state (including `unavailable`) to late `onStateChange` subscribers, or document `getState()` as the required initial read; fix the misleading test comment at `BatteryManager.test.ts:142`.

**Acceptance:** no post-dispose battery state, logging/telemetry is failure-contained, and a callback-only consumer can always learn the current battery state.

---

# Phase A2 — Additional correctness findings (2026-07-18 second review)

*These four tasks are runtime-correctness work discovered by the blind re-review. They merge with the Phase A wave, not after certification. Numbered 23–26 to avoid renumbering existing task references.*

## Task 23: Wrap antimeridian deltas in `lngLatToScene`

**Files:**
- Modify: `src/utils/MercatorProjection.ts`
- Test: `src/utils/MercatorProjection.test.ts`

**Findings covered:** **[NEW]** the forward projection normalizes input and center longitude independently and subtracts with no antimeridian wrap (`MercatorProjection.ts:105`), so a center near ±180° places cross-line points ~a full world-width away (center `[179,0]`, point `[-179,0]` → `x≈-509` instead of `≈+2.8` at scale 1). The existing "handles antimeridian longitudes" test only uses center `[0,0]`, which is symmetric and hides this.

- [ ] Add failing tests with center `[179, 0]`: `lngLatToScene(-179, 0)` must land ~+2.8 scene units east at scale 1; mirror for center `[-179, 0]` with point `[179, 0]` landing west; keep the existing `[0,0]` cases.
- [ ] Wrap the Mercator-X delta to the nearest half-world before scaling:

```ts
let deltaX = mercX - this.centerX;
if (deltaX > 0.5) deltaX -= 1;
else if (deltaX < -0.5) deltaX += 1;
```

- [ ] Add a cross-antimeridian round-trip test (`lngLatToScene` → `sceneToLngLat`) exact to 5 decimals, and verify `sceneToLngLat` output normalization is consistent with the wrapped forward path.

**Verification:**

```bash
npx vitest run src/utils/MercatorProjection.test.ts
```

**Acceptance:** for centers at ±180°, nearby geographic points project to nearby scene coordinates and round trips are exact to 5 decimals; behavior at center `[0,0]` is unchanged.

---

## Task 24: Make the `onError` telemetry hook fire for the SDK's own errors

**Files:**
- Modify: `src/lib/errors.ts`
- Modify: `src/lib/GeolocationProvider.ts`
- Test: `src/lib/errors.test.ts`, `src/lib/GeolocationProvider.test.ts`

**Findings covered:** **[NEW]** `RoveError.emit` gates on `config.onError && context` (`errors.ts:95`), but every provider error site constructs `new RoveError(code, message, originalError)` with no context and most never call `emit` at all (`GeolocationProvider.ts:368, :378/408, :443, :482, :558-579, :641`). Net: the documented Sentry/Datadog integration (`types.ts:36-52`) receives nothing from the SDK's real error paths.

- [ ] Add a failing test: `configureSDK({ onError: spy })`, drive a permission-denied path through the provider, assert the spy receives the `RoveError` exactly once.
- [ ] Make `context` optional in the emit gate (`if (config.onError)`), and route every provider error site through the emit path — either emit at a single choke point where provider errors are raised, or add explicit `emit` calls with a context string per site. One policy, applied consistently.
- [ ] Add tests for the timeout and watch-failure paths as well; assert exactly-once delivery per error.
- [ ] Ensure a throwing `onError` hook cannot propagate into SDK operations (coordinate with Task 8's sink isolation — same containment policy).

**Verification:**

```bash
npx vitest run src/lib/errors.test.ts src/lib/GeolocationProvider.test.ts
```

**Acceptance:** every provider error path reaches a configured `onError` exactly once with a defined `code`, and a throwing hook is contained.

---

## Task 25: Add a trailing-edge flush to update throttling

**Files:**
- Modify: `src/lib/GeolocationProvider.ts`
- Test: `src/lib/GeolocationProvider.test.ts`

**Findings covered:** **[NEW]** the update throttle is leading-edge only — throttled fixes are discarded, not deferred (`GeolocationProvider.ts:527-529`) — so `getLastLocation()` and the rendered marker can lag the true latest fix by a full `minUpdateInterval`, and the final (often most accurate) fix after a burst is dropped forever. Worst with low `maxUpdateRate` (e.g. `0.5` → 2000 ms windows).

- [ ] Add a failing test with fake timers: two rapid fixes inside one throttle window → after the window elapses, the second fix is emitted and `getLastLocation()` returns it.
- [ ] Buffer the most recent throttled position and schedule exactly one trailing emit at window end; a newer fix inside the window replaces the buffer, never queues.
- [ ] Clear the trailing timer on `stop()`/`dispose()` (integrate with Task 5's generation state); test that stop-before-flush produces no timer and no late emit.
- [ ] Test that an on-schedule fix stream (slower than the window) emits exactly once per fix — no duplicates from the flush path.

**Verification:**

```bash
npx vitest run src/lib/GeolocationProvider.test.ts
```

**Acceptance:** the newest fix is always eventually emitted exactly once, and no timer or emit survives stop/dispose.

---

## Task 26: Keep the Three.js direction cone hidden during degraded confidence

**Files:**
- Modify: `src/lib/three/ThreeUserMarker.ts`
- Test: `src/lib/three/ThreeUserMarker.test.ts`

**Findings covered:** **[NEW]** `applyConfidenceState` hides the cone for `low`/`lost` (`ThreeUserMarker.ts:1069`), but `setHeading` unconditionally sets `coneGroup.visible = this.options.showDirectionCone` (`:552`); since the controller calls `setHeading` on every GPS update, the cone flicks back on the next ~1 Hz fix — exactly when it should stay suppressed. The canvas markers gate correctly at render time (`MapLibreUserMarker.ts:755`, `MapBoxUserMarker.ts:692`); this is Three-only drift.

- [ ] Add a failing test: drive confidence to `low`, call `setHeading(90)`, assert `coneGroup.visible === false`.
- [ ] Gate cone visibility in `setHeading` on the current confidence state, mirroring the canvas markers' `showCone` logic; keep `showDirectionCone` as the outer switch.
- [ ] Test the full cycle: `high` (visible) → degrade to `low` (hidden) → `setHeading` (still hidden) → recover to `high` (visible again).

**Verification:**

```bash
npx vitest run src/lib/three/ThreeUserMarker.test.ts
```

**Acceptance:** cone visibility always matches confidence state regardless of heading updates; parity with the canvas markers.

---

# Phase B — Demo, privacy, browser behavior, and accessibility

## Task 9: Make `Map.svelte` teardown complete and asynchronous initialization safe

**Files:**
- Modify: `src/components/Map.svelte`
- Test: focused component/lifecycle test or instrumentation-backed E2E

**Findings covered:** leaked animation loops, resize/DPR listeners, simulations, tiles, and late initialization.

- [ ] Inventory every RAF, timer, event listener, media-query listener, simulation, controller, control, geometry/material/texture, renderer, and tile resource created by the component.
- [ ] Store RAF IDs and stable listener callbacks.
- [ ] Add a mounted/generation guard around asynchronous initialization.
- [ ] On destroy: cancel RAFs, remove listeners, stop simulations, clear tiles, dispose controller/controls/renderer and owned scene resources.
- [ ] Add a repeated Three → MapLibre → Three tab-switch test that asserts RAF/listener/watch counts return to baseline.

**Acceptance:** ten mount/unmount cycles leave one active loop while mounted and zero component-owned resources after final teardown.

---

## Task 10: Put location and orientation access behind explicit user intent

**Files:**
- Modify: `src/components/Map.svelte`
- Modify: `src/components/MapLibreMap.svelte`
- Modify: `src/components/MapBoxMap.svelte`
- Modify: demo copy/privacy documentation
- Test: E2E permission flow

**Findings covered:** location prompt occurs before “Enable Location”; third-party viewport/tile disclosure is implicit.

- [ ] Do not call controller/provider start during component initialization or map load.
- [ ] Make one explicit action explain and initiate location permission; make compass/orientation permission separately understandable where platform rules require it.
- [ ] Do not auto-follow/fly until the user enables tracking/following.
- [ ] Document that Mapbox/OSM/style/tile providers can infer approximate viewport location.
- [ ] Add a no-third-party/offline configuration note for privacy-sensitive consumers.
- [ ] E2E assert no geolocation request before the action and exactly one request after it.

**Acceptance:** initial demo load performs no precise-location request and copy accurately describes data flow.

---

## Task 11: Implement accessible status, tabs, controls, and reduced motion

**Files:**
- Modify: `src/App.svelte`
- Modify: `src/components/InfoBar.svelte`
- Modify: `src/components/DebugControls.svelte`
- Modify: MapLibre/MapBox demo components
- Modify: React/Svelte template status panels
- Modify: marker animation preference handling
- Add: accessibility test dependency/config only if needed

**Findings covered:** missing tab semantics; icon button name/state; unannounced status/errors; color-only state; no reduced-motion handling.

- [ ] Implement the WAI-ARIA tabs pattern (`tablist`, `tab`, `aria-selected`, `tabpanel`, roving focus/arrow keys) or intentionally use a labeled pressed-button group.
- [ ] Give the debug button a stable accessible name, `aria-expanded`, and `aria-controls`.
- [ ] Use polite status regions for tracking/permission state and alert semantics for errors; do not announce every GPS tick.
- [ ] Add text/icon distinctions so alert state is not color-only.
- [ ] Respect `prefers-reduced-motion` in Three, MapLibre, MapBox, and demo transitions; do not force fast alert pulses under reduced motion.
- [ ] Add automated axe or equivalent checks for the bounded demo surface and keyboard E2E for tabs.

**Acceptance:** automated scan has no serious/critical violations; tabs are keyboard-operable; reduced-motion users receive non-animated cues.

---

## Task 12: Fix browser/input edge cases and validate all public numeric options

**Files:**
- Modify: `src/components/InfoBar.svelte`
- Modify: `src/lib/GeolocationProvider.ts`
- Modify: marker constructors/setters
- Modify: `src/utils/validation.ts`
- Test: affected components/classes

**Findings covered:** zero coordinates treated as absent; invalid update rates/timeouts/coordinates/sizes/scales/colors accepted. **[NEW 2026-07-18]:** `maxUpdateRate: 0` produces an `Infinity` throttle window that silently freezes every update after the first, and `NaN` disables throttling entirely (`GeolocationProvider.ts:514-529`); `normalizeLongitude`'s while-loops are O(magnitude) and can hang on extreme inputs like `1e12` (`MercatorProjection.ts:18-22`); raw `position.coords` values enter `LocationData` unvalidated — `NaN`/`Infinity` propagates into `update` events and `getLastLocation()` (`GeolocationProvider.ts:535-543`, `:623-631`) while `isValidLatitude`/`isValidLongitude` sit unused in `validation.ts`.

- [ ] Replace coordinate truthiness checks with explicit null checks; test latitude `0`, longitude `0`, and both `0`.
- [ ] Centralize constructor validation for timeout, maximumAge, positive/bounded update rate, smoothing/opacity ranges, dimensions/scales, colors, and WGS84 coordinates.
- [ ] Choose consistent invalid-input behavior: constructor/configuration errors throw typed `RoveError`; high-frequency setter errors reject safely without corrupting state.
- [ ] Test zero, negative, NaN, Infinity, out-of-range coordinates, and extreme resource sizes.
- [ ] **[NEW]** Define and enforce `maxUpdateRate` semantics: reject non-finite or non-positive values with a typed `RoveError` at construction (test 0, negative, NaN, Infinity explicitly — each currently produces a distinct silent failure mode).
- [ ] **[NEW]** Replace the while-loop longitude normalization with O(1) modulo arithmetic; test with `±1e12` completing instantly.
- [ ] **[NEW]** Validate incoming platform coordinates with the existing `isValidLatitude`/`isValidLongitude` before emitting; choose and document a drop-vs-error policy for malformed fixes and test NaN/Infinity injections through a mock position.

**Acceptance:** malformed options cannot starve updates, trigger invalid canvas sizes, or reach native map APIs in corrupt form; malformed platform fixes cannot pollute `LocationData`.

---

# Phase C — Performance contract and maintainability

## Task 13: Make adaptive quality settings real and measurable

**Files:**
- Modify: `src/lib/performance/QualityPresets.ts`
- Modify: `src/lib/performance/QualityManager.ts`
- Modify: all marker renderers
- Test: quality and marker tests
- Modify: `docs/PERFORMANCE.md`

**Findings covered:** `ringSegments`, `circleSegments`, `coneLayers`, and preset `pulseSpeed` are ignored. **[NEW 2026-07-18]:** `redetect()` is a dead API — `detectOptimalQuality` only reads signals that cannot change mid-session (`hardwareConcurrency`, `deviceMemory`, `userAgent`, screen size), so its documented "power mode changed" trigger is impossible and `onQualityChange` never fires from it (`QualityManager.ts:181-190`, `:57-93`); its test passes only by swapping the entire `navigator` stub (`QualityManager.test.ts:164-207`).

- [ ] For each `QualitySettings` property, define the exact renderer effect and whether it is construction-time or runtime mutable.
- [ ] Thread segment/layer counts into Three geometry creation and MapLibre/MapBox canvas cone/ring rendering.
- [ ] Use resolved preset `pulseSpeed`; preserve explicit user overrides with documented precedence.
- [ ] Add tests asserting geometry attribute/index counts, cone layer draw counts, smoothing behavior, and pulse speed for low/medium/high.
- [ ] If any setting cannot be supported consistently, remove/deprecate it rather than retaining a no-op API.
- [ ] **[NEW]** Remove `redetect()` or reimplement it against a signal that actually varies at runtime (e.g. wire battery state through the existing `setPreset` path); replace its stub-swapping test with a runtime-possible scenario.
- [ ] Benchmark low/medium/high under a fixed marker count and record the method, not unstable absolute numbers, in performance docs.

**Acceptance:** every exported quality property has a test-observable effect and low mode uses measurably less work than high mode.

---

## Task 14: Unify MapLibre/MapBox behavior behind a tested adapter boundary

**Prerequisite:** Tasks 3 and 4 must be merged first so parity is locked by tests.

**Files:**
- Create: shared canvas marker engine/adapter files under `src/lib/map/` or equivalent
- Modify: MapLibre/MapBox marker and controller files
- Test: shared contract suite plus thin adapter tests

**Findings covered:** duplicated 800–900-line marker implementations and recurring behavior drift. **[NEW 2026-07-18]:** `overallScale` is applied quadratically to the ring's minimum-radius floor — the floor is computed with `scale` already applied, then multiplied by `scale` again (`MapLibreUserMarker.ts:733,742` / `MapBoxUserMarker.ts:674,681`; `setOverallScale(2)` grows the floor 4×); MapLibre has copy-paste artifacts Mapbox doesn't (`ctx.arc` drawn twice in one path at `:748-749`, double `closePath()` at `:804-805`); most MapLibre setter tests are fluent-return mock-echo (`MapLibreUserMarker.test.ts:118-286`).

- [ ] Define a narrow structural adapter for native marker creation, map subscription, attach/detach, coordinate assignment, zoom/bearing access, and fly/pan behavior.
- [ ] Extract rendering/state interpolation/confidence/staleness/quality logic without changing public class names.
- [ ] Run one shared behavioral contract suite against both adapters: smoothing on/off, heading, confidence, quality, add/remove/re-add, switch-map, failure rollback, disposal.
- [ ] Keep MapLibre/MapBox-specific runtime imports and public types in their adapter entry points.
- [ ] Compare bundle sizes before/after and prevent accidental cross-imports.
- [ ] **[NEW]** Fix the quadratic `overallScale` application to the ring floor during extraction; add a regression test asserting the floor scales linearly at `setOverallScale(2)`.
- [ ] **[NEW]** Drop the duplicated `ctx.arc`/`ctx.closePath` calls when unifying the canvas paths.
- [ ] **[NEW]** Retire the fluent-return setter tests in favor of shared behavioral contract assertions (canvas output, positioning, state transitions).

**Acceptance:** shared contract passes for both integrations, public APIs remain compatible, and duplicate behavior logic is materially reduced.

---

## Task 15: Bound shared resources and harden global configuration

**Files:**
- Modify: `src/lib/three/ThreeUserMarker.ts`
- Modify: `src/lib/types.ts`
- Test: affected tests
- Document: SSR/browser construction behavior

**Findings covered:** unbounded shared material cache; mutable object returned by `getSDKConfig()`; browser-only constructors not explicit. **[NEW 2026-07-18]:** dual-package hazard — `sdkConfig` (`types.ts:56`), `globalQualityManager` (`QualityManager.ts:220`), and `globalBatteryManager` (`BatteryManager.ts:230`) are module-scoped singletons duplicated across the ESM and CJS builds; a graph loading both formats gets silently divergent config.

- [ ] Choose a material-cache policy: reference counting plus release, bounded LRU, or explicit global cache disposal. Test many distinct colors and final cleanup.
- [ ] Return a frozen snapshot or defensive copy from `getSDKConfig()`; keep internal access private.
- [ ] Document that MapLibre/MapBox marker construction is browser-only, or defer DOM creation until `addTo()` and throw a typed environment error.
- [ ] Add SSR import and construction contract tests.
- [ ] **[NEW]** Mitigate the ESM/CJS singleton split: either make the CJS build a thin wrapper over one shared implementation, or document single-format consumption and add a dev-mode double-load warning when both formats initialize.

**Acceptance:** cache growth is bounded/releasable, public config cannot mutate internal state, SSR behavior is deterministic/documented, and dual-format config divergence is prevented or loudly surfaced.

---

## Task 27: Sweep unused code, exports, files, and dependencies — and keep it swept

**Prerequisite:** Tasks 13, 14, and 16 merged first — the quality-API decisions, adapter unification, and entry-point restructuring all delete or move code, and sweeping before them means sweeping twice.

**Files:**
- Delete: `src/example/components/DebugControls.svelte` (verified byte-identical duplicate of `src/components/DebugControls.svelte`, referenced by nothing)
- Create: `knip.json` (or `knip` config in `package.json`)
- Modify: `package.json` (add `knip` devDependency and a `lint:dead` script)
- Modify: `.github/workflows/ci.yml` (add the dead-code check to the verification job)
- Modify: whatever the sweep flags (bounded below)

**Findings covered:** **[NEW 2026-07-18]** dead duplicate component file; unused `isValidLatitude`/`isValidLongitude` exports (being wired into use by Task 12 — re-check after); dead `redetect()` API (removed by Task 13); `_provider` escape hatch (gated by Task 6); phantom `@react-three/fiber` peer (removed by Task 16). General risk: a 22-task remediation that only adds code entrenches accretion; this task is the counterweight.

- [ ] Add `knip` as a devDependency with a config declaring every real entry point: `src/lib/index.ts`, `src/lib/react/index.ts`, `src/lib/svelte/index.ts`, the renderer entries added by Task 16, `src/main.ts` (demo), `scripts/*.mjs`, `packages/create-rovebeacon/` CLI and templates, and Playwright/Vitest configs. Set `includeEntryExports: false` so public barrel exports are NOT flagged — public API removal is a deliberate decision, never an automated one.
- [ ] Run `npx knip` and triage the report into three buckets: (a) delete now — internal code/files/deps with zero references; (b) keep with a written reason — add to knip's `ignore` with a one-line comment (e.g. intentionally-public helpers); (c) public API candidates for removal — list them in the PR description for an explicit decision, do not auto-delete.
- [ ] Delete `src/example/components/DebugControls.svelte` first (already verified dead).
- [ ] After deletions, run the coverage report and confirm no *excluded-because-untested* file remains that is also unreferenced — unused + untested code is the first to delete, not to backfill tests for.
- [ ] Prune `devDependencies` that knip flags as unused (verify each against scripts/CI before removal; `mapbox-gl` stays — it backs the injected-module tests).
- [ ] Add `lint:dead` (`knip`) to package scripts and the reusable CI verification job from Task 19 so regressions fail PRs.
- [ ] Re-run the full local gate (check, lint, test, build:lib, verify:dist, size, build) to prove the deletions were truly dead.

**Verification:**

```bash
npx knip
npm run check && npm run lint && npm run test -- --run
npm run build:lib && npm run verify:dist && npm run size && npm run build
```

**Acceptance:** knip reports zero unignored findings; every `ignore` entry has a written reason; no public export was removed without an explicit decision recorded in the PR; the full matrix stays green after deletions.

---

# Phase D — Package architecture, tarball integrity, and first-party consumers

## Task 16: Add dependency-isolated renderer entry points and correct peer metadata

**Files:**
- Modify: `vite.lib.config.ts`
- Modify: `package.json`
- Modify/create: `src/lib/core/index.ts`, renderer entry files as needed
- Modify: `scripts/verify-dist.mjs`
- Test: clean consumer fixtures

**Findings covered:** root import statically requires Three despite optional-peer contract; missing MapBox peer; existing renderer indexes not exported; public module options use `any`. **[NEW 2026-07-18]:** `@react-three/fiber` is declared a peer but never imported by any shipped code (only a JSDoc example references it — `useYouAreHere.ts:117`); the exports map blocks `require('rovemaps-you-are-here/package.json')`, which some tooling reads.

- [ ] Add build/package exports for `./core`, `./three`, `./maplibre`, and `./mapbox` while retaining current `.` compatibility for 3.x.
- [ ] Ensure `./core` has no Three/MapLibre/MapBox runtime imports.
- [ ] Declare `mapbox-gl` as an optional peer and include peer metadata.
- [ ] Type injected modules as `typeof import(...)` or a minimal structural marker factory—remove public `any`.
- [ ] Document the root-entry compatibility cost: root users still need Three until a future major removes renderer exports from `.`.
- [ ] Add import-resolution tests for each subpath with only its required peer set installed.
- [ ] **[NEW]** Remove `@react-three/fiber` from `peerDependencies` (keep as a devDependency for the demo/examples only).
- [ ] **[NEW]** Add `"./package.json": "./package.json"` to the exports map.

**Acceptance:** a core-only consumer installs/imports without any renderer peer; each renderer consumer receives an accurate dependency contract.

---

## Task 17: Make package creation deterministic and verify the installed contract

**Files:**
- Modify: `tsconfig.lib.json`
- Modify: `vite.lib.config.ts`
- Modify: `package.json`
- Expand: `scripts/verify-dist.mjs`
- Create: packed-consumer smoke scripts/fixtures

**Findings covered:** test declarations and favicon published; shared demo/library `dist`; no `prepack`; verification covers only root ESM.

- [ ] Exclude `*.test.ts` and test support from declaration emit.
- [ ] Set `copyPublicDir: false` for library build.
- [ ] Separate demo output from library package output, or guarantee library rebuild through `prepack`.
- [ ] Add `prepack` that builds library, verifies files, checks size, and runs packed-consumer smoke tests.
- [ ] Expand verification to ESM/CJS, all subpaths, declarations, export parity, forbidden framework inlining, and an explicit tarball allowlist.
- [ ] **[NEW]** Assert `three`/`maplibre-gl`/`mapbox-gl` remain external in EVERY emitted bundle and chunk (current `verify-dist.mjs:7-11` inspects only root ESM and never checks externals), and that no `*.test.d.ts` appears in the tarball (16 ship today).
- [ ] Pack into a temporary directory and install the tarball—not the repository path—into isolated ESM, CJS, React, Svelte, core, Three, MapLibre, and MapBox fixtures.
- [ ] Assert no favicon, test declarations, source test names, demo HTML, or unrelated assets.

**Verification:**

```bash
npm pack --dry-run --json
npm pack --pack-destination /tmp/rove-pack
node scripts/verify-packed-consumers.mjs /tmp/rove-pack/*.tgz
```

**Acceptance:** clean tarball and successful real package-manager resolution for every supported entry point.

---

## Task 18: Repair and continuously build all CLI templates and examples

**Files:**
- Modify: `packages/create-rovebeacon/templates/vanilla/src/main.ts`
- Modify: `packages/create-rovebeacon/templates/svelte/src/App.svelte`
- Modify as needed: React template and all template package/config files
- Modify: standalone examples and their READMEs
- Create: actual CLI/template tests under `packages/create-rovebeacon/test/`
- Create: root `scripts/verify-first-party-consumers.mjs`
- Modify: root/package scripts and CI

**Findings covered:** vanilla/Svelte templates use removed APIs; async starts are unhandled; Svelte cleanup incomplete; CLI test target is absent/nonfunctional; React example/docs are not independently verified.

- [ ] Replace stale event/method/signature usage with current APIs and normalized error types.
- [ ] Await/catch startup and show typed user-facing errors.
- [ ] Fully dispose owned provider, marker, controls, renderer, listeners, and RAF in templates.
- [ ] Add CLI unit tests for help, invalid template, variable substitution, target-exists behavior, and all three template names.
- [ ] Add an integration matrix that runs `node .../cli.js <temp-name> --template <vanilla|react|svelte>`, rewrites only the SDK dependency to the packed local tarball, installs, typechecks/checks, and builds.
- [ ] Build the standalone React example against the same tarball.
- [ ] Validate CDN examples with a local static server and browser smoke test; ensure import maps and global-module assumptions match the chosen package architecture.
- [ ] Remove templates from blanket lint exclusion; add the appropriate TS/Svelte lint/check commands.

**Acceptance:** every first-party consumer is executable in CI and cannot drift silently from the SDK API.

---

# Phase E — CI, E2E, release policy, documentation, and warning debt

## Task 19: Strengthen CI and publish as one reusable certification pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`
- Modify: `playwright.config.ts`
- Modify/add: lifecycle E2E tests
- Optionally create: reusable `.github/workflows/verify.yml`

**Findings covered:** publish skips coverage; Chromium-only matrix; weak memory test; shared/default port ambiguity; actions not SHA-pinned.

- [ ] Extract one reusable verification job/workflow used by PR, main, and publish.
- [ ] Require typecheck, zero-error lint, coverage, unit tests, library build, dist/tarball checks, size, demo build, first-party consumer matrix, and E2E before publish.
- [ ] Run E2E on a reserved unique port with `reuseExistingServer: false` in CI.
- [ ] Add WebKit and mobile viewport coverage for permission, start/stop/restart, tab switch teardown, and reduced motion. Add Firefox where geolocation mocking is deterministic.
- [ ] Replace “canvas disappears after navigation” with observable lifecycle assertions: listener/watch/RAF counts or repeated mount/start/stop cycles.
- [ ] Remove fixed sleeps in favor of state assertions.
- [ ] Pin third-party GitHub actions to commit SHAs, with comments naming their release tags.
- [ ] Make publish verify tag/version consistency and refuse an already-published npm version.

**Acceptance:** a tag cannot publish code that would fail the main CI contract, and E2E cannot reuse another checkout’s server.

---

## Task 20: Eliminate lint warning debt and make warning regressions fail

**Files:**
- Modify: runtime/tests/examples/templates as needed
- Modify: `eslint.config.js`
- Modify: package scripts and CI

**Findings covered:** 129 warnings normalize unsafe `any` and hide regressions.

- [ ] Split lint baselines by runtime, tests, demo, examples, and templates.
- [ ] Replace runtime public/internal `any` with `unknown`, imported types, or narrow structural interfaces.
- [ ] Permit unavoidable test introspection only with targeted, reasoned disables.
- [ ] Add `--max-warnings=0` once the baseline is clean.
- [ ] Keep Svelte source under `svelte-check`; add complementary linting rather than blanket exclusion where practical.

**Acceptance:** CI reports zero lint warnings across all first-party code.

---

## Task 21: Reconcile documentation with the executable product

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PERFORMANCE.md`
- Modify: `CONTRIBUTING.md`
- Modify: example/template READMEs
- Modify: `CHANGELOG.md`

**Findings covered:** stale MapLibre/MapBox quick starts; future-v3 language; orientation/error drift; contributor commands incomplete; ESM-only wording conflicts with CJS; privacy and browser support claims unsupported. **[NEW 2026-07-18 — concrete drift confirmed]:** README documents `orientation` default as `'z-up'` when the code default is `'y-up'` (`README.md:407` vs `ThreeUserMarker.ts:76`); nine `@default` JSDoc values in `types.ts` diverge from `DEFAULT_OPTIONS`; `examples/react/README.md:35` imports hooks from the removed root export; `docs/PERFORMANCE.md:242-249` lists shipped (QualityManager/BatteryManager) and removed (FrameMonitor/AnimationManager) features as "planned for v3.0" and shows private `pause()/resume()` as callable; `docs/ARCHITECTURE.md:140-146` omits the `resume` event; `README.md:342` types `controller.geolocation` as `GeolocationProvider` instead of `LocationSource`.

- [ ] Generate or compile-check README snippets where feasible.
- [ ] Show module-safe MapLibre/MapBox imports using renderer subpaths/injection; remove `window.*` workarounds from primary guidance.
- [ ] Explain root vs renderer entry points and required peers.
- [ ] Update quality documentation to match tested behavior.
- [ ] Correct error/orientation/current-version descriptions.
- [ ] Document Node floor, complete local gate, privacy data flow, reduced-motion behavior, SSR/browser construction limits, and actual tested browser matrix.
- [ ] Update changelog with every runtime/API/package behavior change and migration instructions.
- [ ] **[NEW]** Correct README `orientation` default to `'y-up'` and reframe the "Custom Coordinate System" example accordingly.
- [ ] **[NEW]** Sync every `@default` JSDoc tag in `types.ts` with the real `DEFAULT_OPTIONS` and mirror into README: dotSize 5, borderWidth 1.5, minSpeedForDirection 0.4, pulseSpeed 0.2, coneColor 0xCBD4E2 (grey — NOT "same as color"), scaleReferenceDistance 200, ringScale 0.75, ringInnerRadius 12, ringOuterRadius 25. Add an automated defaults-drift check if feasible.
- [ ] **[NEW]** Fix `examples/react/README.md` to import from `rovemaps-you-are-here/react`.
- [ ] **[NEW]** Delete/replace the PERFORMANCE.md "Future Improvements planned for v3.0" section and the private `pause()/resume()` example; add the `resume` event to ARCHITECTURE.md; correct `controller.geolocation` to `LocationSource` in README; document the true cone/ring color defaults (accuracy ring color is hardcoded and does not follow `color`).
- [ ] **[NEW]** Document that `locationSource` must be referentially stable across renders for the React hooks (inline/new-per-render sources cause marker/provider teardown churn).

**Acceptance:** every documented quick start is built in the first-party consumer matrix, no “planned for v3” language remains, and every documented default matches `DEFAULT_OPTIONS`.

---

# Phase F — Release certification

## Task 22: Run an adversarial release candidate audit

**Prerequisite:** Tasks 1–21 complete.

- [ ] Start from a clean clone/worktree using the exact candidate commit.
- [ ] Run Node 20.19 and Node 22 install/check/unit/coverage/build matrices.
- [ ] Run lint with zero warnings.
- [ ] Run Chromium and WebKit E2E on isolated ports; include mobile viewport and reduced-motion projects.
- [ ] Pack once, inspect every tarball path, and install that exact tarball into every consumer fixture.
- [ ] Generate/build all CLI templates from the tarball.
- [ ] Run production and full audits.
- [ ] Verify package/lock/tag/changelog version agreement.
- [ ] Verify npm target version is not already published.
- [ ] Run bundle limits and compare to the baseline.
- [ ] Repeat lifecycle stress flows: start/stop during pending start, restart, remove/re-add, adapter switch, ten demo tab cycles, teardown before battery/location promises resolve.
- [ ] Re-run the full audit scoring rubric. Required release floors:
  - Correctness ≥ 8.5
  - Reliability ≥ 8.5
  - Performance/resource lifecycle ≥ 8.0
  - Developer experience ≥ 8.5
  - Packaging/release ≥ 8.5
  - No critical/high confirmed runtime defects
  - Weighted whole-repository score ≥ 85/100
- [ ] Confirm `git status --short` is empty after all checks.

**Final commands:**

```bash
npm ci
npm run verify:version
npm run check
npm run lint
npm run test -- --coverage --run
npm run build:lib
npm run verify:dist
npm run size
npm run build
npm run test:first-party-consumers
npm run test:e2e
npm pack --dry-run --json
npm audit --omit=dev
npm audit
```

Do not publish if any command, fixture, lifecycle stress test, version gate, or score floor fails.

---

# Parallel execution map

After Tasks 1–2 establish the baseline, these lanes can proceed in isolated worktrees:

- **Lane A — Lifecycle:** Tasks 5, 6, 8, 24, 25
- **Lane B — Map correctness:** Tasks 3, 4, then 14
- **Lane C — Three/React correctness and performance:** Tasks 7, 13, 15, 23, 26
- **Lane D — Demo/browser/accessibility:** Tasks 9, 10, 11, 12
- **Lane E — Package/consumers:** Tasks 16, 17, 18

Merge order:

1. Baseline/dependencies
2. Runtime correctness and lifecycle
3. Demo/browser fixes
4. Quality and shared adapter refactor
5. Package architecture and consumers
6. Dead-code sweep (Task 27 — after the refactors have deleted their share)
7. CI/release/docs
8. Release certification

Avoid parallel edits to `package.json`, `package-lock.json`, CI workflows, or `CHANGELOG.md`; assign one integration owner for those files.

# Finding-to-task coverage matrix

| Audit finding | Task(s) |
|---|---|
| Disabled smoothing freezes position/heading | 3, 13 |
| Remove/re-add and controller restart detach marker | 4, 14 |
| Pending controller/provider start cannot be cancelled | 5, 6 |
| Startup timer/watch cleanup gaps | 5 |
| Framework teardown can restart orientation | 6 |
| React altitude drift | 7 |
| Battery async dispose race | 8 |
| Logger sink exceptions propagate | 8 |
| Demo RAF/listener/tile leaks | 9 |
| Location requested before explicit action | 10 |
| Third-party viewport/tile privacy disclosure | 10, 21 |
| Missing reduced motion | 11 |
| Missing status/error announcements | 11 |
| Tab/debug-control semantics | 11 |
| Zero coordinates displayed as absent | 12 |
| Public numeric options insufficiently validated | 12 |
| Adaptive-quality settings ignored | 13 |
| MapLibre/MapBox duplication and drift | 14 |
| Shared material cache unbounded | 15 |
| Mutable SDK config exposure | 15 |
| Browser-only construction/SSR contract | 15, 21 |
| Root statically depends on optional Three | 16 |
| Missing MapBox peer | 16 |
| Public injected modules typed `any` | 16, 20 |
| Test declarations/favicon published | 17 |
| Demo/library share `dist`; no deterministic prepack | 17 |
| Dist verification incomplete | 17 |
| Broken vanilla/Svelte scaffolds | 18 |
| Standalone examples/docs not executable | 18, 21 |
| Publish omits coverage/version gates | 1, 19 |
| Chromium-only/weak E2E and port reuse | 19 |
| Actions not SHA-pinned | 19 |
| 129 lint warnings | 20 |
| Stale/inaccurate docs and contributor guide | 21 |
| Lockfile version mismatch | 1 — ✅ done 2026-07-18 |
| 22 development vulnerabilities | 2 — ✅ done 2026-07-18 |
| [NEW] Antimeridian projection error in `lngLatToScene` | 23 |
| [NEW] `onError` telemetry hook never fires for SDK errors | 24 |
| [NEW] Leading-edge throttle drops the newest fix | 25 |
| [NEW] Three cone reappears during low/lost confidence | 26 |
| [NEW] Heading frozen with smoothing off (all three renderers) | 3 |
| [NEW] Canvas first fix not dirtied (`pulseSpeed: 0`) | 3 |
| [NEW] Mock path survives `stop()` | 5 |
| [NEW] `resume()` re-entrancy watch leak | 5 |
| [NEW] `getCurrentPosition()` permission-state drift | 5 |
| [NEW] Unwrapped errors from framework `start()` paths | 6 |
| [NEW] Wrap helper throws on null payload | 6 |
| [NEW] Svelte compass opt-out / `_provider` escape hatch | 6 |
| [NEW] Battery initial/`unavailable` state never emitted | 8 |
| [NEW] `maxUpdateRate` 0/NaN silent failure modes | 12 |
| [NEW] O(magnitude) longitude normalization | 12 |
| [NEW] Raw platform coordinates unvalidated | 12 |
| [NEW] `redetect()` dead API | 13 |
| [NEW] Quadratic `overallScale` on ring floor | 14 |
| [NEW] Duplicate canvas path calls (MapLibre) | 14 |
| [NEW] Mock-echo setter tests | 14 |
| [NEW] ESM/CJS singleton divergence | 15 |
| [NEW] Phantom `@react-three/fiber` peer | 16 |
| [NEW] Missing `./package.json` export | 16 |
| [NEW] `verify-dist` externals/test-d.ts gaps | 17 |
| [NEW] Concrete doc-default drift (9 values, orientation, examples) | 21 |
| [NEW] Dead duplicate component; unused exports/deps; no accretion guard | 27 |

# Suggested PR breakdown

1. `chore: declare runtime floor and enforce release version consistency`
2. `chore: refresh vulnerable development toolchain`
3. `fix: apply map updates when smoothing is disabled`
4. `fix: make map marker attachment restart-safe and transactional`
5. `fix: cancel pending geolocation and controller startup`
6. `fix: guard framework async startup after teardown`
7. `fix: align React marker altitude behavior`
8. `fix: close battery and logging lifecycle edges`
9. `fix: dispose demo rendering and browser resources`
10. `fix: gate location access behind explicit consent`
11. `feat: add accessible and reduced-motion demo behavior`
12. `fix: validate public options and zero-coordinate display`
13. `fix: wire adaptive quality settings to renderers`
14. `refactor: share canvas marker behavior across map adapters`
15. `fix: bound shared resources and protect SDK config`
16. `feat: add renderer-specific package entry points`
17. `chore: certify packed package contents and consumers`
18. `fix: repair and build-test all scaffolds and examples`
19. `ci: reuse release certification across CI and publish`
20. `chore: eliminate lint warning debt`
21. `docs: reconcile v3 architecture usage and privacy guidance`
22. `chore: certify the release candidate`
23. `fix: wrap antimeridian deltas in scene projection`
24. `fix: deliver SDK errors to the onError telemetry hook`
25. `fix: flush trailing throttled position updates`
26. `fix: gate direction cone on confidence state`

27. `chore: sweep unused code and enforce dead-code checks in CI`

*(PRs 23–26 are Phase A2 runtime-correctness work — they merge with the Phase A wave, before demo/packaging phases, not after certification. PR 27 lands after the Phase C/D refactors, before CI/release/docs.)*
