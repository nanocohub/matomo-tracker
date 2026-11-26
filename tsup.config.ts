import { defineConfig } from 'tsup';

const shared = {
  target: 'es2018',
  splitting: false,
  sourcemap: false,
  treeshake: true,
  outDir: 'dist',
} as const;

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts', react: 'src/react.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    external: ['react'],
  },
  {
    ...shared,
    entry: { browser: 'src/browser.ts' },
    format: ['esm'],
    dts: true,
    minify: true,
    noExternal: [/.*/],
  },
  {
    ...shared,
    entry: { browser: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'NanocoMatomo',
    minify: true,
    outExtension: () => ({ js: '.global.js' }),
  },
]);
