// Server-side HTML for e-ink browsers.
//
// Pages work without JavaScript (meta refresh, plain forms). With JavaScript the
// panel updates in place (fetch + swap), which keeps fullscreen mode alive and
// avoids a full-page flash on e-ink. Measured target: PocketBook Verse Pro Color,
// Chrome 122 engine, viewport 572x663 CSS px.

import { homedir } from 'node:os';
import { t, relativeTime, clockTime, elapsed } from './i18n.js';
import { SETTINGS_TABS, LANGUAGES, FONT_SCALES, COLUMNS, ORIENTATIONS, ALERT_KINDS, MAC_SOUNDS, QUIET_PRESETS, USAGE_SOURCES, USAGE_API_PRESETS, APPROVAL_MODES, AWAY_PRESETS, APPROVAL_TIMEOUT_PRESETS, REPLY_WINDOW_PRESETS, CARD_FIELDS, REFRESH_PRESETS, IDLE_PRESETS, FINISHED_PRESETS } from './config.js';
import { modelLabel } from './transcript.js';
import { forecast, PERIODS } from './usage.js';
import { lineChart, barChart } from './charts.js';

export const esc = (value) =>
	String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const tildePath = (path) => {
	const home = homedir();
	return path.startsWith(home) ? '~' + path.slice(home.length) : path;
};

const compact = (lang, n) => new Intl.NumberFormat(lang, { notation: 'compact', maximumSignificantDigits: 3 }).format(n);

// Builds a link that keeps the access token when the browser does not hold the cookie.
export function makeHref(ctx) {
	return (path, params = {}) => {
		const query = new URLSearchParams(params);
		if (ctx.tokenInLinks) query.set('t', ctx.config.token);
		const qs = query.toString();
		return qs ? `${path}?${qs}` : path;
	};
}

const ICONS = {
	settings:
		'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
	fullscreen:
		'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/></svg>',
	refresh:
		'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M20 11a8 8 0 1 0-2.3 5.7"/><path fill="currentColor" d="M21 4v7h-7z"/></svg>',
	limits:
		'<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M3 20h18M6 17V11M11 17V5M16 17v-8M21 17v-4"/></svg>',
	back: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="M15 4l-8 8 8 8"/></svg>',
};

// In-place updates and fullscreen. Runs only where JavaScript works; the page
// stays fully usable without it.
function liveScript(ctx, { live }) {
	const { config } = ctx;
	const beacon = config.showDiagnostics ? makeHref(ctx)('/diag') : '';
	const stateUrl = makeHref(ctx)('/state');
	return `<script>
(function () {
	var fs = document.getElementById('fs');
	if (fs && document.documentElement.requestFullscreen) {
		fs.hidden = false;
		fs.addEventListener('click', function () {
			if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
		});
	}
	var beacon = ${JSON.stringify(beacon)};
	function diag() {
		var w = window.innerWidth, h = window.innerHeight, r = window.devicePixelRatio || 1;
		var el = document.getElementById('diag');
		if (el) el.textContent = 'JS ok · ' + w + '×' + h + ' · dpr ' + r + (document.fullscreenElement ? ' · fullscreen' : '') + ' · ' + navigator.userAgent;
		if (beacon) new Image().src = beacon + (beacon.indexOf('?') < 0 ? '?' : '&') + 'w=' + w + '&h=' + h + '&r=' + r + '&fs=' + (document.fullscreenElement ? 1 : 0) + '&ua=' + encodeURIComponent(navigator.userAgent);
	}
	diag();
	document.addEventListener('fullscreenchange', diag);
	// Deal cards into columns, each to the shortest column so far: priority order
	// is kept (first card top left, second top right) and no card leaves a hole.
	function deal() {
		var b = document.querySelector('.board');
		var n = b ? Number(b.getAttribute('data-cols')) || 1 : 1;
		if (!b || n < 2 || b.className.indexOf('dealt') >= 0) return;
		var cards = [].slice.call(b.children);
		var heights = cards.map(function (c) { return c.offsetHeight; });
		var cols = [], sums = [];
		for (var i = 0; i < n; i++) { cols.push(document.createElement('div')); cols[i].className = 'col'; sums.push(0); }
		cards.forEach(function (c, k) {
			var j = sums.indexOf(Math.min.apply(null, sums));
			cols[j].appendChild(c);
			sums[j] += heights[k] + 8;
		});
		cols.forEach(function (col) { b.appendChild(col); });
		b.className += ' dealt';
	}
	deal();
	${
		live
			? `var every = ${config.refreshSeconds * 1000};
	function refresh() {
		fetch(location.href, { cache: 'no-store', credentials: 'same-origin' })
			.then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
			.then(function (html) {
				var next = new DOMParser().parseFromString(html, 'text/html').getElementById('app');
				var app = document.getElementById('app');
				if (next && app) { app.replaceWith(next); deal(); diag(); }
			})
			.catch(function () {
				var off = document.getElementById('offline');
				if (off) off.hidden = false;
			});
	}
	setInterval(refresh, every);
	// One single-choice question: a tap on an option is the answer.
	document.addEventListener('change', function (e) {
		var form = e.target.closest && e.target.closest('form.answer-single');
		if (form && e.target.type === 'radio') form.submit();
	});
	// Quick poll: refresh as soon as anything changes; flash the screen when a
	// session starts waiting or finishes a turn (inverting colors is very visible on e-ink).
	var stateUrl = ${JSON.stringify(stateUrl)}, known = null, knownDone = null, lastV = null;
	function flash() {
		var h = document.documentElement, n = 0;
		(function step() { h.classList.toggle('flash'); if (++n < 4) setTimeout(step, 700); })();
	}
	function poll() {
		fetch(stateUrl, { cache: 'no-store', credentials: 'same-origin' })
			.then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
			.then(function (st) {
				var off = document.getElementById('offline');
				if (off) off.hidden = true;
				var fresh = known ? st.waiting.filter(function (id) { return known.indexOf(id) < 0; }) : [];
				var done = st.finished || [];
				var freshDone = knownDone ? done.filter(function (id) { return knownDone.indexOf(id) < 0; }) : [];
				known = st.waiting;
				knownDone = done;
				if (lastV !== null && st.v !== lastV) refresh();
				lastV = st.v;
				if ((fresh.length && st.flash) || (freshDone.length && st.flashFinished)) flash();
			})
			.catch(function () {
				var off = document.getElementById('offline');
				if (off) off.hidden = false;
			});
	}
	poll();
	setInterval(poll, ${10 * 1000});
	document.addEventListener('click', function (e) {
		var a = e.target.closest && e.target.closest('a[data-live]');
		if (a) { e.preventDefault(); history.replaceState(null, '', a.href); refresh(); }
	});`
			: ''
	}
})();
</script>`;
}

