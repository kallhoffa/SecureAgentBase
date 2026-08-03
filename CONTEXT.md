# Context

Glossary of this project's domain terms — maintained by the `domain-modeling` skill as the team works. Architectural decisions live in `docs/adr/`.

- **SecureAgentBase** — a React + Firebase application framework for autonomous agent deployment (auth, Firestore CRUD, infra-setup wizard, template apps).
- **Wizard** — the 7-step infra-setup flow that provisions GCP service accounts, Firebase projects, WIF/OIDC, GitHub variables, and a Kimaki-managed VM.
- **Operator** — the human driving the wizard; authenticates to Google Cloud via OAuth to automate GCP/Firebase setup.
- **Kimaki** — the Discord bot agent runtime installed on provisioned VMs.
- **OAuth consent screen** — Google's per-app authorization screen; scopes requested (cloud-platform etc.) determine verification requirements.
