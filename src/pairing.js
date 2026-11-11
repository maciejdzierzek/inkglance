// Pairing: typing a long token on an e-ink keyboard is painful, so a new device
// opens the short address, the computer shows a 6-digit code (system notification
// and log), and the device types it once. Success hands over the real token.
//
// Limits against guessing from the network: one code at a time, valid for 10
// minutes, 5 wrong attempts burn it, and at most 3 codes per hour. That leaves an
// attacker 15 guesses an hour out of a million codes, and every code announces
// itself on the computer.

import { randomInt } from 'node:crypto';
import { notify } from './platform.js';

const CODE_DIGITS = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 3;
const HOUR = 3600 * 1000;

export function createPairing({ notify = systemNotify, now = () => Date.now() } = {}) {
	let current = null; // { code, expires, attempts }
	let issued = []; // times codes were issued in the last hour

	const active = () => current && current.expires > now() && current.attempts < MAX_ATTEMPTS;
	const recent = () => (issued = issued.filter((at) => now() - at < HOUR));

	return {
		// Returns the active code, issuing (and announcing) a new one if allowed;
		// null while locked out.
		ensureCode() {
			if (active()) return current.code;
			if (recent().length >= MAX_CODES_PER_HOUR) return null;
			current = { code: String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0'), expires: now() + CODE_TTL_MS, attempts: 0 };
			issued.push(now());
			notify(current.code);
			return current.code;
		},
		// When a new code can be issued again (ms timestamp), or 0 if it can now.
		lockedUntil() {
			if (active() || recent().length < MAX_CODES_PER_HOUR) return 0;
			return issued[0] + HOUR;
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
