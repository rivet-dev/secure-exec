set positional-arguments := true

dev-shell *args:
	#!/usr/bin/env bash
	set -euo pipefail
	pnpm --filter @secure-exec/dev-shell dev-shell -- "$@"

dev-docs:
	cd docs && npx mintlify dev

dev-website:
	pnpm --filter @secure-exec/website dev

build-website:
	pnpm --filter @secure-exec/website build

release *args:
	npx tsx scripts/release.ts {{args}}
