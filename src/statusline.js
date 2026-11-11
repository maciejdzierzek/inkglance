#!/usr/bin/env node
// Claude Code status line hook: Claude Code runs this command and passes session
// data as JSON on stdin (model, context window, rate limits, cost). We store the
// latest snapshot per session for the panel and print a short status line.
//
// Install in ~/.claude/settings.json:
//   "statusLine": { "type": "command", "command": "node /path/to/inkai/src/statusline.js" }
//
// Must be fast and never fail loudly: Claude Code calls it on every update.

import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { SNAPSHOT_DIR } from './statusline-dir.js';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
	let data;
	try {
		data = JSON.parse(input);
	} catch {
		return;
	}
	try {
		mkdirSync(SNAPSHOT_DIR, { recursive: true });
		const id = String(data.session_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
		const file = join(SNAPSHOT_DIR, `${id}.json`);
		const tmp = `${file}.${process.pid}.tmp`;
		writeFileSync(tmp, JSON.stringify({ receivedAt: Date.now(), ...data }));
		renameSync(tmp, file);
	} catch {
		// The panel just will not see this update.
	}
	const parts = [];
	const ctx = data.context_window?.used_percentage;
	if (typeof ctx === 'number') parts.push(`ctx ${Math.round(ctx)}%`);
	const five = data.rate_limits?.five_hour?.used_percentage;
	const week = data.rate_limits?.seven_day?.used_percentage;
	if (typeof five === 'number') parts.push(`5h ${Math.round(five)}%`);
	if (typeof week === 'number') parts.push(`7d ${Math.round(week)}%`);
	process.stdout.write(parts.join(' · '));
});
