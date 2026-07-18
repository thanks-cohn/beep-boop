import test from 'node:test';
import assert from 'node:assert/strict';

test('account query routes are canonical', () => {
  const urls = ['/?account=profile','/?account=bookmarks','/?account=settings'];
  assert.deepEqual(urls.map(u => new URL(u, 'https://manga-anime.online').searchParams.get('account')), ['profile','bookmarks','settings']);
});
