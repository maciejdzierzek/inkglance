import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, parseVersion, fromRelease, installMethod, createUpdates } from '../src/updates.js';

test('versions compare numerically', () => {
	assert.deepEqual(parseVersion('v1.10.2'), [1, 10, 2]);
	assert.equal(isNewer('0.10.0', '0.9.9'), true);
	assert.equal(isNewer('v0.1.0', '0.1.0'), false);
	assert.equal(isNewer('garbage', '0.1.0'), false);
});

test('releases: drafts and pre-releases ignored, notes cleaned', () => {
	assert.equal(fromRelease({ tag_name: 'v1.0.0', draft: true }), null);
	const r = fromRelease({ tag_name: 'v1.2.0', html_url: 'u', body: '## Changes\n- Faster\n* Fixed X\n' });
	assert.equal(r.version, '1.2.0');
	assert.deepEqual(r.notes, ['Changes', 'Faster', 'Fixed X']);
});

test('install method from where the server runs', () => {
	assert.equal(installMethod('/Applications/InkGlance.app/Contents/Resources/server', {}), 'app');
	assert.equal(installMethod('C:\\Program Files\\InkGlance\\resources\\server', {}), 'app');
	assert.equal(installMethod('/srv/u/.claude/plugins/cache/inkglance/0.1.0', {}), 'plugin');
	assert.equal(installMethod('/nowhere', {}), 'manual');
	assert.equal(installMethod('/x', { INKGLANCE_INSTALL: 'git' }), 'git');
});

test('check: newer release reported, 404 means no releases, daily throttle', async () => {
	let calls = 0;
	const reply = { status: 200, ok: true, json: async () => ({ tag_name: 'v99.0.0', html_url: 'u', body: '' }) };
	const u = createUpdates({ getConfig: () => ({ updateCheck: true }), log: () => {}, fetchImpl: async () => (calls++, reply), now: () => 1e12 });
	const s = await u.check();
	assert.equal(s.available, true);
	assert.equal(s.latest.version, '99.0.0');
	await u.check();
	assert.equal(calls, 1, 'second check within a day is skipped');
	const none = createUpdates({ getConfig: () => ({ updateCheck: true }), log: () => {}, fetchImpl: async () => ({ status: 404, ok: false }) });
	assert.equal((await none.check()).available, false);
});

test('release links other than GitHub pages are dropped', () => {
	assert.equal(fromRelease({ tag_name: 'v1.0.0', html_url: 'javascript:alert(1)' }).url, '');
	assert.equal(fromRelease({ tag_name: 'v1.0.0', html_url: 'https://github.com/o/r/releases/tag/v1.0.0' }).url, 'https://github.com/o/r/releases/tag/v1.0.0');
});
