// Update checks: once a day, the latest GitHub release is compared with this
// version. How an update is installed depends on how InkGlance was installed:
//
//   app      the menu-bar app (server bundled inside it): download the new app
//            (Tauri's signed updater once release signing is set up)
//   git      a git checkout: `git pull --ff-only`, then restart the panel
//   plugin   Claude Code plugin: `/plugin update inkglance` (Claude Code's job)
//
// The check sends one anonymous request to the GitHub API (no identifiers) and can
// be switched off (`updateCheck: false`).

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DAY = 24 * 3600 * 1000;
export const DEFAULT_REPO = 'maciejdzierzek/inkglance';

export const currentVersion = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

export function installMethod(root = ROOT, env = process.env) {
	if (env.INKGLANCE_INSTALL) return env.INKGLANCE_INSTALL;
	if (/\.app[/\\]Contents[/\\]Resources[/\\]server/.test(root) || /[/\\]resources[/\\]server[/\\]?$/i.test(root)) return 'app';
	if (/[/\\]\.claude[/\\]plugins[/\\]/.test(root)) return 'plugin';
	if (existsSync(join(root, '.git'))) return 'git';
	return 'manual';
}

// "v1.2.3" / "1.2.3-beta" -> [1, 2, 3]; null when not a version.
export function parseVersion(v) {
	const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
	return m ? m.slice(1).map(Number) : null;
}

export function isNewer(latest, current) {
	const a = parseVersion(latest);
	const b = parseVersion(current);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
	return false;
}

export function fromRelease(json) {
	if (!json || json.draft || json.prerelease || !json.tag_name) return null;
	const notes = String(json.body || '')
		.split(/\r?\n/)
		.map((l) => l.replace(/^[-*#\s]+/, '').trim())
		.filter(Boolean)
		.slice(0, 6);
	return { version: json.tag_name.replace(/^v/, ''), url: json.html_url, publishedAt: json.published_at, notes };
}

export function createUpdates({ getConfig, log, fetchImpl = fetch, now = () => Date.now() }) {
	let state = { checkedAt: 0, latest: null, error: '' };

	async function check({ force = false } = {}) {
		const c = getConfig();
		if (!c.updateCheck && !force) return status();
		if (!force && now() - state.checkedAt < DAY) return status();
		state.checkedAt = now();
		const url = process.env.INKGLANCE_UPDATE_URL || `https://api.github.com/repos/${c.updateRepo || DEFAULT_REPO}/releases/latest`;
		try {
			const res = await fetchImpl(url, {
				headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'InkGlance' },
				signal: AbortSignal.timeout(10000),
			});
			if (res.status === 404) {
				state = { ...state, latest: null, error: '' }; // no releases yet
			} else if (!res.ok) {
				state = { ...state, error: `HTTP ${res.status}` };
			} else {
				state = { ...state, latest: fromRelease(await res.json()), error: '' };
			}
		} catch (err) {
			state = { ...state, error: err.name === 'TimeoutError' ? 'timeout' : err.message };
		}
		const s = status();
		if (s.available) log('UPDATE', `${s.current} -> ${s.latest.version}`);
		return s;
	}

	function status() {
		const current = currentVersion();
		return {
			current,
			method: installMethod(),
			checkedAt: state.checkedAt,
			latest: state.latest,
			available: !!state.latest && isNewer(state.latest.version, current),
			error: state.error,
		};
	}

	// git checkouts only: fast-forward to the latest commit on the tracked branch.
	function installGit() {
		return new Promise((resolve) => {
			if (installMethod() !== 'git') return resolve({ ok: false, message: 'not a git checkout' });
			execFile('git', ['-C', ROOT, 'pull', '--ff-only'], { timeout: 120000 }, (err, out, errOut) => {
				resolve(err ? { ok: false, message: (errOut || err.message).trim() } : { ok: true, message: out.trim() });
			});
		});
	}

	return {
		check,
		status,
		installGit,
		start() {
			const run = () => check().catch(() => {});
			setTimeout(run, 30 * 1000); // after startup, then daily
			return setInterval(run, 6 * 3600 * 1000);
		},
	};
}
