#!/usr/bin/env node
// InkGlance - a Claude Code session panel for e-ink readers on the local network.
// Zero dependencies: Node's http server, server-rendered HTML, plain CSS.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hostname, networkInterfaces } from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import { loadConfig, saveConfig, applySettingsForm, configPath } from './config.js';
import { listSessions, groupSessions } from './sessions.js';
import { sessionsPage, settingsPage, pairingPage } from './render.js';
import { createPairing, makeSystemNotify } from './pairing.js';
import { t } from './i18n.js';
import { createWatcher } from './watcher.js';
import { createAlerts, playSound, inQuietHours } from './alerts.js';
import { getUsage } from './usage.js';
import { createApprovals } from './approvals.js';
import { createReplies, wakeText } from './replies.js';

const COOKIE = 'inkglance_t';
const LEGACY_COOKIE = 'inkai_t'; // before the rename: keeps paired readers paired
const MAX_BODY = 16 * 1024;
const css = readFileSync(new URL('../public/style.css', import.meta.url));
const file = configPath();
let config = loadConfig(file);

const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const pairing = createPairing({
	notify: (code) =>
		makeSystemNotify({ title: t(config.language, 'notify.title'), body: t(config.language, 'notify.body'), log })(code),
});

const alerts = createAlerts({ getConfig: () => config, label: (kind) => t(config.language, 'alert.' + kind), log });
let knownApprovals = new Set();
const approvals = createApprovals({
	getConfig: () => config,
	log,
	onChange: () => {
		watcher.bump();
		// A new request is an alert like a session starting to wait.
		const current = approvals.list();
		for (const a of current) {
			if (!knownApprovals.has(a.id)) alerts([{ kind: 'needsYou', session: { id: a.id, project: a.cwd.split('/').pop() || a.tool, name: a.tool } }]);
		}
		knownApprovals = new Set(current.map((a) => a.id));
	},
});
const watcher = createWatcher({
	getConfig: () => config,
	list: (cfg) => listSessions(cfg),
	onEvents: alerts,
	extraWaiting: () => approvals.list().map((a) => a.id),
});

const replies = createReplies({ getConfig: () => config, log, onChange: () => watcher.bump() });

const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

function sameToken(candidate) {
	if (!candidate) return false;
	const a = Buffer.from(String(candidate));
	const b = Buffer.from(config.token);
	return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req, name) {
	const header = req.headers.cookie || '';
	for (const part of header.split(';')) {
		const [k, ...v] = part.trim().split('=');
		if (k === name) return decodeURIComponent(v.join('='));
	}
	return '';
}

function readBody(req, limit = MAX_BODY) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > limit) {
				reject(new Error('body too large'));
				req.destroy();
			} else chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

function send(res, status, body, headers = {}) {
	res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
	res.end(body);
}

const html = (res, body, headers = {}) => send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers });

