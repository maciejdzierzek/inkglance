import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, applySettingsForm, DEFAULTS } from '../src/config.js';

test('normalize fills defaults and drops unknown keys', () => {
	const c = normalize({ extra: 1 });
	assert.equal(c.port, DEFAULTS.port);
	assert.equal('extra' in c, false);
});

test('normalize clamps and rejects invalid values', () => {
	const c = normalize({ refreshSeconds: 2, language: 'xx', fontScale: '9', port: 'abc' });
	assert.equal(c.refreshSeconds, 15);
	assert.equal(c.language, DEFAULTS.language);
	assert.equal(c.fontScale, DEFAULTS.fontScale);
	assert.equal(c.port, DEFAULTS.port);
});

test('settings form cannot change network, binary or token', () => {
	const base = normalize({ token: 'a'.repeat(24) });
	const form = new URLSearchParams({ tab: 'display', language: 'pl', port: '80', claudeBin: '/bin/sh', token: 'b'.repeat(24), host: '1.2.3.4' });
	const c = applySettingsForm(base, form);
	assert.equal(c.language, 'pl');
	assert.equal(c.port, base.port);
	assert.equal(c.claudeBin, base.claudeBin);
	assert.equal(c.token, base.token);
	assert.equal(c.host, base.host);
});

test('unchecked checkboxes turn options off, card fields keep canonical order', () => {
	const base = normalize({ color: true });
	const form = new URLSearchParams('tab=cards&cardFields=tokens&cardFields=model&cardFields=bogus');
	const c = applySettingsForm(base, form);
	assert.equal(c.color, true, 'a checkbox on another tab is untouched');
	assert.deepEqual(c.cardFields, ['model', 'tokens']);
	assert.equal(applySettingsForm(base, new URLSearchParams('tab=display')).color, false);
});

test('templates: edit, remove, move up, add, reset', () => {
	const base = normalize({ templates: ['A', 'B', 'C'] });
	const f = (q) => applySettingsForm(base, new URLSearchParams('tab=replies&template=A&template=B2&template=C&' + q)).templates;
	assert.deepEqual(f(''), ['A', 'B2', 'C']);
	assert.deepEqual(f('remove=0'), ['B2', 'C']);
	assert.deepEqual(f('up=2'), ['A', 'C', 'B2']);
	assert.deepEqual(f('newTemplate=D'), ['A', 'B2', 'C', 'D']);
	assert.deepEqual(f('reset='), []);
});
