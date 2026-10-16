// 結果の 1 枚絵(PLAN §7 ②)。「社員証」+「作品棚」+ 死因の 1 行 + 5万分の1。canvas に描いて PNG にする。
// 縦長 1080×1350(SNS の投稿用)と OG 用 1200×630 の 2 つ。絵柄は元ネタに似せない(棚と社員証に寄せる)。
// 乱数は core/rng(顔のドット絵とバーコードは seed から決まる。Math.random は使わない)。
import { Rng } from '../core/rng';
import type { State, Work, WorkResult, Text } from '../game/types';
import type { Lang } from '../core/i18n';
import { JOB_TEXT } from '../game/names';
import { RESULT_TEXT } from '../game/works';
import { TITLE, HASHTAG, isEos, entryPhrase } from './text';
import { peopleUrl, emoteUrl, faceOf, PEOPLE_COLS, EMO } from '../ui/art';

// 絵の素材(ぴぽや。CREDITS.md): 顔 = ぴぽや32シンプル、王冠 = プチエモートアイコン。読めなければ今までのドット絵・★で描く
const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(url: string): Promise<HTMLImageElement | null> {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise((ok) => {
      const im = new Image();
      const t = setTimeout(() => ok(null), 3000);
      im.onload = () => { clearTimeout(t); ok(im); };
      im.onerror = () => { clearTimeout(t); ok(null); };
      im.src = url;
    });
    imgCache.set(url, p);
  }
  return p;
}
let people: HTMLImageElement | null = null;
let emote: HTMLImageElement | null = null;

export type CardKind = 'portrait' | 'og';
export const CARD_SIZE: Record<CardKind, [number, number]> = { portrait: [1080, 1350], og: [1200, 630] };

const DOT = '"DotGothic16", "IPAGothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", monospace';
const SANS = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "IPAGothic", "Meiryo", sans-serif';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';

export const RESULT_COLOR: Record<WorkResult, string> = { flop: '#7b8494', ok: '#d9b47a', hit: '#ef6b35', legend: '#f5c518' };
const C = { bg: '#1c2230', bg2: '#242c3d', wood: '#9a6a3f', woodDark: '#6e4a2a', woodTop: '#b98552', paper: '#fbf7ec', ink: '#1f2430', sub: '#6b7180', red: '#d83a34', blue: '#2f6fd6', strap: '#2f6fd6' };

