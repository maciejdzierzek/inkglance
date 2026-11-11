// Plan usage limits (5-hour and weekly) for claude.ai subscriptions.
//
// Sources, cheapest first ("auto" picks the freshest local one, the API last):
//   extension  - the "Claude Code Usage" VS Code extension (MIT) stores the quota
//                observations it fetches; reading its file costs no network call.
//   statusline - snapshots written by src/statusline.js. Claude Code passes
//                rate limits to status line commands; terminal sessions only.
//   api        - the claude.ai OAuth usage endpoint, with the token Claude Code
//                stores in the macOS Keychain (or ~/.claude/.credentials.json).
//                Undocumented and strictly rate limited, so it is called rarely,
//                honors Retry-After, and never refreshes or writes credentials.
//
// The token is only ever sent to api.anthropic.com and never logged.

import { execFile } from 'node:child_process';
import { readFile, readdir, stat, unlink } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { SNAPSHOT_DIR } from './statusline-dir.js';

export const USAGE_SOURCES = ['auto', 'extension', 'statusline', 'api', 'off'];
const FIVE_HOURS = 5 * 3600 * 1000;
const SEVEN_DAYS = 7 * 86400 * 1000;
const LOCAL_STALE_MS = 30 * 60 * 1000; // older local data -> let "auto" try the API
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export function extensionFile(home = homedir()) {
	const base =
		platform === 'darwin'
			? join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage')
			: platform === 'win32'
				? join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage')
				: join(home, '.config', 'Code', 'User', 'globalStorage');
	return join(base, 'growthjack.claude-code-usage', 'quota-observations-v2.json');
}

// Epoch milliseconds from seconds, milliseconds or an ISO string.
export function toMs(value) {
	if (value == null || value === '') return null;
	if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
	const t = Date.parse(value);
	return Number.isNaN(t) ? null : t;
}

const windowOf = (used, resetAt) => (typeof used === 'number' ? { used, resetAt: toMs(resetAt) } : null);

// --- extension ----------------------------------------------------------------
export function parseExtension(json) {
	const latest = {};
	for (const o of json?.observations || []) {
		if (o.provider !== 'claude' || typeof o.usedFraction !== 'number') continue;
		const cur = latest[o.periodType];
		if (!cur || o.observedAt > cur.observedAt) latest[o.periodType] = o;
	}
	const five = latest['five-hour'];
	const week = latest['seven-day'];
	if (!five && !week) return null;
	return {
		source: 'extension',
		observedAt: Math.max(five?.observedAt || 0, week?.observedAt || 0),
		fiveHour: five ? windowOf(five.usedFraction, five.resetAt) : null,
		sevenDay: week ? windowOf(week.usedFraction, week.resetAt) : null,
	};
}

let extCache = { mtime: 0, value: null, raw: null };
async function fromExtension() {
	const file = extensionFile();
	const s = await stat(file).catch(() => null);
	if (!s) return null;
	if (s.mtimeMs !== extCache.mtime) {
		const raw = JSON.parse(await readFile(file, 'utf8'));
		extCache = { mtime: s.mtimeMs, value: parseExtension(raw), raw };
	}
	return extCache.value;
}

// The extension's full observation history (for charts), or null.
export async function extensionHistory() {
	return (await fromExtension().catch(() => null)) ? extCache.raw : null;
}

// --- statusline ---------------------------------------------------------------
export function parseStatusline(snapshot) {
	const r = snapshot?.rate_limits;
	if (!r) return null;
	const pct = (w) => (typeof w?.used_percentage === 'number' ? windowOf(w.used_percentage / 100, w.resets_at) : null);
	return { source: 'statusline', observedAt: snapshot.receivedAt || 0, fiveHour: pct(r.five_hour), sevenDay: pct(r.seven_day) };
}

// Snapshots older than this are deleted (one file per session ever seen).
const SNAPSHOT_KEEP_MS = 7 * 24 * 3600 * 1000;

async function fromStatusline() {
	const names = (await readdir(SNAPSHOT_DIR).catch(() => [])).filter((n) => n.endsWith('.json'));
	const now = Date.now();
	const fresh = [];
	for (const name of names) {
		const path = join(SNAPSHOT_DIR, name);
		const s = await stat(path).catch(() => null);
		if (!s) continue;
		if (now - s.mtimeMs > SNAPSHOT_KEEP_MS) await unlink(path).catch(() => {});
		else fresh.push({ name, mtime: s.mtimeMs });
	}
	// The newest few are enough: limits are per account, any session reports them.
	fresh.sort((a, b) => b.mtime - a.mtime);
	let best = null;
	for (const { name } of fresh.slice(0, 5)) {
		try {
			const parsed = parseStatusline(JSON.parse(await readFile(join(SNAPSHOT_DIR, name), 'utf8')));
			if (parsed && (!best || parsed.observedAt > best.observedAt)) best = parsed;
		} catch {
			// half-written or foreign file
		}
	}
	return best;
}

