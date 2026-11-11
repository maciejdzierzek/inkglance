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

test('state colors: #rrggbb only, defaults otherwise', async () => {
	const { normalize } = await import('../src/config.js');
	const c = normalize({ colorNeedsYou: '#FF8000', colorFinished: 'red', colorWorking: '#123' });
	assert.equal(c.colorNeedsYou, '#ff8000');
	assert.equal(c.colorFinished, '#00c853');
	assert.equal(c.colorWorking, '#2196f3');
});

test('text on a colored fill picks the stronger contrast', async () => {
	const { inkOn } = await import('../src/render.js');
	assert.equal(inkOn('#ffcc00'), '#000');
	assert.equal(inkOn('#0b5394'), '#fff');
	assert.equal(inkOn('#000000'), '#fff');
});
