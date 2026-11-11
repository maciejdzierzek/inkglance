// Configuration: defaults, validation, and a JSON file in the user's config directory.
// The file lives outside the repository on purpose: it holds the access token and
// personal preferences, which never belong in version control.

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const LANGUAGES = ['en', 'pl'];
export const FONT_SCALES = [0.875, 1, 1.125, 1.25, 1.5];
export const COLUMNS = [1, 2, 3];
// Fields a session card can show, in display order. The title, status and
// project are always shown.
export const CARD_FIELDS = ['waitingFor', 'activity', 'lastPrompt', 'model', 'context', 'tokens', 'branch', 'times', 'path'];
// Presets offered as buttons on the settings screen (the file accepts any value in range).
export const REFRESH_PRESETS = [30, 60, 120, 300, 600];
export const IDLE_PRESETS = [0, 6, 12, 24, 48, 168];

export const DEFAULTS = Object.freeze({
	host: '0.0.0.0',
	port: 4747,
	language: 'en',
	refreshSeconds: 60,
	columns: 2,
	cardFields: ['waitingFor', 'activity', 'lastPrompt', 'model', 'context', 'tokens', 'times'],
	hideIdleAfterHours: 24,
	color: true,
	fontScale: 1,
	showDiagnostics: true,
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
		cardFields: Array.isArray(input.cardFields)
			? CARD_FIELDS.filter((f) => input.cardFields.includes(f))
			: base.cardFields,
		hideIdleAfterHours: clampInt(input.hideIdleAfterHours, 0, 24 * 30, base.hideIdleAfterHours),
		color: toBool(input.color, base.color),
		fontScale: FONT_SCALES.includes(scale) ? scale : base.fontScale,
		showDiagnostics: toBool(input.showDiagnostics, base.showDiagnostics),
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
		hideIdleAfterHours: form.get('hideIdleAfterHours'),
		fontScale: form.get('fontScale'),
		// Unchecked checkboxes are absent from a submitted form.
		cardFields: form.getAll('cardFields'),
		color: form.get('color') === 'on',
		showDiagnostics: form.get('showDiagnostics') === 'on',
	};
	for (const key of ['language', 'refreshSeconds', 'columns', 'hideIdleAfterHours', 'fontScale']) {
		if (editable[key] === null) delete editable[key];
	}
	return normalize({ ...config, ...editable }, config);
}
