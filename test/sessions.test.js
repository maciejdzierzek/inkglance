import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, groupSessions, transcriptPath } from '../src/sessions.js';

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
	assert.equal(transcriptPath('/srv/my.app', 'abc', '/h'), '/h/.claude/projects/-srv-my-app/abc.jsonl');
});
