.PHONY: setup check install fmt

# Prefer a global pnpm; fall back to the pinned version via npx.
PNPM ?= $(shell command -v pnpm 2>/dev/null || echo "npx --yes pnpm@9.15.0")

setup:
	git config core.hooksPath .githooks
	$(PNPM) install

install:
	$(PNPM) install --frozen-lockfile

check:
	$(PNPM) check

fmt:
	$(PNPM) format
