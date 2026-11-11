import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours, createAlerts } from '../src/alerts.js';
import { diff } from '../src/watcher.js';

const at = (h) => new Date(2026, 0, 1, h, 30);

test('quiet hours over midnight and within a day', () => {
	assert.equal(inQuietHours('22-7', at(23)), true);
	assert.equal(inQuietHours('22-7', at(3)), true);
	assert.equal(inQuietHours('22-7', at(12)), false);
	assert.equal(inQuietHours('off', at(23)), false);
});

test('watcher reports entering "waiting" and finishing a turn, not the first look', () => {
	const s = (id, group) => ({ id, group });
	assert.deepEqual(diff(null, [s('a', 'needsYou')]), []);
	const prev = new Map([['a', 'working'], ['b', 'working'], ['c', 'needsYou']]);
	const events = diff(prev, [s('a', 'needsYou'), s('b', 'idle'), s('c', 'needsYou'), s('d', 'needsYou')]);
	assert.deepEqual(events.map((e) => `${e.kind}:${e.session.id}`), ['needsYou:a', 'finished:b', 'needsYou:d']);
});

test('alerts: one sound per batch, respect kinds and quiet hours', () => {
	const calls = [];
	const run = (cmd) => calls.push(cmd);
	const base = { alertOn: ['needsYou'], macSound: true, macSoundName: 'Glass', macNotification: false, quietHours: 'off' };
	const ev = (kind) => ({ kind, session: { id: 'x', project: 'p' } });
	let config = base;
	const alerts = createAlerts({ getConfig: () => config, label: (k) => k, log: () => {}, run, now: () => at(12) });
	alerts([ev('needsYou'), ev('needsYou'), ev('finished')]);
	if (process.platform === 'darwin') assert.deepEqual(calls, ['afplay']);
	calls.length = 0;
	alerts([ev('finished')]);
	assert.deepEqual(calls, []);
	config = { ...base, quietHours: '11-13' };
	alerts([ev('needsYou')]);
	assert.deepEqual(calls, []);
});
