#!/usr/bin/env node
// Demo mode: the panel with made-up sessions, on its own port and config, next
// to (never instead of) a real panel. Usage: npm run demo [-- --port 4800 --lang pl]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dir = join(tmpdir(), 'inkglance-demo');
mkdirSync(dir, { recursive: true });
const config = join(dir, 'config.json');
writeFileSync(config, JSON.stringify({ port: Number(arg('port', 4800)), language: arg('lang', 'en'), token: randomBytes(18).toString('base64url'), updateCheck: false, showDiagnostics: false }, null, '\t'), { mode: 0o600 });

const child = spawn(process.execPath, [new URL('../src/server.js', import.meta.url).pathname], {
	stdio: 'inherit',
	env: { ...process.env, INKGLANCE_CONFIG: config, INKGLANCE_DEMO: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
// Stopping the launcher stops the demo server too.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
