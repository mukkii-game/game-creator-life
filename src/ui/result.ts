// 結果画面(パート E、PLAN §7)。画面(パート D)は人生が終わったらこれを呼ぶだけ。
// 約束: showResult(root, state, hooks)。root の中身を結果画面に置き換える。
// ① スタッフロール(タップ / キー / パッド A で飛ばせる)→ ② 1 枚絵(src/share/card.ts)と共有 → ③ 新しい人生 / 同じ人生をもう一度。
import './result.css';
import type { State, Text, Company } from '../game/types';
import { lang, type Lang } from '../core/i18n';
import { expose } from '../core/demo';
import { describe, action, clearActions } from '../core/probe';
import { JOB_TEXT } from '../game/names';
import { RESULT_TEXT, ROLE_TEXT } from '../game/works';
import { drawCard, toBlob, ensureFont, RESULT_COLOR } from '../share/card';
import { HIST_BY_ID } from '../game/data';
import { chronicleCount } from './title';
import { t } from '../core/i18n';
import { playSe } from '../core/audio';
import { tf } from './util';
import { TITLE, shareText, lifeUrl, xIntentUrl, entryPhrase } from '../share/text';

export interface ResultHooks {
  /** 新しい人生(別の seed) */
  retry: () => void;
  /** 同じ seed でもう一度 */
  again: () => void;
  /** 年表図鑑: この人生の前・後(app.ts が保存してから渡す)と、今回はじめて入ったキー */
  chronicle?: { before: string[]; after: string[]; added: string[] };
}

const S: Record<string, Text> = {
  starring: { ja: '主演', en: 'STARRING' },
  start: { ja: '業界入り', en: 'ENTERED THE INDUSTRY' },
  companies: { ja: '所属', en: 'COMPANIES' },
  works: { ja: '作品', en: 'WORKS' },
  noWorks: { ja: '(世に出た作品はなし)', en: '(no games shipped)' },
  peers: { ja: '同期', en: 'PEERS' },
  music: { ja: '音楽・効果音', en: 'MUSIC & SOUND EFFECTS' },
  art: { ja: '絵(人物・アイコン)', en: 'ART (PEOPLE & ICONS)' },
  thanks: { ja: '協力', en: 'SPECIAL THANKS' },
  thanksBody: { ja: '寝袋 / カップ麺 / 栄養ドリンク / 仕様書(第 14 版)', en: 'Sleeping bag / Cup noodles / Energy drinks / Spec doc (rev. 14)' },
  fin: { ja: '終', en: 'FIN' },
  oneOf: { ja: '1200万人のうちの、1 人の人生でした', en: 'That was one life out of 12 million' },
  skip: { ja: 'タップで飛ばす', en: 'Tap to skip' },
  head: { ja: 'おつかれさまでした', en: 'Thanks for all your hard work' },
  share: { ja: '共有する', en: 'Share' },
  post: { ja: 'X にポスト', en: 'Post on X' },
  save: { ja: '画像を保存', en: 'Save image' },
  copy: { ja: '同じスタートで生きてみて', en: 'Try the same start (copy link)' },
  copySub: { ja: '?seed= 付きの URL をコピー', en: 'copies a ?seed= link' },
  copied: { ja: 'URL をコピーしました', en: 'Link copied' },
  copyFail: { ja: 'コピーできませんでした: ', en: 'Could not copy: ' },
  saved: { ja: '画像を保存しました(出ない時は画像を長押し)', en: 'Image saved (or long-press the image)' },
  retry: { ja: '新しい人生', en: 'New life' },
  again: { ja: '同じスタートでもう一度', en: 'Same start again' },
  og: { ja: '横長(1200×630)を保存', en: 'Save wide (1200×630)' },
  keys: { ja: '1 新しい人生 / 2 同じスタート / 3 X / 4 保存 / ← → 選ぶ・Enter 決定', en: '1 New / 2 Same / 3 X / 4 Save / ← → move, Enter select' },
};
const T = (k: string, l: Lang) => S[k][l];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 勤めた会社(入社順。自室・無職は除く) */
function companiesOf(s: State): Text[] {
  const out: Text[] = [];
  for (const c of s.companies ?? []) if (c.company.size !== 'none' && !out.some((o) => o.ja === c.company.name.ja)) out.push(c.company.name);
  return out;
}

