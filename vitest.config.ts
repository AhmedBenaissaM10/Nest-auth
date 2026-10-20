import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.unit-spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    env: { NODE_ENV: 'test' },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
