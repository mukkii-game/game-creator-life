// 共有の文と URL(PLAN §7 の型)。State と Ending だけ読む。
// 例: 『1200万人のゲームクリエイター人生』1989 年、下請けのデバッガーとして業界入り。14 本に関わり、2 本はサ終、
//     1 本は 2024 年に「配信で掘り起こされて再評価」。52 歳、仕様変更で心が折れて農業へ。#1200万人のゲームクリエイター人生 URL
import type { State, Work, Text } from '../game/types';
import type { Lang } from '../core/i18n';
import { JOB_TEXT } from '../game/names';

export const TITLE: Text = { ja: '1200万人のゲームクリエイター人生', en: 'Life as One of 12 Million Game Creators' };
export const HASHTAG: Text = { ja: '#1200万人のゲームクリエイター人生', en: '#12MillionGameCreators' };
/** 本番の URL。itch.io の埋め込み(itch.zone)やローカルファイルの時はこちらを共有する */
export const PROD_URL = 'https://game-creator-life.mucky-totoro.workers.dev/';

/** 入口の文を「〜の」形にする。logic の entry.ja は「大手の新卒」型(古い版は「〜に入り」型)。知らない文は「〜の」を足す */
const ENTRY_SHORT: Record<string, Text> = {
  '大手の新卒': { ja: '大手の新卒', en: 'a fresh-graduate' },
  '中堅ソフトハウス': { ja: '中堅ソフトハウスの', en: 'a mid-size-studio' },
  '社員 8 人の会社': { ja: '社員 8 人の会社の', en: 'an eight-person-company' },
  '下請けの開発会社': { ja: '下請けの', en: 'a contract-shop' },
  'アーケードのメーカー': { ja: 'アーケードメーカーの', en: 'an arcade-maker' },
  '同人上がり': { ja: '同人上がりの', en: 'a doujin-born' },
  '異業種からの転職組': { ja: '異業種から来た', en: 'a career-changer' },
  '海外のスタジオ': { ja: '海外スタジオの', en: 'an overseas-studio' },
  '大手に新卒で入り': { ja: '大手の新卒', en: 'a fresh-graduate' },
  '中堅のソフトハウスに入り': { ja: '中堅ソフトハウスの', en: 'a mid-size-studio' },
  '社員 8 人の会社に入り': { ja: '社員 8 人の会社の', en: 'an eight-person-company' },
  '下請けの開発会社に入り': { ja: '下請けの', en: 'a contract-shop' },
  'アーケードのメーカーに入り': { ja: 'アーケードメーカーの', en: 'an arcade-maker' },
  '同人から': { ja: '同人上がりの', en: 'a doujin-born' },
  '異業種から転職し': { ja: '異業種から来た', en: 'a career-changer' },
  '海外のスタジオに入り': { ja: '海外スタジオの', en: 'an overseas-studio' },
};

export function entryPhrase(s: State, l: Lang): string {
  const job = JOB_TEXT[s.inner?.startJob ?? s.job] ?? JOB_TEXT.other;
  const e = ENTRY_SHORT[s.entry.ja];
  if (l === 'ja') return e ? `${e.ja}${job.ja}` : `${s.entry.ja}の${job.ja}`;
  return e ? `${e.en} ${job.en}` : `${job.en} (${s.entry.en})`;
}

export function isEos(h: { text: Text }) { return h.text.ja.includes('サービス終了'); }
function firstSentence(t: string) { return t.split(/[。.!!]\s?/)[0].trim(); }

/** 「作品が人生を追い越した」一番の後日談(発売から一番あとに起きたもの、サ終以外を優先) */
export function bestAfterlife(works: Work[]): { work: Work; year: number; text: Text } | null {
  let best: { work: Work; year: number; text: Text; score: number } | null = null;
  for (const w of works) for (const h of w.history) {
    const score = (h.year - w.year) + (isEos(h) ? -100 : 0) + (w.result === 'flop' ? 3 : 0);
    if (!best || score > best.score) best = { work: w, year: h.year, text: h.text, score };
  }
  return best;
}

