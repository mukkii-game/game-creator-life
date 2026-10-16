import { build } from 'vite';
import fs from 'node:fs';
const seeds = Number(process.argv[2]) || 150;
const entry = 'tools/.cos-entry.ts';
fs.writeFileSync(entry, `
import { init, runToEnd } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
const cnt: Record<string, number> = {}; const gen: Record<string, number> = {}; let lives = 0, tbl = 0, made = 0;
for (let seed = 1; seed <= ${seeds}; seed++) {
  const s = runToEnd(init(seed), (BOTS as any).think); lives++;
  for (const c of s.companies) {
    const co = c.company; if (!co) continue;
    if (/^co_(mid|small|sub)_\\d+$/.test(co.id)) { made++; gen[co.name.ja] = (gen[co.name.ja] ?? 0) + 1; }
    else if (co.size === 'big' || co.size === 'mid' || co.size === 'small' || co.size === 'sub') { tbl++; cnt[co.name.ja] = (cnt[co.name.ja] ?? 0) + 1; }
  }
}
(globalThis as any).__out = { cnt, gen, lives, tbl, made };
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false, define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' }; globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
const { cnt, gen, lives, tbl, made } = globalThis.__out;
console.log(`lives ${lives}: 表の会社 ${tbl} 回 / 作った名前 ${made} 回 (作った名前の割合 ${Math.round(100 * made / (tbl + made))}%)`);
console.log('表:', Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v}`).join(' / '));
console.log('作った名前:', Object.entries(gen).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ${v}`).join(' / '));