function peerName(s: State, i: number, l: Lang): string {
  const p = s.inner?.peerStates?.[i];
  return p ? p.name[l] : s.peers[i].name;
}

// ---------- ① スタッフロール ----------
function buildRoll(s: State, l: Lang): HTMLElement {
  const box = el('div', 'rs-roll-inner rs-dot');
  const h2 = (k: string) => box.append(el('h2', '', T(k, l)));
  const p = (t: string, cls = '') => box.append(el('p', cls, t));
  box.append(el('h1', '', TITLE[l]));
  h2('starring'); p(s.name[l]);
  h2('start');
  p(l === 'ja' ? `${s.startYear} 年 / ${s.startAge} 歳` : `${s.startYear} / age ${s.startAge}`);
  p(entryPhrase(s, l), 'rs-small');
  p(s.region[l], 'rs-small');
  h2('companies');
  const cos = companiesOf(s);
  if (!cos.length) p(l === 'ja' ? '(会社には入らなかった)' : '(never joined a company)', 'rs-small');
  for (const c of cos) p(c[l]);
  h2('works');
  if (!s.works.length) p(T('noWorks', l), 'rs-small');
  for (const w of s.works) {
    const d = el('div', 'rs-work');
    const b = el('b', '', w.name[l]);
    const tag = el('span', 'rs-res', RESULT_TEXT[w.result][l]);
    tag.style.background = RESULT_COLOR[w.result];
    const top = el('p'); top.append(b, tag);
    d.append(top);
    d.append(el('p', 'rs-small', l === 'ja' ? `${w.year} 年 / ${w.platform} / ${ROLE_TEXT[w.role].ja}` : `${w.year} / ${w.platform} / ${ROLE_TEXT[w.role].en}`));
    for (const h of w.history) d.append(el('p', 'rs-small', `${h.year}: ${h.text[l]}`));
    box.append(d);
  }
  h2('peers');
  s.peers.forEach((pe, i) => { p(peerName(s, i, l)); p(pe.summary[l], 'rs-small'); });
  h2('music'); p(l === 'ja' ? '魔王魂' : 'MaouDamashii'); p('https://maou.audio/', 'rs-small');
  h2('art'); p(l === 'ja' ? 'ぴぽや' : 'Pipoya'); p('https://pipoya.net/', 'rs-small');
  h2('thanks'); p(T('thanksBody', l), 'rs-small');
  const job = JOB_TEXT[s.job] ?? JOB_TEXT.other;
  box.append(el('p', 'rs-cause', s.ending ? s.ending.cause[l] : ''));
  p(l === 'ja' ? `${s.ending?.year ?? s.year} 年 / 最後の肩書き: ${job.ja}` : `${s.ending?.year ?? s.year} / last title: ${job.en}`, 'rs-small');
  if (s.ending?.lastWord) box.append(el('p', 'rs-lastword', `「${s.ending.lastWord[l]}」`));
  if (s.ending?.epitaph) box.append(el('p', 'rs-epitaph', s.ending.epitaph[l]));
  box.append(el('p', 'rs-fin', T('fin', l)));
  p(T('oneOf', l), 'rs-small');
  return box;
}