function layout(ctx, { title, active, summary, body, live, usage }) {
	const { config } = ctx;
	const lang = config.language;
	const href = makeHref(ctx);
	const refreshButton = live
		? `<a class="icon" href="${esc(href(ctx.path, ctx.keepParams))}" data-live title="${esc(t(lang, 'nav.refresh'))}">${ICONS.refresh}</a>`
		: '';
	const updateBadge =
		ctx.update?.available && active === 'sessions'
			? `<a class="update-badge" href="${esc(href('/settings', { tab: 'about' }))}">${esc(t(lang, 'about.badge', { version: ctx.update.latest.version }))}</a>`
			: '';
	const limitsButton =
		active === 'sessions' && !config.showLimits ? `<a class="icon" href="${esc(href('/limits'))}" title="${esc(t(lang, 'nav.limits'))}">${ICONS.limits}</a>` : '';
	const right =
		active === 'settings' || active === 'limits'
			? `<a class="icon" href="${esc(href('/'))}" title="${esc(t(lang, 'nav.back'))}">${ICONS.back}<span>${esc(t(lang, 'nav.back'))}</span></a>`
			: `<a class="icon" href="${esc(href('/settings'))}" title="${esc(t(lang, 'nav.settings'))}">${ICONS.settings}</a>`;
	const footer = [
		esc(t(lang, 'footer.rendered', { time: clockTime(lang, ctx.now) })),
		live ? esc(t(lang, 'footer.refresh', { seconds: config.refreshSeconds })) : '',
		usage?.observedAt ? esc(t(lang, 'limits.age', { when: relativeTime(lang, usage.observedAt, ctx.now) })) : '',
	]
		.filter(Boolean)
		.join(' · ');
	return `<!DOCTYPE html>
<html lang="${lang}" class="rot-${config.orientation}" style="font-size:${Math.round(16 * config.fontScale * 10) / 10}px">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${live ? `<noscript><meta http-equiv="refresh" content="${config.refreshSeconds}"></noscript>` : ''}
<title>${esc(title)}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.png" type="image/png">
<link rel="stylesheet" href="/style.css">
</head>
<body class="${config.color ? 'color' : 'mono'}">
<div id="app">
<div class="bar">
<div class="bar-left">${summary}${updateBadge}</div>
<div class="bar-right">
${refreshButton}
${limitsButton}
<button type="button" class="icon" id="fs" hidden title="${esc(t(lang, 'nav.fullscreen'))}">${ICONS.fullscreen}</button>
${right}
</div>
</div>
${body}
<div class="footer">${footer}
<span id="offline" class="offline" hidden> · ${esc(t(lang, 'footer.offline'))}</span>
${config.showDiagnostics ? '<div class="diag" id="diag">JS: -</div>' : ''}
</div>
</div>
${liveScript(ctx, { live })}
</body>
</html>`;
}

