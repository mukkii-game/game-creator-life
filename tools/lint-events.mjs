// イベントと年表の検査(docs/schema §7)。node tools/lint-events.mjs
// 落とすもの: ID 重複・形の誤り / years 無し / ja・en が空 / effect が範囲外 / Condition の語彙外 /
//            later の行き先が無い / 差し込み語の誤り / 小道具の初出年より前に出る語 / 年表の src 無し
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/data';
const errors = [];
const warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

// 小道具の初出年(日本で一般に通じた年の目安)。この年より前に出るイベントの文に入っていたら落とす。
// 例外はイベントの "allow": ["語"]。語は ja / en の両方を見る(英字は単語の境目で照合)。
export const PROPS = {
  'ファミコン': 1983, 'ファミリーコンピュータ': 1983, 'Famicom': 1983,
  'RPG': 1985, 'ポリゴン': 1993, 'polygon': 1993,
  'CD-ROM': 1988, 'プレステ': 1994, 'PlayStation': 1994,
  'インターネット': 1995, 'ホームページ': 1995, 'メール': 1995, 'email': 1995, 'e-mail': 1995, 'internet': 1995,
  'DVD': 1997, 'ケータイ': 1999, 'iモード': 1999, 'i-mode': 1999,
  '2ちゃんねる': 1999, '掲示板': 1996,
  'YouTube': 2006, 'ニコニコ': 2007, 'ニコ動': 2007,
  'iPhone': 2007, 'スマホ': 2008, 'smartphone': 2008, 'アプリ': 2008, 'App Store': 2008,
  'SNS': 2008, 'Twitter': 2008, 'ツイッター': 2008, 'ツイート': 2008, 'tweet': 2008, 'バズ': 2010, 'went viral': 2008, 'viral': 2008,
  'ソシャゲ': 2009, 'ソーシャルゲーム': 2009, 'social game': 2009, 'ガチャ': 2010, 'gacha': 2010,
  'Steam': 2010, 'Unity': 2009, '配信者': 2010, '実況': 2007, 'streamer': 2010, 'livestream': 2010,
  'クラウド': 2010, 'cloud': 2010, 'Slack': 2014, 'Discord': 2016, 'VR': 2016,
  'リモート': 2020, '在宅勤務': 2020, 'テレワーク': 2020, 'Zoom': 2020, 'remote work': 2020, 'work from home': 2020,
  'NFT': 2021, 'メタバース': 2021, 'metaverse': 2021, 'Web3': 2021,
  '添付': 1995, '.doc': 1995, 'Slack': 2014, '既読': 2011, 'ウィッシュリスト': 2010, 'Discord': 2015, 'クラウドファンディング': 2012, 'ストアページ': 2010,
  '生成AI': 2022, '生成 AI': 2022, 'ChatGPT': 2022, 'AI': 2022, 'プロンプト': 2022, 'prompt': 2022,
};
const SLOTS = new Set(['name', 'company', 'work', 'age', 'year', 'peer', 'other']);
const COND = /^!?(age|year|era|job|status|works|career|pos|company\.size|stat\.(hp|passion|skill|network|money|fame)|flag\.[a-z0-9_]+)(\s*(=|!=|<|<=|>|>=)\s*[a-z0-9_-]+)?$/;
const JOBS = ['programmer', 'planner', 'artist', 'sound', 'qa', 'sales', 'director', 'producer', 'teacher', 'other'];
const STATUS = ['employed', 'indie', 'left', 'retired', 'ended'];
const EV_KEYS = new Set(['id', 'years', 'text', 'when', 'weight', 'once', 'effect', 'later', 'choices', 'tag', 'allow', 'cause', 'memory']);
const TL_KEYS = new Set(['id', 'year', 'month', 'kind', 'text', 'use', 'src', 'unverified']);

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const PROP_RE = Object.entries(PROPS).map(([w, y]) => [w, y, /^[\x00-\x7f]+$/.test(w) ? new RegExp(`(^|[^A-Za-z])${esc(w)}($|[^A-Za-z])`, 'i') : new RegExp(esc(w))]);
// 'AI' は大文字だけ(said, maid に当たらないように)
PROP_RE.forEach((p) => { if (p[0] === 'AI') p[2] = /(^|[^A-Za-z])AI($|[^A-Za-z])/; });

