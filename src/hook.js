#!/usr/bin/env node
// Compatibility shim: early installs pointed Claude Code at this file. It hands
// over to src/hook.sh with the same argument, stdin, stdout and exit code.
// Run `npm run hooks:install` once to point the hooks at hook.sh directly.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./hook.sh', import.meta.url));
const child = spawn('sh', [script, process.argv[2] || 'permission'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', () => process.exit(0));