// Small line icons (24x24, currentColor): states, places, numbers.
const svg = (body, size = 18) =>
	`<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const GLYPHS = {
	needsYou: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
	permission: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
	question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01"/>',
	finished: '<circle cx="12" cy="12" r="9"/><path d="m7.5 12.5 3 3 6-6.5"/>',
	working: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor"/>',
	idle: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
	cli: '<path d="m5 8 4 4-4 4M12 17h7"/>',
	'claude-vscode': '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
	'claude-desktop': '<rect x="3" y="4" width="18" height="15" rx="1"/><path d="M3 8h18"/>',
	context: '<path d="M4 7l8-4 8 4-8 4z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
	output: '<path d="M12 20V5M6 11l6-6 6 6"/>',
	model: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
	branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>',
};
const icon = (name, size) => (GLYPHS[name] ? svg(GLYPHS[name], size) : '');

// Numbers the same way in every language: 84k, 1.2M.
const short = (n) => new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(n).toLowerCase();

// One card shape for everything: a state band (icon, label, time), the title,
// where it runs, then what the user chose to see. Idle sessions are two lines.
function card(ctx, s) {
	const lang = ctx.config.language;
	const fields = new Set(ctx.config.cardFields);
	const d = s.details || {};
	const title = d.title || s.name || s.project;
	const whereLabel = d.entrypoint ? (t(lang, 'where.' + d.entrypoint).startsWith('where.') ? d.entrypoint : t(lang, 'where.' + d.entrypoint)) : '';
	const sub = [s.project];
	if (fields.has('where') && whereLabel) sub.push(whereLabel);
	if (fields.has('branch') && d.branch) sub.push(d.branch);
	const subLine = `<div class="sub">${fields.has('where') && d.entrypoint ? icon(d.entrypoint, 14) : ''}${esc(sub.join(' · '))}</div>`;

	if (s.group === 'idle') {
		const when = elapsed(lang, s.lastActivity, ctx.now);
		return `<article class="card st-idle">
<div class="idle-head">${icon('idle', 16)}<span class="title1">${esc(title)}</span></div>
<div class="sub">${esc(sub.join(' · '))}${when ? ` · ${esc(when)}` : ''}</div>
</article>`;
	}

	const rows = [];
	if (fields.has('waitingFor') && s.waitingFor) rows.push(`<div class="waiting">${esc(s.waitingFor)}</div>`);
	if (fields.has('activity') && s.group === 'working' && d.currentTool) rows.push(`<div class="activity">${esc(d.currentTool)}</div>`);
	if (fields.has('lastPrompt') && d.lastPrompt) rows.push(`<div class="prompt">${esc(d.lastPrompt)}</div>`);
	const meta = [];
	if (fields.has('model') && d.model) meta.push(`<span>${esc(modelLabel(d.model) + (d.effort ? ` ${d.effort}` : ''))}</span>`);
	if (fields.has('context') && d.contextTokens) meta.push(`<span title="${esc(t(lang, 'field.context'))}">${icon('context', 13)}${short(d.contextTokens)}</span>`);
	if (fields.has('tokens') && d.outputTokens) meta.push(`<span title="${esc(t(lang, 'field.tokens'))}">${icon('output', 13)}${short(d.outputTokens)}</span>`);
	if (meta.length) rows.push(`<div class="meta">${meta.join('')}</div>`);
	if (fields.has('path') && s.cwd) rows.push(`<div class="path">${esc(tildePath(s.cwd))}</div>`);
	if (ctx.canReply?.(s.id)) rows.push(replyForm(ctx, s));
	if (s.group === 'finished') {
		rows.push(`<form method="post" action="${esc(makeHref(ctx)('/dismiss'))}" class="done-later"><input type="hidden" name="t" value="${esc(ctx.config.token)}"><input type="hidden" name="session" value="${esc(s.id)}"><input type="hidden" name="turn" value="${esc(s.turnEndedAt)}"><button type="submit" class="chip">${esc(t(lang, 'finished.later'))}</button></form>`);
	}

	// Finished: the time since the turn ended is the point, so it is big.
	const since = s.group === 'finished' ? s.turnEndedAt : s.lastActivity;
	const time = s.group === 'finished' || fields.has('times') ? elapsed(lang, since, ctx.now) : '';
	return `<article class="card st-${s.group}">
