import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index.html and reveal.html mount the same app module without filename routes', async () => {
  const [index, reveal] = await Promise.all([readFile('index.html','utf8'), readFile('reveal.html','utf8')]);
  for (const html of [index, reveal]) {
    assert.match(html, /id="app"/);
    assert.match(html, /id="reader-container"/);
    assert.match(html, /<script type="module" src="\/src\/main\.js"><\/script>/);
    assert.doesNotMatch(html, /<<<<<<<|=======|>>>>>>>/);
    assert.doesNotMatch(html, /(?:index|reveal)\.html\?account/);
  }
  assert.equal(index, reveal);
});

test('profile account source stays lightweight until optional tabs load', async () => {
  const account = await readFile('src/account.js','utf8');
  const staticImports = account.split('\n').filter(line => line.startsWith('import ')).join('\n');
  assert.doesNotMatch(staticImports, /bookmark-service|preferences|tags\.js|work-catalog\.json/);
  assert.match(account, /import\("\.\/bookmark-service\.js"\)/);
  assert.match(account, /import\("\.\/preferences\.js"\)/);
  assert.match(account, /import\("\.\/tags\.js"\)/);
});
