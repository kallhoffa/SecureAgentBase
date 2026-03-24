# AGENTS.md - Developer Guide for SecureAgentBase

## Project Overview

This is a React 19 application built with Vite, using JavaScript (not TypeScript). The project uses Firebase for authentication and Firestore, Sentry for error tracking, and TailwindCSS for styling.

## Build / Lint / Test Commands

### Development
```bash
npm run dev          # Start development server (port 3000)
npm run build        # Build for production (output: build/)
npm run preview      # Preview production build
```

### Testing
```bash
npm run test              # Run unit tests in watch mode
npm run test:ci           # Run unit tests once (for CI)
npm run e2e               # Run e2e tests with Playwright
npm run e2e:ci            # Run e2e tests in CI mode
npm run e2e:smoke         # Run smoke tests only
npm run e2e:smoke:ci      # Run smoke tests in CI mode
```

**Running a single test**: Use Vitest's `--filter` flag:
```bash
npm run test -- --filter "test-name-pattern"
# Or directly:
npx vitest run --filter "test-name-pattern"
```

### Linting & Type Checking
```bash
npm run lint         # Run ESLint on src/
npm run lint:fix     # Fix ESLint issues automatically
npm run check        # Run test:ci, lint, and build (full check)
```

## Code Style Guidelines

### General
- Use JavaScript (JSX), not TypeScript
- Use ES modules (`import`/`export`)
- Enable automatic JSX transform in Vite (`esbuild.jsx: 'automatic'`)

### Naming Conventions
- **Components**: PascalCase (e.g., `AuthProvider`, `UserProfile`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth`, `useFeatureFlag`)
- **Utilities**: camelCase (e.g., `fetchFeatureFlags`, `remoteConfig`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`)
- **Context**: PascalCase with `Context` suffix (e.g., `AuthContext`)

### Imports
Order imports as follows:
1. React/External libraries
2. Internal framework utilities
3. Local components/utils

```javascript
import { useState, useEffect } from 'react';
import { fetchFeatureFlags } from '../firestore-utils/remote-config';
import { useAuth } from './auth-context';
```

### Components
- Use functional components with hooks
- Use named exports for hooks and utilities
- Use default export only for top-level route components
- Destructure props for clarity

```javascript
// Good
export const AuthProvider = ({ auth, children }) => {
  const [user, setUser] = useState(null);
  // ...
};

// Avoid
const AuthProvider = ({ auth, children }) => { ... };
export default AuthProvider;
```

### React Hooks
- Follow ESLint react-hooks rules (exhaustive-deps)
- Always include all dependencies in dependency arrays
- Use cleanup functions in useEffect for subscriptions/timers

```javascript
useEffect(() => {
  let mounted = true;
  const loadData = async () => {
    try {
      const data = await fetchData();
      if (mounted) {
        setData(data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };
  loadData();
  return () => { mounted = false; };
}, [dependency]);
```

### Error Handling
- Use try/catch for async operations
- Log errors with descriptive messages
- Set appropriate fallback states on error
- Never swallow errors silently

```javascript
try {
  const result = await riskyOperation();
  setResult(result);
} catch (error) {
  console.error('Operation failed:', error);
  setError('Failed to complete operation');
}
```

### Context Usage
- Create context with `createContext(null)`
- Throw descriptive errors when context is used outside provider
- Use custom hooks to expose context values

```javascript
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

### Testing
- Place tests in `src/_tests_/` directory
- Use `.test.{js,jsx,ts,tsx}` suffix
- Use Vitest with jsdom environment
- Follow `@testing-library/react` patterns

```javascript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

describe('useFeatureFlag', () => {
  it('returns flag value', () => {
    // test implementation
  });
});
```

### TailwindCSS
- Use utility classes for styling
- Avoid custom CSS unless necessary
- Use semantic class names for complex components

### File Organization
```
src/
├── framework/
│   ├── config/           # Configuration files
│   ├── firestore-utils/  # Firebase utilities
│   └── hooks/            # Custom React hooks
└── _tests_/              # Test files
```

### Firebase Integration
- Initialize Firebase outside components
- Pass auth instance as prop to providers
- Use Firebase SDK methods directly in context/logic layers

### Environment Variables
- Use `.env` files for local development
- Prefix variables with `VITE_` for client-side exposure
- Never commit secrets to repository

---

## First-Time Setup

**This must be done by the user** (not the agent) to configure Firebase and GitHub:

```bash
npm install
npm run setup
```

The setup script will:
1. Check/install GitHub CLI
2. Check/install Firebase CLI
3. Create Firebase projects (prod + staging)
4. Get Firebase web app configs
5. Upload secrets to GitHub
6. Create `.firebaserc` and `.env.local`

---

## Deployment

### Prerequisites
- GH CLI authenticated with GitHub
- Firebase project configured via `npm run setup`
- Secrets uploaded to GitHub

### Deploy to Staging
The agent can deploy to staging automatically after tests pass:
- Triggered on push to `main`
- Runs: `npm run build` → `firebase deploy --only hosting,firestore`

### Deploy to Production
Create a GitHub release to deploy to production:
```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the production deployment workflow.

### Manual Deploy
```bash
firebase use staging
firebase deploy --only hosting,firestore
```
