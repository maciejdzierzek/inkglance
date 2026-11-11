#!/usr/bin/env node
// Installs the inkai PermissionRequest hook into Claude Code's user settings
// (~/.claude/settings.json), next to any hooks you already have.
//
//   node scripts/hooks.js install     # backup + add (or update) the hook
//   node scripts/hooks.js uninstall   # backup + remove only inkai's entries
//   node scripts/hooks.js status
//
// inkai's entries are recognised by the "# [inkai]" marker in the command.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETTINGS = process.env.CLAUDE_SETTINGS || join(homedir(), '.claude', 'settings.json');
const MARKER = '# [inkai]';
const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'hook.js');
const EVENT = 'PermissionRequest';
// Longer than the longest hold the panel allows (approvalTimeoutMinutes <= 14).
const TIMEOUT_SECONDS = 900;

const load = () => (existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {});
const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARKER);

function backup() {
	if (!existsSync(SETTINGS)) return null;
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const copy = `${SETTINGS}.bak-inkai-${stamp}`;
	copyFileSync(SETTINGS, copy);
	return copy;
}

function strip(settings) {
	const groups = settings.hooks?.[EVENT];
	if (!Array.isArray(groups)) return settings;
	const kept = groups
		.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
		.filter((g) => g.hooks.length);
	if (kept.length) settings.hooks[EVENT] = kept;
	else delete settings.hooks[EVENT];
	if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
	return settings;
}

const save = (settings) => writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });

const cmd = process.argv[2];
const settings = load();
const installed = (settings.hooks?.[EVENT] || []).some((g) => (g.hooks || []).some(isOurs));

if (cmd === 'install') {
	const copy = backup();
	strip(settings);
	settings.hooks = settings.hooks || {};
	settings.hooks[EVENT] = settings.hooks[EVENT] || [];
	settings.hooks[EVENT].push({
		matcher: '*',
		hooks: [{ type: 'command', command: `"${process.execPath}" "${HOOK}" permission ${MARKER}`, timeout: TIMEOUT_SECONDS }],
	});
	save(settings);
	console.log(`Installed the ${EVENT} hook in ${SETTINGS}`);
	if (copy) console.log(`Backup: ${copy}`);
} else if (cmd === 'uninstall') {
	if (!installed) {
		console.log('Not installed - nothing to do.');
	} else {
		const copy = backup();
		save(strip(settings));
		console.log(`Removed inkai hooks from ${SETTINGS}`);
		if (copy) console.log(`Backup: ${copy}`);
	}
} else if (cmd === 'status') {
	console.log(installed ? `installed (${EVENT})` : 'not installed');
} else {
	console.log('usage: node scripts/hooks.js install|uninstall|status');
	process.exit(2);
}
