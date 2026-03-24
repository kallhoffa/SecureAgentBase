# SecureAgentBase

A React + Firebase application framework designed for autonomous agent deployment. Includes authentication, a Q&A feature (posts with replies), and an "Infrastructure Setup" flow for automating GCP and GitHub resources.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run setup (REQUIRED)
# This will configure Firebase, create projects, and generate .env.local
npm run setup

# 3. Start development server
npm run dev
```

> **⚠️ IMPORTANT**: You *must* run `npm run setup` before deploying or testing authentication. If `.env.local` contains placeholder values like `your_api_key_here`, Firebase Auth will fail with a 400 Bad Request error.

## What's Included

- **React 19** with Vite for fast development
- **Firebase Authentication** (email/password + Google)
- **Firestore** for real-time data
- **Infrastructure Setup Flow** (`/infra-setup`) - 7-step automated wizard:
  1. Account (Firebase Auth)
  2. Service Account (GCP JSON key upload)
  3. GCP Project (select/create project)
  4. Firebase Setup (staging + production configs)
  5. GitHub Auth (PAT for VM access)
  6. Discord Bot (bot token + add to server)
  7. Create VM (automated - forks repo, sets up GitHub Actions, downloads Kimaki, creates Discord channel)
- **TailwindCSS** for styling
- **GitHub Actions** CI/CD for automated deployment

## Project Structure

```
src/
├── posts.jsx           # Home page - list all posts
├── post.jsx            # Single post view + replies
├── infra-setup.jsx     # Automated infrastructure provisioning wizard
├── create-app.jsx      # New app creation flow
├── github-callback.jsx # OAuth handler
├── login.jsx          # Sign in page
├── profile.jsx        # User profile page
├── firestore-utils/
│   ├── auth-context.jsx    # Firebase auth provider
│   └── post-storage.js     # Post/reply CRUD
└── framework/              # Reusable framework code
```

## Deployment

### Staging (Automatic)
Push to `main` branch → CI runs tests → Deploys to staging automatically.

Alternatively, deploy manually:
```bash
firebase use staging
firebase deploy --only hosting,firestore
```

### Production
Create a GitHub release:
```bash
git tag v0.1.0
git push origin v0.1.0
```

## Customization

### Change App Name
Edit `src/navigation-bar.jsx` and `index.html`

### Customize Posts/Replies
- `src/posts.jsx` - Post list page
- `src/post.jsx` - Single post view
- `src/firestore-utils/post-storage.js` - Data layer

### Firestore Rules
Edit `firestore.rules` to customize permissions

## Documentation

- [AGENTS.md](./AGENTS.md) - Developer guide for agents
- [LIFECYCLE.md](./LIFECYCLE.md) - Engineering philosophy

## License

Apache 2.0
