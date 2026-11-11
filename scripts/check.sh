#!/bin/sh
# Quality gates for the public repository: private data, secrets, tests.
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

echo "== tests"
node --test

echo "All checks passed."
