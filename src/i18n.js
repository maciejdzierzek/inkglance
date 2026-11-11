// Tiny translation layer: one flat JSON file per language, English as the fallback.

import { readFileSync } from 'node:fs';
import { LANGUAGES } from './config.js';

const load = (lang) => JSON.parse(readFileSync(new URL(`./locales/${lang}.json`, import.meta.url), 'utf8'));

export const messages = Object.fromEntries(LANGUAGES.map((lang) => [lang, load(lang)]));

export function t(lang, key, vars = {}) {
	const text = messages[lang]?.[key] ?? messages.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function relativeTime(lang, timestamp, now = Date.now()) {
	if (!timestamp) return '';
	const seconds = Math.round((timestamp - now) / 1000);
	const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
	const abs = Math.abs(seconds);
	if (abs < 60) return rtf.format(seconds, 'second');
	if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
	return rtf.format(Math.round(seconds / 86400), 'day');
}

export function clockTime(lang, timestamp) {
	return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp);
}
