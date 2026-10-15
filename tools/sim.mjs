// ボットを並べて比べる(描画なし・数秒)。src/game/bots.ts の全ボットを、同じ seed の組で 1 人生ずつ回す。
// npm run sim            … 既定 100 seed
// npm run sim -- 400     … seed の数を変える
// 見るところ(PLAN §8):
//  - idle(いつも 1 番目)が 70 歳まで生きるなら「何もしなくても生きる」穴
//  - random と think の差が小さいなら、選択に意味が無い
//  - 死因の分布が 1 つに偏っていないか / 1 人生の年数・作品数・ヒット率
import { build } from 'vite';
import fs from 'node:fs';
const seeds = Number(process.argv[2]) || 100;
const entry = 'tools/.sim-entry.ts';
fs.writeFileSync(entry, `
import { init, runToEnd } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
const rows: Record<string, any[]> = {};
for (const [name, bot] of Object.entries(BOTS)) {
  rows[name] = [];
  for (let seed = 1; seed <= ${seeds}; seed++) {
    const s = runToEnd(init(seed), bot);
    rows[name].push({ years: s.age - s.startAge, endAge: s.age, start: s.startYear, works: s.works.length,
      hits: s.works.filter((w) => w.result === 'hit' || w.result === 'legend').length, fates: s.works.filter((w) => w.history.length).length,
      ending: s.ending?.id ?? 'none', choices: s.inner.choicesMade, lines: s.log.length, money: s.stat.money });
  }
}
(globalThis as any).__rows = rows;
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 's' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }

const rows = globalThis.__rows;
const mean = (a) => +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(1);
const table = {}, endings = {};
for (const [k, a] of Object.entries(rows)) {
  table[k] = { 年数: mean(a.map((r) => r.years)), 終わった歳: mean(a.map((r) => r.endAge)), '70歳まで%': Math.round(100 * a.filter((r) => r.endAge >= 70).length / a.length),
    作品: mean(a.map((r) => r.works)), ヒット率: +(a.reduce((p, r) => p + r.hits, 0) / Math.max(1, a.reduce((p, r) => p + r.works, 0))).toFixed(2),
    後日談のある作品: mean(a.map((r) => r.fates)), 選択: mean(a.map((r) => r.choices)), ログ行: mean(a.map((r) => r.lines)) };
  endings[k] = {};
  for (const r of a) endings[k][r.ending] = (endings[k][r.ending] ?? 0) + 1;
}
console.log(`seed ${seeds} 個ずつ(1 人生ずつ)`);
console.table(table);
console.log('死因の分布');
console.table(endings);
const warn = [];
if (table.idle && table.idle['70歳まで%'] >= 30) warn.push('idle(いつも 1 番目)の 3 割以上が 70 歳まで生きる');
if (table.random && table.think && table.random.年数 >= table.think.年数 * 0.95) warn.push('random の年数が think の 95% 以上: 選択に意味が薄い');
for (const [k, e] of Object.entries(endings)) { const top = Math.max(...Object.values(e)); if (top / seeds > 0.6) warn.push(`${k} の死因が 1 つに 6 割以上偏る`); }
console.log(warn.length ? '要確認: ' + warn.join(' / ') : '目立つ穴なし(数字は自分の目でも見ること)');
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/sim.json', JSON.stringify({ seeds, table, endings, warn }, null, 2));
