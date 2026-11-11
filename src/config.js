// Configuration: defaults, validation, and a JSON file in the user's config directory.
// The file lives outside the repository on purpose: it holds the access token and
// personal preferences, which never belong in version control.

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { MAC_SOUNDS, QUIET_PRESETS } from './alerts.js';
import { USAGE_SOURCES } from './usage.js';
import { APPROVAL_MODES, AWAY_PRESETS, APPROVAL_TIMEOUT_PRESETS } from './approvals.js';
import { REPLY_WINDOW_PRESETS } from './replies.js';

export const LANGUAGES = ['en', 'pl'];
export const FONT_SCALES = [0.875, 1, 1.125, 1.25, 1.5];
export const COLUMNS = [1, 2, 3];
// 'auto' follows the browser (readers that rotate on their own); 'left'/'right'
// rotate the page for a reader turned on its side whose browser stays portrait.
export const ORIENTATIONS = ['auto', 'left', 'right'];
// Fields a session card can show, in display order. The title, status and
// project are always shown.
export const CARD_FIELDS = ['where', 'waitingFor', 'activity', 'lastPrompt', 'model', 'context', 'tokens', 'branch', 'times', 'path'];
// Presets offered as buttons on the settings screen (the file accepts any value in range).
export const REFRESH_PRESETS = [30, 60, 120, 300, 600];
export const IDLE_PRESETS = [0, 6, 12, 24, 48, 168];
export const ALERT_KINDS = ['needsYou', 'finished'];
export { MAC_SOUNDS, QUIET_PRESETS, USAGE_SOURCES };
export const USAGE_API_PRESETS = [15, 30, 60];
export { APPROVAL_MODES, AWAY_PRESETS, APPROVAL_TIMEOUT_PRESETS, REPLY_WINDOW_PRESETS };

export const DEFAULTS = Object.freeze({
	host: '0.0.0.0',
	port: 4747,
	language: 'en',
	refreshSeconds: 60,
	columns: 2,
	orientation: 'auto',
	cardFields: ['where', 'waitingFor', 'activity', 'lastPrompt', 'model', 'context', 'tokens', 'times'],
	hideIdleAfterHours: 24,
	color: true,
	fontScale: 1,
	showDiagnostics: true,
	alertOn: ['needsYou'],
	macSound: true,
	macSoundName: 'Glass',
	macNotification: false,
	readerFlash: true,
	quietHours: 'off',
	showLimits: true,
	usageSource: 'auto',
	usageApiMinutes: 15,
	approvals: 'away',
	awaySeconds: 60,
	approvalTimeoutMinutes: 5,
	replies: true,
	replyWindowHours: 4,
	// Reply buttons; empty = the language's defaults. Edit in the file.
	templates: [],
	claudeBin: 'claude',
	token: '',
});

export function configPath() {
	return process.env.INKAI_CONFIG || join(homedir(), '.config', 'inkai', 'config.json');
}

const clampInt = (value, min, max, fallback) => {
	const n = Number.parseInt(value, 10);
	if (Number.isNaN(n)) return fallback;
	return Math.min(max, Math.max(min, n));
};

const toBool = (value, fallback) => {
	if (typeof value === 'boolean') return value;
	if (value === 'on' || value === 'true' || value === '1') return true;
	if (value === 'off' || value === 'false' || value === '0') return false;
	return fallback;
};

