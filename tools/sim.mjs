// ボットを並べて比べる(描画なし・数秒)。src/game/bots.ts の全ボットを、同じ seed の組で回す。
// npm run sim            … 既定 20 seed
// npm run sim -- 100     … seed の数を変える
// 見るところ:
//  - idle(何もしない)が良い点を取るなら「何もしないで勝てる」穴
//  - random と think の差が小さいなら、考える意味が薄い
//  - think と think+遅れ の差が大きいなら、反射神経で決まるゲーム(狙いどおりか確かめる)
// 作品は logic.ts / bots.ts を書き換えるだけで、このファイルはそのまま使える。
import { build } from 'vite';
import fs from 'node:fs';
const seeds = Number(process.argv[2]) || 20;
const entry = 'tools/.sim-entry.ts';
fs.writeFileSync(entry, `
import { init, step } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
import { KNOBS } from '../src/tuning';
const v = (k: string) => KNOBS.find((x) => x.key === k)!.value as number;
const cfg = { speed: v('player.speed'), duration: v('game.duration'), scorePer: v('score.per'), width: 480 };
const rows: Record<string, number[]> = {};
for (const [name, make] of Object.entries(BOTS)) {
  rows[name] = [];
  for (let seed = 1; seed <= ${seeds}; seed++) {
    const s = init(cfg, seed); const bot = make(seed);
    let guard = 0;
    while (!s.over && guard++ < 60 * 60 * 30) step(s, bot(s, cfg), cfg);
    rows[name].push(s.score);
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
const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { mean: +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(1), min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] }; };
const table = Object.fromEntries(Object.entries(rows).map(([k, a]) => [k, stat(a)]));
console.log(`seed ${seeds} 個ずつ`);
console.table(table);
const best = Math.max(...Object.values(table).map((r) => r.mean));
const warn = [];
if (table.idle && best > 0 && table.idle.mean >= best * 0.5) warn.push('idle(何もしない)が一番の半分以上取れている');
if (table.random && table.think && table.think.mean > 0 && table.random.mean >= table.think.mean * 0.8) warn.push('random が think の 8 割以上: 考える意味が薄い');
console.log(warn.length ? '要確認: ' + warn.join(' / ') : '目立つ穴なし(数字は自分の目でも見ること)');
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/sim.json', JSON.stringify({ seeds, table, warn }, null, 2));