<header class="band">${icon(s.group)}<span class="band-label">${esc(t(lang, 'status.' + s.group))}</span><span class="band-time">${esc(time)}</span></header>
<div class="title">${esc(title)}</div>
${subLine}
${rows.join('\n')}
</article>`;
}

export function templatesFor(config) {
	return config.templates.length ? config.templates : t(config.language, 'templates.default').split('|');
}

// One-tap replies for a session whose turn is over; the session stays usable on
// the computer at the same time (see replies.js).
function replyForm(ctx, s) {
	const href = makeHref(ctx);
	const buttons = templatesFor(ctx.config)
		.map((text) => `<button type="submit" name="text" value="${esc(text)}" class="chip">${esc(text)}</button>`)
		.join('');
	return `<form method="post" action="${esc(href('/reply'))}" class="reply">
<input type="hidden" name="t" value="${esc(ctx.config.token)}"><input type="hidden" name="session" value="${esc(s.id)}">${buttons}
</form>`;
}

// Cards in priority order on one board. Without JavaScript the board is a plain
// grid; with it, cards are dealt into columns, each to the shortest one, so a
// tall card never leaves a hole next to a short one (see liveScript).
function board(ctx, cards) {
	if (!cards.length) return '';
	return `<div class="board cols-${ctx.config.columns}" data-cols="${ctx.config.columns}">
${cards.join('\n')}
</div>`;
}

// Limits strip: both windows on one row, each with %, reset and forecast.
function limitsStrip(ctx, usage) {
	const lang = ctx.config.language;
	if (!usage) return '';
	if (usage.error) return `<div class="limits limits-error">${esc(t(lang, 'limits.unavailable', { reason: usage.error }))}</div>`;
	const when = (ms) => {
		const d = new Date(ms);
		const sameDay = new Date(ctx.now).toDateString() === d.toDateString();
		return new Intl.DateTimeFormat(lang, sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
	};
	const cell = (key) => {
		const w = usage[key];
		if (!w) return '';
		const name = `<span class="limit-name">${esc(t(lang, 'limits.' + key))}</span>`;
		// The window has reset since this reading: its number no longer applies.
		if (w.resetAt && w.resetAt <= ctx.now) {
			return `<div class="limit">${name}<span class="meter"><span style="width:0%"></span></span><b>–</b><div class="limit-note">${esc(t(lang, 'limits.expired'))}</div></div>`;
		}
		const pct = Math.round(w.used * 100);
		const f = forecast(w, PERIODS[key], ctx.now);
		const notes = [];
		if (f?.fullAt) notes.push(t(lang, 'limits.fullAt', { when: when(f.fullAt) }));
		else if (f) notes.push(t(lang, 'limits.forecast', { pct: Math.min(100, Math.round(f.atReset * 100)) }));
		if (w.resetAt) notes.push(t(lang, 'limits.reset', { when: when(w.resetAt) }));
		const level = pct >= 90 || f?.fullAt ? ' meter-hot' : pct >= 70 ? ' meter-warm' : '';
		return `<div class="limit">${name}<span class="meter${level}"><span style="width:${Math.min(100, pct)}%"></span></span><b>${pct}%</b><div class="limit-note">${esc(notes.join(' · '))}</div></div>`;
	};
	return `<a class="limits" href="${esc(makeHref(ctx)('/limits'))}">${cell('fiveHour')}${cell('sevenDay')}</a>`;
}

// Permission requests and questions held for the reader, as cards on the board.
// Plain forms, so they work without JavaScript.
function approvalCards(ctx, list, sessions) {
	const lang = ctx.config.language;
	const href = makeHref(ctx);
	const byId = new Map(sessions.map((s) => [s.id, s]));
	const lastPart = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
	return list.map((a) => {
		const s = byId.get(a.sessionId);
		const title = s?.details?.title || s?.name || lastPart(a.cwd);
		const project = s?.project || lastPart(a.cwd);
		const kind = a.kind === 'question' ? 'question' : 'permission';
		const head = `<header class="band">${icon(kind)}<span class="band-label">${esc(t(lang, kind === 'question' ? 'question.badge' : 'approval.badge'))}</span><span class="band-time">${esc(elapsed(lang, a.createdAt, ctx.now))}</span></header>
