import { build } from 'vite';
import fs from 'node:fs';
const seeds = Number(process.argv[2]) || 200;
const entry = 'tools/.romance-entry.ts';
fs.writeFileSync(entry, `
import { init, runToEnd } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
const hits: Record<string, number> = {}; const sample: Record<string, string> = {}; let singles = 0;
for (let seed = 1; seed <= ${seeds}; seed++) {
  const s = runToEnd(init(seed), (BOTS as any).think);
  if ((s.flags as any).partner) continue;
  singles++;
  for (const l of s.log as any[]) {
    const j = JSON.stringify(l);
    if (/恋人|パートナー|結婚|プロポーズ|お見合い|離婚|再婚|デート/.test(j)) {
      const id = l.id ?? l.ev ?? l.eventId ?? (l.text?.ja ?? j).slice(0, 30);
      hits[id] = (hits[id] ?? 0) + 1; sample[id] = (l.text?.ja ?? l.ja ?? j).slice(0, 90);
    }
  }
}
(globalThis as any).__out = { hits, sample, singles, keys: Object.keys((init(1) as any).log?.[0] ?? {}) };
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false, define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' }; globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
const { hits, sample, singles, keys } = globalThis.__out;
console.log('log keys:', keys, 'single lives:', singles);
for (const [id, n] of Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(n, id, '|', sample[id]);
