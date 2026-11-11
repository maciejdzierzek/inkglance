#!/bin/sh
# Builds and installs the InkGlance menu-bar app on macOS.
#
#   sh scripts/tray-macos.sh install   # build, copy to ~/Applications, replace the background service, open
#   sh scripts/tray-macos.sh build     # build only
#   sh scripts/tray-macos.sh dev       # point the app at this checkout instead of its bundled copy
#                                       (macOS will ask for access if the checkout is in a protected
#                                       folder such as Documents, Desktop or a cloud drive)
#
# The app owns the panel server (starts it, stops it on Quit), so the LaunchAgent
# service from `npm run service:install` is removed when the app is installed.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$REPO/tray/src-tauri/target/release/bundle/macos/InkGlance.app"
DEST="$HOME/Applications/InkGlance.app"
CONF_DIR="${INKGLANCE_CONFIG:+$(dirname "$INKGLANCE_CONFIG")}"
CONF_DIR="${CONF_DIR:-$HOME/.config/inkglance}"

build() {
	command -v cargo > /dev/null 2>&1 || { echo "Rust is needed to build the app: https://rustup.rs"; exit 1; }
	(cd "$REPO/tray" && npm install --no-audit --no-fund > /dev/null && npx tauri build --bundles app)
}

case "${1:-install}" in
	build) build ;;
	dev)
		mkdir -p "$CONF_DIR"
		printf '{ "serverDir": "%s" }\n' "$REPO" > "$CONF_DIR/tray.json"
		echo "The app will run the server from $REPO"
		;;
	install)
		build
		sh "$REPO/scripts/service-macos.sh" uninstall > /dev/null 2>&1 || true
		pkill -f 'InkGlance.app/Contents/MacOS/inkglance-tray' > /dev/null 2>&1 || true
		# A killed app leaves its server running on the port: stop it too, or the
		# new app finds the port taken and the old code keeps serving.
		pkill -f 'InkGlance.app/Contents/Resources/server/src/server.js' > /dev/null 2>&1 || true
		sleep 1
		mkdir -p "$HOME/Applications"
		rm -rf "$DEST"
		cp -R "$APP" "$DEST"
		open "$DEST"
		echo "Installed: $DEST (look for the eye icon in the menu bar)"
		;;
	*) echo "usage: $0 install|build|dev"; exit 2 ;;
esac
