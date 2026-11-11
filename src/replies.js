// Replies from the reader to sessions that finished their turn - in parallel
// with the computer, never instead of it.
//
// When a turn ends, Claude Code runs our Stop hook with `asyncRewake`: it runs in
// the background, the session stays idle and fully usable in the terminal or
// editor. The hook opens a "reply slot" here and waits. Then either:
//   - the reader sends a reply: the hook exits with code 2 and the text, which
//     wakes Claude with it;
//   - the user types in the session first: our UserPromptSubmit hook tells us,
//     the slot closes, the hook exits quietly;
//   - nothing happens for replyWindowHours: the slot expires.

export const REPLY_WINDOW_PRESETS = [1, 2, 4, 8];

export function createReplies({ getConfig, log, onChange }) {
	const slots = new Map(); // sessionId -> { sessionId, openedAt, resolve, timer }

	function close(sessionId, outcome) {
		const slot = slots.get(sessionId);
		if (!slot) return false;
		clearTimeout(slot.timer);
		slots.delete(sessionId);
		log('REPLY', outcome.reply ? 'sent' : 'closed', outcome.reason || '', sessionId.slice(0, 8));
		slot.resolve(outcome);
		onChange();
		return true;
	}

	return {
		// Stop hook: resolves with { reply } or { reply: null }.
		open(sessionId) {
			const c = getConfig();
			if (!c.replies || !sessionId) return Promise.resolve({ reply: null, reason: 'off' });
			close(sessionId, { reply: null, reason: 'replaced' });
			return new Promise((resolve) => {
				const slot = { sessionId, openedAt: Date.now(), resolve };
				slot.timer = setTimeout(() => close(sessionId, { reply: null, reason: 'expired' }), c.replyWindowHours * 3600 * 1000);
				slots.set(sessionId, slot);
				onChange();
			});
		},
		// UserPromptSubmit hook: the user answered on the computer.
		userTyped: (sessionId) => close(sessionId, { reply: null, reason: 'user typed' }),
		send: (sessionId, text) => close(sessionId, { reply: String(text).slice(0, 2000) }),
		drop: (sessionId) => close(sessionId, { reply: null, reason: 'connection closed' }),
		isOpen: (sessionId) => slots.has(sessionId),
		count: () => slots.size,
	};
}

// The text Claude receives (as a system reminder from the hook). Explicit about
// where it comes from, so it is read as the user's next message.
export function wakeText(reply) {
	return `The user replied from their InkGlance e-ink panel (sent by the user, not a tool): "${reply}". Treat this as the user's next message and continue.`;
}
