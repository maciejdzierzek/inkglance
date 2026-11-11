import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyCommand, soundCommand, idleCommand, parseIdle, idleCheckMs } from '../src/platform.js';

test('notifications per platform, quotes made safe', () => {
	const [mac, macArgs] = notifyCommand('darwin', 'Title "x"', 'It\'s done', { sound: 'Glass' });
	assert.equal(mac, 'osascript');
	assert.match(macArgs[1], /display notification "It's done" with title "Title x" sound name "Glass"/);
	const tricky = "x’; Start-Process calc; ’";
	const [win, winArgs, winEnv] = notifyCommand('win32', 'T', tricky);
	assert.equal(win, 'powershell.exe');
	assert.ok(!winArgs.at(-1).includes('Start-Process'), 'session text never enters the script');
	assert.match(winArgs.at(-1), /CreateTextNode\(\$env:INKGLANCE_TEXT\)/);
	assert.deepEqual(winEnv, { INKGLANCE_TITLE: 'T', INKGLANCE_TEXT: tricky });
	assert.deepEqual(notifyCommand('linux', 'T', 'x'), ['notify-send', ['T', 'x']]);
});

test('sounds per platform, unknown names refused', () => {
	assert.deepEqual(soundCommand('darwin', 'Ping'), ['afplay', ['/System/Library/Sounds/Ping.aiff']]);
	assert.match(soundCommand('win32', 'Hero')[1].at(-1), /tada\.wav/);
	assert.equal(soundCommand('linux', 'Glass')[0], 'paplay');
	assert.equal(soundCommand('darwin', 'rm -rf'), null);
});

test('idle time per platform', () => {
	assert.equal(idleCommand('darwin')[0], 'ioreg');
	assert.match(idleCommand('win32')[1].at(-1), /GetLastInputInfo/);
	assert.equal(idleCommand('linux')[0], 'xprintidle');
	assert.equal(parseIdle('darwin', '"HIDIdleTime" = 2500000000'), 2.5);
	assert.equal(parseIdle('win32', '1500\r\n'), 1.5);
	assert.equal(parseIdle('linux', 'garbage'), null);
	assert.equal(idleCheckMs('win32'), 5000);
});

test('Windows idle readings come from a background loop after the first one', async () => {
	const { idleSecondsFast } = await import('../src/platform.js');
	let reads = 0;
	const read = async () => (++reads, 42);
	assert.equal(await idleSecondsFast('win32', read), 42); // first call waits for a reading
	assert.equal(await idleSecondsFast('win32', read), 42); // then answers from the cache
	assert.equal(reads, 1);
	assert.equal(await idleSecondsFast('darwin', async () => 7), 7); // elsewhere: direct
});
