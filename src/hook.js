#!/usr/bin/env node
// Claude Code hook: forwards a PermissionRequest to the inkai panel and waits
// for an answer from the reader. Installed by `npm run hooks:install`.
//
// Fails open, fast: if the panel is not running, the config is missing or
// anything goes wrong, it exits silently and Claude Code shows its usual
// permission dialog. It never approves anything by itself.

import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { configPath } from './config.js';

const event = process.argv[2] || 'permission';
const done = (output) => {
	if (output) process.stdout.write(JSON.stringify(output));
	process.exit(0);
};

let config;
try {
	config = JSON.parse(readFileSync(configPath(), 'utf8'));
} catch {
	done();
}
if (!config?.token) done();

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
	const body = Buffer.from(input || '{}');
	const req = request(
		{
			host: '127.0.0.1',
			port: config.port || 4747,
			path: `/hook/${event}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, 'X-Inkai-Token': config.token },
		},
		(res) => {
			let text = '';
			res.setEncoding('utf8');
			res.on('data', (c) => (text += c));
			res.on('end', () => {
				if (res.statusCode !== 200) return done();
				try {
					const answer = JSON.parse(text);
					if (answer.decision !== 'allow' && answer.decision !== 'deny') return done();
					done({
						hookSpecificOutput: {
							hookEventName: 'PermissionRequest',
							decision:
								answer.decision === 'allow'
									? { behavior: 'allow' }
									: { behavior: 'deny', message: answer.message || 'Denied from the inkai panel.' },
						},
					});
				} catch {
					done();
				}
			});
		},
	);
	// Panel not running: connection refused within milliseconds.
	req.on('error', () => done());
	req.setTimeout(15 * 60 * 1000, () => req.destroy());
	req.end(body);
});
