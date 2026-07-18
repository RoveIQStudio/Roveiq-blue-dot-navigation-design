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
