#!/bin/sh
# Quality gates for the public repository: private data, secrets, lint, tests.
set -e
cd "$(dirname "$0")/.."

echo "== private data"
sh scripts/guard-private-data.sh --tracked

echo "== secrets"
if command -v gitleaks > /dev/null 2>&1; then
	gitleaks dir . --config .gitleaks.toml --redact --no-banner
else
	echo "gitleaks not installed - skipped (brew install gitleaks)"
fi

echo "== lint (ESLint, Knip: unused files and exports)"
if [ -d node_modules ]; then npx --no-install eslint . && npx --no-install knip; else echo "dev tools not installed - skipped (npm install)"; fi

echo "== shell scripts"
if command -v shellcheck > /dev/null 2>&1; then
	shellcheck -s sh src/hook.sh scripts/*.sh .githooks/*
else
	echo "shellcheck not installed - skipped (brew install shellcheck)"
fi

echo "== tests"
node --test

echo "All checks passed."
