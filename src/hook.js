#!/usr/bin/env node
// Claude Code hooks for the InkGlance panel - portable Node version.
// Same behaviour as src/hook.sh, for systems without `sh` and curl (Windows).
// macOS and Linux use hook.sh: a waiting Stop hook costs a few MB there instead
// of a Node process.
//
//   hook.js permission | question   wait for the reader, print Claude Code's decision JSON
//   hook.js stop                    background (asyncRewake): exit 2 with the reply text
//   hook.js prompt                  the user typed; close this session's reply slot
//
// Fails open: no panel, no hook.env, any error - exit 0 silently.
// Only node:* modules, so it starts fast and needs nothing installed.

import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const event = process.argv[2] || 'permission';
const LIMITS = { permission: 900, question: 900, stop: 86400, prompt: 3 };
const quiet = () => process.exit(0);
if (!(event in LIMITS)) quiet();

let env = {};
try {
	const file = process.env.INKGLANCE_HOOK_ENV || join(homedir(), '.config', 'inkglance', 'hook.env');
	for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
		if (m) env[m[1]] = m[2];
	}
} catch {
	quiet();
}
if (!env.INKGLANCE_PORT || !env.INKGLANCE_TOKEN) quiet();

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
	const body = Buffer.from(input || '{}');
	const req = request(
		{
			host: '127.0.0.1',
			port: Number(env.INKGLANCE_PORT),
			path: `/hook/${event}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, 'X-InkGlance-Token': env.INKGLANCE_TOKEN },
		},
		(res) => {
			let out = '';
			res.setEncoding('utf8');
			res.on('data', (c) => (out += c));
			res.on('end', () => {
				if (res.statusCode !== 200 || !out) quiet();
				if (event === 'stop') {
					process.stderr.write(out); // asyncRewake: stderr wakes Claude
					process.exit(2);
				}
				if (event === 'permission' || event === 'question') process.stdout.write(out);
				process.exit(0);
			});
		},
	);
	req.on('error', quiet);
	req.setTimeout(LIMITS[event] * 1000, () => req.destroy());
	req.end(body);
});
