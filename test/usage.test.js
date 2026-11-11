import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExtension, parseStatusline, parseApi, forecast, toMs, PERIODS } from '../src/usage.js';

test('extension file: latest Claude observation per window', () => {
	const r = parseExtension({
		observations: [
			{ provider: 'claude', periodType: 'five-hour', usedFraction: 0.2, observedAt: 1, resetAt: 100 },
			{ provider: 'claude', periodType: 'five-hour', usedFraction: 0.45, observedAt: 5, resetAt: 200 },
			{ provider: 'claude', periodType: 'seven-day', usedFraction: 0.7, observedAt: 5, resetAt: 900 },
			{ provider: 'codex', periodType: 'five-hour', usedFraction: 0.9, observedAt: 9, resetAt: 1 },
		],
	});
	assert.equal(r.fiveHour.used, 0.45);
	assert.equal(r.sevenDay.used, 0.7);
	assert.equal(r.observedAt, 5);
});

test('statusline and api shapes', () => {
	const s = parseStatusline({ receivedAt: 7, rate_limits: { five_hour: { used_percentage: 30, resets_at: 1800000000 } } });
	assert.equal(s.fiveHour.used, 0.3);
	assert.equal(s.fiveHour.resetAt, 1800000000000);
	const a = parseApi({ five_hour: { utilization: 45, resets_at: '2026-11-11T21:00:00Z' }, seven_day: { utilization: 70 } }, 9);
	assert.equal(a.fiveHour.used, 0.45);
	assert.equal(a.sevenDay.used, 0.7);
	assert.equal(toMs('2026-11-11T21:00:00Z'), Date.parse('2026-11-11T21:00:00Z'));
});

test('forecast: none early, at-reset projection, run-out time', () => {
	const P = PERIODS.fiveHour;
	const now = 1_000_000_000_000;
	assert.equal(forecast({ used: 0.1, resetAt: now + P * 0.95 }, P, now), null);
	const half = forecast({ used: 0.25, resetAt: now + P / 2 }, P, now);
	assert.equal(Math.round(half.atReset * 100), 50);
	assert.equal(half.fullAt, null);
	const hot = forecast({ used: 0.8, resetAt: now + P / 2 }, P, now);
	assert.ok(hot.fullAt > now && hot.fullAt < now + P / 2);
});
