// Background watcher: polls sessions on the computer even when no reader is
// looking, detects transitions and keeps a version number that changes whenever
// the panel content would change. Readers poll the version (tiny request) and
// refresh at once when it moves, instead of waiting for the full interval.

export const WATCH_MS = 10 * 1000;

// Transitions worth an alert:
//   needsYou - a session starts waiting for you (permission, question, input)
//   finished - a session goes from working to idle (its turn is over)
export function diff(prev, sessions) {
	const events = [];
	if (!prev) return events;
	for (const s of sessions) {
		const before = prev.get(s.id);
		if (s.group === 'needsYou' && before !== 'needsYou') events.push({ kind: 'needsYou', session: s });
		else if (s.group === 'idle' && before === 'working') events.push({ kind: 'finished', session: s });
	}
	return events;
}

export function createWatcher({ getConfig, list, onEvents, extraWaiting = () => [] }) {
	let prev = null;
	let signature = '';
	let version = 0;
	let waiting = [];

	async function tick() {
		const data = await list(getConfig());
		if (data.error) return;
		const events = diff(prev, data.sessions);
		prev = new Map(data.sessions.map((s) => [s.id, s.group]));
		waiting = data.sessions.filter((s) => s.group === 'needsYou').map((s) => s.id);
		const next = data.sessions
			.map((s) => `${s.id}:${s.group}`)
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
		state: () => ({ v: version, waiting: [...waiting, ...extraWaiting()] }),
	};
}
