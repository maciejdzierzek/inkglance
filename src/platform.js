// Operating-system specifics in one place: notifications, sounds, idle time.
//
// Each feature is a pure "command builder" (what to run on which platform,
// unit-tested for every platform) plus a small runner. Everything fails quietly:
// a missing tool means no sound or no notification, never a crash.
//
//   macOS    osascript (notifications), afplay (sounds), ioreg (idle time)
//   Windows  PowerShell: toast notifications, System.Media.SoundPlayer,
//            GetLastInputInfo through Add-Type
//   Linux    notify-send, paplay / aplay, xprintidle (each optional)

import { execFile } from 'node:child_process';

export const SOUNDS = ['Glass', 'Ping', 'Submarine', 'Hero'];

const WINDOWS_SOUNDS = {
	Glass: 'Windows Notify System Generic.wav',
	Ping: 'Windows Ding.wav',
	Submarine: 'Windows Exclamation.wav',
	Hero: 'tada.wav',
};
const LINUX_SOUND = '/usr/share/sounds/freedesktop/stereo/complete.oga';
// Toasts need a registered app id; PowerShell's own is present on every Windows 10/11.
const POWERSHELL_AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

const ps = (script) => ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]];
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const asQuote = (s) => `"${String(s).replace(/["\\]/g, '')}"`;

export function notifyCommand(platform, title, text, { sound = null } = {}) {
	if (platform === 'darwin') {
		const withSound = sound ? ` sound name ${asQuote(sound)}` : '';
		return ['osascript', ['-e', `display notification ${asQuote(text)} with title ${asQuote(title)}${withSound}`]];
	}
	if (platform === 'win32') {
		return ps(
			[
				'[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
				'$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
				`$x.GetElementsByTagName('text')[0].AppendChild($x.CreateTextNode(${psQuote(title)})) | Out-Null`,
				`$x.GetElementsByTagName('text')[1].AppendChild($x.CreateTextNode(${psQuote(text)})) | Out-Null`,
				`[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${psQuote(POWERSHELL_AUMID)}).Show([Windows.UI.Notifications.ToastNotification]::new($x))`,
			].join('; '),
		);
	}
	return ['notify-send', [String(title), String(text)]];
}

export function soundCommand(platform, name) {
	if (!SOUNDS.includes(name)) return null;
	if (platform === 'darwin') return ['afplay', [`/System/Library/Sounds/${name}.aiff`]];
	if (platform === 'win32') return ps(`(New-Object System.Media.SoundPlayer ${psQuote('C:\\Windows\\Media\\' + WINDOWS_SOUNDS[name])}).PlaySync()`);
	return ['paplay', [LINUX_SOUND]];
}

export function idleCommand(platform) {
	if (platform === 'darwin') return ['ioreg', ['-c', 'IOHIDSystem', '-d', '4']];
	if (platform === 'win32') {
		return ps(
			[
				"Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class InkIdle { [StructLayout(LayoutKind.Sequential)] struct L { public uint s; public uint t; } [DllImport(\"user32.dll\")] static extern bool GetLastInputInfo(ref L l); public static uint Ms() { L l = new L(); l.s = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.t; } }'",
				'[InkIdle]::Ms()',
			].join('; '),
		);
	}
	return ['xprintidle', []];
}

// Seconds of idle time from the command's output; null when unknown.
export function parseIdle(platform, out) {
	if (platform === 'darwin') {
		const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(out);
		return m ? Number(m[1]) / 1e9 : null;
	}
	const ms = Number.parseInt(String(out).trim(), 10);
	return Number.isNaN(ms) ? null : ms / 1000;
}

// How often to re-check idle time while a request is held. PowerShell starts
// slowly, so Windows checks less often.
export const idleCheckMs = (platform) => (platform === 'win32' ? 5000 : 2000);

// --- runners ------------------------------------------------------------------------
const run = (spec, cb = () => {}, opts = {}) => {
	if (!spec) return cb(new Error('unsupported'));
	execFile(spec[0], spec[1], { timeout: 15000, windowsHide: true, ...opts }, cb);
};

export function notify(title, text, options = {}, platform = process.platform) {
	run(notifyCommand(platform, title, text, options));
}

export function playSound(name, platform = process.platform) {
	run(soundCommand(platform, name));
}

export function idleSeconds(platform = process.platform) {
	return new Promise((resolve) => {
		run(idleCommand(platform), (err, out) => resolve(err ? null : parseIdle(platform, out)), { maxBuffer: 4 * 1024 * 1024 });
	});
}