/** DotGothic16(Google Fonts、OFL)を読む。読めなくても 2.5 秒で諦めて代わりの字で描く */
let fontReady: Promise<void> | null = null;
export function ensureFont(): Promise<void> {
  if (fontReady) return fontReady;
  fontReady = new Promise<void>((done) => {
    try {
      if (!document.querySelector(`link[href^="https://fonts.googleapis.com/css2?family=DotGothic16"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = FONT_CSS;
        document.head.appendChild(l);
      }
      const t = setTimeout(done, 2500);
      const sample = '5万人のゲームクリエイター人生 0123456789 社員証作品棚';
      const load = () => document.fonts.load(`32px "DotGothic16"`, sample).then(() => document.fonts.ready).then(() => { clearTimeout(t); done(); }, () => done());
      // link の CSS が届くまで少し待ってから読む
      setTimeout(load, 50);
    } catch { done(); }
  });
  return fontReady;
}

/** Google Fonts は字の範囲ごとに分かれて届く。canvas は自分では取りに行かないので、描く字を先に読ませる */
async function loadGlyphs(s: State, l: Lang) {
  try {
    const text = [TITLE[l], HASHTAG[l], s.name[l], s.company?.name[l] ?? '', s.ending?.cause[l] ?? '', ...s.works.map((w) => w.name[l]),
      '社員証作品棚開発者としての死因最終職種在籍氏名番号分の万終後日談爆死普通伝説ヒットサ0123456789,./()-–STAFFIDNo.'].join('');
    await Promise.race([document.fonts.load('32px "DotGothic16"', text), new Promise((ok) => setTimeout(ok, 2000))]);
  } catch { /* 代わりの字で描く */ }
}

const tx = (t: Text, l: Lang) => t[l];
const L = (ja: string, en: string): Text => ({ ja, en });

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** 折り返し(日本語は 1 字ずつ、英語は単語ごと)。行の配列を返す */
function wrap(c: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const tokens = /[　-鿿＀-￯]/.test(text) ? [...text] : text.split(/(?<=\s)/);
  const lines: string[] = [];
  let cur = '';
  for (const tk of tokens) {
    if (c.measureText(cur + tk).width > maxW && cur) { lines.push(cur.trimEnd()); cur = tk.trimStart(); }
    else cur += tk;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last && c.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    keep[maxLines - 1] = last + '…';
    return keep;
  }
  return lines;
}

/** 文字を幅に収める(縮める) */
function fitFont(c: CanvasRenderingContext2D, text: string, family: string, size: number, maxW: number, weight = '') {
  let s = size;
  do { c.font = `${weight} ${s}px ${family}`; s -= 1; } while (c.measureText(text).width > maxW && s > 10);
}

// ---------- 社員証 ----------
function drawFace(c: CanvasRenderingContext2D, s: State, x: number, y: number, w: number, h: number) {
  if (people) {
    // 32×32 のうち胸から上(x 6〜26, y 2〜26。20×24 = 写真と同じ 5:6)を整数倍で
    const idx = faceOf(s.seed, s.ending?.age ?? s.age);
    const sx = (idx % PEOPLE_COLS) * 32 + 6, sy = Math.floor(idx / PEOPLE_COLS) * 32 + 2;
    c.fillStyle = '#c9d6e8'; c.fillRect(x, y, w, h);
    const sc = Math.max(1, Math.floor(Math.min(w / 20, h / 24)));
    const dw = 20 * sc, dh = 24 * sc;
    c.save(); c.imageSmoothingEnabled = false;
    c.drawImage(people, sx, sy, 20, 24, x + (w - dw) / 2, y + h - dh, dw, dh);
    c.restore();
    return;
  }
  const r = new Rng((s.seed ^ 0x5eed) >>> 0);
  const skin = r.pick(['#f2c9a0', '#e8b48a', '#d49a6a', '#f5d3b3', '#b97c52']);
  const hair = r.pick(['#222', '#3a2a1e', '#5b3b24', '#777', '#1d2a4a', '#b0b0b0']);
  const shirt = r.pick(['#2f6fd6', '#3d8b5a', '#8a4fc2', '#c2493b', '#4a5568', '#d38a1f']);
  const glasses = r.chance(0.45);
  const tired = s.stat.hp < 45 || (s.inner?.counts?.crunch ?? 0) >= 3;
  const old = s.age >= 50;
  c.fillStyle = '#c9d6e8'; c.fillRect(x, y, w, h);
  const g = Math.floor(Math.min(w / 10, h / 12));
  const ox = x + (w - g * 10) / 2, oy = y + (h - g * 12) / 2;
  const px = (cx: number, cy: number, col: string, cw = 1, ch = 1) => { c.fillStyle = col; c.fillRect(ox + cx * g, oy + cy * g, cw * g, ch * g); };
  px(1, 9, shirt, 8, 3); px(4, 9, '#fff', 2, 1); // 体と襟
  px(2, 2, skin, 6, 7); px(1, 4, skin, 1, 2); px(8, 4, skin, 1, 2); // 顔と耳
  const hcol = old ? '#b8b8b8' : hair;
  px(2, 1, hcol, 6, 2); px(1, 2, hcol, 1, 2); px(8, 2, hcol, 1, 2);
  if (r.chance(0.4)) px(2, 3, hcol, 2, 1); // 前髪
  if (old && r.chance(0.5)) px(4, 1, skin, 2, 1); // 頭頂
  px(3, 5, '#222'); px(6, 5, '#222'); // 目
  if (glasses) { c.strokeStyle = '#222'; c.lineWidth = Math.max(2, g / 4); c.strokeRect(ox + 2.6 * g, oy + 4.6 * g, 1.8 * g, 1.6 * g); c.strokeRect(ox + 5.6 * g, oy + 4.6 * g, 1.8 * g, 1.6 * g); }
  if (tired) { px(3, 6, '#8d6e8a'); px(6, 6, '#8d6e8a'); } // くま
  px(4, 7, tired ? '#7a4a3a' : '#b0544a', 2, 1); // 口
}

function barcode(c: CanvasRenderingContext2D, seed: number, x: number, y: number, w: number, h: number) {
  const r = new Rng((seed ^ 0xba4c0de) >>> 0);
  c.fillStyle = C.ink;
  let cx = x;
  while (cx < x + w) { const bw = r.int(1, 4); if (r.chance(0.6)) c.fillRect(cx, y, Math.min(bw, x + w - cx), h); cx += bw + r.int(1, 3); }
}

export function employeeNo(seed: number): string {
  return String(seed % 50000).padStart(5, '0').replace(/(\d{2})(\d{3})/, '$1,$2');
}

function lastCompany(s: State): Text {
  if (s.company && s.company.size !== 'none') return s.company.name;
  return L('(退職済み)', '(no longer employed)');
}

function drawBadge(c: CanvasRenderingContext2D, s: State, l: Lang, x: number, y: number, w: number, h: number) {
  const k = h / 420; // 基準の高さ 420 からの倍率
  // ストラップ
  c.fillStyle = C.strap; c.fillRect(x + w / 2 - 34 * k, y - 60 * k, 68 * k, 70 * k);
  c.fillStyle = '#c7ccd6'; rr(c, x + w / 2 - 46 * k, y - 14 * k, 92 * k, 30 * k, 8 * k); c.fill();
  // カード
  c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 24 * k; c.shadowOffsetY = 8 * k;
  c.fillStyle = C.paper; rr(c, x, y, w, h, 22 * k); c.fill(); c.restore();
  // 上の帯
  c.save(); rr(c, x, y, w, h, 22 * k); c.clip();
  c.fillStyle = C.ink; c.fillRect(x, y, w, 64 * k);
  c.fillStyle = '#fff'; c.font = `${30 * k}px ${DOT}`; c.textBaseline = 'middle';
  c.fillText(l === 'ja' ? '社 員 証' : 'STAFF  ID', x + 26 * k, y + 33 * k);
  c.textAlign = 'right'; c.font = `${20 * k}px ${DOT}`; c.fillStyle = '#aab3c5';
  fitFont(c, tx(lastCompany(s), l), DOT, 22 * k, w * 0.55);
  c.fillText(tx(lastCompany(s), l), x + w - 26 * k, y + 33 * k);
  c.textAlign = 'left';
  c.restore();
  // 顔写真
  const fx = x + 26 * k, fy = y + 86 * k, fw = 150 * k, fh = 180 * k;
  drawFace(c, s, fx, fy, fw, fh);
  c.strokeStyle = C.ink; c.lineWidth = 3 * k; c.strokeRect(fx, fy, fw, fh);
  // 名前と肩書き
  const tx0 = fx + fw + 28 * k, tw = x + w - 26 * k - tx0;
  c.fillStyle = C.sub; c.font = `${18 * k}px ${SANS}`; c.textBaseline = 'alphabetic';
  c.fillText(l === 'ja' ? '氏名' : 'NAME', tx0, fy + 22 * k);
  c.fillStyle = C.ink; fitFont(c, tx(s.name, l), DOT, 50 * k, tw);
  c.fillText(tx(s.name, l), tx0, fy + 74 * k);
  c.fillStyle = C.sub; c.font = `${18 * k}px ${SANS}`;
  c.fillText(l === 'ja' ? '最終職種 / 在籍' : 'LAST ROLE / YEARS', tx0, fy + 112 * k);
  const job = JOB_TEXT[s.job === 'other' ? (s.inner?.prevJob ?? s.job) : s.job] ?? JOB_TEXT.other;
  const endY = s.ending?.year ?? s.year;
  const roleLine = l === 'ja' ? `${job.ja}  ${s.startYear}–${endY}` : `${cap(job.en)}  ${s.startYear}–${endY}`;
  c.fillStyle = C.ink; fitFont(c, roleLine, DOT, 32 * k, tw);
  c.fillText(roleLine, tx0, fy + 150 * k);
  c.fillStyle = C.sub; fitFont(c, entryLine(s, l), SANS, 18 * k, tw);
  c.fillText(entryLine(s, l), tx0, fy + 180 * k);
  // 社員番号 = 5万分の1
  const ny = y + h - 118 * k;
  c.strokeStyle = '#d6d0bf'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(x + 26 * k, ny - 12 * k); c.lineTo(x + w - 26 * k, ny - 12 * k); c.stroke();
  c.fillStyle = C.sub; c.font = `${18 * k}px ${SANS}`;
  c.fillText(l === 'ja' ? '社員番号(日本でゲームを作る人の通し番号)' : 'ID No. (among everyone making games in Japan)', x + 26 * k, ny + 14 * k);
  c.fillStyle = C.ink; c.font = `${64 * k}px ${DOT}`;
  const no = `No.${employeeNo(s.seed)}`;
  c.fillText(no, x + 24 * k, ny + 80 * k);
  const nw = c.measureText(no).width;
  c.fillStyle = C.sub; c.font = `${28 * k}px ${DOT}`;
  c.fillText('/ 50,000', x + 34 * k + nw, ny + 80 * k);
  barcode(c, s.seed, x + w - 190 * k, ny + 2 * k, 164 * k, 54 * k);
  // ハンコ「5万分の1」
  stamp(c, x + w - 120 * k, y + 170 * k, 78 * k, l, -0.22);
}
function cap(t: string) { return t.charAt(0).toUpperCase() + t.slice(1); }
function entryLine(s: State, l: Lang) {
  return l === 'ja' ? `${s.startAge} 歳で業界入り(${entryPhrase(s, l)})` : `Joined at ${s.startAge} as ${entryPhrase(s, l)}`;
}

function stamp(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, l: Lang, rot: number) {
  c.save(); c.translate(cx, cy); c.rotate(rot); c.globalAlpha = 0.86;
  c.strokeStyle = C.red; c.fillStyle = C.red; c.lineWidth = r * 0.07;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.86, 0, Math.PI * 2); c.lineWidth = r * 0.03; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (l === 'ja') {
    c.font = `${r * 0.5}px ${DOT}`; c.fillText('5万', 0, -r * 0.24);
    c.font = `${r * 0.42}px ${DOT}`; c.fillText('分の1', 0, r * 0.3);
  } else {
    c.font = `${r * 0.4}px ${DOT}`; c.fillText('1 in', 0, -r * 0.28);
    c.font = `${r * 0.44}px ${DOT}`; c.fillText('50K', 0, r * 0.26);
  }
  c.restore();
}

// ---------- 作品棚 ----------
type Media = 'cart' | 'disc' | 'dl' | 'app';
function mediaOf(w: Work): Media {
  if (['スマホ', 'ソシャゲ', 'ケータイ', 'iPhone', 'AI クラウド'].includes(w.platform)) return 'app';
  if (w.year < 1994) return 'cart';
  if (w.year < 2008) return 'disc';
  return 'dl';
}

function drawWork(c: CanvasRenderingContext2D, w: Work, l: Lang, x: number, base: number, bw: number, maxH: number, k: number) {
  const m = mediaOf(w);
  const h = { cart: 0.8, disc: 1, dl: 0.92, app: 0.5 }[m] * maxH;
  const ww = { cart: bw, disc: bw * 0.78, dl: bw * 0.9, app: bw }[m];
  const x0 = x + (bw - ww) / 2, y0 = base - h;
  const col = RESULT_COLOR[w.result];
  c.save();
  c.fillStyle = col;
  if (m === 'app') { rr(c, x0, base - ww, ww, ww, ww * 0.24); c.fill(); }
  else if (m === 'dl') { rr(c, x0, y0, ww, h, 8 * k); c.fill(); }
  else { c.fillRect(x0, y0, ww, h); }
  // 機種ごとの飾り
  c.fillStyle = 'rgba(0,0,0,.18)';
  if (m === 'cart') { for (let i = 0; i < 4; i++) c.fillRect(x0 + ww * 0.15 + i * ww * 0.2, y0 + 6 * k, ww * 0.08, 14 * k); c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x0 + ww * 0.12, y0 + 30 * k, ww * 0.76, h - 44 * k); }
  if (m === 'disc') { c.fillRect(x0, y0, ww * 0.14, h); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x0 + ww * 0.57, base - ww * 0.34, ww * 0.24, 0, Math.PI * 2); c.fill(); }
  if (m === 'dl') { c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); const ax = x0 + ww / 2, ay = base - 22 * k; c.moveTo(ax - 10 * k, ay - 10 * k); c.lineTo(ax + 10 * k, ay - 10 * k); c.lineTo(ax, ay); c.fill(); c.fillRect(ax - 4 * k, ay - 24 * k, 8 * k, 14 * k); }
  if (m === 'app') { const g = c.createLinearGradient(x0, base - ww, x0, base); g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; rr(c, x0, base - ww, ww, ww / 2, ww * 0.24); c.fill(); }
  // 名前(縦書き。英語は回す)
  const name = w.name[l].replace(/^[『"]|[』"]$/g, '');
  const top = m === 'app' ? base - ww : y0;
  const avail = (m === 'app' ? ww : h) - (m === 'cart' ? 44 * k : m === 'dl' ? 46 * k : m === 'disc' ? ww * 0.62 + 14 * k : 16 * k);
  c.fillStyle = m === 'cart' ? C.ink : (w.result === 'flop' ? '#fff' : C.ink);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (m !== 'app') {
    const fs = Math.min(ww * 0.4, 20 * k);
    c.font = `${fs}px ${DOT}`;
    if (l === 'ja') {
      const chars = [...name.replace(/〜.*$/, '')];
      const n = Math.min(chars.length, Math.floor(avail / (fs * 1.02)));
      const sy = top + (m === 'cart' ? 34 * k : 10 * k) + fs / 2;
      for (let i = 0; i < n; i++) {
        const ch = i === n - 1 && n < chars.length ? '…' : chars[i];
        c.fillText(/[ー〜-]/.test(ch) ? '|' : ch, x0 + ww * (m === 'disc' ? 0.57 : 0.5), sy + i * fs * 1.02);
      }
    } else {
      c.save(); c.translate(x0 + ww * (m === 'disc' ? 0.57 : 0.5), top + (m === 'cart' ? 34 * k : 10 * k) + avail / 2); c.rotate(Math.PI / 2);
      let t = name; while (t.length > 2 && c.measureText(t).width > avail) t = t.slice(0, -2) + '…';
      c.fillText(t, 0, 0); c.restore();
    }
  } else {
    c.font = `${ww * 0.34}px ${DOT}`; c.fillStyle = '#fff';
    c.fillText([...name][0] ?? '?', x0 + ww / 2, base - ww / 2);
  }
  // 伝説は星
  if (w.result === 'legend') {
    if (emote) {
      const [er, ec] = EMO.legend, sz = Math.max(12, Math.round(36 * k / 12) * 12);
      c.save(); c.imageSmoothingEnabled = false;
      c.drawImage(emote, ec * 12, er * 12, 12, 12, x0 + ww - sz * 0.75, top - sz * 0.35, sz, sz);
      c.restore();
    } else { c.fillStyle = '#fff'; c.font = `${18 * k}px ${SANS}`; c.fillText('★', x0 + ww - 12 * k, top + 12 * k); }
  }
  // 後日談の印(棚の上の付箋)
  if (w.history.length) {
    const eos = w.history.some(isEos);
    const tagC = eos ? C.ink : C.blue;
    const tr = 13 * k, tcx = x0 + ww / 2, tcy = top - tr - 4 * k;
    c.fillStyle = tagC; c.beginPath(); c.arc(tcx, tcy, tr, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = `${tr * 1.25}px ${DOT}`;
    c.fillText(eos ? (l === 'ja' ? '終' : 'X') : String(Math.min(9, w.history.length)), tcx, tcy + 1);
  }
  // 年
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `${15 * k}px ${DOT}`; c.textBaseline = 'top';
  c.fillText(String(w.year), x + bw / 2, base + 22 * k);
  c.restore();
}

function drawShelf(c: CanvasRenderingContext2D, s: State, l: Lang, x: number, y: number, w: number, h: number, k: number, perRowMax: number) {
  const works = s.works;
  const rows = Math.max(1, Math.min(3, Math.ceil(works.length / perRowMax)));
  const perRow = Math.max(1, Math.ceil(works.length / rows));
  const rowH = h / rows;
  // 棚の箱(奥の板)
  c.fillStyle = C.woodDark; rr(c, x - 14 * k, y - 10 * k, w + 28 * k, h + 22 * k, 10 * k); c.fill();
  c.fillStyle = '#2a1d12'; c.fillRect(x, y, w, h);
  for (let r = 0; r < rows; r++) {
    const base = y + rowH * (r + 1) - 44 * k;
    // 板
    c.fillStyle = C.woodTop; c.fillRect(x - 6 * k, base, w + 12 * k, 8 * k);
    c.fillStyle = C.wood; c.fillRect(x - 6 * k, base + 8 * k, w + 12 * k, 14 * k);
    const items = works.slice(r * perRow, (r + 1) * perRow);
    const bw = Math.min(88 * k, (w - 20 * k) / Math.max(items.length, 1) - 10 * k);
    const total = items.length * (bw + 10 * k) - 10 * k;
    let cx = x + (w - total) / 2;
    const maxH = Math.min(rowH - 72 * k, 260 * k);
    for (const it of items) { drawWork(c, it, l, cx, base, bw, maxH, k); cx += bw + 10 * k; }
  }
  if (!works.length) {
    c.fillStyle = 'rgba(255,255,255,.6)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${26 * k}px ${DOT}`;
    c.fillText(l === 'ja' ? '(棚は空っぽ。ほこりだけが積もった)' : '(The shelf is empty. Only dust piled up.)', x + w / 2, y + h / 2 - 20 * k);
    c.textAlign = 'left';
  }
}

function drawLegend(c: CanvasRenderingContext2D, l: Lang, x: number, y: number, k: number) {
  c.textBaseline = 'middle'; c.font = `${18 * k}px ${SANS}`;
  let cx = x;
  for (const r of ['flop', 'ok', 'hit', 'legend'] as WorkResult[]) {
    c.fillStyle = RESULT_COLOR[r]; c.fillRect(cx, y - 9 * k, 18 * k, 18 * k); cx += 26 * k;
    c.fillStyle = '#cfd5e1'; const t = RESULT_TEXT[r][l]; c.fillText(t, cx, y); cx += c.measureText(t).width + 22 * k;
  }
  c.fillStyle = C.blue; c.beginPath(); c.arc(cx + 9 * k, y, 9 * k, 0, Math.PI * 2); c.fill(); cx += 26 * k;
  c.fillStyle = '#cfd5e1'; let t = l === 'ja' ? '後日談' : 'afterlife'; c.fillText(t, cx, y); cx += c.measureText(t).width + 22 * k;
  c.fillStyle = C.ink; c.beginPath(); c.arc(cx + 9 * k, y, 9 * k, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#cfd5e1'; c.lineWidth = 1.5; c.stroke(); cx += 26 * k;
  c.fillStyle = '#cfd5e1'; t = l === 'ja' ? 'サ終' : 'shut down'; c.fillText(t, cx, y);
}

function drawCause(c: CanvasRenderingContext2D, s: State, l: Lang, x: number, y: number, w: number, h: number, k: number) {
  c.fillStyle = C.paper; rr(c, x, y, w, h, 10 * k); c.fill();
  c.fillStyle = C.red; c.fillRect(x, y, 10 * k, h);
  c.fillStyle = C.red; c.font = `${20 * k}px ${DOT}`; c.textBaseline = 'top';
  c.fillText(l === 'ja' ? '開発者としての死因' : 'CAUSE OF (DEVELOPER) DEATH', x + 30 * k, y + 16 * k);
  const cause = s.ending ? tx(s.ending.cause, l) : (l === 'ja' ? 'まだ生きている' : 'Still alive');
  c.fillStyle = C.ink;
  let size = 40 * k, lines: string[] = [];
  const maxLines = h > 160 * k ? 3 : 2;
  for (; size > 18 * k; size -= 2 * k) {
    c.font = `${size}px ${DOT}`;
    lines = wrap(c, cause, w - 60 * k, 99);
    if (lines.length <= maxLines && 52 * k + lines.length * size * 1.22 <= h) break;
  }
  lines = wrap(c, cause, w - 60 * k, maxLines);
  lines.forEach((ln, i) => c.fillText(ln, x + 30 * k, y + 50 * k + i * size * 1.22));
}

/** 最後の 1 行(「いいゲーム人生だった」)。入らなければ字を小さくし、それでも入らなければ … で切る */
function drawEpitaph(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, size: number, maxLines: number, align: CanvasTextAlign) {
  c.textAlign = align; c.textBaseline = 'top'; c.fillStyle = '#fff4d6';
  let sz = size, lines: string[] = [];
  for (; sz >= 14; sz -= 1) { c.font = `${sz}px ${SANS}`; lines = wrap(c, text, w, 99); if (lines.length <= maxLines) break; }
  lines = wrap(c, text, w, maxLines);
  lines.forEach((ln, i) => c.fillText(ln, x, y + i * sz * 1.35));
  c.textAlign = 'left';
}

function background(c: CanvasRenderingContext2D, W: number, H: number) {
  c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += 30) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
  for (let y = 0; y < H; y += 30) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
}

function header(c: CanvasRenderingContext2D, l: Lang, x: number, y: number, maxW: number, size: number) {
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = '#ffd34d'; fitFont(c, TITLE[l], DOT, size, maxW);
  c.fillText(TITLE[l], x, y);
}

function footer(c: CanvasRenderingContext2D, l: Lang, x: number, y: number, k: number, align: CanvasTextAlign) {
  c.textAlign = align; c.textBaseline = 'alphabetic';
  c.fillStyle = '#8e97aa'; c.font = `${20 * k}px ${DOT}`;
  c.fillText(`${HASHTAG[l]}   game-creator-life.mucky-totoro.workers.dev`, x, y);
  c.textAlign = 'left';
}

/** 1 枚絵を描く。フォントを待ってから描くので Promise */
export async function drawCard(s: State, l: Lang, kind: CardKind = 'portrait', canvas?: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  await ensureFont();
  await loadGlyphs(s, l);
  [people, emote] = await Promise.all([loadImg(peopleUrl), loadImg(emoteUrl)]);
  const [W, H] = CARD_SIZE[kind];
  const cv = canvas ?? document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  background(c, W, H);
  if (kind === 'portrait') {
    const k = 1;
    header(c, l, 60, 98, W - 120, 58);
    c.fillStyle = '#8e97aa'; c.font = `22px ${SANS}`;
    c.fillText(l === 'ja' ? `${s.startYear} 年 〜 ${s.ending?.year ?? s.year} 年 のゲーム開発者の一生` : `A game developer's life, ${s.startYear}–${s.ending?.year ?? s.year}`, 62, 140);
    drawBadge(c, s, l, 130, 220, 820, 380);
    const epi = s.ending?.epitaph?.[l];
    drawCause(c, s, l, 60, 630, 960, epi ? 124 : 140, k);
    if (epi) drawEpitaph(c, epi, 540, 770, 960, 20, 2, 'center');
    c.fillStyle = '#ffd34d'; c.font = `24px ${DOT}`; c.textBaseline = 'alphabetic';
    c.fillText(l === 'ja' ? `作品棚(${s.works.length} 本)` : `THE SHELF (${s.works.length})`, 60, epi ? 840 : 826);
    drawShelf(c, s, l, 74, epi ? 856 : 846, 932, epi ? 384 : 392, 1, 11);
    drawLegend(c, l, 60, 1272, k);
    footer(c, l, W - 60, 1322, k, 'right');
  } else {
    const k = 0.8;
    header(c, l, 44, 64, 700, 40);
    drawBadge(c, s, l, 44, 130, 520, 254);
    drawCause(c, s, l, 600, 92, 556, 132, k);
    drawShelf(c, s, l, 612, 262, 532, 286, 0.62, 11);
    c.fillStyle = '#ffd34d'; c.font = `${54}px ${DOT}`; c.textBaseline = 'alphabetic';
    c.fillText(l === 'ja' ? '5万分の1' : '1 in 50,000', 44, 470);
    const epi = s.ending?.epitaph?.[l];
    if (epi) drawEpitaph(c, epi, 46, 494, 530, 17, 2, 'left');
    else {
      c.fillStyle = '#cfd5e1'; c.font = `22px ${SANS}`;
      c.fillText(l === 'ja' ? 'あなたのゲーム開発人生を 1 本、引く。' : 'Draw one game-dev life out of 50,000.', 46, 512);
    }
    drawLegend(c, l, 46, 556, k);
    footer(c, l, W - 44, 606, k, 'right');
  }
  return cv;
}

export function toBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, ng) => cv.toBlob((b) => (b ? ok(b) : ng(new Error('toBlob failed'))), 'image/png'));
}
