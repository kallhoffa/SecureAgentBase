# Context

Glossary of this project's domain terms — maintained by the `domain-modeling` skill as the team works. Architectural decisions live in `docs/adr/`.

- **SecureAgentBase** — a React + Firebase application framework for autonomous agent deployment (auth, Firestore CRUD, infra-setup wizard, template apps).
- **Wizard** — the 4-step infra-setup flow: Step 0 optional sign-in (only persists config, never locks steps), Step 1 Discord bot, Step 2 GitHub PAT, Step 3 Google Cloud. One Google OAuth consent in Step 3 powers all GCP work (project create/select, Firebase apps, CI deploy accounts, VM, agent service account). Every step works signed-out.
- **app-vm / app-staging / app-prod** — the three GCP projects a deployment uses: app-vm hosts the VM and the agent service account; app-staging and app-prod are the Firebase-backed projects for each environment. All three are created during the Google Cloud step via the operator's Google OAuth token.
- **Agent service account** — created by the wizard in app-vm; scoped to app-vm only; identity-only (no key file is ever generated — the wizard operates on the operator's OAuth token). It never creates projects.
- **Manual VM** — an existing VM the operator provisions themselves instead of one-click creation; connected to the wizard by entering its IP. The agent service account only unlocks one-click creation, so manual mode never creates an SA.
- **Billing link** — the wizard links a Google Cloud billing account to app-vm only; app-staging and app-prod run on Firebase's free tier and never receive a billing link. The wizard never auto-links on the operator's behalf — the operator links via the Billing section or the console, and VM creation fails fast (with the link URL) if billing is off.
- **Deploy service account** — one in app-staging and one in app-prod, created by the Google Cloud step's OIDC setup; used by CI to deploy Firebase hosting.
- **Operator** — the human driving the wizard; authenticates to Google Cloud via OAuth to automate GCP/Firebase setup.
- **Kimaki** — the Discord bot agent runtime installed on provisioned VMs.
- **OAuth consent screen** — Google's per-app authorization screen; scopes requested (cloud-platform etc.) determine verification requirements.
