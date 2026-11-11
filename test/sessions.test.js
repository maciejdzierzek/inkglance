import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { classify, groupSessions, transcriptPath, dismiss } from '../src/sessions.js';

test('classify maps documented fields to groups', () => {
	assert.equal(classify({ status: 'waiting' }), 'needsYou');
	assert.equal(classify({ status: 'idle', waitingFor: 'permission prompt' }), 'needsYou');
	assert.equal(classify({ status: 'busy' }), 'working');
	assert.equal(classify({ status: 'idle' }), 'idle');
});

test('old idle sessions are collapsed', () => {
	const now = 10 * 86400 * 1000;
	const s = (id, group, ageHours) => ({ id, group, lastActivity: now - ageHours * 3600 * 1000 });
	const g = groupSessions([s('a', 'idle', 1), s('b', 'idle', 48), s('c', 'working', 0)], { hideIdleAfterHours: 24 }, now);
	assert.deepEqual(g.idle.map((x) => x.id), ['a']);
	assert.deepEqual(g.stale.map((x) => x.id), ['b']);
	assert.deepEqual(g.working.map((x) => x.id), ['c']);
});

test('transcript path follows the documented folder rule', () => {
	// join() uses the platform's separator (backslashes on Windows).
	assert.equal(transcriptPath('/srv/my.app', 'abc', '/h'), join('/h', '.claude', 'projects', '-srv-my-app', 'abc.jsonl'));
	assert.equal(transcriptPath('C:\\work\\my app', 'abc', '/h'), join('/h', '.claude', 'projects', 'C--work-my-app', 'abc.jsonl'));
});

test('an idle session whose turn ended recently is "finished" until dismissed or too old', () => {
	const now = 100 * 3600 * 1000;
	const cfg = { finishedHours: 4 };
	const ended = (hoursAgo) => ({ turnEndedAt: now - hoursAgo * 3600 * 1000 });
	assert.equal(classify({ sessionId: 'x', status: 'idle' }, ended(1), cfg, now), 'finished');
	assert.equal(classify({ sessionId: 'x', status: 'idle' }, ended(5), cfg, now), 'idle');
	assert.equal(classify({ sessionId: 'x', status: 'idle' }, { turnEndedAt: 0 }, cfg, now), 'idle');
	assert.equal(classify({ sessionId: 'x', status: 'busy' }, ended(1), cfg, now), 'working');
	assert.equal(classify({ sessionId: 'x', status: 'idle' }, ended(1), { finishedHours: 0 }, now), 'idle');
	dismiss('x', now - 3600 * 1000);
	assert.equal(classify({ sessionId: 'x', status: 'idle' }, ended(1), cfg, now), 'idle');
	// The next turn end shows it again.
	assert.equal(classify({ sessionId: 'x', status: 'idle' }, ended(0.5), cfg, now), 'finished');
});

test('finished sessions: most recent turn end first', () => {
	const g = groupSessions([{ id: 'a', group: 'finished', turnEndedAt: 1 }, { id: 'b', group: 'finished', turnEndedAt: 2 }], { hideIdleAfterHours: 24 }, 10);
	assert.deepEqual(g.finished.map((x) => x.id), ['b', 'a']);
});
