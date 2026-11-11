#!/usr/bin/env node
// Collects the license notices of every Rust crate the menu-bar app is built
// from into tray/src-tauri/THIRD-PARTY-NOTICES.txt, which the app bundles.
// Identical license texts are printed once, with the crates that share them.
// Run before every app build (npm run notices; the build scripts and CI do).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..', 'tray', 'src-tauri');
const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1'], { cwd: app, maxBuffer: 64 * 1024 * 1024 }).toString());
const used = new Set(meta.resolve.nodes.map((n) => n.id));
const crates = meta.packages.filter((p) => used.has(p.id) && p.source).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const texts = new Map(); // license text -> [crate@version]
const missing = [];
for (const p of crates) {
	const dir = dirname(p.manifest_path);
	const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f));
	if (!files.length) missing.push(`${p.name} ${p.version} (${p.license || 'see repository'})`);
	for (const f of files) {
		const text = readFileSync(join(dir, f), 'utf8').trim();
		if (!texts.has(text)) texts.set(text, []);
		texts.get(text).push(`${p.name} ${p.version}`);
	}
}

const out = [
	'InkGlance menu-bar app - third-party notices',
	'',
	'The app is built with the following open-source Rust crates. Where a crate is',
	'offered under a choice of licenses, InkGlance uses it under MIT (or Apache-2.0).',
	'Source code of every crate is available on https://crates.io.',
	'',
	'CRATES',
	...crates.map((p) => `  ${p.name} ${p.version} - ${p.license || 'see license text below'}${p.repository ? ` - ${p.repository}` : ''}`),
	'',
	...(missing.length
		? ['CRATES WITHOUT A LICENSE FILE IN THEIR PACKAGE', '(they declare the licenses listed above; the full MIT and Apache-2.0 texts appear below)', ...missing.map((m) => `  ${m}`), '']
		: []),
	'LICENSE TEXTS',
	...[...texts].flatMap(([text, users]) => ['', '='.repeat(78), `Used by: ${users.join(', ')}`, '-'.repeat(78), text]),
	'',
];
writeFileSync(join(app, 'THIRD-PARTY-NOTICES.txt'), out.join('\n'));
console.log(`THIRD-PARTY-NOTICES.txt: ${crates.length} crates, ${texts.size} distinct license texts, ${missing.length} without a file`);
