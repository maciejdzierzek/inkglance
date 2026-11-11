#!/bin/sh
# Claude Code hooks for the InkGlance panel. Installed by `npm run hooks:install`.
#
#   hook.sh permission  PermissionRequest: wait for Allow / Deny from the reader.
#   hook.sh stop        Stop (asyncRewake, background): wait for a reply from the
#                       reader; exit 2 with the text, which wakes Claude with it.
#   hook.sh prompt      UserPromptSubmit: the user typed, so an open reply slot
#                       for this session closes. Prints nothing.
#
# A shell script with curl on purpose: a Stop hook may wait for hours in every
# session, and curl needs a few MB where Node needs tens.
#
# Fails open, fast: panel not running, no hook.env, any error - exit 0 silently,
# and Claude Code behaves as if there were no hook. It decides nothing itself.

EVENT="${1:-permission}"
ENV_FILE="${INKGLANCE_HOOK_ENV:-$HOME/.config/inkglance/hook.env}"
[ -r "$ENV_FILE" ] || exit 0
. "$ENV_FILE"
[ -n "$INKGLANCE_PORT" ] && [ -n "$INKGLANCE_TOKEN" ] || exit 0

case "$EVENT" in
	permission) MAX=900 ;;
	stop) MAX=86400 ;;
	prompt) MAX=3 ;;
	*) exit 0 ;;
esac

OUT=$(curl -s -f -m "$MAX" -X POST \
	-H "X-InkGlance-Token: $INKGLANCE_TOKEN" -H "Content-Type: application/json" \
	--data-binary @- "http://127.0.0.1:$INKGLANCE_PORT/hook/$EVENT") || exit 0
[ -n "$OUT" ] || exit 0

case "$EVENT" in
	permission) printf '%s' "$OUT"; exit 0 ;;   # JSON decision for Claude Code
	stop) printf '%s' "$OUT" >&2; exit 2 ;;     # asyncRewake: stderr wakes Claude
esac
exit 0
