import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPairing, CODE_TTL_MS, MAX_ATTEMPTS, MAX_CODES_PER_HOUR } from '../src/pairing.js';

const setup = () => {
	let clock = 0;
	const sent = [];
	const p = createPairing({ notify: (c) => sent.push(c), now: () => clock });
	return { p, sent, tick: (ms) => (clock += ms) };
};

test('one code is issued and announced once while active', () => {
	const { p, sent } = setup();
	const code = p.ensureCode();
	assert.match(code, /^\d{6}$/);
	assert.equal(p.ensureCode(), code);
	assert.equal(sent.length, 1);
});

test('right code pairs once, then is gone', () => {
	const { p } = setup();
	const code = p.ensureCode();
	assert.equal(p.check(code), 'ok');
	assert.equal(p.check(code), 'expired');
});

test('wrong attempts burn the code', () => {
	const { p } = setup();
	const code = p.ensureCode();
	const wrong = code === '000000' ? '000001' : '000000';
	for (let i = 1; i < MAX_ATTEMPTS; i++) assert.equal(p.check(wrong), 'wrong');
	assert.equal(p.check(wrong), 'expired');
	assert.equal(p.check(code), 'expired');
});

test('code expires after its lifetime', () => {
	const { p, tick } = setup();
	const code = p.ensureCode();
	tick(CODE_TTL_MS + 1);
	assert.equal(p.check(code), 'expired');
});

test('at most a few codes per hour, then locked until the oldest is an hour old', () => {
	const { p, sent, tick } = setup();
	for (let i = 0; i < MAX_CODES_PER_HOUR; i++) {
		p.ensureCode();
		tick(CODE_TTL_MS + 1); // let each code expire
	}
	assert.equal(p.ensureCode(), null);
	assert.equal(sent.length, MAX_CODES_PER_HOUR);
	assert.ok(p.lockedUntil() > 0);
	tick(3600 * 1000);
	assert.match(p.ensureCode(), /^\d{6}$/);
	assert.equal(p.lockedUntil(), 0);
});
