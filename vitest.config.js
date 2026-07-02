import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    include: ['src/_tests_/**/*.test.{js,jsx,ts,tsx}'],
    env: {
      NODE_ENV: 'development',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [
        'src/_tests_/**',
        'src/**/*.test.*',
        'src/**/*.spec.*',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        'src/infra-setup.tsx',
        'src/framework/infra-setup/**',
      ],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 30,
        statements: 50,
      },
    },
  },
});
