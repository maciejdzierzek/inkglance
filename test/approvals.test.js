import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApprovals, summarize } from '../src/approvals.js';

const input = { session_id: 's1', cwd: '/w/app', tool_name: 'Bash', tool_input: { command: 'npm test' } };
const make = (config, idleValue) => {
	let idle = idleValue;
	const a = createApprovals({ getConfig: () => config, log: () => {}, onChange: () => {}, idle: async () => idle });
	return { a, setIdle: (v) => (idle = v) };
};
const base = { approvals: 'away', awaySeconds: 60, approvalTimeoutMinutes: 5 };

test('off never holds; away holds only when idle long enough', async () => {
	assert.equal((await make({ ...base, approvals: 'off' }, 999).a.request(input)).decision, null);
	assert.equal((await make(base, 10).a.request(input)).decision, null);
	assert.equal((await make(base, null).a.request(input)).decision, null, 'unknown idle counts as at desk');
});

test('held request resolves with the reader decision', async () => {
	const { a } = make({ ...base, approvals: 'always' }, 0);
	let id;
	const p = a.request(input, { onHold: (x) => (id = x) });
	await new Promise((r) => setTimeout(r, 10));
	assert.equal(a.list().length, 1);
	assert.equal(a.list()[0].detail, 'npm test');
	a.decide(id, 'deny', 'no');
	assert.deepEqual(await p, { decision: 'deny', message: 'no' });
	assert.equal(a.list().length, 0);
});

test('release and dropped connection fall through to the computer', async () => {
	const { a } = make({ ...base, approvals: 'always' }, 0);
	let id;
	const p = a.request(input, { onHold: (x) => (id = x) });
	await new Promise((r) => setTimeout(r, 10));
	a.release(id);
	assert.equal((await p).decision, null);
	let id2;
	const p2 = a.request(input, { onHold: (x) => (id2 = x) });
	await new Promise((r) => setTimeout(r, 10));
	a.drop(id2);
	assert.equal((await p2).decision, null);
});

test('summary prefers the command, clips long input', () => {
	assert.deepEqual(summarize(input), { tool: 'Bash', detail: 'npm test' });
	assert.equal(summarize({ tool_name: 'Write', tool_input: { file_path: 'x'.repeat(500) } }).detail.length, 400);
});

test('a duplicate request joins the waiting one', async () => {
	const { a } = make({ ...base, approvals: 'always' }, 0);
	let id;
	const first = a.request(input, { onHold: (x) => (id = x) });
	await new Promise((r) => setTimeout(r, 10));
	const second = a.request(input);
	await new Promise((r) => setTimeout(r, 10));
	assert.equal(a.list().length, 1);
	a.decide(id, 'allow');
	assert.equal((await first).decision, 'allow');
	assert.equal((await second).decision, 'allow');
});

test('questions: kept for the reader, answered with labels', async () => {
	const { a } = make({ ...base, approvals: 'always' }, 0);
	const q = { session_id: 's1', cwd: '/w', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Color?', header: 'C', multiSelect: false, options: [{ label: 'Red' }, { label: 'Blue', description: 'calm' }] }] } };
	let id;
	const p = a.request(q, { kind: 'question', onHold: (x) => (id = x) });
	await new Promise((r) => setTimeout(r, 10));
	assert.equal(a.list()[0].kind, 'question');
	assert.equal(a.list()[0].questions[0].options[1].description, 'calm');
	a.answer(id, { 'Color?': 'Blue' });
	assert.deepEqual(await p, { decision: 'answer', answers: { 'Color?': 'Blue' } });
});
