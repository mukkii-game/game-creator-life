// パート E の確かめ用ページ(dev.html)。おまかせ(think)で 1 人生を最後まで回し、結果画面を直接出す。
// tools/og.mjs もここを開いて OG 画像を書き出す(window.__dev)。
import { init, runToEnd } from '../game/logic';
import { BOTS } from '../game/bots';
import { startSeed } from '../core/rng';
import { lang } from '../core/i18n';
import { query } from '../core/meta';
import { showResult } from '../ui/result';
import { drawCard } from './card';
import { shareText, xIntentUrl, lifeUrl, xWeight } from './text';
import type { State } from '../game/types';

const life = (seed: number): State => runToEnd(init(seed), BOTS.think);
const root = document.getElementById('game-container')!;

/** 映える人生か(OG 用の seed 探し): 作品 6〜11 本、ヒットも爆死もあり、後日談が 2 本以上、死因が短すぎない */
function score(s: State): number {
  const w = s.works;
  if (!s.ending || w.length < 5 || w.length > 11) return -1;
  const kinds = new Set(w.map((x) => x.result)).size;
  const fates = w.filter((x) => x.history.length).length;
  return kinds * 3 + Math.min(fates, 4) * 2 + (w.some((x) => x.result === 'legend') ? 3 : 0) + (s.ending.id === 'end_burnout' || s.ending.id === 'end_ai_seat' ? 2 : 0) + (s.startYear < 1995 ? 2 : 0);
}

(window as any).__dev = {
  life: (seed: number) => { const s = life(seed); return { cause: s.ending?.cause, works: s.works.length, start: s.startYear, text: shareText(s, lang()) }; },
  find: (from: number, n: number) => {
    let best = { seed: from, sc: -1 };
    for (let i = 0; i < n; i++) { const sd = from + i; const sc = score(life(sd)); if (sc > best.sc) best = { seed: sd, sc }; }
    return best;
  },
  /** 1 枚絵を dataURL で返す */
  card: async (seed: number, kind: 'portrait' | 'og', l: 'ja' | 'en') => (await drawCard(life(seed), l, kind)).toDataURL('image/png'),
  weight: xWeight,
};

const seed = startSeed();
if (query.get('og')) {
  drawCard(life(seed), lang(), query.get('og') === 'portrait' ? 'portrait' : 'og').then((cv) => { cv.style.width = '100%'; root.append(cv); (window as any).__ready = true; });
} else {
  const s = life(seed);
  const text = shareText(s, lang());
  (window as any).__check = { seed, cause: s.ending?.cause, text, weight: xWeight(text) + 1 + 23, x: xIntentUrl(text, lifeUrl(seed)) };
  showResult(root, s, {
    retry: () => { location.search = `?seed=${(seed * 48271) % 2147483647}${query.lang ? `&lang=${query.lang}` : ''}`; },
    again: () => { location.reload(); },
  });
}
