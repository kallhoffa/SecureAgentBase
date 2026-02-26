export const frameworkManifest = {
  name: 'SecureAgentBase',
  version: '0.1.0',
  description: 'React + Firebase app framework with autonomous agent workflow',
  
  extract: {
    directories: [
      'src/framework',
      'scripts/framework',
      '.github/framework',
      'tests/framework',
    ],
    files: [
      'vitest.config.js',
      'eslint.config.js',
      'tailwind.config.js',
      'vite.config.js',
      'postcss.config.js',
      'playwright.config.js',
      'package.json',
      '.env.example',
    ],
  },
  
  envVars: {
    required: [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
    ],
    optional: [
      'VITE_STAGING_URL',
      'VITE_PRODUCTION_URL',
      'VITE_FIREBASE_PROJECT_ID_STAGING',
      'VITE_SENTRY_DSN',
      'VITE_SENTRY_ORG',
      'VITE_SENTRY_PROJECT',
      'VITE_FEATURE_FLAG_KEY',
      'VITE_APP_ENV',
    ],
  },
  
  customizationPoints: [
    { file: 'src/shared/config/app.config.js', description: 'App name, feature flags, Firestore schema' },
    { file: '.env.example', description: 'Firebase config, Sentry DSN, feature flag key' },
    { file: 'firebase.json', description: 'Firebase project configuration' },
    { file: 'firestore.rules', description: 'Firestore security rules' },
  ],
};
