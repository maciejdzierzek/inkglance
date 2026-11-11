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

test('watcher reports entering "waiting" and each new turn end, not the first look', () => {
	const s = (id, group, turnEndedAt = 0) => ({ id, group, turnEndedAt });
	const was = (group, turnEndedAt = 0) => ({ group, turnEndedAt });
	assert.deepEqual(diff(null, [s('a', 'needsYou')]), []);
	const prev = new Map([['a', was('working')], ['b', was('working')], ['c', was('needsYou')], ['e', was('finished', 100)], ['f', was('finished', 100)]]);
	const events = diff(prev, [s('a', 'needsYou'), s('b', 'finished', 50), s('c', 'needsYou'), s('d', 'needsYou'), s('e', 'finished', 100), s('f', 'finished', 200), s('g', 'finished', 300)]);
	// e: same turn as before; g: new to us - both silent. f: finished again between two polls.
	assert.deepEqual(events.map((e) => `${e.kind}:${e.session.id}`), ['needsYou:a', 'finished:b', 'needsYou:d', 'finished:f']);
});

test('alerts: one sound per batch, respect kinds and quiet hours', () => {
	const calls = [];
	const sound = () => calls.push('sound');
	const base = { alertOn: ['needsYou'], macSound: true, macSoundName: 'Glass', macNotification: false, quietHours: 'off' };
	const ev = (kind) => ({ kind, session: { id: 'x', project: 'p' } });
	let config = base;
	const alerts = createAlerts({ getConfig: () => config, label: (k) => k, log: () => {}, sound, notify: () => calls.push('notify'), now: () => at(12) });
	alerts([ev('needsYou'), ev('needsYou'), ev('finished')]);
	assert.deepEqual(calls, ['sound']);
	calls.length = 0;
	alerts([ev('finished')]);
	assert.deepEqual(calls, []);
	config = { ...base, quietHours: '11-13' };
	alerts([ev('needsYou')]);
	assert.deepEqual(calls, []);
});
