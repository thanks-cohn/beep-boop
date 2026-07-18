import test from 'node:test';
import assert from 'node:assert/strict';

test('finite rail modulo cycles to first block after last', () => {
  const count = 4;
  const visible = (start, slots) => Array.from({length: slots}, (_, slot) => (start + slot) % count);
  assert.deepEqual(visible(3, 2), [3, 0]);
});
