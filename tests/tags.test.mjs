import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTagIndex, normalizeTag } from '../src/tags-core.js';

test('empty input has no tags', () => {
  const index = buildTagIndex({ version: 1, labels: {}, tags: {} });
  assert.deepEqual([...index.forward.keys()], []);
  assert.deepEqual([...(index.reverse.get('missing') || [])], []);
});

test('normalizes, merges, deduplicates, sorts, and reverses', () => {
  const index = buildTagIndex({ labels: { 'SCI_FI': 'Sci Fi' }, tags: { 'Sci Fi': ['b','a','a'], 'sci_fi': ['c'], Fantasy: ['b'] } });
  assert.equal(normalizeTag('SCI_FI'), 'sci fi');
  assert.deepEqual(index.forward.get('sci fi'), ['a','b','c']);
  assert.deepEqual([...index.reverse.get('b')].sort(), ['fantasy','sci fi']);
  assert.equal(index.labels.get('sci fi'), 'Sci Fi');
});

test('unknown slugs are empty', () => {
  const index = buildTagIndex({ tags: { known: ['slug'] } });
  assert.deepEqual([...(index.reverse.get('nope') || [])], []);
});
