// Session data from Claude Code itself.
//
// Source of truth: `claude agents --json`, the documented way to list active sessions
// (interactive and background, any entrypoint: terminal, IDE extension, desktop app).
// Last activity comes from the modification time of the session transcript, whose
// location (~/.claude/projects/<cwd with non-alphanumerics as "-">/<sessionId>.jsonl)
// is documented. Optional details (title, tokens, ...) come from transcript.js,
// which treats the internal transcript format as best-effort.

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { transcriptDetails, forgetExcept } from './transcript.js';

const CACHE_MS = 5000;
let cache = { at: 0, result: null };
// Finished turns the user put aside on the reader: sessionId -> turnEndedAt.
// A later turn end shows the session again.
const dismissed = new Map();

export function transcriptPath(cwd, sessionId, home = homedir()) {
	return join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
}

function runAgentsJson(claudeBin) {
	return new Promise((resolve, reject) => {
		// On Windows `claude` may be a .cmd shim, which only runs through a shell.
		execFile(claudeBin, ['agents', '--json'], { timeout: 15000, maxBuffer: 8 * 1024 * 1024, shell: process.platform === 'win32', windowsHide: true }, (err, stdout) => {
			if (err) return reject(err);
			try {
				const data = JSON.parse(stdout);
				resolve(Array.isArray(data) ? data : []);
			} catch (parseErr) {
				reject(new Error(`Unexpected output from "claude agents --json": ${parseErr.message}`));
			}
		});
	});
}

// Maps the documented fields onto the groups the panel cares about:
//   needsYou - blocked on the user (permission, question, input)
//   working  - Claude is busy
//   finished - idle, Claude's last turn ended less than finishedHours ago and the
//              user has not answered yet: "your turn" (from the transcript)
//   idle     - everything else
export function classify(session, details = null, { finishedHours = 0 } = {}, now = Date.now()) {
	if (session.status === 'waiting' || session.state === 'blocked' || session.waitingFor) return 'needsYou';
	if (session.status === 'busy' || session.state === 'working') return 'working';
	const ended = details?.turnEndedAt || 0;
	if (ended && finishedHours > 0 && now - ended <= finishedHours * 3600 * 1000) {
		const id = session.sessionId || session.id;
		if (dismissed.get(id) !== ended) return 'finished';
	}
	return 'idle';
}

async function enrich(session, config, now) {
	let lastActivity = session.startedAt || null;
	let details = null;
	let path = '';
	if (session.cwd && session.sessionId) {
		path = transcriptPath(session.cwd, session.sessionId);
		try {
			const s = await stat(path);
			lastActivity = s.mtimeMs;
			details = await transcriptDetails(path);
		} catch {
			// No transcript yet (fresh session) - keep startedAt, no details.
		}
	}
	return {
		id: session.sessionId || session.id || String(session.pid),
		name: session.name || '',
		cwd: session.cwd || '',
		project: (session.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '', // Windows paths too
		kind: session.kind || '',
		status: session.status || '',
		waitingFor: session.waitingFor || '',
		startedAt: session.startedAt || null,
		lastActivity,
		turnEndedAt: details?.turnEndedAt || 0,
		group: classify(session, details, config, now),
		details,
		transcript: path,
	};
}

// The watcher and readers often ask at the same moment: share one run.
let pending = null;

export function listSessions(config, now = Date.now()) {
	if (cache.result && now - cache.at < CACHE_MS) return Promise.resolve(cache.result);
	if (!pending) pending = fetchSessions(config, now).finally(() => (pending = null));
	return pending;
}

async function fetchSessions(config, now) {
	const { claudeBin } = config;
	let result;
	try {
		const raw = await runAgentsJson(claudeBin);
		const sessions = await Promise.all(raw.map((s) => enrich(s, config, now)));
		forgetExcept(sessions.map((s) => s.transcript).filter(Boolean));
		result = { sessions, error: null, fetchedAt: now };
	} catch (err) {
		result = { sessions: [], error: err.code === 'ENOENT' ? `"${claudeBin}" not found` : err.message, fetchedAt: now };
	}
	cache = { at: now, result };
	return result;
}

// Splits sessions into the panel's sections. Idle sessions without activity for
// longer than the threshold are counted separately, so long-forgotten sessions
// do not push the important ones off a small screen.
export function groupSessions(sessions, { hideIdleAfterHours }, now = Date.now()) {
	const byRecent = (a, b) => (b.lastActivity || 0) - (a.lastActivity || 0);
	const limit = hideIdleAfterHours > 0 ? hideIdleAfterHours * 3600 * 1000 : Infinity;
	const idle = sessions.filter((s) => s.group === 'idle').sort(byRecent);
	const byFinished = (a, b) => b.turnEndedAt - a.turnEndedAt;
	return {
		needsYou: sessions.filter((s) => s.group === 'needsYou').sort(byRecent),
		finished: sessions.filter((s) => s.group === 'finished').sort(byFinished),
		working: sessions.filter((s) => s.group === 'working').sort(byRecent),
		idle: idle.filter((s) => now - (s.lastActivity || 0) <= limit),
		stale: idle.filter((s) => now - (s.lastActivity || 0) > limit),
	};
}

// "Seen it, later": the session drops to idle until its next turn ends.
export function dismiss(sessionId, turnEndedAt) {
	if (!sessionId || !turnEndedAt) return;
	dismissed.set(sessionId, turnEndedAt);
	if (dismissed.size > 500) dismissed.delete(dismissed.keys().next().value);
	cache = { at: 0, result: null };
}
