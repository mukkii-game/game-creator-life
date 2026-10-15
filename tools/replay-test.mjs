// 部品の自己確認(描画なし・数秒)。同じ seed と入力なら同じ結果になるか。画面のリフレッシュレートで結果が変わらないか。
// npm run test:replay
import { build } from 'vite';
import fs from 'node:fs';
const entry = 'tools/.replay-entry.ts';
fs.writeFileSync(entry, `
import { Rng } from '../src/core/rng';
import { Recorder, Player, decodeRecording } from '../src/core/replay';
const a = new Rng(42), b = new Rng(42);
const sa = Array.from({ length: 5 }, () => a.int(1, 100));
const sb = Array.from({ length: 5 }, () => b.int(1, 100));
const rec = new Recorder(42); rec.push(3, 'L'); rec.push(10, 'A'); rec.push(10, 'R');
const back = decodeRecording(rec.toString())!; const p = new Player(back);
const replayed = [3, 10].map((f) => p.input(f));
// 画面が 60Hz でも 120Hz でも、同じ秒数なら中身は同じになるか(FixedStep + logic)
import { FixedStep } from '../src/core/fixedstep';
import { TICK, init, step, encodeInput, decodeInput } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
const cfg = { speed: 300, duration: 5, scorePer: 10, width: 480 };
function run(hz: number) {
  const s = init(cfg, 7), bot = BOTS.think(7), clock = new FixedStep(TICK), r = new Recorder(7);
  for (let i = 0; i < hz * 6; i++) clock.advance(1000 / hz, () => { const inp = bot(s, cfg); r.push(s.tick, encodeInput(inp)); step(s, inp, cfg); });
  return { s, r };
}
const r60 = run(60), r120 = run(120);
const sameHz = r60.s.score === r120.s.score && Math.abs(r60.s.x - r120.s.x) < 1e-6 && r60.s.tick === r120.s.tick;
// 記録を再生すると同じ結果になるか
const pl = new Player(decodeRecording(r60.r.toString())!), s2 = init(cfg, 7);
while (!s2.over) step(s2, decodeInput(pl.input(s2.tick)), cfg);
const sameReplay = s2.score === r60.s.score && Math.abs(s2.x - r60.s.x) < 1e-6;
const ok = JSON.stringify(sa) === JSON.stringify(sb) && back.seed === 42 && replayed.join('|') === 'L|AR' && sameHz && sameReplay;
console.log(JSON.stringify({ ok, sameSequence: sa, replayed, sameHz, sameReplay, score: r60.s.score }));
(globalThis as any).__ok = ok;
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 't' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
process.exit(globalThis.__ok ? 0 : 1);
