import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromExtension, monotonic, chartData } from '../src/history.js';

const H = 3600 * 1000;

test('extension history: flagged readings dropped, windows by rounded reset', () => {
	const h = fromExtension({
		observations: [
			{ provider: 'claude', periodType: 'seven-day', usedFraction: 0.3, observedAt: 1, resetAt: 100 * H + 5 },
			{ provider: 'claude', periodType: 'seven-day', usedFraction: 0, observedAt: 2, resetAt: 100 * H, flags: ['account-ambiguous'] },
			{ provider: 'claude', periodType: 'five-hour', usedFraction: 0.1, observedAt: 3, resetAt: 50 * H },
		],
	});
	assert.equal(h.sevenDay.length, 1);
	assert.equal(h.sevenDay[0].w, 100);
	assert.equal(h.fiveHour.length, 1);
});

test('monotonic removes mid-window glitches, resets on a new window', () => {
	const m = monotonic([
		{ t: 1, v: 0.4, w: 1 },
		{ t: 2, v: 0, w: 1 },
		{ t: 3, v: 0.5, w: 1 },
		{ t: 4, v: 0.1, w: 2 },
	]);
	assert.deepEqual(m.map((p) => p.v), [0.4, 0.4, 0.5, 0.1]);
});

test('chart data: current week, last day, weekly peaks', () => {
	const now = 1000 * H;
	const week = (t, v, w) => ({ t, v, w, resetAt: w * H });
	const history = {
		sevenDay: [week(now - 200 * H, 0.6, 900), week(now - 10 * H, 0.2, 1100), week(now - 2 * H, 0.3, 1100)],
		fiveHour: [{ t: now - 30 * H, v: 0.9, w: 975 }, { t: now - H, v: 0.4, w: 1003 }],
	};
	const usage = { sevenDay: { used: 0.35, resetAt: 1100 * H }, fiveHour: { used: 0.45, resetAt: 1003 * H } };
	const c = chartData(history, usage, now);
	assert.equal(c.week.points.at(-1).v, 0.35);
	assert.equal(c.day.points.length, 2);
	assert.deepEqual(c.weeks.map((w) => [w.v, w.current]), [[0.6, false], [0.35, true]]);
});

test('activity buckets output tokens by hour, once per message', async () => {
	const { bucket } = await import('../src/activity.js');
	const st = { seen: new Map(), hours: new Map() };
	const msg = (id, out, ts) => ({ type: 'assistant', timestamp: ts, message: { id, usage: { output_tokens: out } } });
	bucket(st, msg('a', 10, '2026-11-11T10:05:00Z'));
	bucket(st, msg('a', 10, '2026-11-11T10:05:01Z'));
	bucket(st, msg('b', 5, '2026-11-11T10:59:00Z'));
	bucket(st, msg('c', 7, '2026-11-11T11:00:00Z'));
	assert.deepEqual([...st.hours.values()], [15, 7]);
});