function text(where, t) {
  if (!t || typeof t !== 'object') return err(where, 'ja/en がない');
  for (const k of ['ja', 'en']) {
    if (typeof t[k] !== 'string' || !t[k].trim()) err(where, `${k} が空`);
    for (const m of (t[k] || '').matchAll(/\{([a-z]+)\}/g)) if (!SLOTS.has(m[1])) err(where, `差し込み {${m[1]}} は使えない`);
  }
  for (const k of Object.keys(t)) if (k !== 'ja' && k !== 'en') err(where, `text に余計な ${k}`);
}
function effect(where, e) {
  if (e == null) return;
  for (const [k, v] of Object.entries(e)) {
    if (['hp', 'passion', 'skill', 'network', 'fame'].includes(k)) { if (!Number.isInteger(v) || v < -50 || v > 50) err(where, `${k}=${v} は -50〜50 の整数`); }
    else if (k === 'money') { if (!Number.isInteger(v) || v < -2000 || v > 5000) err(where, `money=${v} は -2000〜5000`); }
    else if (k === 'flag') { for (const [f, b] of Object.entries(v)) { if (!/^[a-z0-9_]+$/.test(f) || typeof b !== 'boolean') err(where, `flag ${f}`); } }
    else if (k === 'job') { if (!JOBS.includes(v)) err(where, `job=${v}`); }
    else if (k === 'status') { if (!STATUS.includes(v)) err(where, `status=${v}`); }
    else if (k === 'work') {
      for (const wk of Object.keys(v)) if (wk !== 'add' && wk !== 'last') err(where, `work.${wk}`);
      if (v.last?.result && !['flop', 'ok', 'hit', 'legend'].includes(v.last.result)) err(where, `work.last.result=${v.last.result}`);
      if (v.last?.history) text(where + '.work.last.history', v.last.history);
      if (v.add?.role && !['junior', 'core', 'lead', 'solo'].includes(v.add.role)) err(where, `work.add.role=${v.add.role}`);
    } else err(where, `effect に未知の ${k}`);
  }
}
function props(where, from, strs, allow = []) {
  for (const s of strs) for (const [w, y, re] of PROP_RE) {
    if (from < y && !allow.includes(w) && re.test(s)) err(where, `「${w}」は ${y} 年から(years[0]=${from})。years を直すか allow に入れる`);
  }
}

const ids = new Map();
function seen(id, where) { if (ids.has(id)) err(where, `ID 重複 ${id}(${ids.get(id)} にもある)`); else ids.set(id, where); }

const files = fs.readdirSync(path.join(DIR, 'events')).filter((f) => f.endsWith('.json')).map((f) => path.join(DIR, 'events', f));
const events = [];
let nChoice = 0;
const perFile = {};
for (const f of files) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `JSON が読めない: ${e.message}`); continue; }
  if (!Array.isArray(arr)) { err(f, '配列でない'); continue; }
  perFile[path.basename(f)] = { events: arr.length, choices: arr.filter((e) => e.choices).length, afterlife: arr.filter((e) => e.tag?.includes('afterlife')).length };
  for (const ev of arr) checkEvent(ev, `${path.basename(f)}:${ev.id}`, true);
}