async function handle(req, res) {
	const url = new URL(req.url, 'http://panel');
	const ua = (req.headers['user-agent'] || '').slice(0, 80);
	if (url.pathname !== '/state') log(req.method, url.pathname, req.socket.remoteAddress, ua);

	if (url.pathname === '/style.css') return send(res, 200, css, { 'Content-Type': 'text/css; charset=utf-8' });
	if (url.pathname === '/health') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

	// Hooks from Claude Code on this computer (src/hook.sh): loopback only, token in a header.
	if (url.pathname.startsWith('/hook/') && req.method === 'POST') {
		if (!isLoopback(req.socket.remoteAddress) || !sameToken(req.headers['x-inkglance-token'])) return send(res, 403, 'forbidden');
		let input = {};
		try {
			input = JSON.parse(await readBody(req, 2 * 1024 * 1024));
		} catch {
			return send(res, 204, '');
		}
		if (url.pathname === '/hook/prompt') {
			replies.userTyped(input.session_id || '');
			return send(res, 204, '');
		}
		if (url.pathname === '/hook/stop') {
			const sid = input.session_id || '';
			res.on('close', () => {
				if (!res.writableEnded) replies.drop(sid);
			});
			const outcome = await replies.open(sid);
			if (!outcome.reply) return send(res, 204, '');
			return send(res, 200, wakeText(outcome.reply), { 'Content-Type': 'text/plain; charset=utf-8' });
		}
		if (url.pathname === '/hook/question') {
			let heldId = null;
			res.on('close', () => {
				if (heldId && !res.writableEnded) approvals.drop(heldId);
			});
			const outcome = await approvals.request(input, { kind: 'question', onHold: (id) => (heldId = id) });
			if (outcome.decision !== 'answer') return send(res, 204, '');
			// Filling the tool's own "answers" field: Claude gets a normal answer and
			// the dialog on the computer is skipped.
			const body = {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'allow',
					updatedInput: { ...(input.tool_input || {}), answers: outcome.answers },
				},
			};
			return send(res, 200, JSON.stringify(body), { 'Content-Type': 'application/json' });
		}
		if (url.pathname !== '/hook/permission') return send(res, 404, '');
		let heldId = null;
		res.on('close', () => {
			if (heldId && !res.writableEnded) approvals.drop(heldId);
		});
		const outcome = await approvals.request(input, { onHold: (id) => (heldId = id) });
		if (!outcome.decision) return send(res, 204, '');
		// The hook prints this as-is: Claude Code's PermissionRequest decision format.
		const decision =
			outcome.decision === 'allow'
				? { behavior: 'allow' }
				: { behavior: 'deny', message: outcome.message || 'Denied from the InkGlance panel.' };
		return send(res, 200, JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }), {
			'Content-Type': 'application/json',
		});
	}

	// Access: token from the link (then remembered in a cookie) or from the cookie.
	// Without either, the device pairs with a short code shown on the computer.
	const queryToken = url.searchParams.get('t');
	const viaQuery = sameToken(queryToken);
	const viaCookie = sameToken(readCookie(req, COOKIE)) || sameToken(readCookie(req, LEGACY_COOKIE));
	if (!viaQuery && !viaCookie) return handlePairing(req, res, url);
	const cookie = viaQuery
		? { 'Set-Cookie': `${COOKIE}=${encodeURIComponent(config.token)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax` }
		: {};

	const keepParams = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 't'));
	// Until the browser proves it keeps cookies, links carry the token too.
	const ctx = { config, now: Date.now(), path: url.pathname, keepParams, tokenInLinks: !viaCookie };

	if (req.method === 'GET' && url.pathname === '/') {
		const data = await listSessions(config, ctx.now);
		const groups = groupSessions(data.sessions, config, ctx.now);
		const usage = config.showLimits ? await getUsage(config, ctx.now) : null;
		const extras = { usage, approvals: approvals.list(), canReply: (id) => replies.isOpen(id) };
		return html(res, sessionsPage(ctx, data, groups, extras, { showStale: url.searchParams.get('stale') === '1' }), cookie);
	}

	// Tiny poll for readers: a version that moves when the panel would change,
	// plus the waiting sessions, so the reader can refresh and flash at once.
	if (url.pathname === '/state') {
		const body = JSON.stringify({
			...watcher.state(),
			flash: config.readerFlash && config.alertOn.includes('needsYou') && !inQuietHours(config.quietHours),
		});
		return send(res, 200, body, { 'Content-Type': 'application/json' });
	}

	if (url.pathname === '/settings') {
		if (req.method === 'POST') {
			const form = new URLSearchParams(await readBody(req));
			if (!sameToken(form.get('t'))) return send(res, 403, 'forbidden');
			const before = config;
			config = applySettingsForm(config, form);
			// Let the user hear a newly chosen sound, or the sound just switched on.
			if (config.macSound && (config.macSoundName !== before.macSoundName || !before.macSound)) playSound(config.macSoundName);
			saveConfig(config, file);
			log('settings saved', JSON.stringify({ ...config, token: '***' }));
			const params = new URLSearchParams();
			if (!viaCookie) params.set('t', config.token);
			const qs = params.toString();
			return send(res, 303, '', { Location: `/settings${qs ? '?' + qs : ''}` });
		}
		return html(res, settingsPage(ctx, { configFile: file }), cookie);
	}

	// Answer from the reader: allow, deny, or hand back to the computer.
	if (url.pathname === '/approve' && req.method === 'POST') {
		const form = new URLSearchParams(await readBody(req));
		if (!sameToken(form.get('t'))) return send(res, 403, 'forbidden');
		const id = form.get('id');
		const action = form.get('action');
		if (action === 'allow') approvals.decide(id, 'allow');
		else if (action === 'deny') approvals.decide(id, 'deny', t(config.language, 'approval.deniedMessage'));
		else approvals.release(id);
		const qs = viaCookie ? '' : `?t=${config.token}`;
		return send(res, 303, '', { Location: `/${qs}` });
	}

	// Answer to one of Claude's questions, from the reader.
	if (url.pathname === '/answer' && req.method === 'POST') {
		const form = new URLSearchParams(await readBody(req));
		if (!sameToken(form.get('t'))) return send(res, 403, 'forbidden');
		const id = form.get('id');
		const held = approvals.get(id);
		if (held && form.get('action') === 'release') approvals.release(id);
		else if (held) {
			const answers = {};
			held.questions.forEach((q, i) => {
				const picked = form.getAll(`q${i}`).filter((v) => q.options.some((o) => o.label === v));
				if (picked.length) answers[q.question] = picked.join(', ');
			});
			if (Object.keys(answers).length) approvals.answer(id, answers);
		}
		const qs = viaCookie ? '' : `?t=${config.token}`;
		return send(res, 303, '', { Location: `/${qs}` });
	}

	// Reply from the reader to a session that finished its turn.
	if (url.pathname === '/reply' && req.method === 'POST') {
		const form = new URLSearchParams(await readBody(req));
		if (!sameToken(form.get('t'))) return send(res, 403, 'forbidden');
		const text = (form.get('text') || '').trim();
		if (text) replies.send(form.get('session') || '', text);
		const qs = viaCookie ? '' : `?t=${config.token}`;
		return send(res, 303, '', { Location: `/${qs}` });
	}

	if (url.pathname === '/diag') {
		const p = url.searchParams;
		log('DIAG', `viewport ${p.get('w')}x${p.get('h')} dpr ${p.get('r')}`, `cookie ${viaCookie ? 'yes' : 'no'}`, p.get('ua'));
		return send(res, 204, '');
	}

	return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
}

