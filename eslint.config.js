// Lint for the server, hooks, scripts and tests (npm run lint). Plain
// recommended rules: catch real mistakes, leave style alone.
import js from '@eslint/js';
import globals from 'globals';

export default [
	{ ignores: ['node_modules/', 'tray/', 'docs/'] },
	js.configs.recommended,
	{
		languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
		rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
	},
];
