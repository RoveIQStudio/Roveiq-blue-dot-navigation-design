# Contributing to RoveMaps YouAreHere

Thank you for your interest in contributing! This guide will help you get started.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/RoveIQStudio/Roveiq-blue-dot-navigation-design.git
cd RoveBeacon

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

## Development Workflow

### 1. Find or Create an Issue

- Check [existing issues](https://github.com/RoveIQStudio/Roveiq-blue-dot-navigation-design/issues)
- For new features, open an issue first to discuss the approach
- For bugs, include reproduction steps and browser/device info

### 2. Branch Naming

```
feature/short-description   # New features
fix/issue-number-description # Bug fixes
docs/what-changed           # Documentation updates
refactor/what-changed       # Code refactoring
```

### 3. Code Standards

**TypeScript:**
- Use strict TypeScript (no `any` without justification)
- Add JSDoc comments for all public APIs
- Export types from `src/lib/types.ts`

**Testing:**
- Add tests for new features
- Update tests when fixing bugs
- Maintain >80% coverage

**Commits:**
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Keep commits focused and atomic

### 4. Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Run `npm run check` and `npm test`
4. Push and open a PR
5. Fill out the PR template
6. Address review feedback

## Code Architecture

### Directory Structure

```
src/lib/
├── index.ts              # Public exports
├── types.ts              # Shared interfaces
├── errors.ts             # Error types
├── GeolocationProvider.ts # Location tracking
├── three/                # Three.js implementation
├── maplibre/             # MapLibre implementation
└── mapbox/               # MapBox implementation
```

### Key Patterns

**Controllers** orchestrate markers and geolocation:
```typescript
export class ThreeYouAreHereController {
  public readonly marker: ThreeUserMarker;
  public readonly geolocation: GeolocationProvider;
  // ...
}
```

**Markers** handle rendering and animation:
```typescript
export class ThreeUserMarker extends THREE.Group {
  setPosition(x, y, z): this { /* ... */ }
  update(deltaTime): void { /* ... */ }
}
```

**GeolocationProvider** wraps browser APIs:
```typescript
export class GeolocationProvider {
  on(event, callback): () => void { /* ... */ }
  start(): Promise<void> { /* ... */ }
}
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage

# Specific file
npm test -- ThreeUserMarker
```

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('FeatureName', () => {
  it('should do expected behavior', () => {
    // Arrange
    const instance = new MyClass();

    // Act
    const result = instance.method();

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Mocking Browser APIs

```typescript
beforeEach(() => {
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    },
  });
});
```

## Common Tasks

### Adding a New Option

1. Add to interface in `src/lib/types.ts`
2. Add default in the relevant class
3. Implement the behavior
4. Add tests
5. Update README

### Adding a New Confidence State

1. Add to `ConfidenceState` type
2. Add materials in `ThreeUserMarker.createMarker()`
3. Handle in `applyConfidenceState()`
4. Add tests
5. Document in README

### Supporting a New Map Library

1. Create `src/lib/newlib/NewLibUserMarker.ts`
2. Create `src/lib/newlib/NewLibYouAreHereController.ts`
3. Export from `src/lib/index.ts`
4. Add peer dependency to `package.json`
5. Add example and documentation

## Release Process

Maintainers only:

1. Update `CHANGELOG.md`
2. Bump version in `package.json`
3. Create GitHub release
4. npm publish

## Questions?

- Open a [discussion](https://github.com/RoveIQStudio/Roveiq-blue-dot-navigation-design/discussions)
- Check existing issues for similar questions

Thank you for contributing!