async function handlePairing(req, res, url) {
	const page = (error) => send(res, 200, pairingPage(config.language, { error }), { 'Content-Type': 'text/html; charset=utf-8' });
	if (req.method === 'POST' && url.pathname === '/pair') {
		const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
		const result = pairing.check(form.code);
		log('PAIRING', result, req.socket.remoteAddress);
		if (result === 'ok') {
			// The address after pairing carries the token, so a bookmark works even
			// in browsers that drop cookies.
			return send(res, 303, '', {
				Location: `/?t=${config.token}`,
				'Set-Cookie': `${COOKIE}=${encodeURIComponent(config.token)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`,
			});
		}
		if (result === 'expired') pairing.ensureCode();
		return page(result);
	}
	pairing.ensureCode();
	return page(null);
}

function lanAddresses() {
	return Object.values(networkInterfaces())
		.flat()
		.filter((i) => i && i.family === 'IPv4' && !i.internal)
		.map((i) => i.address);
}

const server = createServer((req, res) => {
	handle(req, res).catch((err) => {
		log('ERROR', err.stack || err.message);
		if (!res.headersSent) send(res, 500, 'internal error', { 'Content-Type': 'text/plain' });
	});
});

// Browsers that try HTTPS first send a TLS handshake to this plain-HTTP port.
// Log it, so "the page does not load" can be told apart from "nothing arrives".
server.on('clientError', (err, socket) => {
	log('CLIENT ERROR', socket.remoteAddress, err.code || err.message, err.rawPacket?.[0] === 0x16 ? '(TLS handshake: browser tried https://)' : '');
	socket.destroy();
});

server.on('error', (err) => {
	if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
		console.error(`Cannot listen on port ${config.port} (${err.code}). Set another "port" in ${file}.`);
		process.exit(1);
	}
	throw err;
});

// Port and token for src/hook.sh (a shell script cannot read the JSON config
// reliably without extra tools). Rewritten on every start, so it follows the config.
function writeHookEnv() {
	const envFile = join(dirname(file), 'hook.env');
	writeFileSync(envFile, `INKGLANCE_PORT=${config.port}\nINKGLANCE_TOKEN=${config.token}\n`, { mode: 0o600 });
}

server.listen(config.port, config.host, () => {
	writeHookEnv();
	watcher.start();
	const host = hostname().replace(/\.local$/, '');
	const port = config.port === 80 ? '' : `:${config.port}`;
	console.log(`InkGlance is running. Open on your e-reader (same Wi-Fi) and type the code shown here:`);
	for (const ip of lanAddresses()) console.log(`  http://${ip}${port}`);
	console.log(`  http://${host}.local${port}`);
	console.log(`Config: ${file}`);
});
