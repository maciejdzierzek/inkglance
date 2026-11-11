// Background watcher: polls sessions on the computer even when no reader is
// looking, detects transitions and keeps a version number that changes whenever
// the panel content would change. Readers poll the version (tiny request) and
// refresh at once when it moves, instead of waiting for the full interval.

export const WATCH_MS = 10 * 1000;

// Transitions worth an alert:
//   needsYou - a session starts waiting for you (permission, question, input)
//   finished - a session's turn ends (a new turn end, even if the whole turn
//              happened between two polls)
// `prev` maps session id -> { group, turnEndedAt } from the previous poll.
export function diff(prev, sessions) {
	const events = [];
	if (!prev) return events;
	for (const s of sessions) {
		const before = prev.get(s.id);
		if (s.group === 'needsYou' && before?.group !== 'needsYou') events.push({ kind: 'needsYou', session: s });
		// A session new to us has no "before": its finished turn may be old news.
		else if (s.group === 'finished' && before && s.turnEndedAt !== before.turnEndedAt) events.push({ kind: 'finished', session: s });
	}
	return events;
}

export function createWatcher({ getConfig, list, onEvents, extraWaiting = () => [] }) {
	let prev = null;
	let signature = '';
	let version = 0;
	let waiting = [];
	let finished = [];
	let counts = { needsYou: 0, finished: 0, working: 0, idle: 0 };

	async function tick() {
		const data = await list(getConfig());
		if (data.error) return;
		const events = diff(prev, data.sessions);
		prev = new Map(data.sessions.map((s) => [s.id, { group: s.group, turnEndedAt: s.turnEndedAt }]));
		waiting = data.sessions.filter((s) => s.group === 'needsYou').map((s) => s.id);
		// Keyed by turn, so the reader flashes again when the same session finishes again.
		finished = data.sessions.filter((s) => s.group === 'finished').map((s) => `${s.id}@${s.turnEndedAt}`);
		counts = { needsYou: 0, finished: 0, working: 0, idle: 0 };
		for (const s of data.sessions) counts[s.group] += 1;
		const next = data.sessions
			.map((s) => `${s.id}:${s.group}:${s.group === 'finished' ? s.turnEndedAt : ''}`)
			.sort()
			.join('|');
		if (next !== signature) {
			signature = next;
			version += 1;
		}
		if (events.length) onEvents(events);
	}

	return {
		tick,
		start() {
			const run = () => tick().catch(() => {});
			run();
			return setInterval(run, WATCH_MS);
		},
		// Something outside the session list changed (e.g. a permission request).
		bump: () => {
			version += 1;
		},
		state: () => {
			const all = [...waiting, ...extraWaiting()];
			return { v: version, waiting: all, finished: [...finished], counts: { ...counts, needsYou: all.length } };
		},
	};
}
