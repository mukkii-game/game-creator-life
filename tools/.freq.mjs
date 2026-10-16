import { build } from 'vite';
import fs from 'node:fs';
const seeds = Number(process.argv[2]) || 200;
const entry = 'tools/.freq-entry.ts';
fs.writeFileSync(entry, `
import { init, runToEnd } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
import { EVENT_BY_ID } from '../src/game/data';
const n: Record<string, number> = {}; let lives = 0;
for (let seed = 1; seed <= ${seeds}; seed++) {
  const s = runToEnd(init(seed), (BOTS as any).think); lives++;
  for (const id of Object.keys(s.inner.uses ?? {})) n[id] = (n[id] ?? 0) + 1;
}
const files: Record<string, string> = {};
(globalThis as any).__out = { n, lives };
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false, define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' }; globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
const { n, lives } = globalThis.__out;
const top = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 80);
console.log('lives', lives);
for (const [id, c] of top) console.log(`${Math.round(100 * c / lives)}% ${id}`);
