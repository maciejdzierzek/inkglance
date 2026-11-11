#!/usr/bin/env node
// Read or change the InkGlance config from the terminal (also used by the
// /inkglance:setup command). Values are validated like the settings screen.
//
//   npm run config                          # show (token hidden)
//   npm run config -- set language pl
//   npm run config -- set port 80
//   npm run config -- set templates '["Yes, continue","Commit"]'
//   npm run config -- url                   # pairing address(es) of this computer

import { networkInterfaces } from 'node:os';
import { loadConfig, saveConfig, normalize, configPath } from '../src/config.js';

const [cmd, key, ...rest] = process.argv.slice(2);
const config = loadConfig();

if (!cmd || cmd === 'show') {
	console.log(JSON.stringify({ ...config, token: '(hidden)' }, null, 2));
	console.log(`file: ${configPath()}`);
} else if (cmd === 'set') {
	if (!key || !(key in config) || key === 'token') {
		console.error(`unknown or protected key: ${key}`);
		process.exit(2);
	}
	const raw = rest.join(' ');
	let value = raw;
	try {
		value = JSON.parse(raw);
	} catch {
		// plain string
	}
	const next = normalize({ ...config, [key]: value }, config);
	if (JSON.stringify(next[key]) === JSON.stringify(config[key]) && JSON.stringify(value) !== JSON.stringify(config[key])) {
		console.error(`invalid value for ${key}: ${raw} (kept ${JSON.stringify(config[key])})`);
		process.exit(2);
	}
	saveConfig(next);
	console.log(`${key} = ${JSON.stringify(next[key])}`);
	if (['host', 'port', 'claudeBin'].includes(key)) console.log('Restart the panel to apply (npm run service:install).');
} else if (cmd === 'url') {
	const port = config.port === 80 ? '' : `:${config.port}`;
	const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
	for (const i of ips) console.log(`http://${i.address}${port}`);
} else {
	console.error('usage: npm run config [-- show | set <key> <value> | url]');
	process.exit(2);
}
