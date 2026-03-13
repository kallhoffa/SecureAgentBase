export const frameworkManifest = {
  name: 'SecureAgentBase',
  version: '0.1.0',
  description: 'React + Firebase app framework with autonomous agent workflow - a deployable Q&A starter template',
  
  extract: {
    directories: [
      'src/framework',
      'scripts/framework',
      '.github/framework',
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
      'VITE_APP_ENV',
    ],
  },
  
  customizationPoints: [
    { file: 'src/posts.jsx', description: 'Post list page - customize search, sorting, display' },
    { file: 'src/post.jsx', description: 'Single post page - customize reply display, voting' },
    { file: 'firestore.rules', description: 'Firestore security rules - customize permissions' },
    { file: 'src/navigation-bar.jsx', description: 'Navigation - add new links, change branding' },
  ],
};