// ---------- 今回はじめて触れた歴史 ----------
function chronicleBox(s: State, c: NonNullable<ResultHooks['chronicle']>): HTMLElement {
  const beforeHist = new Set(c.before.map((k) => k.split(':')[0]));
  const fresh = [...new Set(s.chronicle.map((k) => k.split(':')[0]))].filter((id) => !beforeHist.has(id) && HIST_BY_ID.has(id))
    .sort((a, b) => HIST_BY_ID.get(a)!.year - HIST_BY_ID.get(b)!.year || (HIST_BY_ID.get(a)!.month ?? 0) - (HIST_BY_ID.get(b)!.month ?? 0));
  const otherPos = c.added.filter((k) => beforeHist.has(k.split(':')[0])).length;
  const all = HIST_BY_ID.size;
  const box = el('div', 'rs-chron');
  box.append(el('p', 'rs-chron-h', tf('rsChronNew', { n: fresh.length })));
  box.append(el('p', 'rs-chron-n', tf('rsChronCount', { a: chronicleCount(c.before), b: chronicleCount(c.after), all })));
  if (otherPos) box.append(el('p', 'rs-chron-n', tf('rsChronPos', { n: otherPos })));
  if (fresh.length) {
    const ul = el('ul', 'rs-chron-ul');
    for (const id of fresh) {
      const x = HIST_BY_ID.get(id)!;
      const li = el('li');
      li.append(el('b', '', String(x.year)), el('span', '', x.title[lang()]));
      ul.append(li);
    }
    box.append(ul);
  } else if (!s.chronicle.length) box.append(el('p', 'rs-chron-n', t('rsChronNone')));
  return box;
}