// --- api ------------------------------------------------------------------------
function readToken() {
	return new Promise((resolve) => {
		const parse = (text) => {
			try {
				const c = JSON.parse(text).claudeAiOauth;
				resolve(c?.accessToken ? { token: c.accessToken, expiresAt: c.expiresAt || 0 } : null);
			} catch {
				resolve(null);
			}
		};
		if (platform === 'darwin') {
			execFile(
				'security',
				['find-generic-password', '-s', 'Claude Code-credentials', '-a', userInfo().username, '-w'],
				{ timeout: 5000 },
				(err, out) => (err ? resolve(null) : parse(out.trim())),
			);
		} else {
			readFile(join(homedir(), '.claude', '.credentials.json'), 'utf8').then(parse, () => resolve(null));
		}
	});
}

export function parseApi(json, now) {
	const w = (x) => (x && typeof x.utilization === 'number' ? windowOf(x.utilization / 100, x.resets_at) : null);
	return { source: 'api', observedAt: now, fiveHour: w(json?.five_hour), sevenDay: w(json?.seven_day) };
}

let api = { value: null, lastTry: 0, blockedUntil: 0, error: '' };
async function fromApi(minutes, now) {
	if (now < api.blockedUntil || now - api.lastTry < minutes * 60 * 1000) return api.value;
	api.lastTry = now;
	const cred = await readToken();
	if (!cred) {
		api.error = 'no Claude Code login found';
		return api.value;
	}
	// Claude Code refreshes its own token when it next talks to the API; we never do.
	if (cred.expiresAt && cred.expiresAt < now) {
		api.error = 'login token expired - it renews when a Claude Code session is used';
		return api.value;
	}
	try {
		const res = await fetch(USAGE_URL, {
			headers: { Authorization: `Bearer ${cred.token}`, 'anthropic-beta': 'oauth-2025-04-20' },
			signal: AbortSignal.timeout(10000),
		});
		if (res.status === 429) {
			const wait = Number(res.headers.get('retry-after')) || 3600;
			api.blockedUntil = now + wait * 1000;
			api.error = `rate limited for ${Math.round(wait / 60)} min`;
			console.log(new Date(now).toISOString().slice(11, 19), 'USAGE api', api.error);
			return api.value;
		}
		if (!res.ok) {
			api.error = `HTTP ${res.status}`;
			return api.value;
		}
		api.value = parseApi(await res.json(), now);
		api.error = '';
	} catch (err) {
		api.error = err.name === 'TimeoutError' ? 'timeout' : err.message;
	}
	return api.value;
}

// --- public -----------------------------------------------------------------------
export async function getUsage({ usageSource, usageApiMinutes }, now = Date.now()) {
	if (usageSource === 'off') return null;
	const safe = (p) => p.catch(() => null);
	if (usageSource === 'extension') return safe(fromExtension());
	if (usageSource === 'statusline') return safe(fromStatusline());
	if (usageSource === 'api') return (await safe(fromApi(usageApiMinutes, now))) || errorResult();
	// auto: freshest local source; the API only when nothing local is recent.
	const local = [await safe(fromExtension()), await safe(fromStatusline())].filter(Boolean);
	local.sort((a, b) => b.observedAt - a.observedAt);
	if (local[0] && now - local[0].observedAt < LOCAL_STALE_MS) return local[0];
	return (await safe(fromApi(usageApiMinutes, now))) || local[0] || errorResult();
}

function errorResult() {
	return api.error ? { source: 'api', error: api.error } : null;
}

// Linear forecast from the start of the window: where usage will be at reset,
// and when it would reach 100% at the current pace. Null early in the window,
// when the pace is not meaningful yet.
export function forecast(win, periodMs, now = Date.now()) {
	if (!win || !win.resetAt || win.used <= 0) return null;
	const start = win.resetAt - periodMs;
	const elapsed = now - start;
	if (elapsed < periodMs * 0.15 || elapsed <= 0) return null;
	const atReset = win.used * (periodMs / elapsed);
	const fullAt = win.used >= 1 ? now : start + elapsed / win.used;
	return { atReset, fullAt: fullAt < win.resetAt ? fullAt : null };
}

export const PERIODS = { fiveHour: FIVE_HOURS, sevenDay: SEVEN_DAYS };
