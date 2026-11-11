// Who may talk to the panel at all, checked before anything else.
//
// 1. Source address: only this computer and private networks (home Wi-Fi,
//    link-local, VPN ranges such as Tailscale's 100.64.0.0/10). The panel is
//    never meant to be reachable from the internet.
// 2. Host header: an IP address, localhost, this computer's name (with or
//    without .local) or a name listed in `allowedHosts`. This stops DNS
//    rebinding: a web page that points its own domain at the panel sends its
//    own domain in Host and is refused.

import { hostname } from 'node:os';

export function isPrivateAddress(addr) {
	let a = String(addr || '').toLowerCase();
	if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4 mapped into IPv6
	if (a === '::1') return true;
	const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
	if (v4) {
		const [x, y] = [Number(v4[1]), Number(v4[2])];
		return (
			x === 127 || // loopback
			x === 10 ||
			(x === 172 && y >= 16 && y <= 31) ||
			(x === 192 && y === 168) ||
			(x === 169 && y === 254) || // link-local
			(x === 100 && y >= 64 && y <= 127) // carrier-grade NAT, Tailscale
		);
	}
	return /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a); // ULA, link-local
}

export function isAllowedHost(header, { allowedHosts = [], machine = hostname() } = {}) {
	if (!header) return true; // HTTP/1.0 clients send none; rebinding needs one
	let name = String(header).toLowerCase().trim();
	if (name.startsWith('[')) return /^\[[0-9a-f:.]+\](:\d+)?$/.test(name); // IPv6 literal
	name = name.replace(/:\d+$/, '').replace(/\.$/, '');
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true; // IPv4 literal
	const own = String(machine).toLowerCase().replace(/\.local$/, '');
	const names = ['localhost', own, `${own}.local`, ...allowedHosts.map((h) => String(h).toLowerCase())];
	return names.includes(name);
}
