import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the real shell hook against a throwaway server (never a real panel):
// it must read its env file, send the token and pass the reply through.
const run = (args, env, input) =>
	new Promise((resolve) => {
		const child = spawn('sh', [new URL('../src/hook.sh', import.meta.url).pathname, ...args], { env: { ...process.env, ...env } });
		let out = '';
		let err = '';
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (err += d));
		child.on('close', (code) => resolve({ code, out, err }));
		child.stdin.end(input);
	});

test('shell hook: token from the header file, stop reply goes to stderr with exit 2', { skip: process.platform === 'win32' }, async () => {
	const seen = [];
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', (d) => (body += d));
		req.on('end', () => {
			seen.push({ url: req.url, token: req.headers['x-inkglance-token'], body });
			if (req.url === '/hook/stop') res.end('wake up');
			else res.writeHead(204).end();
		});
	});
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	const port = server.address().port;
	const dir = mkdtempSync(join(tmpdir(), 'inkglance-hook-'));
	writeFileSync(join(dir, 'hook.env'), `INKGLANCE_PORT=${port}\nINKGLANCE_TOKEN=test-token-123\n`);
	writeFileSync(join(dir, 'hook.header'), 'X-InkGlance-Token: test-token-123\n');
	const env = { INKGLANCE_HOOK_ENV: join(dir, 'hook.env') };
	try {
		const prompt = await run(['prompt'], env, '{"session_id":"s1"}');
		assert.equal(prompt.code, 0);
		const stop = await run(['stop'], env, '{"session_id":"s1"}');
		assert.equal(stop.code, 2);
		assert.equal(stop.err, 'wake up');
		assert.deepEqual(seen.map((s) => [s.url, s.token, s.body]), [
			['/hook/prompt', 'test-token-123', '{"session_id":"s1"}'],
			['/hook/stop', 'test-token-123', '{"session_id":"s1"}'],
		]);
	} finally {
		server.close();
	}
});

test('shell hook fails open: no env file, or nothing listening', { skip: process.platform === 'win32' }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'inkglance-hook-'));
	assert.equal((await run(['permission'], { INKGLANCE_HOOK_ENV: join(dir, 'missing.env') }, '{}')).code, 0);
	writeFileSync(join(dir, 'hook.env'), 'INKGLANCE_PORT=9\nINKGLANCE_TOKEN=x\n'); // port 9: nothing there
	const started = Date.now();
	const r = await run(['permission'], { INKGLANCE_HOOK_ENV: join(dir, 'hook.env') }, '{}');
	assert.equal(r.code, 0);
	assert.equal(r.out, '');
	assert.ok(Date.now() - started < 3000);
});
