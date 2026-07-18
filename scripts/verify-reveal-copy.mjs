import { mkdtemp, cp, copyFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), 'beep-boop-reveal-'));
await cp(root, temp, { recursive: true, filter: p => !p.includes('/.git') && !p.includes('/dist') && !p.includes('/node_modules') });
await copyFile(join(temp, 'reveal.html'), join(temp, 'index.html'));
const html = await readFile(join(temp, 'index.html'), 'utf8');
const refs = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(r => r.startsWith('/src/') || r.startsWith('/src/styles/'));
if (!refs.includes('/src/main.js')) throw new Error('copied index.html does not reference /src/main.js');
await Promise.all(refs.map(ref => access(join(temp, ref.replace(/^\//, '')))));
await new Promise((resolve, reject) => {
  const child = spawn('npm', ['ci'], { cwd: temp, stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`npm ci failed with ${code}`)));
});
await new Promise((resolve, reject) => {
  const child = spawn('npm', ['run', 'build'], { cwd: temp, stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`build failed with ${code}`)));
});
await rm(temp, { recursive: true, force: true });
console.log('reveal.html can be copied over index.html and built; required app references resolve.');