/** 共有する URL(?seed= 付き)。「同じスタートで生きてみて」(図鑑で中身が変わるので「同じ人生」とは言わない。?seed= の人生は図鑑を使わないので誰でも同じになる) */
export function lifeUrl(seed: number, era?: string): string {
  let base = PROD_URL;
  try {
    const h = location.hostname;
    const local = location.protocol === 'file:' || h.endsWith('itch.zone') || h.endsWith('itch.io') || h.endsWith('hwcdn.net');
    if (!local && location.origin && location.origin !== 'null') base = location.origin + location.pathname;
  } catch { /* そのまま */ }
  return `${base}?seed=${seed}${era ? `&era=${era}` : ''}`;
}

/** X の字数の重み(twitter-text と同じ考え: ラテン系 1、全角 2、URL は 23)。上限 280 */
export function xWeight(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const light = c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}
const X_LIMIT = 280;
const URL_WEIGHT = 23;

/** 共有文(URL は含まない)。X の字数に収める */
export function shareText(s: State, l: Lang): string {
  const w = s.works;
  const eos = w.filter((x) => x.history.some(isEos)).length;
  const hits = w.filter((x) => x.result === 'hit' || x.result === 'legend').length;
  const legend = w.filter((x) => x.result === 'legend').length;
  const flops = w.filter((x) => x.result === 'flop').length;
  const fate = bestAfterlife(w);
  const cause = s.ending ? s.ending.cause[l] : '';
  const parts: { text: string; drop: number }[] = []; // drop: 字数が足りない時に消す順(大きい方から)
  if (l === 'ja') {
    parts.push({ text: `『${TITLE.ja}』`, drop: 0 });
    parts.push({ text: `${s.startYear} 年、${entryPhrase(s, l)}として業界入り。`, drop: 0 });
    if (!w.length) parts.push({ text: '作品は 1 本も世に出なかった。', drop: 0 });
    else {
      const bits = [`${w.length} 本に関わり`];
      if (legend) bits.push(`${legend} 本は伝説`); else if (hits) bits.push(`${hits} 本はヒット`);
      if (eos) bits.push(`${eos} 本はサ終`); else if (flops) bits.push(`${flops} 本は爆死`);
      parts.push({ text: bits.join('、') + '。', drop: 2 });
      if (fate && !isEos(fate)) parts.push({ text: `1 本は ${fate.year} 年に「${firstSentence(fate.text.ja)}」。`, drop: 3 });
    }
    parts.push({ text: cause ? `${cause}。` : '', drop: 0 });
  } else {
    parts.push({ text: `"${TITLE.en}":`, drop: 0 });
    parts.push({ text: `Started in ${s.startYear} as ${entryPhrase(s, l)}.`, drop: 0 });
    if (!w.length) parts.push({ text: 'Not a single game shipped.', drop: 0 });
    else {
      const bits = [`Worked on ${w.length} game${w.length > 1 ? 's' : ''}`];
      if (legend) bits.push(`${legend} became legend`); else if (hits) bits.push(`${hits} hit${hits > 1 ? 's' : ''}`);
      if (eos) bits.push(`${eos} shut down`); else if (flops) bits.push(`${flops} flop${flops > 1 ? 's' : ''}`);
      parts.push({ text: bits.join(', ') + '.', drop: 2 });
      if (fate && !isEos(fate)) parts.push({ text: `In ${fate.year}, one was "${firstSentence(fate.text.en)}."`, drop: 3 });
    }
    parts.push({ text: cause ? `${cause}.` : '', drop: 0 });
  }
  const sep = l === 'ja' ? '' : ' ';
  const tag = HASHTAG[l];
  const build = () => parts.map((p) => p.text).filter(Boolean).join(sep);
  const fits = (t: string) => xWeight(t) + 1 + xWeight(tag) + 1 + URL_WEIGHT <= X_LIMIT;
  let body = build();
  for (const d of [3, 2]) {
    if (fits(body)) break;
    for (const p of parts) if (p.drop === d) p.text = '';
    body = build();
  }
  if (!fits(body)) { // まだ長ければ末尾を削る(死因は残したいので前から削らない)
    const chars = [...body];
    while (chars.length && !fits(chars.join('') + '…')) chars.pop();
    body = chars.join('') + '…';
  }
  return `${body}${l === 'ja' ? '' : ' '}${l === 'ja' ? '\n' : ''}${tag}`;
}

/** X の投稿画面のリンク */
export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
