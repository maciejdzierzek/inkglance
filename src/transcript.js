// Optional details from session transcripts: title, last prompt, model, context,
// token counters, current tool.
//
// The transcript format is internal to Claude Code and may change between versions.
// Everything here is best-effort: unknown lines are skipped, every field is
// optional, and a parse failure only hides details - the session list itself
// comes from `claude agents --json`.
//
// Transcripts grow to tens of megabytes, so each file is read incrementally:
// the first poll reads it whole, later polls read only the appended bytes.

import { open, stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';

const states = new Map(); // path -> state

function emptyState() {
	return {
		offset: 0,
		size: 0,
		partial: '',
		customTitle: '',
		aiTitle: '',
		lastPrompt: '',
		prompts: 0,
		model: '',
		effort: '',
		branch: '',
		entrypoint: '',
		contextTokens: 0,
		outputById: new Map(),
		outputTokens: 0,
		currentTool: '',
		lastText: '',
		turnEndedAt: 0,
	};
}

const clip = (text, max) => {
	const s = String(text || '').replace(/\s+/g, ' ').trim();
	return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

// Short, human description of a tool call: "Bash: run tests", "Edit: server.js".
export function describeTool(block) {
	const input = block.input || {};
	const detail =
		input.description ||
		(input.file_path && input.file_path.split(/[\\/]/).pop()) ||
		input.pattern ||
		input.command ||
		input.url ||
		input.query ||
		input.prompt ||
		'';
	return clip(detail ? `${block.name}: ${detail}` : block.name, 90);
}

function promptText(content) {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		if (content.some((c) => c && c.type === 'tool_result')) return '';
		return content
			.filter((c) => c && c.type === 'text')
			.map((c) => c.text)
			.join(' ');
	}
	return '';
}

function applyLine(state, entry) {
	if (!entry || typeof entry !== 'object' || entry.isSidechain) return;
	if (entry.entrypoint) state.entrypoint = entry.entrypoint;
	switch (entry.type) {
		case 'custom-title':
			if (entry.customTitle) state.customTitle = entry.customTitle;
			break;
		case 'ai-title':
			if (entry.aiTitle) state.aiTitle = entry.aiTitle;
			break;
		case 'last-prompt':
			if (entry.lastPrompt) state.lastPrompt = entry.lastPrompt;
			break;
		case 'user': {
			if (entry.isMeta) break;
			const text = promptText(entry.message?.content);
			// "[Request interrupted by user]": the user stopped the turn at the computer.
			if (text.startsWith('[Request interrupted')) {
				state.turnEndedAt = 0;
				state.currentTool = '';
				break;
			}
			// Skip command wrappers and system reminders injected as user turns.
			if (text && !text.startsWith('<')) {
				state.prompts += 1;
				state.lastPrompt = text;
				state.currentTool = '';
				state.turnEndedAt = 0;
			}
			break;
		}
		case 'assistant': {
			const msg = entry.message || {};
			if (msg.model && !msg.model.startsWith('<')) state.model = msg.model;
			if (entry.effort) state.effort = entry.effort;
			if (entry.gitBranch) state.branch = entry.gitBranch;
			const u = msg.usage;
			if (u) {
				state.contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
				// One API message is written as several lines (one per content block);
				// count its output once.
				const id = msg.id || entry.requestId || entry.uuid;
				const prev = state.outputById.get(id) || 0;
				const out = u.output_tokens || 0;
				if (out > prev) {
					state.outputTokens += out - prev;
					state.outputById.set(id, out);
				}
			}
			for (const block of Array.isArray(msg.content) ? msg.content : []) {
				if (block?.type === 'tool_use') state.currentTool = describeTool(block);
				if (block?.type === 'text' && block.text) {
					state.lastText = block.text;
					state.currentTool = '';
				}
			}
			// The turn is over when Claude stops for any reason other than a tool call
			// (end_turn, max_tokens, an API error...): the next move is the user's.
			if (msg.stop_reason === 'tool_use') state.turnEndedAt = 0;
			else if (msg.stop_reason) state.turnEndedAt = Date.parse(entry.timestamp) || Date.now();
			break;
		}
		default:
	}
}

export function applyChunk(state, text) {
	const lines = (state.partial + text).split('\n');
	state.partial = lines.pop();
	for (const line of lines) {
		if (!line) continue;
		try {
			applyLine(state, JSON.parse(line));
		} catch {
			// Not JSON or an unexpected shape: skip.
		}
	}
}

// One read per file at a time: two overlapping reads would apply the same bytes
// twice and move the offset past the end, skipping the next lines.
const inFlight = new Map(); // path -> Promise<state>

function update(path) {
	let p = inFlight.get(path);
	if (!p) {
		p = readNew(path).finally(() => inFlight.delete(path));
		inFlight.set(path, p);
	}
	return p;
}

async function readNew(path) {
	let state = states.get(path);
	const s = await stat(path);
	if (!state || s.size < state.size) {
		state = emptyState(); // new file, or rewritten/truncated
		state.decoder = new StringDecoder('utf8'); // keeps characters split across reads whole
		states.set(path, state);
	}
	if (s.size > state.offset) {
		const fh = await open(path, 'r');
		try {
			const CHUNK = 4 * 1024 * 1024;
			while (state.offset < s.size) {
				const length = Math.min(CHUNK, s.size - state.offset);
				const buf = Buffer.alloc(length);
				const { bytesRead } = await fh.read(buf, 0, length, state.offset);
				if (!bytesRead) break;
				state.offset += bytesRead;
				applyChunk(state, state.decoder.write(buf.subarray(0, bytesRead)));
			}
		} finally {
			await fh.close();
		}
	}
	state.size = s.size;
	return state;
}

// Public summary for one transcript, or null when it cannot be read.
export async function transcriptDetails(path) {
	try {
		const s = await update(path);
		return {
			title: s.customTitle || s.aiTitle || '',
			lastPrompt: clip(s.lastPrompt, 160),
			prompts: s.prompts,
			model: s.model,
			effort: s.effort,
			branch: s.branch,
			entrypoint: s.entrypoint,
			contextTokens: s.contextTokens,
			outputTokens: s.outputTokens,
			currentTool: s.currentTool,
			turnEndedAt: s.turnEndedAt,
		};
	} catch {
		return null;
	}
}

// "claude-opus-5-5" -> "Opus 5.5"; unknown shapes are returned unchanged.
export function modelLabel(id) {
	const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id || '');
	if (!m) return id || '';
	const family = m[1][0].toUpperCase() + m[1].slice(1);
	return m[3] && m[3].length <= 2 ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`;
}

// Drops state for transcripts no longer listed, so memory stays bounded.
export function forgetExcept(paths) {
	const keep = new Set(paths);
	for (const key of states.keys()) if (!keep.has(key)) states.delete(key);
}
