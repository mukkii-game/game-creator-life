import { build } from 'vite';
import fs from 'node:fs';
const seeds = Number(process.argv[2]) || 300;
const entry = 'tools/.flags-entry.ts';
fs.writeFileSync(entry, `
import { init, runToEnd } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
const rows: any[] = [];
for (const name of ['think','random','stable']) for (let seed = 1; seed <= ${seeds}; seed++) {
  const s = runToEnd(init(seed + (name==='random'?10000:name==='stable'?20000:0)), (BOTS as any)[name]);
  const f = s.flags as any;
  rows.push({ bot: name, start: s.startYear, endAge: s.age, partner: !!f.partner, married: !!f.lv_married, child: !!f.child, divorced: !!f.lv_divorced,
    romanceLines: s.log.filter((l: any) => /恋人|パートナー|結婚|プロポーズ|お見合い|離婚|再婚/.test(l.text?.ja ?? l.ja ?? JSON.stringify(l))).length });
}
(globalThis as any).__rows = rows;
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false, define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' }; globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
const rows = globalThis.__rows;
const pct = (a, k) => Math.round(100 * a.filter((r) => r[k]).length / a.length);
for (const bot of ['think','random','stable']) {
  const a = rows.filter((r) => r.bot === bot);
  console.log(bot, `n=${a.length}`, `partner ${pct(a,'partner')}%`, `married ${pct(a,'married')}%`, `child ${pct(a,'child')}%`, `divorced ${pct(a,'divorced')}%`,
    `romance lines avg ${(a.reduce((p,r)=>p+r.romanceLines,0)/a.length).toFixed(1)}`, `single lives with romance lines: ${a.filter(r=>!r.partner && r.romanceLines>0).length}`);
}
