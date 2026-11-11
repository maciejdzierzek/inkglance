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

export function transcriptPath(cwd, sessionId, home = homedir()) {
	return join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
}

function runAgentsJson(claudeBin) {
	return new Promise((resolve, reject) => {
		execFile(claudeBin, ['agents', '--json'], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
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

// Maps the documented fields onto three groups the panel cares about.
export function classify(session) {
	if (session.status === 'waiting' || session.state === 'blocked' || session.waitingFor) return 'needsYou';
	if (session.status === 'busy' || session.state === 'working') return 'working';
	return 'idle';
}

async function enrich(session) {
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
		project: (session.cwd || '').split('/').filter(Boolean).pop() || '',
		kind: session.kind || '',
		status: session.status || '',
		waitingFor: session.waitingFor || '',
		startedAt: session.startedAt || null,
		lastActivity,
		group: classify(session),
		details,
		transcript: path,
	};
}

export async function listSessions({ claudeBin }, now = Date.now()) {
	if (cache.result && now - cache.at < CACHE_MS) return cache.result;
	let result;
	try {
		const raw = await runAgentsJson(claudeBin);
		const sessions = await Promise.all(raw.map(enrich));
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
	return {
		needsYou: sessions.filter((s) => s.group === 'needsYou').sort(byRecent),
		working: sessions.filter((s) => s.group === 'working').sort(byRecent),
		idle: idle.filter((s) => now - (s.lastActivity || 0) <= limit),
		stale: idle.filter((s) => now - (s.lastActivity || 0) > limit),
	};
}

export function _resetCache() {
	cache = { at: 0, result: null };
}