// ---------- 入力(window だけに付けない。重複は同じ event を 2 度扱わないことで除く) ----------
type Unbind = () => void;
function onKeys(fn: (e: KeyboardEvent) => void): Unbind {
  const seen = new WeakSet<Event>();
  const h = (e: Event) => { if (seen.has(e)) return; seen.add(e); fn(e as KeyboardEvent); };
  document.addEventListener('keydown', h); window.addEventListener('keydown', h);
  return () => { document.removeEventListener('keydown', h); window.removeEventListener('keydown', h); };
}
function onPad(fn: (btn: number) => void): Unbind {
  let alive = true, prev: boolean[] = [];
  const loop = () => {
    if (!alive) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((x) => x);
    if (gp) {
      const now = gp.buttons.map((b) => b.pressed);
      now.forEach((v, i) => { if (v && !prev[i]) fn(i); });
      prev = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => { alive = false; };
}

export function showResult(root: HTMLElement, s: State, hooks: ResultHooks) {
  const l = lang();
  root.innerHTML = '';
  const wrap = el('div', 'rs-root');
  root.append(wrap);
  const unbinds: Unbind[] = [];
  const cleanup = () => { unbinds.splice(0).forEach((u) => u()); };
  const leave = (fn: () => void) => () => { cleanup(); fn(); };
  const retry = leave(hooks.retry), again = leave(hooks.again);
  void ensureFont(); // DOM の字も DotGothic16 にする

  const url = lifeUrl(s.seed, s.options?.era ?? (s.options?.year ? `y${s.options.year}` : undefined));
  const text = shareText(s, l);
  const xUrl = xIntentUrl(text, url);
  // 1 枚絵は先に作り始める(ロールの間に間に合う)
  const portrait = drawCard(s, l, 'portrait');
  const portraitBlob = portrait.then(toBlob);

  // probe(AI の口)と check 用
  expose('scene', 'Result');
  expose('result', { seed: s.seed, cause: s.ending?.cause[l], text, url, xUrl });
  clearActions();
  describe(() => ({ scene: 'result', seed: s.seed, age: s.ending?.age, cause: s.ending?.cause[l], works: s.works.length, share: text, url }));
  action('retry', () => { retry(); });
  action('again', () => { again(); });

  // ① ロール
  const roll = el('div', 'rs-roll');
  const inner = buildRoll(s, l);
  roll.append(inner, el('div', 'rs-skip', T('skip', l)));
  wrap.append(roll);
  let rolled = false;
  const finishRoll = () => {
    if (rolled) return;
    rolled = true;
    roll.remove();
    showPanel();
  };
  action('skip', () => { if (rolled) return 'staff roll already finished'; finishRoll(); });
  requestAnimationFrame(() => {
    const H = roll.clientHeight || 720, total = inner.offsetHeight + H * 0.55;
    const sec = Math.max(14, Math.min(45, total / 55));
    const anim = inner.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-total}px)` }], { duration: sec * 1000, easing: 'linear', fill: 'forwards' });
    anim.onfinish = finishRoll;
  });
  roll.addEventListener('pointerup', finishRoll);
  roll.addEventListener('click', finishRoll);

  // ② 結果パネル
  let buttons: HTMLElement[] = [];
  let focusIdx = 0;
  const toast = el('div', 'rs-toast');
  wrap.append(toast);
  let toastT = 0;
  const say = (msg: string) => { toast.textContent = msg; toast.classList.add('rs-on'); clearTimeout(toastT); toastT = window.setTimeout(() => toast.classList.remove('rs-on'), 2200); };

  const showPanel = () => {
    const panel = el('div', 'rs-panel');
    const pin = el('div', 'rs-panel-in');
    panel.append(pin);
    pin.append(el('p', 'rs-ttl rs-dot', T('head', l)));
    pin.append(el('p', 'rs-cause-big rs-dot', s.ending ? s.ending.cause[l] : ''));
    if (s.ending?.lastWord) pin.append(el('p', 'rs-lastword', `「${s.ending.lastWord[l]}」`));
    if (s.ending?.epitaph) pin.append(el('p', 'rs-epitaph rs-epitaph-panel', s.ending.epitaph[l]));
    pin.append(el('p', 'rs-sum', s.ending ? s.ending.summary[l] : ''));
    if (hooks.chronicle) pin.append(chronicleBox(s, hooks.chronicle));
    pin.append(lifeLog(s, l));
    const img = el('img', 'rs-card');
    img.alt = s.ending ? s.ending.cause[l] : TITLE[l];
    pin.append(img);
    let imgUrl = '';
    portraitBlob.then((b) => { imgUrl = URL.createObjectURL(b); img.src = imgUrl; }).catch(() => { img.remove(); });

    const row1 = el('div', 'rs-btns');
    const mk = (label: string, cls: string, fn: () => void, sub?: string) => {
      const b = el('button', `rs-btn ${cls}`, label);
      if (sub) b.append(el('small', '', sub));
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    const fileName = `game-creator-life-${s.seed}.png`;
    const saveBlob = async (blobP: Promise<Blob>, name: string) => {
      try {
        const b = await blobP;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = name;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say(T('saved', l));
      } catch (e) { say(String(e)); }
    };
    // 共有(Web Share API。画像付きで共有できる端末は画像も)
    let file: File | null = null;
    portraitBlob.then((b) => { try { file = new File([b], fileName, { type: 'image/png' }); } catch { file = null; } });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share === 'function') {
      row1.append(mk(T('share', l), 'rs-share', async () => {
        try {
          if (file && nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: TITLE[l], text: `${text}\n${url}` });
          else await nav.share({ title: TITLE[l], text, url });
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') window.open(xUrl, '_blank', 'noopener');
        }
      }));
    }
    const x = el('a', 'rs-btn rs-x', T('post', l));
    x.href = xUrl; x.target = '_blank'; x.rel = 'noopener';
    x.style.cssText = 'text-decoration:none;display:flex;align-items:center;justify-content:center';
    row1.append(x);
    row1.append(mk(T('save', l), '', () => saveBlob(portraitBlob, fileName)));
    row1.append(mk(T('copy', l), typeof nav.share === 'function' ? '' : 'rs-wide', () => copy(url), T('copySub', l)));
    pin.append(row1);

    const row2 = el('div', 'rs-btns rs-life');
    const bRetry = mk(T('retry', l), 'rs-main', retry);
    const bAgain = mk(T('again', l), '', again);
    row2.append(bRetry, bAgain);
    pin.append(row2);

    const links = el('p', 'rs-links');
    const og = el('a', '', T('og', l));
    og.href = '#'; og.addEventListener('click', (e) => { e.preventDefault(); saveBlob(drawCard(s, l, 'og').then(toBlob), `game-creator-life-${s.seed}-wide.png`); });
    links.append(og);
    pin.append(links);
    pin.append(el('p', 'rs-keys', T('keys', l)));
    pin.append(el('p', 'rs-keys', t('soundCredit')));
    playSe('clap', { vol: 0.8 });
    // ロールを飛ばしたタップが下のボタンに落ちないよう、少しだけ押せなくする
    panel.style.pointerEvents = 'none';
    setTimeout(() => { panel.style.pointerEvents = ''; }, 450);
    wrap.insertBefore(panel, toast);

    buttons = [...pin.querySelectorAll<HTMLElement>('.rs-btn')];
    focusIdx = buttons.indexOf(bRetry);
    unbinds.push(() => { if (imgUrl) URL.revokeObjectURL(imgUrl); });
  };

  const copy = async (u: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(u);
      else throw new Error('no clipboard');
      say(T('copied', l));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = u; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      say(ok ? T('copied', l) : T('copyFail', l) + u);
    }
  };

  const moveFocus = (d: number) => {
    if (!buttons.length) return;
    buttons[focusIdx]?.classList.remove('rs-focus');
    focusIdx = (focusIdx + d + buttons.length) % buttons.length;
    buttons[focusIdx].classList.add('rs-focus');
    buttons[focusIdx].focus();
  };
  const clickBtn = (cls: string) => (buttons.find((b) => b.classList.contains(cls)) ?? null)?.click();

  unbinds.push(onKeys((e) => {
    if (!rolled) { if (['Enter', ' ', 'Escape', 'ArrowDown', 'ArrowRight', 'Spacebar'].includes(e.key) || e.key.length === 1) { e.preventDefault(); finishRoll(); } return; }
    if (e.key === '1') retry();
    else if (e.key === '2') again();
    else if (e.key === '3') clickBtn('rs-x');
    else if (e.key === '4') buttons.find((b) => b.textContent === T('save', l))?.click();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
  }));
  // パッド: A = 飛ばす / 決定、十字 = 選ぶ、B = 同じ人生(誤爆しにくい方)
  unbinds.push(onPad((b) => {
    if (!rolled) { if (b === 0 || b === 9) finishRoll(); return; }
    if (b === 0) { const t = buttons[focusIdx]; if (t) { if (!t.classList.contains('rs-focus')) moveFocus(0); else t.click(); } }
    else if (b === 13 || b === 15) moveFocus(1);
    else if (b === 12 || b === 14) moveFocus(-1);
  }));
  // root が差し替えられたら(D が画面を戻した等)後片付け
  const mo = new MutationObserver(() => { if (!wrap.isConnected) { cleanup(); mo.disconnect(); } });
  mo.observe(root, { childList: true });
}

/** 人生の記録をぜんぶ(開くとスクロールで読める。年ごとに見出し) */
function lifeLog(s: State, l: 'ja' | 'en'): HTMLElement {
  const d = document.createElement('details');
  d.className = 'rs-log';
  const sm = document.createElement('summary');
  sm.textContent = l === 'ja' ? `📖 この人生の記録をぜんぶ読む(${s.log.length} 行)` : `📖 Read this whole life (${s.log.length} lines)`;
  const list = document.createElement('div');
  list.className = 'rs-log-list';
  let last = '';
  for (const line of s.log) {
    const key = `${line.year}:${line.age}`;
    if (key !== last) {
      last = key;
      const yh = document.createElement('div');
      yh.className = 'rs-log-year';
      yh.textContent = l === 'ja' ? `${line.year} 年(${line.age} 歳)` : `${line.year} (age ${line.age})`;
      list.append(yh);
    }
    const p = document.createElement('p');
    p.className = `rs-log-line rs-log-${line.kind}`;
    p.textContent = line.text[l];
    list.append(p);
  }
  d.append(sm, list);
  return d;
}
