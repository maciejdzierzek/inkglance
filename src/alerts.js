// Alerts on the computer (macOS, Windows, Linux - see platform.js): a system
// sound and, optionally, a notification.
// The reader's own alert (a screen flash) is decided in the browser.

import { SOUNDS, playSound as platformSound, notify as platformNotify } from './platform.js';

// Kept under its old name: config keys and the settings screen use it.
export const MAC_SOUNDS = SOUNDS;
export const QUIET_PRESETS = ['off', '21-8', '22-7', '23-7'];

// "22-7" = from 22:00 to 07:00 (over midnight); "off" = never quiet.
export function inQuietHours(spec, date = new Date()) {
	const m = /^(\d{1,2})-(\d{1,2})$/.exec(spec || '');
	if (!m) return false;
	const from = Number(m[1]);
	const to = Number(m[2]);
	const h = date.getHours();
	return from < to ? h >= from && h < to : h >= from || h < to;
}

export const playSound = (name) => platformSound(name);

// `sound` and `notify` are injectable for tests.
export function createAlerts({ getConfig, label, log, sound = platformSound, notify = platformNotify, now = () => new Date() }) {
	return (events) => {
		const c = getConfig();
		const wanted = events.filter((e) => c.alertOn.includes(e.kind));
		if (!wanted.length) return;
		const quiet = inQuietHours(c.quietHours, now());
		for (const e of wanted) {
			const s = e.session;
			log('ALERT', e.kind, quiet ? '(quiet hours)' : '', s.details?.title || s.name || s.project);
		}
		if (quiet) return;
		// One sound per batch, however many sessions changed at once.
		if (c.macSound) sound(c.macSoundName);
		if (c.macNotification) {
			for (const e of wanted) {
				const s = e.session;
				notify(label(e.kind), `${s.details?.title || s.name || s.project} · ${s.project}`);
			}
		}
	};
}