<div class="title">${esc(title)}</div>
${project && project !== title ? `<div class="sub">${esc(project)}</div>` : ''}`;
		const hidden = `<input type="hidden" name="t" value="${esc(ctx.config.token)}"><input type="hidden" name="id" value="${esc(a.id)}">`;
		if (kind === 'question') {
			const single = a.questions.length === 1 && !a.questions[0].multiSelect;
			const blocks = a.questions
				.map((q, i) => {
					const type = q.multiSelect ? 'checkbox' : 'radio';
					const opts = q.options
						.map((o) => `<label class="choice option"><input type="${type}" name="q${i}" value="${esc(o.label)}"><span><b>${esc(o.label)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></label>`)
						.join('');
					return `<div class="question"><div class="q-text">${esc(q.question)}</div><div class="options">${opts}</div></div>`;
				})
				.join('');
			return `<article class="card st-needsYou approval">
${head}
<form method="post" action="${esc(href('/answer'))}" class="answer${single ? ' answer-single' : ''}">${hidden}
${blocks}
<div class="approval-actions">${single ? '' : `<button type="submit" class="button btn-allow">${esc(t(lang, 'question.send'))}</button>`}<button type="submit" name="action" value="release" class="button btn-release">${esc(t(lang, 'approval.release'))}</button></div>
</form>
</article>`;
		}
		const button = (action, cls) => `<button type="submit" name="action" value="${action}" class="button ${cls}">${esc(t(lang, 'approval.' + action))}</button>`;
		return `<article class="card st-needsYou approval">
${head}
<div class="ask"><b>${esc(a.tool)}</b>${a.detail ? `<code>${esc(a.detail)}</code>` : ''}</div>
<form method="post" action="${esc(href('/approve'))}" class="approval-actions">${hidden}
${button('allow', 'btn-allow')}${button('deny', 'btn-deny')}${button('release', 'btn-release')}
</form>
</article>`;
	});
}

// Limits screen: the strip, then three charts with one series each.
export function limitsPage(ctx, usage, charts) {
	const lang = ctx.config.language;
	const day = (ms, opts) => new Intl.DateTimeFormat(lang, opts).format(new Date(ms));
	const parts = [limitsStrip(ctx, usage).replace(/^<a class="limits"[^>]*>/, '<div class="limits">').replace(/<\/a>$/, '</div>')];
	if (charts.week?.points.length) {
		const ticks = [];
		for (let t = charts.week.from; t <= charts.week.to; t += 86400000) ticks.push({ t, label: day(t, { weekday: 'short' }) });
		const f = usage?.sevenDay ? forecast(usage.sevenDay, PERIODS.sevenDay, ctx.now) : null;
		parts.push(
			`<h2>${esc(t(lang, 'charts.week'))}</h2>` +
				lineChart({
					...charts.week,
					projection: f ? { t: charts.week.to, v: f.atReset } : null,
					xTicks: ticks,
					title: t(lang, 'charts.week'),
				}),
		);
	}
	if (charts.tokens?.some((h) => h.tokens > 0)) {
		const total = charts.tokens.reduce((sum, h) => sum + h.tokens, 0);
		const bars = charts.tokens.map((h, i) => ({
			v: h.tokens,
			current: i === charts.tokens.length - 1,
			label: new Date(h.t).getHours() % 6 === 0 ? day(h.t, { hour: '2-digit', minute: '2-digit' }) : '',
		}));
		parts.push(
			`<h2>${esc(t(lang, 'charts.tokens', { total: compact(lang, total) }))}</h2>` +
				barChart({ bars, format: (v) => compact(lang, v), title: t(lang, 'charts.tokens', { total: compact(lang, total) }) }),
		);
	}
	// The 5-hour line needs a few readings to say anything.
	if (charts.day.points.length >= 4) {
		const ticks = [];
		const start = Math.ceil(charts.day.from / (6 * 3600000)) * 6 * 3600000;
		for (let t = start; t <= charts.day.to; t += 6 * 3600000) ticks.push({ t, label: day(t, { hour: '2-digit', minute: '2-digit' }) });
		parts.push(`<h2>${esc(t(lang, 'charts.day'))}</h2>` + lineChart({ ...charts.day, xTicks: ticks, title: t(lang, 'charts.day') }));
	}
	if (charts.weeks.length > 1) {
		const bars = charts.weeks.map((w) => ({ ...w, label: day(w.resetAt - PERIODS.sevenDay, { day: 'numeric', month: 'numeric' }) }));
		parts.push(`<h2>${esc(t(lang, 'charts.weeks'))}</h2>` + barChart({ bars, title: t(lang, 'charts.weeks') }) + `<p class="muted small">${esc(t(lang, 'charts.weeksNote'))}</p>`);
	}
	if (parts.length === 1) parts.push(`<p class="empty">${esc(t(lang, 'charts.empty'))}</p>`);
	const body = `<div id="main">${parts.join('\n')}</div>`;
	const summary = `<span class="bar-title">${esc(t(lang, 'nav.limits'))}</span>`;
	return layout(ctx, { title: t(lang, 'nav.limits'), active: 'limits', summary, body, live: true });
}

export function sessionsPage(ctx, data, groups, { usage, approvals: approvalList, canReply }, { showStale }) {
	ctx.canReply = canReply;
	const lang = ctx.config.language;
	const href = makeHref(ctx);
	// Four tiles, readable from across the desk. A tile that wants you is filled.
	const tile = (key, n, glyph) =>
		`<div class="tile tile-${key}${n ? ' on' : ''}"><span class="tile-top">${icon(glyph, 20)}<b>${n}</b></span><span class="tile-label">${esc(t(lang, 'summary.' + key))}</span></div>`;
	const summary = `<div class="tiles">${[
		tile('needsYou', groups.needsYou.length + approvalList.length, 'needsYou'),
		tile('finished', groups.finished.length, 'finished'),
		tile('working', groups.working.length, 'working'),
		tile('idle', groups.idle.length + groups.stale.length, 'idle'),
	].join('')}</div>`;

	let body = limitsStrip(ctx, usage) + '<div id="main">';
	if (data.error) body += `<div class="error"><b>${esc(t(lang, 'error.title'))}</b><br>${esc(data.error)}</div>`;
	else if (!data.sessions.length && !approvalList.length) body += `<p class="empty">${esc(t(lang, 'empty'))}</p>`;
	const list = [...groups.needsYou, ...groups.finished, ...groups.working, ...groups.idle, ...(showStale ? groups.stale : [])];
	body += board(ctx, [...approvalCards(ctx, approvalList, data.sessions), ...list.map((s) => card(ctx, s))]);
	if (groups.stale.length) {
		const label = esc(t(lang, 'section.stale', { count: groups.stale.length, hours: ctx.config.hideIdleAfterHours }));
		const toggle = showStale
			? `<a href="${esc(href('/'))}" data-live>${esc(t(lang, 'stale.hide'))}</a>`
			: `<a href="${esc(href('/', { stale: '1' }))}" data-live>${esc(t(lang, 'stale.show'))}</a>`;
		body += `<p class="stale-line">${label} · ${toggle}</p>`;
	}
	body += '</div>';
	return layout(ctx, { title: t(lang, 'app.title'), active: 'sessions', summary, body, live: true, usage });
}

// Settings in tabs, as big buttons (radio groups and toggles styled as buttons):
// no sliders - dragging is unreliable on e-ink. With JavaScript every tap saves;
// the reply-button editor saves with its own button (it has text fields).
export function settingsPage(ctx, { configFile, tab, installed }) {
	const { config } = ctx;
	const lang = config.language;
	const href = makeHref(ctx);
	const current = SETTINGS_TABS[tab] ? tab : 'display';

	const group = (name, options, value) =>
		`<fieldset><legend>${esc(t(lang, 'settings.' + name))}</legend><div class="choices">${options
			.map(
				([v, text]) =>
					`<label class="choice"><input type="radio" name="${name}" value="${esc(v)}"${String(v) === String(value) ? ' checked' : ''}><span>${esc(text)}</span></label>`,
			)
			.join('')}</div></fieldset>`;
	const toggle = (name) =>
		`<label class="choice"><input type="checkbox" name="${name}"${config[name] ? ' checked' : ''}><span>${esc(t(lang, 'settings.' + name))}</span></label>`;
	const toggles = (legend, names) => `<fieldset><legend>${esc(t(lang, 'settings.' + legend))}</legend><div class="choices">${names.map(toggle).join('')}</div></fieldset>`;
	const multi = (name, values, chosen, labelKey) =>
		`<fieldset><legend>${esc(t(lang, 'settings.' + name))}</legend><div class="choices">${values
			.map(
				(v) =>
					`<label class="choice"><input type="checkbox" name="${name}" value="${v}"${chosen.includes(v) ? ' checked' : ''}><span>${esc(t(lang, labelKey + v))}</span></label>`,
			)
			.join('')}</div></fieldset>`;
	const seconds = (x) => (x < 60 ? `${x} s` : `${x / 60} min`);
	const withCurrent = (presets, value) => [...new Set([...presets, value])].sort((a, b) => a - b);

	let fields = '';
	let manual = false;
	if (current === 'display') {
		fields = [
			group('language', LANGUAGES.map((l) => [l, t(lang, 'lang.' + l)]), config.language),
			group('orientation', ORIENTATIONS.map((o) => [o, t(lang, 'orientation.' + o)]), config.orientation),
			group('columns', COLUMNS.map((c) => [c, String(c)]), config.columns),
			group('fontScale', FONT_SCALES.map((f) => [f, Math.round(f * 100) + '%']), config.fontScale),
			group('refreshSeconds', withCurrent(REFRESH_PRESETS, config.refreshSeconds).map((x) => [x, seconds(x)]), config.refreshSeconds),
			toggles('display', ['color', 'showDiagnostics']),
		].join('');
	} else if (current === 'cards') {
		const idle = withCurrent(IDLE_PRESETS, config.hideIdleAfterHours).map((h) => [
			h,
			h === 0 ? t(lang, 'settings.never') : h % 24 === 0 && h >= 48 ? `${h / 24} ${t(lang, 'unit.days')}` : `${h} h`,
		]);
		const finished = withCurrent(FINISHED_PRESETS, config.finishedHours).map((h) => [h, h === 0 ? t(lang, 'settings.off') : `${h} h`]);
		fields =
			multi('cardFields', CARD_FIELDS, config.cardFields, 'field.') +
			group('finishedHours', finished, config.finishedHours) +
			group('hideIdleAfterHours', idle, config.hideIdleAfterHours);
	} else if (current === 'replies') {
		manual = true;
		const list = templatesFor(config);
		const rows = list
			.map(
				(text, i) => `<div class="tpl-row"><input type="text" name="template" value="${esc(text)}" maxlength="200">
<button type="submit" name="up" value="${i}" class="icon small-icon"${i === 0 ? ' disabled' : ''} title="${esc(t(lang, 'templates.up'))}">↑</button>
<button type="submit" name="remove" value="${i}" class="icon small-icon" title="${esc(t(lang, 'templates.remove'))}">✕</button></div>`,
			)
			.join('');
		fields = `<fieldset><legend>${esc(t(lang, 'settings.templates'))}</legend>
<p class="muted small">${esc(t(lang, config.templates.length ? 'templates.hint' : 'templates.usingDefaults'))}</p>
${rows}
<div class="tpl-row"><input type="text" name="newTemplate" placeholder="${esc(t(lang, 'templates.new'))}" maxlength="200"></div>
<div class="approval-actions"><button type="submit" class="button btn-allow">${esc(t(lang, 'settings.save'))}</button>
<button type="submit" name="reset" value="1" class="button btn-release">${esc(t(lang, 'templates.reset'))}</button></div>
</fieldset>
${toggles('repliesTitle', ['replies'])}
${group('replyWindowHours', REPLY_WINDOW_PRESETS.map((h) => [h, `${h} h`]), config.replyWindowHours)}
${group('approvals', APPROVAL_MODES.map((m) => [m, t(lang, 'approvals.' + m)]), config.approvals)}
${group('awaySeconds', AWAY_PRESETS.map((x) => [x, seconds(x)]), config.awaySeconds)}
${group('approvalTimeoutMinutes', APPROVAL_TIMEOUT_PRESETS.map((m) => [m, `${m} min`]), config.approvalTimeoutMinutes)}`;
	} else if (current === 'alerts') {
		fields = [
			multi('alertOn', ALERT_KINDS, config.alertOn, 'alertOn.'),
			toggles('alertHow', ['macSound', 'macNotification', 'readerFlash']),
			group('macSoundName', MAC_SOUNDS.map((n) => [n, n]), config.macSoundName),
			group('quietHours', QUIET_PRESETS.map((q) => [q, q === 'off' ? t(lang, 'settings.quietOff') : q.replace('-', '–')]), config.quietHours),
		].join('');
	} else if (current === 'about') {
		const u = ctx.update;
		const when = u.checkedAt ? relativeTime(lang, u.checkedAt, ctx.now) : t(lang, 'about.never');
		let state;
		if (u.available) {
			const notes = u.latest.notes.length ? `<ul class="notes">${u.latest.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
			const how =
				u.method === 'git' && ctx.local
					? `<button type="submit" name="action" value="install" class="button btn-allow">${esc(t(lang, 'about.install'))}</button>`
					: `<p>${esc(t(lang, 'about.how.' + u.method))}</p>`;
			state = `<p><b>${esc(t(lang, 'about.available', { version: u.latest.version }))}</b>${u.latest.url ? ` · <a href="${esc(u.latest.url)}">${esc(t(lang, 'about.releaseNotes'))}</a>` : ''}</p>${notes}${how}`;
		} else {
			state = `<p>${esc(u.error ? t(lang, 'about.error', { reason: u.error }) : t(lang, 'about.upToDate'))}</p>`;
		}
		const result = installed === '1' ? `<p class="saved">${esc(t(lang, 'about.installed'))}</p>` : installed === '0' ? `<p class="error">${esc(t(lang, 'about.installFailed'))}</p>` : '';
		fields = `<fieldset><legend>InkGlance ${esc(u.current)}</legend>
<p class="muted small">${esc(t(lang, 'about.method.' + u.method))} · ${esc(t(lang, 'about.checked', { when }))}</p>
${result}${state}
</fieldset>
${toggles('updates', ['updateCheck'])}`;
		// The check/install buttons post to /update, not to /settings.
		fields += `<div class="approval-actions"><button type="submit" formaction="${esc(href('/update'))}" name="action" value="check" class="button btn-release">${esc(t(lang, 'about.checkNow'))}</button></div>`;
		fields = fields.replace(
			`name="action" value="install" class="button btn-allow"`,
			`formaction="${esc(href('/update'))}" name="action" value="install" class="button btn-allow"`,
		);
	} else if (current === 'limits') {
		fields = [
			toggles('limits', ['showLimits']),
			group('usageSource', USAGE_SOURCES.map((u) => [u, t(lang, 'usageSource.' + u)]), config.usageSource),
			group('usageApiMinutes', USAGE_API_PRESETS.map((m) => [m, `${m} min`]), config.usageApiMinutes),
		].join('');
	}

	const tabs = Object.keys(SETTINGS_TABS)
		.map((k) =>
			k === current
				? `<span class="tab tab-on" aria-current="page">${esc(t(lang, 'tab.' + k))}</span>`
				: `<a class="tab" href="${esc(href('/settings', { tab: k }))}">${esc(t(lang, 'tab.' + k))}</a>`,
		)
		.join('');
	const body = `<div id="main">
<nav class="tabs">${tabs}</nav>
<div class="tab-panel">
<form method="post" action="${esc(href('/settings', { tab: current }))}" id="settings" class="${manual ? 'manual' : 'auto'}">
<input type="hidden" name="t" value="${esc(config.token)}"><input type="hidden" name="tab" value="${current}">
${fields}
${manual ? '' : `<noscript><button type="submit" class="button">${esc(t(lang, 'settings.save'))}</button></noscript>`}
</form>
</div>
<p class="muted small">${esc(t(lang, 'settings.fileNote'))} ${esc(tildePath(configFile))}</p>
</div>
<script>
(function () {
	var form = document.getElementById('settings');
	// Buttons and toggles save at once; text fields wait for Save.
	form.addEventListener('change', function (e) {
		if (form.className === 'auto' || e.target.type === 'radio' || e.target.type === 'checkbox') form.submit();
	});
})();
</script>`;
	const summary = `<span class="bar-title">${esc(t(lang, 'settings.title'))}</span>`;
	return layout(ctx, { title: t(lang, 'settings.title'), active: 'settings', summary, body, live: false });
}

