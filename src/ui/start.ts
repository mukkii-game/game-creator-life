// 始まりの指定: '' = おまかせ / 'era1'〜'era3' = 時代 / 'y1985' = 年を指定(1977〜2000)
// URL の ?era=・replay の先頭(era:…)・共有リンクでも同じ文字列を使う
import type { Era } from '../game/types';

export type StartPick = string;
export const YEAR_MIN = 1977;
export const YEAR_MAX = 2000;
const ERAS = ['era1', 'era2', 'era3'];

export function validPick(p: string | null | undefined): p is StartPick {
  if (!p) return false;
  if (ERAS.includes(p)) return true;
  const y = /^y(\d{4})$/.exec(p);
  return !!y && +y[1] >= YEAR_MIN && +y[1] <= YEAR_MAX;
}

export function pickOpts(p: StartPick): { era?: Era; year?: number } {
  if (!validPick(p)) return {};
  return p.startsWith('y') ? { year: +p.slice(1) } : { era: p as Era };
}
