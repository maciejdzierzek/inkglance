#!/usr/bin/env node
// Installs the InkGlance hooks (PermissionRequest, PreToolUse for questions, Stop, UserPromptSubmit) into Claude Code's user settings
// (~/.claude/settings.json), next to any hooks you already have.
//
//   node scripts/hooks.js install     # backup + add (or update) the hook
//   node scripts/hooks.js uninstall   # backup + remove only InkGlance's entries
//   node scripts/hooks.js status
//
// InkGlance's entries are recognised by the "# [inkglance]" marker in the command.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETTINGS = process.env.CLAUDE_SETTINGS || join(homedir(), '.claude', 'settings.json');
const MARKER = '# [inkglance]';
const LEGACY_MARKERS = ['# [inkai]']; // entries from before the rename, removed on install/uninstall
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
// macOS / Linux: a curl shell script (a few MB per waiting hook). Windows has no
// `sh`, so it gets the portable Node version.
const hookCommand = (arg) =>
	process.platform === 'win32'
		? `"${process.execPath}" "${join(SRC, 'hook.js')}" ${arg} ${MARKER}`
		: `sh "${join(SRC, 'hook.sh')}" ${arg} ${MARKER}`;
// Event -> hook settings. Timeouts are longer than the longest wait the panel
// allows (approvalTimeoutMinutes <= 14, replyWindowHours <= 24).
const HOOKS = {
	PermissionRequest: { arg: 'permission', timeout: 900, matcher: '*' },
	PreToolUse: { arg: 'question', timeout: 900, matcher: 'AskUserQuestion' },
	Stop: { arg: 'stop', timeout: 24 * 3600 + 120, asyncRewake: true },
	UserPromptSubmit: { arg: 'prompt', timeout: 5 },
};

const load = () => (existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {});
const isOurs = (h) => typeof h?.command === 'string' && [MARKER, ...LEGACY_MARKERS].some((m) => h.command.includes(m));

function backup() {
	if (!existsSync(SETTINGS)) return null;
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const copy = `${SETTINGS}.bak-inkglance-${stamp}`;
	copyFileSync(SETTINGS, copy);
	return copy;
}

function strip(settings) {
	for (const event of Object.keys(settings.hooks || {})) {
		const groups = settings.hooks[event];
		if (!Array.isArray(groups)) continue;
		const kept = groups
			.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
			.filter((g) => g.hooks.length);
		if (kept.length) settings.hooks[event] = kept;
		else delete settings.hooks[event];
	}
	if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
	return settings;
}

const save = (settings) => writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });

const cmd = process.argv[2];
const settings = load();
const installedEvents = Object.keys(HOOKS).filter((e) => (settings.hooks?.[e] || []).some((g) => (g.hooks || []).some(isOurs)));
const installed = installedEvents.length > 0;

if (cmd === 'install') {
	const copy = backup();
	strip(settings);
	settings.hooks = settings.hooks || {};
	for (const [event, h] of Object.entries(HOOKS)) {
		const entry = { type: 'command', command: hookCommand(h.arg), timeout: h.timeout };
		if (h.asyncRewake) entry.asyncRewake = true;
		settings.hooks[event] = settings.hooks[event] || [];
		settings.hooks[event].push(h.matcher ? { matcher: h.matcher, hooks: [entry] } : { hooks: [entry] });
	}
	save(settings);
	console.log(`Installed InkGlance hooks (${Object.keys(HOOKS).join(', ')}) in ${SETTINGS}`);
	if (copy) console.log(`Backup: ${copy}`);
} else if (cmd === 'uninstall') {
	if (!installed) {
		console.log('Not installed - nothing to do.');
	} else {
		const copy = backup();
		save(strip(settings));
		console.log(`Removed InkGlance hooks from ${SETTINGS}`);
		if (copy) console.log(`Backup: ${copy}`);
	}
} else if (cmd === 'status') {
	console.log(installed ? `installed: ${installedEvents.join(', ')}` : 'not installed');
} else {
	console.log('usage: node scripts/hooks.js install|uninstall|status');
	process.exit(2);
}
