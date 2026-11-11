import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChunk, modelLabel, describeTool } from '../src/transcript.js';

const fresh = () => ({ partial: '', customTitle: '', aiTitle: '', lastPrompt: '', prompts: 0, model: '', effort: '', branch: '', contextTokens: 0, outputById: new Map(), outputTokens: 0, currentTool: '', lastText: '' });
const line = (o) => JSON.stringify(o) + '\n';

test('reads titles, prompt, model, context and output once per message', () => {
	const s = fresh();
	const usage = { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 40 };
	applyChunk(s, line({ type: 'ai-title', aiTitle: 'Fix login' }));
	applyChunk(s, line({ type: 'user', message: { content: 'please fix the login' } }));
	applyChunk(s, line({ type: 'assistant', effort: 'high', gitBranch: 'main', message: { id: 'm1', model: 'claude-opus-5-5', usage, content: [{ type: 'thinking' }] } }));
	applyChunk(s, line({ type: 'assistant', message: { id: 'm1', model: 'claude-opus-5-5', usage, content: [{ type: 'tool_use', name: 'Bash', input: { description: 'run tests' } }] } }));
	assert.equal(s.aiTitle, 'Fix login');
	assert.equal(s.lastPrompt, 'please fix the login');
	assert.equal(s.prompts, 1);
	assert.equal(s.model, 'claude-opus-5-5');
	assert.equal(s.branch, 'main');
	assert.equal(s.contextTokens, 1052);
	assert.equal(s.outputTokens, 40);
	assert.equal(s.currentTool, 'Bash: run tests');
});

test('custom title wins, tool results and wrappers are not prompts, sidechains ignored', () => {
	const s = fresh();
	applyChunk(s, line({ type: 'custom-title', customTitle: 'Mine' }));
	applyChunk(s, line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } }));
	applyChunk(s, line({ type: 'user', message: { content: '<command-name>/clear</command-name>' } }));
	applyChunk(s, line({ type: 'user', isSidechain: true, message: { content: 'subagent task' } }));
	assert.equal(s.customTitle, 'Mine');
	assert.equal(s.prompts, 0);
});

test('lines split across chunks and garbage are handled', () => {
	const s = fresh();
	const full = line({ type: 'ai-title', aiTitle: 'Split' });
	applyChunk(s, 'not json\n' + full.slice(0, 10));
	applyChunk(s, full.slice(10));
	assert.equal(s.aiTitle, 'Split');
});

test('model labels and tool descriptions', () => {
	assert.equal(modelLabel('claude-opus-5-5'), 'Opus 5.5');
	assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'Haiku 4.5');
	assert.equal(modelLabel('other'), 'other');
	assert.equal(describeTool({ name: 'Edit', input: { file_path: '/a/b/server.js' } }), 'Edit: server.js');
});

test('turn end: set when Claude stops without a tool call, cleared by a prompt, tool call or interrupt', () => {
	const s = { ...fresh(), turnEndedAt: 0 };
	const at = '2026-11-11T21:46:28.943Z';
	applyChunk(s, line({ type: 'assistant', timestamp: at, message: { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } }));
	assert.equal(s.turnEndedAt, 0);
	applyChunk(s, line({ type: 'assistant', timestamp: at, message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } }));
	assert.equal(s.turnEndedAt, Date.parse(at));
	applyChunk(s, line({ type: 'system', subtype: 'stop_hook_summary' }));
	assert.equal(s.turnEndedAt, Date.parse(at));
	applyChunk(s, line({ type: 'user', message: { content: 'next step' } }));
	assert.equal(s.turnEndedAt, 0);
	applyChunk(s, line({ type: 'assistant', timestamp: at, message: { stop_reason: 'end_turn', content: [] } }));
	applyChunk(s, line({ type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } }));
	assert.equal(s.turnEndedAt, 0);
	assert.equal(s.lastPrompt, 'next step'); // the interrupt marker is not a prompt
});
