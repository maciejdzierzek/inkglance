#!/bin/sh
# Blocks private data from entering the public repository.
#
#   sh scripts/guard-private-data.sh --staged   # pre-commit: files being committed
#   sh scripts/guard-private-data.sh --tracked  # check.sh: every tracked file
#
# What it blocks, and why:
#   1. Private workspace files (assistant config, internal notes, plans).
#   2. Personal configuration (holds the access token and personal preferences).
#   3. Absolute home-directory or cloud-drive paths in file contents - they leak
#      usernames and folder layout, and never belong in portable code.

set -e

MODE="${1:---staged}"
case "$MODE" in
	--staged) FILES=$(git diff --cached --name-only --diff-filter=ACMR) ;;
	--tracked) FILES=$(git ls-files) ;;
	*) echo "usage: $0 --staged|--tracked"; exit 2 ;;
esac

[ -z "$FILES" ] && exit 0

FAIL=0

PRIVATE=$(echo "$FILES" | grep -E '(^|/)(CLAUDE\.md|AGENTS\.md|TABLICA\.md|config(\.local)?\.json)$|(^|/)(PREP|\.claude|temp)/' || true)
if [ -n "$PRIVATE" ]; then
	echo "BLOCKED: private workspace or personal configuration files:"
	echo "$PRIVATE" | sed 's/^/  /'
	FAIL=1
fi

# Content check. This script and the hooks are excluded, because they must name
# the patterns they look for.
for F in $FILES; do
	case "$F" in
		scripts/guard-private-data.sh|.githooks/*) continue ;;
	esac
	[ -f "$F" ] || continue
	if [ "$MODE" = "--staged" ]; then
		CONTENT=$(git show ":$F" 2>/dev/null || true)
	else
		CONTENT=$(cat "$F")
	fi
	if echo "$CONTENT" | grep -Eq '/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|C:\\Users\\|OneDrive|CloudStorage'; then
		echo "BLOCKED: absolute home path or cloud-drive path in $F"
		FAIL=1
	fi
done

if [ "$FAIL" -ne 0 ]; then
	echo ""
	echo "Remove these from the commit (git rm --cached <file>) or fix the content."
	exit 1
fi
exit 0
