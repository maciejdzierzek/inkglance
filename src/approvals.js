// Permission requests and Claude's multiple-choice questions answered from the reader.
//
// Claude Code runs our PermissionRequest hook (src/hook.sh) before it shows its
// own permission dialog, and shows the dialog only after the hook exits. So
// holding a request here hides the dialog on the computer. Rules that keep the
// computer the default place to answer:
//   - mode "off": never hold.
//   - mode "away" (default): hold only when the keyboard and mouse have been idle
//     for awaySeconds; release at once when the user comes back.
//   - mode "always": hold whenever the panel runs.
// Every hold ends after approvalTimeoutMinutes; a released request falls through
// to the normal dialog, so the panel can only add a way to answer, never remove one.

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { platform } from 'node:process';

export const APPROVAL_MODES = ['off', 'away', 'always'];
export const AWAY_PRESETS = [30, 60, 120, 300];
export const APPROVAL_TIMEOUT_PRESETS = [2, 5, 10];
const BACK_AT_DESK_SECONDS = 5;
const CHECK_MS = 2000;

// Seconds since the last keyboard or mouse input (macOS); null when unknown.
export function idleSeconds() {
	return new Promise((resolve) => {
		if (platform !== 'darwin') return resolve(null);
		execFile('ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
			if (err) return resolve(null);
			const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(out);
			resolve(m ? Number(m[1]) / 1e9 : null);
		});
	});
}

// Questions from Claude's AskUserQuestion tool, reduced to what the reader shows.
export function questionsOf(input) {
	const qs = input?.tool_input?.questions;
	if (!Array.isArray(qs)) return [];
	return qs.slice(0, 4).map((q) => ({
		question: String(q.question || ''),
		header: String(q.header || ''),
		multiSelect: !!q.multiSelect,
		options: (Array.isArray(q.options) ? q.options : []).slice(0, 6).map((o) => ({
			label: String(o.label || ''),
			description: String(o.description || ''),
		})),
	}));
}

// Short human summary of what is being asked.
export function summarize(input) {
	const tool = input?.tool_name || 'tool';
	const ti = input?.tool_input || {};
	const detail = ti.command || ti.file_path || ti.url || ti.pattern || ti.query || ti.description || ti.prompt || '';
	const text = String(detail).replace(/\s+/g, ' ').trim();
	return { tool, detail: text.length > 400 ? text.slice(0, 399) + '…' : text };
}

export function createApprovals({ getConfig, log, onChange, idle = idleSeconds }) {
	const pending = new Map(); // id -> { id, sessionId, cwd, tool, detail, createdAt, resolve, timer, watch }

	function finish(id, outcome) {
		const p = pending.get(id);
		if (!p) return false;
		clearTimeout(p.timer);
		clearInterval(p.watch);
		pending.delete(id);
		log('APPROVAL', outcome.decision || 'released', outcome.reason || '', p.tool, p.detail.slice(0, 80));
		p.resolve(outcome);
		for (const follower of p.followers) follower(outcome);
		onChange();
		return true;
	}

	// Decides whether to hold. Resolves with { decision: 'allow'|'deny', message }
	// or { decision: null } (fall through to the dialog on the computer).
	async function request(input, { onHold, kind = 'permission' } = {}) {
		const c = getConfig();
		if (c.approvals === 'off') return { decision: null, reason: 'off' };
		if (c.approvals === 'away') {
			const s = await idle();
			if (s === null || s < c.awaySeconds) return { decision: null, reason: 'at desk' };
		}
		// The same request may arrive twice (hooks from the plugin and from
		// settings.json): join the one already waiting instead of showing two cards.
		const key = `${kind}|${input?.session_id || ''}|${input?.tool_name || ''}|${JSON.stringify(input?.tool_input || {})}`;
		const twin = [...pending.values()].find((p) => p.key === key);
		if (twin) return new Promise((resolve) => twin.followers.push(resolve));
		const id = randomUUID();
		const { tool, detail } = summarize(input);
		return new Promise((resolve) => {
			const p = {
				id,
				key,
				kind,
				questions: kind === 'question' ? questionsOf(input) : [],
				followers: [],
				sessionId: input?.session_id || '',
				cwd: input?.cwd || '',
				tool,
				detail,
				createdAt: Date.now(),
				resolve,
			};
			p.timer = setTimeout(() => finish(id, { decision: null, reason: 'timeout' }), c.approvalTimeoutMinutes * 60 * 1000);
			if (c.approvals === 'away') {
				p.watch = setInterval(async () => {
					const s = await idle();
					if (s !== null && s < BACK_AT_DESK_SECONDS) finish(id, { decision: null, reason: 'back at desk' });
				}, CHECK_MS);
			}
			pending.set(id, p);
			log('APPROVAL', 'waiting', tool, detail.slice(0, 80));
			onChange();
			if (onHold) onHold(id);
		});
	}

	return {
		request,
		decide: (id, decision, message) => finish(id, { decision, message }),
		// Answers to an AskUserQuestion: { "<question text>": "<label>[, <label>]" }.
		answer: (id, answers) => finish(id, { decision: 'answer', answers }),
		get: (id) => pending.get(id),
		release: (id) => finish(id, { decision: null, reason: 'released on reader' }),
		// Called when the hook's HTTP connection closes early (session cancelled).
		drop: (id) => finish(id, { decision: null, reason: 'connection closed' }),
		list: () =>
			[...pending.values()].map(({ id, kind, questions, sessionId, cwd, tool, detail, createdAt }) => ({
				id,
				kind,
				questions,
				sessionId,
				cwd,
				tool,
				detail,
				createdAt,
			})),
	};
}
