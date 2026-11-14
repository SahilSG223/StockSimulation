# Secrets & Confidentiality

## Never commit

- `.env`, API keys, Mongo connection strings with credentials
- `credentials.json`, `*.pem`, `*.p8`, cloud service-account JSON
- Screenshots or logs that contain secrets

`.env.example` may list **variable names** only.

## Never paste into this repo from employer / lab systems

This is a hackathon team repo. Do **not** copy:

- Skye / Sginull Labs internal URLs, project IDs, Helm values, Terraform state
- Proprietary agent product specs, card taxonomies, or prompt corpora
- Internal runbooks, admin credentials, or customer/PII handling details
- Private monorepo paths, package names that identify employer internals

**Allowed:** paraphrased engineering _principles_ (Zod at edges, deterministic
simulation, CI quality gates, memory isolation patterns) rewritten in this
project's voice.

## Sharing keys with teammates

Use a password manager or out-of-band channel. If a key leaks into git history,
rotate it immediately — do not "fix" by deleting the file alone.
