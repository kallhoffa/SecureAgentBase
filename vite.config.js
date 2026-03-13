import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      org: 'argbase',
      project: 'argbase-react',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      deploy: {
        env: process.env.VITE_APP_ENV || 'production',
      },
      sourcemaps: {
        assets: './build/**',
      },
    }),
  ],
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
