.PHONY: setup check precommit install fmt

# Prefer repo-local / global pnpm; avoid bare `npx pnpm` on every hook (slow download).
PNPM ?= $(shell \
	if [ -x node_modules/.bin/pnpm ]; then echo node_modules/.bin/pnpm; \
	elif command -v pnpm >/dev/null 2>&1; then command -v pnpm; \
	else echo "npx --yes pnpm@9.15.0"; fi)

setup:
	git config core.hooksPath .githooks
	$(PNPM) install

install:
	$(PNPM) install --frozen-lockfile

# Local/CI full suite (still short — no prettier over the whole docs tree).
check:
	$(PNPM) check

# Pre-commit only: must stay under ~30s once deps are installed.
precommit:
	$(PNPM) precommit

fmt:
	$(PNPM) format
