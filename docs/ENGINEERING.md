# Engineering Practices (Hackathon-Sized)

This repo borrows **structure and principles** from a personal TypeScript agent
infra playbook, paraphrased for this project. It does **not** contain employer
code, proprietary agent specs, or lab secrets.

## What we adopted

| Practice                 | How it shows up here                                       |
| ------------------------ | ---------------------------------------------------------- |
| Repo constitution for AI | `CLAUDE.md` + `.claude/rules/` (team-visible, versioned)   |
| Same hooks local + CI    | `make check` via `.githooks/pre-commit` and GitHub Actions |
| One package manager      | pnpm only (`packageManager` + CI)                          |
| Typed contracts at edges | Zod for agent I/O and (later) HTTP                         |
| Clear layer boundaries   | simulation ≠ agents ≠ memory ≠ evaluation                  |
| Fast, canceling CI       | concurrency + timeout on the `ci` workflow                 |
| Secrets out of git       | `.gitignore`, `.env.example`, `secrets.md`                 |

## What we deliberately skipped (for now)

Hackathon scope — add only when pain appears:

- Terraform / Helm / multi-service Docker deploy model
- Multi-provider LLM failover tiers
- Admin panel + audited manual job triggers
- Full monorepo package graph (start as one package)
- Background job platform complexity beyond experiment runners

## When you add a rule

Pair it with a gate (`make check`, test, or review checklist). A rule without
enforcement is a wish.

## Meta

When the team corrects “how we work,” update `.claude/rules/` or this doc in the
same PR. Personal assistant memory is invisible to teammates.
