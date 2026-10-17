// 絵の素材(ぴぽや。CREDITS.md)。人物 = ぴぽや32シンプル(32×32 のキャラチップ正面)、アイコン = プチエモートアイコン(12×12)。
// どちらも 1 倍のドット絵を 1 枚にまとめたもの。拡大は CSS の image-rendering: pixelated。
// 読み込みに失敗したら .gcl に no-art を付け、絵文字(data-e)に戻す。
import peopleUrl from '../assets/img/pipoya_simple32_people.png';
import emoteUrl from '../assets/img/pipoya_puchiemote12.png';
import { h } from './util';

export { peopleUrl, emoteUrl };

/** 人物の 1 枚絵: 10 列 × 9 行、1 人 32×32 */
export const PEOPLE_COLS = 10;
export const PEOPLE_N = 89;

/**
 * 1 人の顔の移り変わり(若手 〜34 歳 / 中堅 35〜54 歳 / ベテラン 55 歳〜)。数字は人物の番号(配布ページの並び順)。
 * 例: 0 番目 = 普段着の青年 → 会社員 → 社長(はげ・眼鏡)。性別・髪型を散らした 24 通り。
 */
export const LINEAGES: [number, number, number][] = [
  // 男性
  [25, 50, 54], [26, 51, 74], [27, 52, 81], [28, 1, 2], [29, 73, 74], [42, 82, 81],
  [44, 50, 54], [46, 51, 2], [3, 17, 88], [61, 64, 2], [62, 52, 54], [18, 72, 88],
  // 女性
  [20, 47, 8], [21, 48, 8], [22, 49, 53], [23, 87, 8], [24, 55, 53], [45, 48, 8],
  [56, 47, 53], [60, 49, 8], [79, 85, 8], [4, 87, 8], [19, 48, 53], [80, 85, 8],
];

/** seed から 1 人を選ぶ(Math.random は使わない) */
export function lineageOf(seed: number): [number, number, number] {
  let x = (seed ^ 0x5eedface) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return LINEAGES[x % LINEAGES.length];
}
export function faceOf(seed: number, age: number): number {
  const l = lineageOf(seed);
  return l[age < 35 ? 0 : age < 55 ? 1 : 2];
}

/** 社員証の写真: 32×32 のうち胸から上(x 5〜27, y 3〜25 の 22×22)を scale 倍で見せる */
export function faceEl(idx: number, cls = 'face'): HTMLElement {
  const e = h('div', cls);
  e.style.setProperty('--fx', String(idx % PEOPLE_COLS));
  e.style.setProperty('--fy', String(Math.floor(idx / PEOPLE_COLS)));
  return e;
}

/** 全身(タイトルの行列など) */
export function personEl(idx: number, cls = 'person'): HTMLElement {
  return faceEl(idx, cls);
}

/** プチエモートアイコン(行, 列)。12×12 */
export const EMO = {
  // 吹き出しの種類
  event: [12, 17], work: [17, 7], peer: [11, 15], choice: [11, 12], ask: [12, 1],
  // 歴史の事件の種類
  hardware: [20, 16], hit: [17, 4], incident: [20, 7], biz: [17, 8], ai: [5, 0], future: [12, 8],
  // テンション・有名人・挫折
  high: [12, 9], celeb: [12, 7], pit: [7, 17],
  // 職種
  programmer: [20, 14], planner: [20, 11], artist: [16, 7], ta: [16, 7], sound: [12, 6], qa: [10, 16], sales: [20, 15], director: [20, 17], producer: [17, 8], other: [18, 3],
  // 作品の結果
  legend: [17, 2], star: [12, 7], flop: [7, 17],
  // 年表
  book: [20, 8],
} as const satisfies Record<string, readonly [number, number]>;
export type EmoName = keyof typeof EMO;

/** アイコン 1 つ。scale = 12px の何倍か。fallback = 絵が読めない時の絵文字 */
export function emo(name: EmoName, fallback: string, cls = '', scale = 2): HTMLElement {
  const [r, c] = EMO[name];
  const e = h('span', `pe${cls ? ` ${cls}` : ''}`);
  e.style.setProperty('--ex', String(c));
  e.style.setProperty('--ey', String(r));
  if (scale !== 2) e.style.setProperty('--es', String(scale));
  e.dataset.e = fallback;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

/** 1 回だけ: CSS に画像の URL を渡し、読めるか確かめる。読めなければ root に no-art(絵文字に戻す) */
let installed = false;
export function installArt(root: HTMLElement) {
  if (installed) return;
  installed = true;
  const de = document.documentElement.style;
  de.setProperty('--people-sheet', `url("${peopleUrl}")`);
  de.setProperty('--emote-sheet', `url("${emoteUrl}")`);
  for (const u of [peopleUrl, emoteUrl]) {
    const im = new Image();
    im.onerror = () => { root.classList.add('no-art'); document.body.classList.add('no-art'); };
    im.src = u;
  }
}
