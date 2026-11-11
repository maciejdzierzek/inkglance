// Pairing: typing a long token on an e-ink keyboard is painful, so a new device
// opens the short address, the computer shows a 4-digit code (system notification
// and terminal), and the device types it once. Success hands over the real token.
//
// Limits: one code at a time, valid for 10 minutes, 5 wrong attempts burn it.
// A new code is only issued with a fresh notification on the computer, so
// guessing is visible to the owner.

import { randomInt } from 'node:crypto';
import { notify } from './platform.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export function createPairing({ notify = systemNotify, now = () => Date.now() } = {}) {
	let current = null; // { code, expires, attempts }

	const active = () => current && current.expires > now() && current.attempts < MAX_ATTEMPTS;

	return {
		// Returns the active code, issuing (and announcing) a new one if needed.
		ensureCode() {
			if (!active()) {
				current = { code: String(randomInt(0, 10000)).padStart(4, '0'), expires: now() + CODE_TTL_MS, attempts: 0 };
				notify(current.code);
			}
			return current.code;
		},
		// 'ok' | 'wrong' | 'expired'
		check(input) {
			if (!active()) return 'expired';
			if (String(input || '').trim() === current.code) {
				current = null;
				return 'ok';
			}
			current.attempts += 1;
			return active() ? 'wrong' : 'expired';
		},
	};
}

// System notification (macOS, Windows, Linux) plus the terminal / log.
export function makeSystemNotify({ title, body, log }) {
	return (code) => {
		log(`PAIRING CODE: ${code}`);
		notify(title, body.replace('{code}', code), { sound: 'Glass' });
	};
}

function systemNotify(code) {
	console.log(`PAIRING CODE: ${code}`);
}
