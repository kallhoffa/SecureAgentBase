export const getFrameworkConfig = () => ({
  stagingUrl: import.meta.env.VITE_STAGING_URL,
  productionUrl: import.meta.env.VITE_PRODUCTION_URL,
  stagingProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID_STAGING,
  productionProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  sentryOrg: import.meta.env.VITE_SENTRY_ORG || 'your-org',
  sentryProject: import.meta.env.VITE_SENTRY_PROJECT || 'your-project',
  featureFlagKey: import.meta.env.VITE_FEATURE_FLAG_KEY || 'default_flag',
  appEnv: import.meta.env.VITE_APP_ENV || 'development',
});
