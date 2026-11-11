// Demo mode (`npm run demo`): made-up sessions, a permission request, a question
// and plan limits, so the panel can be tried, shown and screenshotted without
// exposing real projects. Nothing here touches Claude Code.
//
// Times are fixed relative to when the demo started, so counters keep running
// and the watcher sees no "new" events (no sounds, no flashes).

const started = Date.now();
const MIN = 60 * 1000;
const at = (minutesAgo) => started - minutesAgo * MIN;

const session = (id, group, project, title, extra = {}) => ({
	id,
	name: '',
	cwd: `/work/${project}`,
	project,
	kind: 'interactive',
	status: group === 'working' ? 'busy' : 'idle',
	waitingFor: extra.waitingFor || '',
	startedAt: at(240),
	lastActivity: at(extra.ago ?? 2),
	turnEndedAt: group === 'finished' ? at(extra.ago ?? 2) : 0,
	group,
	transcript: '',
	details: {
		title,
		lastPrompt: extra.prompt || '',
		prompts: 6,
		model: extra.model || 'claude-opus-5-5',
		effort: extra.effort || '',
		branch: extra.branch || 'main',
		entrypoint: extra.where || 'claude-vscode',
		contextTokens: extra.context || 84000,
		outputTokens: extra.output || 12300,
		currentTool: extra.tool || '',
		turnEndedAt: group === 'finished' ? at(extra.ago ?? 2) : 0,
	},
});

const SESSIONS = [
	session('demo-1', 'finished', 'web-shop', 'Fix the flaky checkout test', { ago: 4, prompt: 'The checkout test fails on CI about once a day - find out why', where: 'claude-vscode' }),
	session('demo-2', 'finished', 'docs-site', 'Release notes for version 2.3', { ago: 47, prompt: 'Write the release notes from the merged pull requests', where: 'cli', model: 'claude-sonnet-5-5' }),
	session('demo-3', 'working', 'photo-tools', 'Speed up thumbnail generation', { ago: 0, prompt: 'Thumbnails take 4 s each, make it under one', tool: 'Bash: run the benchmark', where: 'claude-desktop' }),
	session('demo-4', 'working', 'mobile-app', 'Dark mode for the settings screen', { ago: 1, prompt: 'Add a dark mode toggle that follows the system by default', tool: 'Edit: SettingsScreen.tsx' }),
	session('demo-5', 'idle', 'data-pipeline', 'Explore options for the search index', { ago: 190, prompt: 'Compare three ways to index product search' }),
];

export function demoSessions() {
	return { sessions: SESSIONS.map((s) => ({ ...s, details: { ...s.details } })), error: null, fetchedAt: Date.now() };
}

export function demoApprovals() {
	return [
		{
			id: 'demo-a1',
			kind: 'permission',
			questions: [],
			sessionId: 'demo-6',
			cwd: '/work/api-server',
			tool: 'Bash',
			detail: 'npm run db:migrate -- --env staging',
			createdAt: at(1),
		},
		{
			id: 'demo-q1',
			kind: 'question',
			questions: [
				{
					question: 'Which storage should the new cache use?',
					multiSelect: false,
					options: [
						{ label: 'Redis', description: 'Already running in production' },
						{ label: 'In memory', description: 'Simplest, lost on restart' },
					],
				},
			],
			sessionId: 'demo-7',
			cwd: '/work/api-server',
			tool: 'AskUserQuestion',
			detail: '',
			createdAt: at(3),
		},
	];
}

export function demoUsage(now = Date.now()) {
	return {
		source: 'demo',
		observedAt: now - 2 * MIN,
		fiveHour: { used: 0.42, resetAt: now + 2.5 * 60 * MIN },
		sevenDay: { used: 0.63, resetAt: now + 3.2 * 24 * 60 * MIN },
	};
}

// Sessions in the demo that accept one-tap replies.
export const demoCanReply = (id) => id === 'demo-1';
