// Token activity per hour across all sessions, from transcripts.
//
// Every assistant message in a transcript carries a timestamp and its usage, so
// output tokens can be bucketed by hour - local, always fresh, independent of
// any limits source. Files are read incrementally (only appended bytes), and
// only those changed within the window.

import { open, readdir, stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOUR = 3600 * 1000;
const files = new Map(); // path -> { offset, size, partial, seen: Map(id -> out), hours: Map(hourStart -> tokens) }

export function bucket(state, entry) {
	if (entry?.type !== 'assistant' || !entry.timestamp) return;
	const u = entry.message?.usage;
	if (!u) return;
	const t = Date.parse(entry.timestamp);
	if (Number.isNaN(t)) return;
	// One message is written once per content block; count its output once.
	const id = entry.message?.id || entry.requestId || entry.uuid;
	const out = u.output_tokens || 0;
	const prev = state.seen.get(id) || 0;
	if (out <= prev) return;
	state.seen.set(id, out);
	const h = Math.floor(t / HOUR) * HOUR;
	state.hours.set(h, (state.hours.get(h) || 0) + out - prev);
}

async function update(path, size) {
	let st = files.get(path);
	if (!st || size < st.size) {
		st = { offset: 0, size: 0, partial: '', seen: new Map(), hours: new Map(), decoder: new StringDecoder('utf8') };
		files.set(path, st);
	}
	if (size > st.offset) {
		const fh = await open(path, 'r');
		try {
			while (st.offset < size) {
				const len = Math.min(4 * 1024 * 1024, size - st.offset);
				const buf = Buffer.alloc(len);
				const { bytesRead } = await fh.read(buf, 0, len, st.offset);
				if (!bytesRead) break;
				st.offset += bytesRead;
				const lines = (st.partial + st.decoder.write(buf.subarray(0, bytesRead))).split('\n');
				st.partial = lines.pop();
				for (const line of lines) {
					if (!line.includes('"assistant"')) continue;
					try {
						bucket(st, JSON.parse(line));
					} catch {
						// skip
					}
				}
			}
		} finally {
			await fh.close();
		}
	}
	st.size = size;
}

// Output tokens per hour for the last `hours` hours (oldest first). One run at
// a time: overlapping runs would read the same bytes twice.
let running = null;
export function hourlyTokens(hours = 24, now = Date.now(), root = join(homedir(), '.claude', 'projects')) {
	if (!running) running = collect(hours, now, root).finally(() => (running = null));
	return running;
}

async function collect(hours, now, root) {
	const from = Math.floor((now - hours * HOUR) / HOUR) * HOUR + HOUR;
	const active = new Set();
	const dirs = await readdir(root).catch(() => []);
	for (const dir of dirs) {
		const names = await readdir(join(root, dir)).catch(() => []);
		for (const name of names) {
			if (!name.endsWith('.jsonl')) continue;
			const path = join(root, dir, name);
			const s = await stat(path).catch(() => null);
			if (!s || s.mtimeMs < from) continue;
			active.add(path);
			await update(path, s.size).catch(() => {});
		}
	}
	// Memory stays bounded on a server that runs for weeks: forget files quiet for
	// the whole window and hours that fell out of it.
	for (const [path, st] of files) {
		if (!active.has(path)) files.delete(path);
		else for (const h of st.hours.keys()) if (h < from) st.hours.delete(h);
	}
	const totals = new Map();
	for (const st of files.values()) {
		for (const [h, n] of st.hours) if (h >= from) totals.set(h, (totals.get(h) || 0) + n);
	}
	const out = [];
	for (let h = from; h <= now; h += HOUR) out.push({ t: h, tokens: totals.get(h) || 0 });
	return out;
}