// Pairing page with an on-screen keypad: e-ink system keyboards are slow and
// small. The keypad needs JavaScript; without it the plain field still works.
export function pairingPage(lang, { error, vars = {} }) {
	const message = error ? `<p class="error">${esc(t(lang, 'pair.' + error, vars))}</p>` : '';
	const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
	const keypad = keys
		.map((k) => {
			if (k === 'del') return `<button type="button" class="key key-fn" data-k="del">${esc(t(lang, 'pair.delete'))}</button>`;
			if (k === 'ok') return `<button type="submit" class="key key-fn">${esc(t(lang, 'pair.submit'))}</button>`;
			return `<button type="button" class="key" data-k="${k}">${k}</button>`;
		})
		.join('');
	return `<!DOCTYPE html><html lang="${lang}" style="font-size:18px"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t(lang, 'pair.title'))}</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"></head>
<body class="mono pair-page">
<h2>${esc(t(lang, 'pair.title'))}</h2>
<p>${esc(t(lang, 'pair.body'))}</p>
${message}
<form method="post" action="/pair" class="pair" id="pair">
<input type="text" name="code" id="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">
<div class="keypad" id="keypad" hidden>${keypad}</div>
<noscript><button type="submit" class="button">${esc(t(lang, 'pair.submit'))}</button></noscript>
</form>
<p class="muted small">${esc(t(lang, 'pair.hint'))}</p>
<script>
(function () {
	var input = document.getElementById('code'), pad = document.getElementById('keypad'), form = document.getElementById('pair');
	pad.hidden = false;
	input.setAttribute('inputmode', 'none');
	input.readOnly = true;
	pad.addEventListener('click', function (e) {
		var k = e.target.getAttribute('data-k');
		if (!k) return;
		if (k === 'del') input.value = input.value.slice(0, -1);
		else if (input.value.length < 6) input.value += k;
		if (input.value.length === 6) form.submit();
	});
})();
</script>
</body></html>`;
}
