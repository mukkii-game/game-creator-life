// 年表図鑑: 触れた歴史の事件(src/data/hist/)を年の順に並べる。触れていない事件は年と kind のアイコンだけで「？？？」。
// 同じ事件でも立場(variant)ごとに話が違うので「立場 2/4」と触れた版の本文を出す。キー・パッド・タップで閉じる。
import { t } from '../core/i18n';
import { HIST } from '../game/data';
import { POS_TEXT } from '../game/names';
import type { Hist, Pos } from '../game/types';
import { h, tf, tx, setLook } from './util';
import { onTap, type Cmd } from './input';
import { HIST_ICON } from './play';

export interface ChronicleScreen { onCmd: (c: Cmd) => void }

/** 見出しの区切り(業界入りの 3 時代 + その後の人生) */
const SPANS: [number, number, string][] = [
  [0, 1985, 'chr_era1'], [1986, 1994, 'chr_era2'], [1995, 2000, 'chr_era3'],
  [2001, 2011, 'chr_era4'], [2012, 2019, 'chr_era5'], [2020, 9999, 'chr_era6'],
];

/** variant の when から立場を読む(無ければ「誰にでも」) */
function posLabel(when: string[] | undefined): string {
  const p = (when ?? []).map((c) => /^pos\s*=\s*([a-z_]+)$/.exec(c.trim())?.[1]).find(Boolean) as Pos | undefined;
  if (p && POS_TEXT[p]) return tx(POS_TEXT[p]);
  const other = (when ?? []).length > 0;
  return t(other ? 'chrPosOther' : 'chrPosAny');
}
const clean = (s: string) => s.replace(/\{\w+\}/g, '…');

export function chronicleStats(keys: string[]) {
  const set = new Set(keys);
  let hist = 0, vars = 0, varsAll = 0;
  for (const x of HIST) {
    const n = x.variants.filter((v) => set.has(`${x.id}:${v.id}`)).length;
    varsAll += x.variants.length;
    vars += n;
    if (n || keys.some((k) => k.startsWith(`${x.id}:`))) hist++;
  }
  return { hist, histAll: HIST.length, vars, varsAll };
}

function item(x: Hist, set: Set<string>): HTMLElement {
  const got = x.variants.filter((v) => set.has(`${x.id}:${v.id}`));
  const touched = got.length > 0 || [...set].some((k) => k.startsWith(`${x.id}:`));
  const li = h('li', `chr-item k-${x.kind}${touched ? ' got' : ' unk'}`);
  const when = h('div', 'chr-when');
  when.append(h('span', 'chr-ic', HIST_ICON[x.kind] ?? '📰'), h('b', '', x.month && touched ? tf('ym', { y: x.year, m: x.month }) : String(x.year)));
  li.append(when);
  const body = h('div', 'chr-body');
  if (!touched) {
    body.append(h('div', 'chr-title', t('chrUnknown')));
  } else {
    const top = h('div', 'chr-top');
    top.append(h('span', 'chr-title', tx(x.title)), h('span', `chr-pos${got.length >= x.variants.length ? ' full' : ''}`, tf('chrPos', { n: got.length, all: x.variants.length })));
    body.append(top, h('div', 'chr-news', tx(x.news)));
    for (const v of got) {
      const d = h('div', 'chr-var');
      d.append(h('span', 'chr-var-pos', posLabel(v.when)), h('span', 'chr-var-text', clean(tx(v.text))));
      body.append(d);
    }
  }
  li.append(body);
  return li;
}

export function showChronicle(app: HTMLElement, keys: string[], onClose: () => void): ChronicleScreen {
  app.innerHTML = '';
  setLook(app, 'dot');
  app.dataset.scene = 'chronicle';
  const set = new Set(keys);
  const st = chronicleStats(keys);
  const pct = st.histAll ? Math.floor((st.hist / st.histAll) * 100) : 0;

  const wrap = h('div', 'chr');
  const head = h('header', 'chr-head');
  const ttl = h('div', 'chr-ttl');
  ttl.append(h('h2', '', t('chrTitle')), h('div', 'chr-rate', tf('chrRate', { n: st.hist, all: st.histAll, p: pct })));
  const close = h('button', 'mini chr-close', t('close'));
  let closed = false;
  const done = () => { if (closed) return; closed = true; onClose(); };
  onTap(close, done);
  head.append(ttl, close);
  const bar = h('div', 'chr-bar');
  const fill = h('span', 'chr-fill');
  fill.style.width = `${pct}%`;
  bar.append(fill);
  const sub = h('div', 'chr-sub', tf('chrVars', { n: st.vars, all: st.varsAll }));
  head.append(bar, sub);

  const list = h('div', 'chr-list');
  if (!HIST.length) list.append(h('p', 'muted', t('chrNone')));
  for (const [a, b, key] of SPANS) {
    const xs = HIST.filter((x) => x.year >= a && x.year <= b);
    if (!xs.length) continue;
    const n = xs.filter((x) => [...set].some((k) => k.startsWith(`${x.id}:`))).length;
    const sec = h('section', 'chr-sec');
    const sh = h('h3', 'chr-sec-h');
    sh.append(h('span', '', t(key)), h('span', 'chr-sec-n', `${n} / ${xs.length}`));
    const ul = h('ul', 'chr-ul');
    for (const x of xs) ul.append(item(x, set));
    sec.append(sh, ul);
    list.append(sec);
  }
  if (!keys.length) list.prepend(h('p', 'chr-empty', t('chrEmpty')));
  list.append(h('p', 'chr-foot', t('chrHelp')));
  wrap.append(head, list);
  app.append(wrap);

  return {
    onCmd(c) {
      if (c.type === 'up') list.scrollBy({ top: -120, behavior: 'smooth' });
      else if (c.type === 'down') list.scrollBy({ top: 120, behavior: 'smooth' });
      else if (c.type === 'left') list.scrollBy({ top: -list.clientHeight * 0.8, behavior: 'smooth' });
      else if (c.type === 'right') list.scrollBy({ top: list.clientHeight * 0.8, behavior: 'smooth' });
      else if (c.type === 'ok' || c.type === 'back' || c.type === 'speed' || c.type === 'pause') done();
    },
  };
}
