import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages, t } from '../src/i18n.js';

test('every language has every English key', () => {
	const keys = Object.keys(messages.en);
	for (const [lang, dict] of Object.entries(messages)) {
		const missing = keys.filter((k) => !(k in dict));
		assert.deepEqual(missing, [], `${lang} is missing keys`);
	}
});

test('placeholders are filled', () => {
	assert.equal(t('en', 'footer.refresh', { seconds: 60 }), 'refresh every 60 s');
});
