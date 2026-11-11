import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, isAllowedHost } from '../src/access.js';

test('only this computer and private networks may connect', () => {
	for (const a of ['127.0.0.1', '::1', '::ffff:192.168.0.20', '10.1.2.3', '172.16.0.1', '172.31.255.1', '169.254.1.1', '100.101.102.103', 'fd12:3456::1', 'fe80::1']) {
		assert.equal(isPrivateAddress(a), true, a);
	}
	for (const a of ['8.8.8.8', '172.32.0.1', '::ffff:1.2.3.4', '2001:db8::1', '100.128.0.1', '', undefined]) {
		assert.equal(isPrivateAddress(a), false, String(a));
	}
});

test('Host must be an address, localhost, this computer or an allowed name', () => {
	const opts = { machine: 'Studio.local', allowedHosts: ['panel.tailnet.ts.net'] };
	for (const h of ['192.168.1.50', '192.168.1.50:4747', 'localhost:80', '[::1]:4747', 'studio', 'studio.local', 'STUDIO.LOCAL:80', 'panel.tailnet.ts.net', undefined]) {
		assert.equal(isAllowedHost(h, opts), true, String(h));
	}
	for (const h of ['evil.example', 'studio.evil.example', '192.168.1.50.nip.io', '[::1]evil']) {
		assert.equal(isAllowedHost(h, opts), false, h);
	}
});
