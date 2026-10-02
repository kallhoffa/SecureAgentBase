# SecureAgentBase CLI

The `secureagentbase` CLI provisions a Google Cloud VM that runs a Discord agent
(Kimaki). It is the CLI counterpart to the web setup wizard and can be used
instead of, or to redo, any wizard step.

## Install

Requires **Node 18+**.

```bash
npx secureagentbase@latest init     # run without installing
```

or install globally:

```bash
npm install -g secureagentbase
secureagentbase init
```

Check the installed version:

```bash
secureagentbase --version
```

The version is read from the published package, so it always matches what you
installed.

## Authentication

The CLI authenticates to Google Cloud with **Application Default Credentials**.
It never creates or downloads a service account key file.

```bash
gcloud auth application-default login
```

If credentials are missing, `init` and `destroy` detect it and offer to run that
command for you. Non-interactive runs (`--yes`, CI) do this automatically.

The CLI tells you *which* problem it hit, because the fix differs:

| Message | Fix |
|---|---|
| `No credential source is available.` | Run the login above. |
| `Stored credentials are expired or were revoked.` | Re-run the login. |
| `The gcloud CLI was not found on PATH.` | Install the [Cloud SDK](https://cloud.google.com/sdk/docs/install). |
| `...service account has no OAuth scopes` | You are on a VM — attach a service account with the `cloud-platform` scope. |

On a Google Cloud VM the CLI deliberately never runs the interactive login,
because that would overwrite the VM's metadata identity.

**On Windows (Git Bash / MINGW64):** if the browser does not open during
`gcloud auth application-default login`, run it from PowerShell or CMD instead.
Credentials are stored in the same location either way.

**On Windows (all shells):** the Cloud SDK installs `gcloud` as a batch wrapper
(`gcloud.cmd`), which Node cannot execute directly. The CLI handles this, but
if you ever see `spawnSync gcloud ENOENT`, the CLI is an older build — upgrade
with `npm install -g secureagentbase@latest`. Run `secureagentbase --version` to
confirm which build you have.

## `secureagentbase init`

Runs the seven-step setup. Each step can be skipped by passing its flag.

```
Step 1: GCP Project       --project-id <id>
Step 2: Service Account   --auto-sa
Step 3: Firebase Setup    --no-firebase
Step 4: Billing Account   --billing-account <id>
Step 5: GitHub + OIDC     --github-pat <token>  --repo-name <name>
Step 6: Discord Bot       --discord-token <token>  --discord-guild <id>
Step 7: Create VM         --no-vm  --vm-zone <zone>
```

### Options

| Flag | Effect |
|---|---|
| `--project-id <id>` | Use this GCP project instead of prompting. |
| `--auto-sa` | Create the service account without prompting. |
| `--no-firebase` | Skip Firebase project setup. |
| `--billing-account <id>` | Link this billing account. |
| `--github-pat <token>` | Use this PAT instead of prompting (requires `--repo-name`). |
| `--repo-name <name>` | GitHub repo to create for the generated app. |
| `--discord-token <token>` | Discord bot token. |
| `--discord-guild <id>` | Discord guild (server) ID. |
| `--vm-zone <zone>` | VM zone. Default `us-central1-a`, falls back across regions. |
| `--no-vm` | Stop after Step 6; no VM is created. |
| `-y, --yes` | Skip confirmations. Non-interactive. |

Secrets are stored in **Secret Manager**, never in local config. Local config
holds only secret *references*.

## `secureagentbase status`

Prints the deployment recorded in `~/.secureagentbase/config.json`: GCP project,
service account, Firebase projects, GitHub repo, Discord guild, VM IP and zone,
and which secrets are stored in Secret Manager.

Warns and exits if no deployment is found.

## `secureagentbase destroy`

Deletes the VM and clears local configuration. It does **not** delete the GCP
project, service account, Firebase apps, or Secret Manager entries — remove
those yourself if you want them gone.

```bash
secureagentbase destroy           # asks for confirmation
secureagentbase destroy --yes     # no prompt
```

## Local configuration

```
~/.secureagentbase/config.json
```

Written by `init`, read by `status`, cleared by `destroy`. Contains no secret
values, only references to Secret Manager entries.

## Troubleshooting

**`Not signed in to Google Cloud`** — see [Authentication](#authentication).

**VM creation fails with a billing error** — the project has no billing account
attached. The CLI prints the link URL to fix it in the console.

**`Already exists` during VM creation** — a VM from a previous run is still
present under the same fixed name (`secureagent-manager`). Run
`secureagentbase destroy`, or delete it in the console.

**Zone out of capacity** — pass `--vm-zone` with another zone; the CLI already
falls back across regions, but you can pin one explicitly.

## Related

- `../.opencode/skills/infra-setup/SKILL.md` — wizard and CLI internals
- `../.opencode/skills/release-gate/SKILL.md` — how CLI changes get released