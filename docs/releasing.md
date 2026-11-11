# Releasing InkGlance

1. **Version** - bump `version` in `package.json`, `tray/package.json`,
   `tray/src-tauri/Cargo.toml`, `tray/src-tauri/tauri.conf.json` and
   `.claude-plugin/plugin.json` (they must match). Move the `Unreleased` notes in
   `CHANGELOG.md` under the new version.
2. **Tag** - `git tag vX.Y.Z && git push --tags`. CI (`.github/workflows/ci.yml`)
   runs the tests on macOS, Windows and Linux and builds the menu-bar app for
   macOS (`.dmg`) and Windows (`.exe` installer).
3. **GitHub release** - create it from the tag with the changelog notes and the
   CI artifacts. The panel's update check reads the latest release
   (`/repos/<owner>/<repo>/releases/latest`); drafts and pre-releases are ignored.

## One-click app updates (Tauri updater) - not set up yet

- Generate a signing key once: `npx tauri signer generate -w ~/.tauri/inkglance.key`
  (keep the private key and its password out of the repository; store them as
  the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  repository secrets).
- Add `tauri-plugin-updater`, put the public key and the endpoint
  `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` in
  `tauri.conf.json` (`plugins.updater`), set `bundle.createUpdaterArtifacts: true`,
  and let CI upload `latest.json` with the signed bundles.
- Point the tray's update menu item at the updater instead of the release page.

## Code signing

- **macOS**: without a Developer ID certificate and notarization, Gatekeeper warns
  on first launch (right-click -> Open). Signing needs an Apple Developer account.
- **Windows**: unsigned installers trigger a SmartScreen warning until the app
  builds reputation; a code-signing certificate removes it.

## Plugin

The Claude Code plugin is the repository itself (`.claude-plugin/`). Users get
new versions with `/plugin update inkglance`. Validate before a release:
`claude plugin validate .`

## Third-party notices (before the first release)

The menu-bar app bundles Tauri and other Rust crates (MIT / Apache-2.0), whose
licenses require their notices to travel with binaries. Generate them with
[cargo-about](https://github.com/EmbarkStudios/cargo-about) (or `cargo license`)
from `tray/src-tauri`, add the file to the app resources, and attach it to the
release. The Node server has no runtime dependencies.