function checkEvent(ev, w, needYears, histYear) {
    events.push(ev);
    if (!/^ev_[a-z0-9_]+$/.test(ev.id || '')) err(w, 'id は ev_ + 英小文字・数字・_');
    seen(ev.id, w);
    for (const k of Object.keys(ev)) if (!EV_KEYS.has(k)) err(w, `未知の項目 ${k}`);
    if (needYears && (!Array.isArray(ev.years) || ev.years.length !== 2 || !ev.years.every(Number.isInteger) || ev.years[0] > ev.years[1] || ev.years[0] < 1970 || ev.years[1] > 2040)) err(w, 'years は [from, to](1970〜2040)');
    if (!needYears && ev.years) err(w, '事件の variant に years は書かない(事件の year / until が使われる)');
    text(w + '.text', ev.text);
    if (ev.cause) text(w + '.cause', ev.cause);
    if (ev.memory) text(w + '.memory', ev.memory);
    for (const c of ev.when || []) {
      if (!COND.test(c)) { err(w, `when の語彙外: ${c}`); continue; }
      const m = /^!?(pos|job|status|company\.size)\s*!?=\s*([a-z0-9_-]+)$/.exec(c);
      const VALS = { pos: ['client_lead', 'client', 'dev_lead', 'dev', 'sub', 'qa', 'indie', 'abroad', 'teacher', 'prison', 'outside'], job: JOBS, status: STATUS, 'company.size': ['big', 'mid', 'small', 'sub', 'indie', 'abroad', 'school', 'none'] };
      if (m && !VALS[m[1]].includes(m[2])) err(w, `when の値が無い: ${c}(${m[1]} は ${VALS[m[1]].join(' / ')})`);
    }
    effect(w + '.effect', ev.effect);
    const strs = [ev.text?.ja, ev.text?.en];
    if (ev.choices) {
      nChoice++;
      if (ev.choices.length < 2 || ev.choices.length > 3) err(w, 'choices は 2〜3 個');
      for (const c of ev.choices) {
        const cw = `${w}/${c.id}`;
        if (!/^ch_[a-z0-9_]+$/.test(c.id || '')) err(cw, 'choice id は ch_');
        seen(c.id, cw);
        text(cw + '.label', c.label);
        if (c.result) text(cw + '.result', c.result);
        if (c.cause) text(cw + '.cause', c.cause);
        if (c.memory) text(cw + '.memory', c.memory);
        for (const k of Object.keys(c)) if (!['id', 'label', 'effect', 'later', 'result', 'cause', 'memory'].includes(k)) err(cw, `choice に未知の ${k}`);
        effect(cw + '.effect', c.effect ?? {});
        if (!c.effect) err(cw, 'effect が無い({} でよい)');
        strs.push(c.label?.ja, c.label?.en, c.result?.ja, c.result?.en);
      }
    }
    if (ev.effect?.work?.last?.history) strs.push(ev.effect.work.last.history.ja, ev.effect.work.last.history.en);
    const from = needYears ? (Array.isArray(ev.years) ? ev.years[0] : 9999) : histYear;
    props(w, from, strs.filter(Boolean), ev.allow);
    const t = ev.text?.ja || '';
    if (t.length > 90) warns.push(`${w}: 本文が長い(${t.length} 字。2 行=90 字まで)`);
  }

