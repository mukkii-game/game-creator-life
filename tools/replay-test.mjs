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
// 人生の再現: 同じ seed と同じ選択の列なら、同じ人生になるか(?seed= と ?replay= の土台)
import { init, advance, choose } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
function life(seed: number, pick: (s: any, i: number) => string) {
  const s = init(seed); const ids: string[] = []; let i = 0;
  for (let y = 0; y < 200 && !s.ending; y++) { advance(s); while (s.choice) { const id = pick(s, i++); ids.push(id); choose(s, id); } }
  return { s, ids };
}
const a1 = life(7, (s) => BOTS.think(s, s.choice.choices));
const a2 = life(7, (_s, i) => a1.ids[i]);
const sig = (s: any) => JSON.stringify([s.ending?.cause, s.log.length, s.works.map((w: any) => w.result), s.stat]);
const sameReplay = sig(a1.s) === sig(a2.s) && !!a1.s.ending;
const other = life(8, (s) => BOTS.think(s, s.choice.choices));
const differs = sig(other.s) !== sig(a1.s);
const ok = JSON.stringify(sa) === JSON.stringify(sb) && back.seed === 42 && replayed.join('|') === 'L|AR' && sameReplay && differs;
console.log(JSON.stringify({ ok, sameSequence: sa, replayed, sameReplay, differs, ending: a1.s.ending?.cause.ja, choices: a1.ids.length }));
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
