// 画面の小道具(DOM を作る・文字列の差し込み・時代の絵柄)
import { t, lang } from '../core/i18n';
import type { Text } from '../game/types';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** t() に {v} {year} などを差し込む */
export function tf(key: string, vars: Record<string, string | number> = {}): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export const tx = (x: Text | undefined) => (x ? x[lang()] : '');

/** 時代ごとの絵柄(PLAN §7): body/root のクラスを切り替えるだけ */
export type Look = 'term' | 'dot' | 'win' | 'flat' | 'ai';
export function lookOf(year: number): Look {
  return year < 1983 ? 'term' : year < 1994 ? 'dot' : year < 2007 ? 'win' : year < 2022 ? 'flat' : 'ai';
}
const LOOKS: Look[] = ['term', 'dot', 'win', 'flat', 'ai'];
export function setLook(root: HTMLElement, look: Look) {
  for (const l of LOOKS) root.classList.toggle(`look-${l}`, l === look);
  document.body.dataset.look = look;
}

export function money(v: number): string {
  return lang() === 'ja' ? tf('moneyFmt', { v: v.toLocaleString('ja-JP') }) : tf('moneyFmt', { v: (v * 10000).toLocaleString('en-US') });
}

/** Google Fonts(DotGothic16: 8 色ドットの時代)。index.html は触らないので TS から足す */
export function loadFonts() {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
  document.head.append(l);
}

/** フォーカスできるボタンの列(キーの矢印・パッドの十字で動かす) */
export class FocusRing {
  i = 0;
  constructor(public items: HTMLElement[] = [], start = 0) { this.i = start; this.paint(); }
  set(items: HTMLElement[], start = 0) { this.items = items; this.i = start; this.paint(); }
  move(d: number) {
    if (!this.items.length) return;
    this.i = (this.i + d + this.items.length) % this.items.length;
    this.paint();
  }
  get current(): HTMLElement | undefined { return this.items[this.i]; }
  paint() { this.items.forEach((e, k) => e.classList.toggle('focus', k === this.i)); }
}
