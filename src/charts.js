// Server-rendered SVG charts for e-ink: one series per chart, thick black marks,
// a recessive grid, values written on the chart (there is no hover on e-ink).

import { esc } from './render.js';

const W = 560;
const PAD = { left: 46, right: 44, top: 14, bottom: 24 };
const pct = (v) => `${Math.round(v * 100)}%`;

function frame(height, inner) {
	return `<svg class="chart" viewBox="0 0 ${W} ${height}" width="100%" role="img" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function yGrid(y, height, yMax) {
	const lines = [0.5, 1].filter((v) => v <= yMax);
	return lines
		.map((v) => {
			const yy = y(v);
			const solid = v === 1;
			return `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${yy}" y2="${yy}" class="${solid ? 'grid-max' : 'grid'}"/><text x="${PAD.left - 6}" y="${yy + 4}" class="tick" text-anchor="end">${pct(v)}</text>`;
		})
		.join('');
}

// Line over time. `breaks` splits the line where the window id changes (a reset).
export function lineChart({ from, to, points, projection, xTicks, height = 160, title }) {
	if (!points.length) return '';
	const yMax = Math.max(1, ...points.map((p) => p.v), projection?.v ?? 0);
	const x = (t) => PAD.left + ((t - from) / (to - from)) * (W - PAD.left - PAD.right);
	const y = (v) => PAD.top + (1 - v / yMax) * (height - PAD.top - PAD.bottom);
	const base = y(0);
	const segs = [];
	let cur = [];
	let lastW;
	for (const p of points) {
		if (lastW !== undefined && p.w !== undefined && p.w !== lastW && cur.length) {
			segs.push(cur);
			cur = [];
		}
		cur.push(p);
		lastW = p.w ?? lastW;
	}
	if (cur.length) segs.push(cur);
	const paths = segs
		.map((seg) => `<path class="line" d="${seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>`)
		.join('');
	const last = points[points.length - 1];
	const proj = projection
		? `<path class="projection" d="M${x(last.t).toFixed(1)},${y(last.v).toFixed(1)} L${x(projection.t).toFixed(1)},${y(projection.v).toFixed(1)}"/><text x="${x(projection.t) + 4}" y="${y(projection.v) + 4}" class="tick">${pct(projection.v)}</text>`
		: '';
	const ticks = (xTicks || [])
		.map((tk) => `<line x1="${x(tk.t)}" x2="${x(tk.t)}" y1="${base}" y2="${base + 4}" class="axis"/><text x="${x(tk.t)}" y="${height - 6}" class="tick" text-anchor="middle">${esc(tk.label)}</text>`)
		.join('');
	const endLabel = projection ? '' : `<text x="${x(last.t) + 5}" y="${y(last.v) + 4}" class="value">${pct(last.v)}</text>`;
	return frame(
		height,
		`<title>${esc(title || '')}</title>${yGrid(y, height, yMax)}<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${base}" y2="${base}" class="axis"/>${ticks}${paths}${proj}<circle cx="${x(last.t)}" cy="${y(last.v)}" r="4.5" class="dot"/>${endLabel}`,
	);
}

// Bars with values on top; the current (unfinished) period is drawn hollow.
// percent scale: grid at 50% and 100%. Absolute scale (format given): grid at
// half and full of the largest bar; with many bars only the largest is labelled.
export function barChart({ bars, height = 150, title, format, tickEvery = 1 }) {
	if (!bars.length) return '';
	const percent = !format;
	const fmt = format || pct;
	const top = Math.max(...bars.map((b) => b.v));
	const yMax = percent ? Math.max(1, top) : top || 1;
	const inner = W - PAD.left - PAD.right;
	const slot = inner / bars.length;
	const bw = Math.max(3, Math.min(44, slot - (bars.length > 12 ? 3 : 10)));
	const y = (v) => PAD.top + (1 - v / yMax) * (height - PAD.top - PAD.bottom);
	const base = y(0);
	const labelAll = bars.length <= 12;
	const grid = percent
		? yGrid(y, height, yMax)
		: [0.5, 1]
				// Labels inside the plot: absolute values are wider than "100%".
				.map((f) => `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(yMax * f)}" y2="${y(yMax * f)}" class="grid"/>${f < 1 ? `<text x="${PAD.left + 2}" y="${y(yMax * f) - 4}" class="tick">${esc(fmt(yMax * f))}</text>` : ''}`)
				.join('');
	let maxLabelled = false;
	const marks = bars
		.map((b, i) => {
			const cx = PAD.left + slot * i + slot / 2;
			const yt = y(b.v);
			const h = Math.max(base - yt, b.v > 0 ? 1.5 : 0);
			const showValue = labelAll || (!maxLabelled && b.v === top && top > 0);
			if (showValue && !labelAll) maxLabelled = true;
			const value = showValue ? `<text x="${cx}" y="${yt - 5}" class="value" text-anchor="middle">${esc(fmt(b.v))}</text>` : '';
			const tick = i % tickEvery === 0 && b.label ? `<text x="${cx}" y="${height - 6}" class="tick" text-anchor="middle">${esc(b.label)}</text>` : '';
			return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${bw > 8 ? 3 : 1}" class="${b.current ? 'bar-current' : 'bar'}"/>${value}${tick}`;
		})
		.join('');
	return frame(height, `<title>${esc(title || '')}</title>${grid}<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${base}" y2="${base}" class="axis"/>${marks}`);
}
