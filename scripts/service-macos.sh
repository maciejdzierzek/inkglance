#!/bin/sh
# Runs the panel as a macOS background service (LaunchAgent): starts at login,
# restarts if it stops, keeps running when no terminal is open.
#
#   sh scripts/service-macos.sh install     # install or update, then start
#   sh scripts/service-macos.sh uninstall   # stop and remove
#   sh scripts/service-macos.sh status      # is it running?
#   sh scripts/service-macos.sh logs        # follow the log
#
# The service uses the node and claude found in your current shell, so run
# "install" again after upgrading Node to a new path.

set -e

LABEL="io.github.inkglance.panel"
LEGACY_LABEL="io.github.inkai.panel" # before the rename
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/inkglance.log"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="gui/$(id -u)"

case "${1:-}" in
	install)
		NODE="$(command -v node || true)"
		CLAUDE="$(command -v claude || true)"
		[ -n "$NODE" ] || { echo "node not found in PATH"; exit 1; }
		[ -n "$CLAUDE" ] || echo "warning: claude not found in PATH - set \"claudeBin\" in the config file"
		SERVICE_PATH="$(dirname "$NODE")"
		[ -n "$CLAUDE" ] && SERVICE_PATH="$SERVICE_PATH:$(dirname "$CLAUDE")"
		SERVICE_PATH="$SERVICE_PATH:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
		mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
		touch "$LOG" && chmod 600 "$LOG"   # pairing codes are logged: owner only
		cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>$NODE</string>
		<string>$REPO/src/server.js</string>
	</array>
	<key>WorkingDirectory</key>
	<string>$REPO</string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>$SERVICE_PATH</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>ThrottleInterval</key>
	<integer>10</integer>
	<key>StandardOutPath</key>
	<string>$LOG</string>
	<key>StandardErrorPath</key>
	<string>$LOG</string>
</dict>
</plist>
PLIST
		# Remove the service installed under the old name, if any.
		launchctl bootout "$DOMAIN/$LEGACY_LABEL" 2> /dev/null || true
		rm -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
		launchctl bootout "$DOMAIN/$LABEL" 2> /dev/null || true
		# bootout returns before the old instance is gone; wait for it.
		i=0
		while launchctl print "$DOMAIN/$LABEL" > /dev/null 2>&1 && [ $i -lt 50 ]; do
			sleep 0.2
			i=$((i + 1))
		done
		launchctl bootstrap "$DOMAIN" "$PLIST"
		echo "Installed and started: $LABEL"
		echo "Log: $LOG"
		;;
	uninstall)
		launchctl bootout "$DOMAIN/$LABEL" 2> /dev/null || true
		rm -f "$PLIST"
		echo "Removed: $LABEL"
		;;
	status)
		if launchctl print "$DOMAIN/$LABEL" > /dev/null 2>&1; then
			launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|pid|last exit code)' | sed 's/^\s*/  /'
		else
			echo "not installed"
		fi
		;;
	logs)
		tail -n 50 -f "$LOG"
		;;
	*)
		echo "usage: $0 install|uninstall|status|logs"
		exit 2
		;;
esac