// 歴史の事件(src/data/hist/*.json)
const HS_KEYS = new Set(['id', 'year', 'month', 'until', 'kind', 'weight', 'title', 'news', 'src', 'unverified', 'variants']);
const histDir = path.join(DIR, 'hist');
let nHist = 0, nVar = 0;
for (const f of fs.existsSync(histDir) ? fs.readdirSync(histDir).filter((x) => x.endsWith('.json')).map((x) => path.join(histDir, x)) : []) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `JSON が読めない: ${e.message}`); continue; }
  perFile['hist/' + path.basename(f)] = { hist: arr.length, variants: arr.reduce((t, h) => t + (h.variants?.length ?? 0), 0) };
  for (const h of arr) {
    nHist++;
    const w = `hist/${path.basename(f)}:${h.id}`;
    if (!/^hs_[a-z0-9_]+$/.test(h.id || '')) err(w, 'id は hs_ + 英小文字・数字・_');
    seen(h.id, w);
    for (const k of Object.keys(h)) if (!HS_KEYS.has(k)) err(w, `未知の項目 ${k}`);
    if (!Number.isInteger(h.year) || h.year < 1970 || h.year > 2040) err(w, 'year');
    if (h.until != null && (!Number.isInteger(h.until) || h.until < h.year || h.until > h.year + 5)) err(w, 'until は year〜year+5');
    if (h.month != null && (!Number.isInteger(h.month) || h.month < 1 || h.month > 12)) err(w, 'month');
    if (!['hardware', 'hit', 'incident', 'work', 'ai', 'future'].includes(h.kind)) err(w, `kind=${h.kind}`);
    if (h.year >= 2027 && h.kind !== 'future') err(w, '2027 年以降は kind: "future"(架空)');
    text(w + '.title', h.title); text(w + '.news', h.news);
    if (!h.src || !String(h.src).trim()) err(w, 'src が無い');
    const vs = h.variants ?? [];
    if (vs.length < 3) err(w, 'variants は 3 個以上(立場で起きることを変える)');
    const whens = new Set(vs.map((v) => JSON.stringify(v.when ?? [])));
    if (whens.size < 3) err(w, 'variants の when が 3 種類以上必要(同じ事件を違う立場で)');
    if (vs.length && (vs[vs.length - 1].when ?? []).length) warns.push(`${w}: 最後の variant に when が無い(誰にでも起きる版)と、事件を必ず受け取れる`);
    for (const v of vs) { nVar++; checkEvent(v, `${w}/${v.id}`, false, h.year); }
  }
}
// later の行き先
for (const ev of events) {
  const laters = [...(ev.later || []), ...(ev.choices || []).flatMap((c) => c.later || [])];
  for (const l of laters) {
    if (!Number.isInteger(l.after) || l.after < 1 || l.after > 50) err(ev.id, `later.after=${l.after}`);
    if (!ids.has(l.event)) err(ev.id, `later の行き先 ${l.event} が無い`);
  }
}

// 年表
const tlFiles = fs.readdirSync(DIR).filter((f) => /^timeline.*\.json$/.test(f)).map((f) => path.join(DIR, f));
let nTl = 0;
for (const f of tlFiles) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err(f, `JSON が読めない: ${e.message}`); continue; }
  for (const t of arr) {
    nTl++;
    const w = `${path.basename(f)}:${t.id}`;
    if (!/^tl_[a-z0-9_]+$/.test(t.id || '')) err(w, 'id は tl_');
    seen(t.id, w);
    for (const k of Object.keys(t)) if (!TL_KEYS.has(k)) err(w, `未知の項目 ${k}`);
    if (!Number.isInteger(t.year) || t.year < 1970 || t.year > 2040) err(w, 'year');
    if (t.month != null && (!Number.isInteger(t.month) || t.month < 1 || t.month > 12)) err(w, 'month');
    if (!['hardware', 'hit', 'incident', 'work', 'ai', 'future'].includes(t.kind)) err(w, `kind=${t.kind}`);
    if (t.year >= 2027 && t.kind !== 'future') err(w, '2027 年以降は kind: "future"(架空)');
    text(w + '.text', t.text);
    if (!t.src || !String(t.src).trim()) err(w, 'src が無い');
    if (!t.use) err(w, 'use が無い');
  }
}

console.log(JSON.stringify({ ok: errors.length === 0, events: events.length, choices: nChoice, timeline: nTl, hist: nHist, histVariants: nVar, perFile }, null, 1));
for (const w of warns.slice(0, 20)) console.log('注意: ' + w);
for (const e of errors.slice(0, 60)) console.log('NG: ' + e);
if (errors.length > 60) console.log(`… ほか ${errors.length - 60} 件`);
process.exit(errors.length ? 1 : 0);
