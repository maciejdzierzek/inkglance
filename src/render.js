// Server-side HTML for e-ink browsers.
//
// Pages work without JavaScript (meta refresh, plain forms). With JavaScript the
// panel updates in place (fetch + swap), which keeps fullscreen mode alive and
// avoids a full-page flash on e-ink. Measured target: PocketBook Verse Pro Color,
// Chrome 122 engine, viewport 572x663 CSS px.

import { homedir } from 'node:os';
import { t, relativeTime, clockTime } from './i18n.js';
import { LANGUAGES, FONT_SCALES, COLUMNS, ORIENTATIONS, ALERT_KINDS, MAC_SOUNDS, QUIET_PRESETS, USAGE_SOURCES, USAGE_API_PRESETS, CARD_FIELDS, REFRESH_PRESETS, IDLE_PRESETS } from './config.js';
import { modelLabel } from './transcript.js';
import { forecast, PERIODS } from './usage.js';

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
	${
		live
			? `var every = ${config.refreshSeconds * 1000};
	function refresh() {
		fetch(location.href, { cache: 'no-store', credentials: 'same-origin' })
			.then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
			.then(function (html) {
				var next = new DOMParser().parseFromString(html, 'text/html').getElementById('app');
				var app = document.getElementById('app');
				if (next && app) { app.replaceWith(next); diag(); }
			})
			.catch(function () {
				var off = document.getElementById('offline');
				if (off) off.hidden = false;
			});
	}
	setInterval(refresh, every);
	// Quick poll: refresh as soon as anything changes; flash the screen when a
	// session starts waiting (inverting colors is very visible on e-ink).
	var stateUrl = ${JSON.stringify(stateUrl)}, known = null, lastV = null;
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
				known = st.waiting;
				if (lastV !== null && st.v !== lastV) refresh();
				lastV = st.v;
				if (fresh.length && st.flash) flash();
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

function layout(ctx, { title, active, summary, body, live }) {
	const { config } = ctx;
	const lang = config.language;
	const href = makeHref(ctx);
	const refreshButton = live
		? `<a class="icon" href="${esc(href(ctx.path, ctx.keepParams))}" data-live title="${esc(t(lang, 'nav.refresh'))}">${ICONS.refresh}</a>`
		: '';
	const right =
		active === 'settings'
			? `<a class="icon" href="${esc(href('/'))}" title="${esc(t(lang, 'nav.back'))}">${ICONS.back}<span>${esc(t(lang, 'nav.back'))}</span></a>`
			: `<a class="icon" href="${esc(href('/settings'))}" title="${esc(t(lang, 'nav.settings'))}">${ICONS.settings}</a>`;
	const footer = [
		esc(t(lang, 'footer.rendered', { time: clockTime(lang, ctx.now) })),
		live ? esc(t(lang, 'footer.refresh', { seconds: config.refreshSeconds })) : '',
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
<link rel="stylesheet" href="/style.css">
</head>
<body class="${config.color ? 'color' : 'mono'}">
<div id="app">
<div class="bar">
<div class="bar-left">${summary}</div>
<div class="bar-right">
${refreshButton}
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

function card(ctx, s) {
	const lang = ctx.config.language;
	const fields = new Set(ctx.config.cardFields);
	const d = s.details || {};
	const title = d.title || s.name || s.project;
	const sub = [s.project];
	if (fields.has('branch') && d.branch) sub.push(d.branch);

	const rows = [];
	if (fields.has('waitingFor') && s.waitingFor) rows.push(`<div class="waiting">${esc(s.waitingFor)}</div>`);
	if (fields.has('activity') && s.group === 'working' && d.currentTool) rows.push(`<div class="activity">▸ ${esc(d.currentTool)}</div>`);
	if (fields.has('lastPrompt') && d.lastPrompt) rows.push(`<div class="prompt">„${esc(d.lastPrompt)}”</div>`);

	const meta = [];
	if (fields.has('model') && d.model) meta.push(modelLabel(d.model) + (d.effort ? ` ${d.effort}` : ''));
	if (fields.has('context') && d.contextTokens) meta.push(t(lang, 'card.context', { n: compact(lang, d.contextTokens) }));
	if (fields.has('tokens') && d.outputTokens) meta.push(t(lang, 'card.output', { n: compact(lang, d.outputTokens) }));
	if (fields.has('times')) meta.push(relativeTime(lang, s.lastActivity, ctx.now));
	if (meta.length) rows.push(`<div class="meta">${esc(meta.join(' · '))}</div>`);
	if (fields.has('path') && s.cwd) rows.push(`<div class="path">${esc(tildePath(s.cwd))}</div>`);

	return `<div class="card card-${s.group}">
<div class="card-head"><span class="badge badge-${s.group}">${esc(t(lang, 'status.' + s.group))}</span><span class="sub">${esc(sub.join(' · '))}</span></div>
<div class="title">${esc(title)}</div>
${rows.join('\n')}
</div>`;
}

function section(ctx, key, list, heading) {
	if (!list.length) return '';
	return `<h2>${heading ?? `${esc(t(ctx.config.language, 'section.' + key))} <span class="count">${list.length}</span>`}</h2>
<div class="grid cols-${ctx.config.columns}">
${list.map((s) => card(ctx, s)).join('\n')}
</div>`;
}

// Limits strip: one bar per window with %, reset time and a forecast.
function limitsStrip(ctx, usage) {
	const lang = ctx.config.language;
	if (!usage) return '';
	if (usage.error) return `<div class="limits limits-error">${esc(t(lang, 'limits.unavailable', { reason: usage.error }))}</div>`;
	const when = (ms) => {
		const d = new Date(ms);
		const sameDay = new Date(ctx.now).toDateString() === d.toDateString();
		return new Intl.DateTimeFormat(lang, sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
	};
	const row = (key) => {
		const w = usage[key];
		if (!w) return '';
		const pct = Math.round(w.used * 100);
		const f = forecast(w, PERIODS[key], ctx.now);
		const notes = [];
		if (w.resetAt) notes.push(t(lang, 'limits.reset', { when: when(w.resetAt) }));
		if (f?.fullAt) notes.push(t(lang, 'limits.fullAt', { when: when(f.fullAt) }));
		else if (f) notes.push(t(lang, 'limits.forecast', { pct: Math.min(100, Math.round(f.atReset * 100)) }));
		const level = pct >= 90 || f?.fullAt ? ' meter-hot' : pct >= 70 ? ' meter-warm' : '';
		return `<div class="limit"><span class="limit-name">${esc(t(lang, 'limits.' + key))}</span><span class="meter${level}"><span style="width:${Math.min(100, pct)}%"></span></span><b>${pct}%</b><span class="limit-note">${esc(notes.join(' · '))}</span></div>`;
	};
	const age = usage.observedAt ? relativeTime(lang, usage.observedAt, ctx.now) : '';
	return `<div class="limits">${row('fiveHour')}${row('sevenDay')}<div class="limit-age">${esc(t(lang, 'limits.age', { when: age }))}</div></div>`;
}

export function sessionsPage(ctx, data, groups, usage, { showStale }) {
	const lang = ctx.config.language;
	const href = makeHref(ctx);
	const idleCount = groups.idle.length + groups.stale.length;
	const summary = `<span class="sum sum-needsYou${groups.needsYou.length ? ' sum-on' : ''}"><b>${groups.needsYou.length}</b> ${esc(t(lang, 'summary.needsYou'))}</span>
<span class="sum"><b>${groups.working.length}</b> ${esc(t(lang, 'summary.working'))}</span>
<span class="sum"><b>${idleCount}</b> ${esc(t(lang, 'summary.idle'))}</span>`;

	let body = limitsStrip(ctx, usage) + '<div id="main">';
	if (data.error) {
		body += `<div class="error"><b>${esc(t(lang, 'error.title'))}</b><br>${esc(data.error)}</div>`;
	} else if (!data.sessions.length) {
		body += `<p class="empty">${esc(t(lang, 'empty'))}</p>`;
	} else {
		body += section(ctx, 'needsYou', groups.needsYou);
		body += section(ctx, 'working', groups.working);
		body += section(ctx, 'idle', groups.idle);
		if (groups.stale.length) {
			const label = esc(t(lang, 'section.stale', { count: groups.stale.length, hours: ctx.config.hideIdleAfterHours }));
			const toggle = showStale
				? `<a href="${esc(href('/'))}" data-live>${esc(t(lang, 'stale.hide'))}</a>`
				: `<a href="${esc(href('/', { stale: '1' }))}" data-live>${esc(t(lang, 'stale.show'))}</a>`;
			if (showStale) body += section(ctx, 'stale', groups.stale, `${label} · ${toggle}`);
			else body += `<h2 class="stale-head">${label} · ${toggle}</h2>`;
		}
	}
	body += '</div>';
	return layout(ctx, { title: t(lang, 'app.title'), active: 'sessions', summary, body, live: true });
}

// Settings as big buttons (radio groups and toggles styled as buttons): no typing,
// no sliders - dragging is unreliable on e-ink. With JavaScript every tap saves.
export function settingsPage(ctx, { configFile }) {
	const { config } = ctx;
	const lang = config.language;
	const href = makeHref(ctx);

	const group = (name, options, current, label) =>
		`<fieldset><legend>${esc(t(lang, 'settings.' + name))}</legend><div class="choices">${options
			.map(
				([value, text]) =>
					`<label class="choice"><input type="radio" name="${name}" value="${esc(value)}"${String(value) === String(current) ? ' checked' : ''}><span>${esc(text)}</span></label>`,
			)
			.join('')}</div></fieldset>`;
	const toggle = (name) =>
		`<label class="choice"><input type="checkbox" name="${name}"${config[name] ? ' checked' : ''}><span>${esc(t(lang, 'settings.' + name))}</span></label>`;

	const seconds = (s) => (s < 60 ? `${s} s` : `${s / 60} min`);
	const refreshOptions = [...new Set([...REFRESH_PRESETS, config.refreshSeconds])].sort((a, b) => a - b).map((s) => [s, seconds(s)]);
	const idleOptions = [...new Set([...IDLE_PRESETS, config.hideIdleAfterHours])]
		.sort((a, b) => a - b)
		.map((h) => [h, h === 0 ? t(lang, 'settings.never') : h % 24 === 0 && h >= 48 ? `${h / 24} ${t(lang, 'unit.days')}` : `${h} h`]);

	const fields = `<fieldset><legend>${esc(t(lang, 'settings.cardFields'))}</legend><div class="choices">${CARD_FIELDS.map(
		(f) =>
			`<label class="choice"><input type="checkbox" name="cardFields" value="${f}"${config.cardFields.includes(f) ? ' checked' : ''}><span>${esc(t(lang, 'field.' + f))}</span></label>`,
	).join('')}</div></fieldset>`;

	const body = `<div id="main">
<form method="post" action="${esc(href('/settings'))}" id="settings">
<input type="hidden" name="t" value="${esc(config.token)}">
${group('language', LANGUAGES.map((l) => [l, t(lang, 'lang.' + l)]), config.language)}
${group('refreshSeconds', refreshOptions, config.refreshSeconds)}
${group('orientation', ORIENTATIONS.map((o) => [o, t(lang, 'orientation.' + o)]), config.orientation)}
${group('columns', COLUMNS.map((c) => [c, String(c)]), config.columns)}
${fields}
${group('fontScale', FONT_SCALES.map((f) => [f, Math.round(f * 100) + '%']), config.fontScale)}
${group('hideIdleAfterHours', idleOptions, config.hideIdleAfterHours)}
<fieldset><legend>${esc(t(lang, 'settings.display'))}</legend><div class="choices">${toggle('color')}${toggle('showDiagnostics')}</div></fieldset>
<fieldset><legend>${esc(t(lang, 'settings.alertOn'))}</legend><div class="choices">${ALERT_KINDS.map(
		(k) =>
			`<label class="choice"><input type="checkbox" name="alertOn" value="${k}"${config.alertOn.includes(k) ? ' checked' : ''}><span>${esc(t(lang, 'alertOn.' + k))}</span></label>`,
	).join('')}</div></fieldset>
<fieldset><legend>${esc(t(lang, 'settings.alertHow'))}</legend><div class="choices">${toggle('macSound')}${toggle('macNotification')}${toggle('readerFlash')}</div></fieldset>
${group('macSoundName', MAC_SOUNDS.map((n) => [n, n]), config.macSoundName)}
<fieldset><legend>${esc(t(lang, 'settings.limits'))}</legend><div class="choices">${toggle('showLimits')}</div></fieldset>
${group('usageSource', USAGE_SOURCES.map((u) => [u, t(lang, 'usageSource.' + u)]), config.usageSource)}
${group('usageApiMinutes', USAGE_API_PRESETS.map((m) => [m, `${m} min`]), config.usageApiMinutes)}
${group('quietHours', QUIET_PRESETS.map((q) => [q, q === 'off' ? t(lang, 'settings.quietOff') : q.replace('-', '–')]), config.quietHours)}
<noscript><button type="submit" class="button">${esc(t(lang, 'settings.save'))}</button></noscript>
</form>
<p class="muted small">${esc(t(lang, 'settings.fileNote'))} ${esc(tildePath(configFile))}</p>
</div>
<script>
(function () {
	var form = document.getElementById('settings');
	form.addEventListener('change', function () { form.submit(); });
})();
</script>`;
	const summary = `<span class="bar-title">${esc(t(lang, 'settings.title'))}</span>`;
	return layout(ctx, { title: t(lang, 'settings.title'), active: 'settings', summary, body, live: false });
}

// Pairing page with an on-screen keypad: e-ink system keyboards are slow and
// small. The keypad needs JavaScript; without it the plain field still works.
export function pairingPage(lang, { error }) {
	const message = error ? `<p class="error">${esc(t(lang, 'pair.' + error))}</p>` : '';
	const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
	const keypad = keys
		.map((k) => {
			if (k === 'del') return `<button type="button" class="key key-fn" data-k="del">${esc(t(lang, 'pair.delete'))}</button>`;
			if (k === 'ok') return `<button type="submit" class="key key-fn">${esc(t(lang, 'pair.submit'))}</button>`;
			return `<button type="button" class="key" data-k="${k}">${k}</button>`;
		})
		.join('');
	return `<!DOCTYPE html><html lang="${lang}" style="font-size:18px"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t(lang, 'pair.title'))}</title><link rel="stylesheet" href="/style.css"></head>
<body class="mono pair-page">
<h2>${esc(t(lang, 'pair.title'))}</h2>
<p>${esc(t(lang, 'pair.body'))}</p>
${message}
<form method="post" action="/pair" class="pair" id="pair">
<input type="text" name="code" id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off">
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
		else if (input.value.length < 4) input.value += k;
		if (input.value.length === 4) form.submit();
	});
})();
</script>
</body></html>`;
}
