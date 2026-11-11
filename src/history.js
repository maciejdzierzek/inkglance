// History of plan-limit readings, for the charts.
//
// With the Claude Code Usage extension the history is already in its file
// (months of observations). Without it, the panel records every new reading it
// gets (status line or claude.ai) in ~/.config/inkglance/usage-history.json.
//
// Usage inside one window never goes down, so series are made monotonic with a
// running maximum: that also removes the odd glitch reading (a 0 in mid-window).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configPath } from './config.js';
import { toMs, PERIODS } from './usage.js';

const HOUR = 3600 * 1000;
const KEEP_MS = 200 * 86400 * 1000;
const MAX_POINTS = 6000;

// Window id: the reset time rounded to the hour (readings differ by milliseconds).
const windowId = (resetAt) => (resetAt ? Math.round(resetAt / HOUR) : null);

export function fromExtension(json) {
	const out = { fiveHour: [], sevenDay: [] };
	for (const o of json?.observations || []) {
		if (o.provider !== 'claude' || typeof o.usedFraction !== 'number' || !o.resetAt) continue;
		if ((o.flags || []).includes('account-ambiguous')) continue;
		const key = o.periodType === 'five-hour' ? 'fiveHour' : o.periodType === 'seven-day' ? 'sevenDay' : null;
		if (key) out[key].push({ t: o.observedAt, v: o.usedFraction, w: windowId(o.resetAt), resetAt: o.resetAt });
	}
	out.fiveHour.sort((a, b) => a.t - b.t);
	out.sevenDay.sort((a, b) => a.t - b.t);
	return out;
}

// Running maximum per window.
export function monotonic(points) {
	const best = new Map();
	return points.map((p) => {
		const v = Math.max(best.get(p.w) ?? 0, p.v);
		best.set(p.w, v);
		return { ...p, v };
	});
}

// --- own store (sources without history) -----------------------------------------
const storeFile = () => join(dirname(configPath()), 'usage-history.json');
let store = null;

function loadStore() {
	if (store) return store;
	try {
		store = JSON.parse(readFileSync(storeFile(), 'utf8'));
	} catch {
		store = { fiveHour: [], sevenDay: [] };
	}
	return store;
}

export function record(usage) {
	if (!usage || usage.error || usage.source === 'extension' || !usage.observedAt) return;
	const s = loadStore();
	let changed = false;
	for (const key of ['fiveHour', 'sevenDay']) {
		const w = usage[key];
		if (!w) continue;
		const last = s[key][s[key].length - 1];
		if (last && last.t >= usage.observedAt) continue;
		s[key].push({ t: usage.observedAt, v: w.used, w: windowId(w.resetAt), resetAt: w.resetAt });
		const cutoff = usage.observedAt - KEEP_MS;
		s[key] = s[key].filter((p) => p.t >= cutoff).slice(-MAX_POINTS);
		changed = true;
	}
	if (changed) {
		try {
			writeFileSync(storeFile(), JSON.stringify(s), { mode: 0o600 });
		} catch {
			// history is a nice-to-have
		}
	}
}

export function ownHistory() {
	const s = loadStore();
	return { fiveHour: [...s.fiveHour], sevenDay: [...s.sevenDay] };
}

// --- chart data -------------------------------------------------------------------
// Everything the limits screen draws, from a history and the current reading.
export function chartData(history, usage, now = Date.now()) {
	const five = monotonic(history.fiveHour);
	const week = monotonic(history.sevenDay);
	const currentWeek = usage?.sevenDay?.resetAt ? windowId(usage.sevenDay.resetAt) : week.at(-1)?.w;
	const weekReset = usage?.sevenDay?.resetAt || (currentWeek ? currentWeek * HOUR : null);

	const thisWeek = week.filter((p) => p.w === currentWeek);
	if (usage?.sevenDay && weekReset) thisWeek.push({ t: now, v: Math.max(thisWeek.at(-1)?.v ?? 0, usage.sevenDay.used) });

	const dayFrom = now - 24 * HOUR;
	const lastDay = five.filter((p) => p.t >= dayFrom);
	if (usage?.fiveHour && !(usage.fiveHour.resetAt <= now)) lastDay.push({ t: now, v: usage.fiveHour.used, w: windowId(usage.fiveHour.resetAt) });

	const peaks = new Map();
	for (const p of week) peaks.set(p.w, Math.max(peaks.get(p.w) ?? 0, p.v));
	if (usage?.sevenDay && currentWeek) peaks.set(currentWeek, Math.max(peaks.get(currentWeek) ?? 0, usage.sevenDay.used));
	const weeks = [...peaks.entries()]
		.sort((a, b) => a[0] - b[0])
		.slice(-8)
		.map(([w, v]) => ({ resetAt: w * HOUR, v, current: w === currentWeek }));

	return {
		week: weekReset ? { from: weekReset - PERIODS.sevenDay, to: weekReset, points: thisWeek } : null,
		day: { from: dayFrom, to: now, points: lastDay },
		weeks,
	};
}

export function historyFor(usageSourceJson) {
	return usageSourceJson ? fromExtension(usageSourceJson) : ownHistory();
}

export { toMs };
