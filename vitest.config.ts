import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            // Include library source files
            include: ['src/lib/**/*.ts', 'src/utils/**/*.ts'],
            // Exclude test files, type-only files, barrel re-exports, and demo app
            exclude: [
                // Test files
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                '**/*.test.ts',
                // Type-only file: interface declarations, no executable code
                'src/lib/sources.ts',
                // Barrel re-export files (no executable logic)
                'src/lib/index.ts',
                'src/lib/react/index.ts',
                'src/lib/mapbox/index.ts',
                'src/lib/maplibre/index.ts',
                'src/lib/three/index.ts',
                // Demo app (not part of the published SDK)
                'src/main.ts',
                'src/App.svelte',
                'src/components/**',
                'src/example/**',
                // Build output and workspace packages
                'dist/**',
                'packages/**',
            ],
            // Coverage thresholds - fail if below these values.
            // Set ~2 points below the current measured floor (statements 79.57,
            // branches 71.70, functions 86.49, lines 81.86) so coverage can only
            // ratchet up; raise them as real coverage improves.
            thresholds: {
                statements: 77,
                branches: 69,
                functions: 84,
                lines: 79,
            },
        },
        include: ['src/**/*.{test,spec}.{js,ts}'],
    },
});