// Accepts untrusted input (file contents or a submitted form) and returns a complete,
// valid configuration. Unknown keys are dropped, invalid values fall back.
export function normalize(input = {}, base = DEFAULTS) {
	const pick = (list, value, fallback) => (list.includes(value) ? value : fallback);
	const scale = Number.parseFloat(input.fontScale);
	return {
		host: typeof input.host === 'string' && input.host ? input.host : base.host,
		port: clampInt(input.port, 1, 65535, base.port),
		language: pick(LANGUAGES, input.language, base.language),
		refreshSeconds: clampInt(input.refreshSeconds, 15, 3600, base.refreshSeconds),
		columns: COLUMNS.includes(Number(input.columns)) ? Number(input.columns) : base.columns,
		orientation: pick(ORIENTATIONS, input.orientation, base.orientation),
		cardFields: Array.isArray(input.cardFields)
			? CARD_FIELDS.filter((f) => input.cardFields.includes(f))
			: base.cardFields,
		hideIdleAfterHours: clampInt(input.hideIdleAfterHours, 0, 24 * 30, base.hideIdleAfterHours),
		color: toBool(input.color, base.color),
		fontScale: FONT_SCALES.includes(scale) ? scale : base.fontScale,
		showDiagnostics: toBool(input.showDiagnostics, base.showDiagnostics),
		alertOn: Array.isArray(input.alertOn) ? ALERT_KINDS.filter((k) => input.alertOn.includes(k)) : base.alertOn,
		macSound: toBool(input.macSound, base.macSound),
		macSoundName: pick(MAC_SOUNDS, input.macSoundName, base.macSoundName),
		macNotification: toBool(input.macNotification, base.macNotification),
		readerFlash: toBool(input.readerFlash, base.readerFlash),
		quietHours: pick(QUIET_PRESETS, input.quietHours, base.quietHours),
		showLimits: toBool(input.showLimits, base.showLimits),
		usageSource: pick(USAGE_SOURCES, input.usageSource, base.usageSource),
		usageApiMinutes: clampInt(input.usageApiMinutes, 5, 24 * 60, base.usageApiMinutes),
		approvals: pick(APPROVAL_MODES, input.approvals, base.approvals),
		awaySeconds: clampInt(input.awaySeconds, 10, 3600, base.awaySeconds),
		approvalTimeoutMinutes: clampInt(input.approvalTimeoutMinutes, 1, 14, base.approvalTimeoutMinutes),
		replies: toBool(input.replies, base.replies),
		replyWindowHours: clampInt(input.replyWindowHours, 1, 24, base.replyWindowHours),
		templates: Array.isArray(input.templates)
			? input.templates.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 12)
			: base.templates,
		claudeBin: typeof input.claudeBin === 'string' && input.claudeBin ? input.claudeBin : base.claudeBin,
		token: typeof input.token === 'string' && /^[A-Za-z0-9_-]{16,}$/.test(input.token) ? input.token : base.token,
	};
}

export function newToken() {
	return randomBytes(18).toString('base64url');
}

export function loadConfig(path = configPath()) {
	let raw = {};
	try {
		raw = JSON.parse(readFileSync(path, 'utf8'));
	} catch (err) {
		if (err.code !== 'ENOENT') throw new Error(`Cannot read config ${path}: ${err.message}`);
	}
	const config = normalize(raw);
	if (!config.token) {
		config.token = newToken();
		saveConfig(config, path);
	}
	return config;
}

export function saveConfig(config, path = configPath()) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(config, null, '\t') + '\n', { mode: 0o600 });
	chmodSync(path, 0o600);
}

// Applies a settings form: only user-facing preferences can change from the panel.
// Network, binary path and token are edited in the file, deliberately.
export function applySettingsForm(config, form) {
	const editable = {
		language: form.get('language'),
		refreshSeconds: form.get('refreshSeconds'),
		columns: form.get('columns'),
		orientation: form.get('orientation'),
		hideIdleAfterHours: form.get('hideIdleAfterHours'),
		fontScale: form.get('fontScale'),
		// Unchecked checkboxes are absent from a submitted form.
		cardFields: form.getAll('cardFields'),
		color: form.get('color') === 'on',
		showDiagnostics: form.get('showDiagnostics') === 'on',
		alertOn: form.getAll('alertOn'),
		macSound: form.get('macSound') === 'on',
		macSoundName: form.get('macSoundName'),
		macNotification: form.get('macNotification') === 'on',
		readerFlash: form.get('readerFlash') === 'on',
		quietHours: form.get('quietHours'),
		showLimits: form.get('showLimits') === 'on',
		usageSource: form.get('usageSource'),
		usageApiMinutes: form.get('usageApiMinutes'),
		approvals: form.get('approvals'),
		awaySeconds: form.get('awaySeconds'),
		approvalTimeoutMinutes: form.get('approvalTimeoutMinutes'),
		replies: form.get('replies') === 'on',
		replyWindowHours: form.get('replyWindowHours'),
	};
	for (const key of ['language', 'refreshSeconds', 'columns', 'orientation', 'hideIdleAfterHours', 'fontScale', 'macSoundName', 'quietHours', 'usageSource', 'usageApiMinutes', 'approvals', 'awaySeconds', 'approvalTimeoutMinutes', 'replyWindowHours']) {
		if (editable[key] === null) delete editable[key];
	}
	return normalize({ ...config, ...editable }, config);
}
