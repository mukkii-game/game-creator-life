// ゲームの中身(描画なし)。画面(src/ui)と結果(src/share)が呼ぶのは init / advance / choose だけ(docs/schema §6)。
// 決まり: Phaser・DOM・Math.random を使わない(乱数は state.rng)。数値は src/tuning.ts。
// 1 回の advance = 1 年。選択が出たら state.choice が埋まって止まり、choose で続きを進める。
import { Rng } from '../core/rng';
import { tune } from '../core/tuning';
import { callName, fullName, type OtherLife } from './people';
import type { Arc } from './types';
import type { State, InitOptions, Text, Effect, GameEvent, Choice, Job, CompanySize, EndingId, Era, LogLine, Company } from './types';
import { CO_TRAITS, EVENTS, EVENT_BY_ID, POOL, TIMELINE_BY_YEAR, HIST, HIST_OF, COMPANIES, type CoRow } from './data';
import { eligible, draw, positionOf, test } from './select';

export { positionOf };
import { personName, companyName, OTHER_JOBS, JOB_TEXT } from './names';
import { release, tickWorks, clamp, RESULT_TEXT, RECENT_TITLES } from './works';
import { makeEnding } from './ending';
import { BOTS } from './bots';

export { JOB_TEXT };

export function eraOf(year: number): Era {
  return year <= 1985 ? 'era1' : year <= 1994 ? 'era2' : year <= 2003 ? 'era3' : year <= 2011 ? 'era4' : year <= 2019 ? 'era5' : 'era6';
}

// ---- 業界入りガチャ(PLAN §4) ----
// 業界入りの年: 一番早くて 1977 年(のちに世界的なデザイナーになる人が任天堂に入った年)、一番遅くて 2000 年(PlayStation 2 発売)。
// 重み = 1 年あたりの出やすさ(全部同じ。Mukkii 指定 2026-10-15)
// 業界入りの年(2026-10-16 Mukkii: いま 40 歳くらいの人も遊べるよう、いちばん遅くて 2010 年)
const ERA_SPAN: [number, number, number][] = [[1977, 1985, 1], [1986, 1994, 1], [1995, 2000, 1], [2001, 2010, 1]];
function gachaYear(r: Rng, era?: Era): number {
  const last = 2000;
  const spans = ERA_SPAN.map(([a, b, w]) => [a, Math.min(b, last), w] as const).filter(([a, b], i) => a <= b && (!era || `era${i + 1}` === era));
  if (!spans.length) return 1986;
  const total = spans.reduce((t, [a, b, w]) => t + w * (b - a + 1), 0);
  let x = r.next() * total;
  for (const [a, b, w] of spans) { x -= w * (b - a + 1); if (x < 0) return r.int(a, b); }
  return spans[spans.length - 1][1];
}
function gachaAge(r: Rng): number {
  const x = r.next();
  if (x < tune('gacha.age18')) return 18;
  if (x < tune('gacha.age18') + tune('gacha.lateBloomer')) return r.int(26, 35);
  if (x < tune('gacha.age18') + tune('gacha.lateBloomer') + tune('gacha.age50')) return r.int(50, 57); // 50 すぎで業界入り(ひいひい言いながら)
  return 22;
}
type Entry = { size: CompanySize; text: Text; w: (age: number, year: number) => number; indie?: boolean; sega?: boolean; segaSub?: boolean };
const ENTRIES: Entry[] = [
  { size: 'big', text: { ja: '大手の新卒', en: 'fresh graduate at a major' }, w: (a) => (a === 22 ? 3 : 0.3) },
  { size: 'mid', text: { ja: '中堅ソフトハウス', en: 'mid-size studio' }, w: () => 3 },
  { size: 'small', text: { ja: '社員 8 人の会社', en: 'eight-person company' }, w: () => 3 },
  { size: 'sub', text: { ja: '下請けの開発会社', en: 'contract dev shop' }, w: () => 2.5 },
  { size: 'mid', text: { ja: 'アーケードのメーカー', en: 'arcade maker' }, w: (_a, y) => (y < 2000 ? 2 : 0.3) },
  { size: 'indie', text: { ja: '同人上がり', en: 'from doujin circles' }, w: (a, y) => (a >= 26 ? 0 : y >= 1982 ? (a === 18 ? 1.5 : 0.6) : 0.2), indie: true }, // 27 歳からは前の仕事の 1 行が出るので、同人上がりにしない(第 58 回)
  { size: 'small', text: { ja: '異業種からの転職組', en: 'career change' }, w: (a) => (a >= 26 && a < 50 ? 5 : 0) },
  { size: 'sub', text: { ja: '早期退職からの再出発組', en: 'second career after early retirement' }, w: (a) => (a >= 50 ? 6 : 0) },
  { size: 'indie', text: { ja: '定年前に一念発起した独学組', en: 'self-taught late starter' }, w: (a) => (a >= 50 ? 2 : 0), indie: true },
  { size: 'abroad', text: { ja: '海外のスタジオ', en: 'overseas studio' }, w: (_a, y) => (y >= 1990 ? 0.6 : 0.2) },
  // セガの引力(PLAN §11): 1983〜2001 年は業界入りの約 4 人に 1 人がセガ
  { size: 'big', sega: true, text: { ja: 'セガ', en: 'Sega' }, w: (a, y) => (a >= 50 ? 0.3 : y <= 1982 ? 1.3 : y <= 2001 ? 5 : y <= 2015 ? 2 : 1.3) },
  { size: 'sub', segaSub: true, text: { ja: 'セガの下請け', en: "Sega's contractor" }, w: (_a, y) => (y >= 1990 && y <= 2010 ? 0.8 : 0) },
];
const JOBS: [Job, number][] = [['programmer', 30], ['planner', 20], ['artist', 22], ['sound', 11], ['qa', 12], ['sales', 5]];
const REGIONS: Text[] = [{ ja: '東京', en: 'Tokyo' }, { ja: '東京', en: 'Tokyo' }, { ja: '京都', en: 'Kyoto' }, { ja: '大阪', en: 'Osaka' }, { ja: '福岡', en: 'Fukuoka' }, { ja: '地方', en: 'the countryside' }];

function wpick<T>(r: Rng, items: T[], w: (t: T) => number): T {
  const total = items.reduce((a, t) => a + w(t), 0);
  let x = r.next() * total;
  for (const t of items) { x -= w(t); if (x < 0) return t; }
  return items[items.length - 1];
}

/** 入力された名前があればそれ(乱数の並びは変えない = 同じ seed なら名前以外は同じ人生) */
function freshName(r: Rng, born: number, recent?: string[]): Text {
  let p = personName(r, born);
  const g0 = new Set((recent ?? []).filter((x) => x.startsWith('given:')).map((x) => x.slice(6, 7)));
  for (let i = 0; i < 10 && (recent?.includes(`given:${p.ja.split(' ')[1]}`) || recent?.includes(`fam:${p.ja.split(' ')[0]}`) || g0.has((p.ja.split(' ')[1] ?? '').slice(0, 1))); i++) p = personName(r, born); // 名前の頭の字も直近と被らせない(第 38 回: えみ・えりか・えり) // 名字も直近の人生と被らせない(第 31 回: 松田が 2 回)
  return p;
}
function nameOf(gacha: Text, typed?: string): Text {
  const t = (typed ?? '').trim().slice(0, 16);
  return t ? { ja: t, en: t } : gacha;
}

/** その年の社名(社名が変わる会社: 光栄 → コーエー、セガ・エンタープライゼス → セガ …) */
const EVENTS_ALL = () => EVENTS;
function nameAt(c: CoRow, year: number): Text {
  let n = c.name;
  for (const [y, t] of c.renames ?? []) if (y <= year) n = t;
  return n;
}
/** 勤め先を表から引く: 大手は実名、中堅・小さい会社・下請けはパロディ名(その年に存在した会社だけ)。無ければ名前を作る */
/** 直近の人生で勤めた会社(init で入る。続けて遊んだ時に、毎回同じ会社に入らないように) */
let RECENT_CO: string[] = [];
function newCompany(r: Rng, size: CompanySize, year: number, avoid?: string | string[]): Company {
  const av0 = Array.isArray(avoid) ? avoid : avoid ? [avoid] : [];
  const rows0 = size === 'big' ? COMPANIES.real : COMPANIES.parody.filter((c) => c.size === size);
  // 直近の人生で勤めた会社は、他に候補があれば避ける(第 14 回ペルソナ: 3 回とも転職先がバンダイナムコ)
  const av = rows0.filter((c) => c.years[0] <= year && year <= c.years[1] && !av0.includes(c.id) && !RECENT_CO.includes(c.id)).length ? [...av0, ...RECENT_CO] : av0;
  const rows = size === 'big' ? COMPANIES.real : ['mid', 'small', 'sub'].includes(size) ? COMPANIES.parody.filter((c) => c.size === size) : [];
  const ok = rows.filter((c) => c.years[0] <= year && year <= c.years[1] && !av.includes(c.id));
  // 表に 1 社でもあれば表から(Mukkii が決めた名前を見たい。作った名前は表が空の時だけの保険。2026-10-16 Fable 経由)
  if (ok.length && r.chance(0.97)) {
    const total = ok.reduce((t, c) => t + (c.weight ?? 1), 0);
    let x = r.next() * total;
    const c = ok.find((c) => (x -= c.weight ?? 1) < 0) ?? ok[ok.length - 1];
    return { id: c.id, name: nameAt(c, year), size };
  }
  return { id: `co_${size}_${r.int(1, 999)}`, name: companyName(r, size, year), size };
}
const SEGA = () => COMPANIES.real.find((c) => c.id === 'co_sega');
/** 会社が変わった・年が変わった時に呼ぶ: 社名の変更と、セガにいる / いた の印(PLAN §11) */
function syncCompany(s: State) {
  const row = COMPANIES.real.find((c) => c.id === s.company.id);
  if (row) s.company.name = nameAt(row, s.year);
  s.flags.real_co = !!row;
  if (s.company.id === 'co_sega') s.flags.sega = true;
  else if (s.flags.sega) { s.flags.sega = false; s.flags.ex_sega = true; }
}

export function init(seed: number, options: InitOptions = {}): State {
  const r = new Rng(seed);
  const peerOf = options.peerOf;
  if (!peerOf) RECENT_CO = (options.recent ?? []).filter((x) => x.startsWith('co:')).map((x) => x.slice(3));
  if (!peerOf) { RECENT_TITLES.clear(); for (const x of options.recent ?? []) if (x.startsWith('title:')) RECENT_TITLES.add(x.slice(6)); }
  const recentStarts = (options.recent ?? []).filter((x) => x.startsWith('start:')).map((x) => +x.slice(6));
  let year = options.year ?? peerOf?.year ?? gachaYear(r, options.era);
  // おまかせの始まりは、直近の人生の始まりの年から 5 年以上離す(第 31 回: 開始年が違うと 3 回続けても 6 点、同じだと 4.5 点)
  if (options.year === undefined && !peerOf) for (let i = 0; i < 8 && recentStarts.some((y) => Math.abs(y - year) < 5); i++) year = gachaYear(r, options.era);
  const age = options.age ?? gachaAge(r);
  const entry = wpick(r, ENTRIES, (e) => e.w(age, year));
  // 直近の人生と同じ職種・同じ下の名前は引きにくく(第 11 回ペルソナ: プランナーの「まい」が 2 回続いた)
  const job = wpick(r, JOBS, ([j, w]) => w * (options.recent?.includes(`job:${j}`) ? 0.25 : 1))[0];
  const base = age <= 18 ? [80, 90, 10, 5, 10] : age <= 24 ? [70, 80, 25, 15, 30] : age < 50 ? [60, 95, 15, 10, 100] : [50, 95, 10, 30, 600];
  const company: Company = entry.indie ? { id: 'co_indie_self', name: { ja: '自室', en: 'your bedroom' }, size: 'indie' }
    : peerOf && peerOf.company.size !== 'indie' ? peerOf.company
    : entry.sega && SEGA() ? { id: 'co_sega', name: nameAt(SEGA()!, year), size: 'big' } : newCompany(r, entry.size, year);
  const s: State = {
    seed, year, age, startAge: age, startYear: year, era: eraOf(year), job, status: entry.indie ? 'indie' : 'employed',
    name: nameOf(freshName(r, year - age, options.recent), options.name), entry: entry.text, region: entry.size === 'abroad' ? { ja: '海外', en: 'abroad' } : r.pick(REGIONS),
    company, companies: [{ company, year }], options: { era: options.era, year: options.year, age: options.age, seen: options.seen },
    stat: { hp: base[0], passion: base[1], skill: base[2], network: base[3], money: base[4], fame: 0 },
    flags: {}, works: [], peers: [], log: [], chronicle: [], pending: [], rng: r,
    inner: {
      used: [], seen: {}, uses: {}, queue: [], nextWorkYear: year + r.int(tune('work.everyMin'), tune('work.everyMax')), companyYears: 0, searchFails: 0,
      leftYear: 0, otherJob: null, counts: {}, lastTag: '', choicesMade: 0, peerStates: [], isPeer: !!peerOf, bot: peerOf?.bot ?? '',
      workTarget: -1, startJob: job, prevJob: job, histDone: [], highs: [],
      // 人生に一度の大挫折と大成功(業界に入って何年目に来るか)
      pitAt: r.int(2, 10), peakAt: r.int(4, 16), pitDone: false, peakDone: false,
      recent: options.recent, others: options.others?.filter((o) => o && (o.family || o.given)).slice(0, 40), othersShown: 0, menteeAt: r.int(6, 11),
      bondAt: r.int(3, 18), bondDone: false, gravAt: r.int(2, 15), gravDone: false, nextBig: year + r.int(2, 4), nextHw: year + 2, prisonUntil: 0,
    },
  };
  if (!peerOf) {
    const bots = ['think', 'dreamer', 'stable'];
    for (let i = 0; i < 3; i++) {
      const p = init((seed * 31 + i * 7919 + 1) >>> 0, { peerOf: { year, company: s.company, bot: bots[i] }, age: r.pick([18, 22, 22, 24]) });
      for (let k = 0; k < 6 && options.recent?.includes(`fam:${p.name.ja.split(' ')[0]}`); k++) { const q = personName(r, year - p.age); p.name = { ja: `${q.ja.split(' ')[0]} ${p.name.ja.split(' ')[1] ?? ''}`.trim(), en: `${p.name.en.split(' ')[0]} ${q.en.split(' ').slice(-1)[0]}` }; } // 直近の人生の同期と同じ名字にしない(第 24 回: 長谷川が 2 人生で同期)
      if (p.name.ja.split(' ')[0] === s.name.ja.split(' ')[0]) { const q = personName(r, year - p.age); p.name = { ja: `${q.ja.split(' ')[0]} ${p.name.ja.split(' ')[1] ?? ''}`.trim(), en: `${p.name.en.split(' ')[0]} ${q.en.split(' ').slice(-1)[0]}` }; } // 本人と同じ苗字の同期は紛らわしい
      s.inner.peerStates.push(p);
      s.peers.push({ name: p.name.ja, bot: bots[i], summary: peerSummary(p) });
    }
  }
  if (entry.segaSub) s.flags.sega_sub = true;
  if (entry.text.ja === 'アーケードのメーカー') s.flags.hw_pl_arcade = true; // ゲーセン組(ゲーセンに残るかの選択はこの人にだけ)
  syncCompany(s);
  // 前日譚: 業界に入る前の学生時代(2026-10-16 Mukkii: 基本は 22 歳で入社、それまでは学生として何かしている)。
  // 道をひとつ引く(自主制作 = 雑誌への投稿など / バイト / ただのゲーマー / 学業)→ その道の話 2 本 + 別の道から 0〜1 本。
  // 選ぶ時だけ年と年齢を学生の頃に戻す(その頃にあった物しか出さない)。50 すぎの業界入りには無い
  if (!peerOf && age < 50) {
    const [y0, a0] = [s.year, s.age];
    s.age = age <= 18 ? 16 : Math.min(20, age - 2);
    s.year = year - (age - s.age);
    const base = { y: s.year, a: s.age };
    const path = wpick(r, ['st_dev', 'st_arbeit', 'st_gamer', 'st_school'], (p) => (p === 'st_dev' ? 3 : p === 'st_school' && age <= 18 ? 0.3 : 2));
    const ok = (e: GameEvent) => e.tag?.includes('prologue') && eligible(s, e);
    const inPath = (e: GameEvent) => (path === 'st_dev' ? !e.tag?.includes('student') || e.tag.includes('st_dev') : !!e.tag?.includes(path));
    const mine = EVENTS_ALL().filter((e) => ok(e) && inPath(e));
    const picked = draw(r, mine, 2, wOf(s));
    const rest = EVENTS_ALL().filter((e) => ok(e) && !picked.includes(e) && !inPath(e));
    if (rest.length && (picked.length < 2 || r.chance(0.5))) picked.push(...draw(r, rest, picked.length ? 1 : 2, wOf(s))); // その道の話が無い年は別の道から
    s.flags[path] = true;
    const off = Math.max(0, picked.length - (year - base.y)); // 入社の年にはみ出さない
    const ageKey = (e: GameEvent) => { const t = e.text.ja; return /子どもの頃|小学|幼|中学/.test(t) ? 0 : /高校/.test(t) ? 1 : 2; };
    picked.sort((a, b) => ageKey(a) - ageKey(b)); // 子どもの頃 → 高校 → 学生時代の順に並べる(第 38 回: 同人サークルの翌年に「中学の頃」)
    picked.forEach((ev, i) => {
      const tx0 = fill(s, evText(s, ev)); const kid0 = ageKey(ev) === 0 && base.a - off + i >= 16; // 19 歳の欄に「子どもの頃」の話は思い出として出す(第 48・50 回)
      s.log.push({ year: base.y - off + i, age: base.a - off + i, text: kid0 ? { ja: `〔思い出〕${tx0.ja}`, en: `[Memory] ${tx0.en}` } : tx0, kind: 'event', tag: ev.tag });
      applyInner(s, ev.effect ?? {}, ev.id, []);
      s.inner.used.push(ev.id); s.inner.seen[ev.id] = base.y - off + i; if (ev.motif) (s.inner.motifs ??= []).push(ev.motif); // 学生時代の話の型も覚える(第 40 回: 「最初に買ってくれた人の顔」が学生時代と 11 年後に) // seen に入れないと、次の人生で「直近に見た話」として避けられない(第 21 回: 学生時代の同じ文が 3 人生とも)
    });
    [s.year, s.age] = [y0, a0];
  }
  // 遅れて業界に入る人には、前の仕事の 1 行(第 23 回: 30 歳で転職したのに、前の仕事が 1 行も無い)
  if (!peerOf && age >= 27) {
    const prev = freshLine(s, [
      { ja: `${age - 1} 歳まで銀行にいた。最後の日、窓口の端末で、こっそり 1 回だけ数字を並べて絵を描いた。`, en: `Until ${age - 1}, you worked at a bank. On your last day you arranged numbers on the teller terminal into a tiny picture, just once.` },
      { ja: `${age - 1} 歳まで営業車に乗っていた。カーナビの「目的地を設定してください」に、毎朝「ゲーム会社」と言いかけた。`, en: `Until ${age - 1}, you drove a sales car. Every morning the GPS said "Set a destination," and you almost said "game company."` },
      { ja: `${age - 1} 歳まで工場の生産管理。歩留まりの表を作るのは得意だった。のちにガチャの確率表で役に立つ。`, en: `Until ${age - 1}, you ran production control at a factory. You were good at yield charts. Later, that would come in handy for gacha rates.` },
      { ja: `${age - 1} 歳まで市役所にいた。退職の日、課長が「ゲームって、仕事になるの?」と聞いた。答えはまだ分からない。`, en: `Until ${age - 1}, you worked at city hall. On your last day, the section chief asked, "Can games be a job?" You don't know yet.` },
    ], 'prevjob');
    s.log.push({ year: year - 1, age: age - 1, text: prev, kind: 'event' });
    (s.inner.saidLines ??= []).push(prev.ja);
  }
  { const st = s.status === 'indie' ? 'ev_sys_start_indie' : vary(s, ['ev_sys_start', 'ev_sys_start_b', 'ev_sys_start_c', 'ev_sys_start_d']); s.inner.seen[st] = s.year; logEvent(s, st, 'event'); }
  return s;
}

// ---- 文の差し込み ----
function fill(s: State, t: Text): Text {
  const w = s.inner.workTarget >= 0 ? s.works[s.inner.workTarget] : s.works[s.works.length - 1];
  const rivalP = s.inner.rival ? s.inner.peerStates[1] : undefined;
  const live = s.inner.peerStates.filter((p) => !p.ending && !p.flags.in_prison && !p.flags.ex_prison && p !== rivalP); // 捕まった同期は、出てきた後も普通の話には出さない(第 21 回: 逮捕の 26 年後に次の企画のリーダー) // 引退・服役した同期、ライバルは出さない
  const sameCo = live.filter((p) => p.company.id === s.company.id); // 同じ会社にいる同期を先に(第 27 回: 転職した同期が「次の企画のリーダー」)
  const pool = sameCo.length ? sameCo : live;
  const peer = pool.length ? pool[s.year % pool.length].name : { ja: '同期', en: 'a peer' };
  const other = s.inner.otherJob ?? { ja: '別の仕事', en: 'another job' };
  const rep = (str: string, l: 'ja' | 'en') => (l === 'ja' ? str.replace(/ ?\{(peer|company|work|name)\} ?/g, '{$1}') : str)
    .replace(/\{name\}/g, s.name[l]).replace(/\{company\}/g, s.company.name[l])
    .replace(/\{work\}/g, w ? w.name[l] : (l === 'ja' ? '『まだ名前の無い作品』' : '"an untitled game"'))
    .replace(/\{age\}/g, String(s.age)).replace(/\{year\}/g, String(s.year))
    .replace(/\{fan\}/g, s.inner.fan?.name[l] ?? (l === 'ja' ? 'あのファン' : 'that fan')).replace(/\{fanwork\}/g, s.inner.fan?.work?.[l] ?? (l === 'ja' ? 'あなたのゲーム' : 'your game'))
    .replace(/\{fanmsg\}/g, l === 'ja' ? (s.year < 1997 ? '手紙' : s.year < 2010 ? 'メール' : 'SNS のメッセージ') : (s.year < 1997 ? 'letter' : s.year < 2010 ? 'email' : 'social-media message'))
    .replace(/\{rival\}/g, s.inner.rival?.name[l] ?? (l === 'ja' ? '同期' : 'your rival'))
    .replace(/\{mentor\}/g, s.inner.mentor?.name[l] ?? (l === 'ja' ? '先輩' : 'your mentor')).replace(/\{mentee\}/g, s.inner.mentee?.name[l] ?? (l === 'ja' ? '後輩' : 'your junior'))
    .replace(/\{peer\}/g, s.inner.rival && /負けたくない|ライバル/.test(t[l]) ? s.inner.rival.name[l] : l === 'ja' ? peer.ja.split(' ')[0] : peer.en.split(' ').slice(-1)[0]).replace(/\{other\}/g, other[l]);
  return { ja: rep(t.ja, 'ja').replace(/([ぁ-んァ-ヶ一-龠ー])(SNS)/g, '$1 $2'), en: rep(t.en, 'en').replace(/\b([Aa]) (email|emails?\b)/g, '$1n $2') };
}
function log(s: State, text: Text, kind: LogLine['kind'], tag?: string[]) {
  // 日本語どうしの間の空白は詰める(「グリー に」→「グリーに」。第 14・15 回ペルソナ)
  text = { ja: text.ja.replace(/([ぁ-んァ-ヶ一-龠ー々」』])[ \u3000]+(?=[ぁ-んァ-ヶ一-龠ー々「『、。])/g, '$1'), en: text.en };
  s.log.push({ year: s.year, age: s.age, text, kind, tag });
}
function logEvent(s: State, id: string, kind: LogLine['kind']) {
  const ev = EVENT_BY_ID.get(id);
  if (ev) log(s, fill(s, evText(s, ev)), kind, ev.tag);
}

// ---- 効果 ----
function apply(s: State, e: Effect | undefined, ctx: string, out: string[], cause?: Text) {
  if (!e) return;
  try { applyInner(s, e, ctx, out, cause); } finally { syncCompany(s); }
  // 海を渡ったら、勤め先は本当に海外の会社に(第 12 回ペルソナ: 渡った後もずっと日本の下請けの話)。数年で帰ってくる
  if ((e.flag?.life_abroad || e.flag?.went_abroad) && s.status === 'employed' && s.company.size !== 'abroad') {
    s.company = newCompany(s.rng, 'abroad', s.year, [s.company.id]); s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0;
    s.inner.abroadUntil = s.year + s.rng.int(4, 7);
  }
}
/** 海外から帰ってくる(abroadUntil の年) */
function comeHome(s: State) {
  s.inner.abroadUntil = 0; s.flags.life_abroad = false; s.flags.went_abroad = false; s.flags.came_home = true;
  const size: CompanySize = s.stat.skill >= 60 ? s.rng.pick(['big', 'mid'] as const) : s.rng.pick(['mid', 'small'] as const);
  s.company = newCompany(s.rng, size, s.year, [...(s.inner.deadCos ?? []), s.company.id]); s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0;
  log(s, freshLine(s, [{ ja: `日本に帰ってきた。次の勤め先は ${s.company.name.ja}。空港のうどんが、泣くほどうまかった。`, en: `Back in Japan. Next stop: ${s.company.name.en}. The airport udon was good enough to cry over.` }, { ja: `帰国して ${s.company.name.ja} に入った。最初の会議で、つい英語で相づちを打った。`, en: `Home again, you joined ${s.company.name.en}. At the first meeting you nodded along in English by accident.` }], 'comehome'), 'event');
}
function applyInner(s: State, e: Effect, ctx: string, out: string[], cause?: Text) {
  for (const k of ['hp', 'passion', 'skill', 'network', 'fame'] as const) if (e[k]) s.stat[k] = clamp(s.stat[k] + e[k]!);
  if (e.money) s.stat.money += e.money;
  if (e.job) s.job = e.job;
  if (e.status && e.status !== s.status) setStatus(s, e.status);
  if (e.work?.add) {
    const { work, line } = release(s);
    if (e.work.add.platform) work.platform = e.work.add.platform;
    if (e.work.add.role) work.role = e.work.add.role === 'lead' && (s.job === 'qa' || s.job === 'sales') ? 'core' : e.work.add.role;
    log(s, line, 'work'); out.push('work');
  }
  if (e.work?.last) {
    const w = s.inner.workTarget >= 0 ? s.works[s.inner.workTarget] : s.works[s.works.length - 1];
    if (w) {
      if (e.work.last.result) w.result = e.work.last.result;
      if (e.work.last.history) w.history.push({ year: s.year, text: e.work.last.history });
    }
  }
  // 普通のフラグを先に立ててから命令(do_*)を実行する(do_end が ai_seat を読むため)
  const flags = Object.entries(e.flag ?? {}).sort(([a], [b]) => Number(a.startsWith('do_')) - Number(b.startsWith('do_')));
  for (const [f, v] of flags) {
    if (!f.startsWith('do_')) {
      // ハードの好み(hw_<組>_<名>)は組ごとに最後の選択だけ残す(SEGA→PS に乗り換えたら SEGA の好みは消える)
      const g = /^hw_([a-z]+)_/.exec(f);
      if (g && v) for (const k of Object.keys(s.flags)) if (k.startsWith(`hw_${g[1]}_`)) delete s.flags[k];
      delete s.flags[f]; // 付け直して、新しい選択ほど後ろに並ぶように(platformFor は新しい選択を優先する)
      s.flags[f] = v;
      if (f === 'child' && v && !s.inner.childYear) s.inner.childYear = s.year; // 子どもの年齢(select.ts の kid)
      continue;
    }
    if (!v) continue;
    if (f === 'do_change_company') {
      s.flags.changed_co = true; s.flags.callcenter = false;
      if (s.company.size === 'abroad' && !e.flag?.life_abroad && !e.flag?.went_abroad) { s.flags.life_abroad = false; s.flags.went_abroad = false; s.flags.came_home = true; s.inner.abroadUntil = 0; } // 海外から日本の会社へ移ったら、海外暮らしの話を止める(第 22 回: ナムコに入った後に「海外暮らしが 3 年」)
      const cev = EVENT_BY_ID.get(ctx); const ctxTx = cev ? [cev.text, ...(cev.alt ?? []), ...(cev.choices ?? []).map((c) => c.result ?? { ja: '', en: '' })].map((x) => x.ja).join(' ') : '';
      const named = /外注先|下請け|元上司の会社|元上司の新会社|新会社|先輩の会社|友人の会社|知り合いの会社|小さな会社|同期の会社/.test(ctxTx); // 本文が行き先を決めている(第 48 回: 「外注先の会社に入った」の直後に「ナムコに移った」)
      const size: CompanySize = named ? s.rng.pick(['small', 'sub'] as const) : s.stat.skill >= 60 ? s.rng.pick(['big', 'mid'] as const) : s.rng.pick(['mid', 'small', 'sub'] as const);
      if (e.flag?.life_hometown) { // 地元へ帰ったら、幼なじみと始める小さな会社(第 20 回ペルソナ: 地元へ帰った同じ年に大手へ移った)
        s.company = { id: `co_home_${s.year}`, name: { ja: `${s.rng.pick(['ふるさと', 'みなと', 'やまびこ', 'たんぼ', 'ひだまり'])}ゲームス`, en: `${s.rng.pick(['Hometown', 'Harbor', 'Echo', 'Paddy', 'Sunspot'])} Games` }, size: 'small' };
        s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0; setStatus(s, 'employed');
        s.inner.nextWorkYear = s.year + s.rng.int(tune('work.everyMin'), tune('work.everyMax'));
        continue;
      }
      s.company = newCompany(s.rng, size, s.year, [...(s.inner.deadCos ?? []), ...s.companies.map((c) => c.company.id)]); s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0; setStatus(s, 'employed'); // 潰れた会社・前にいた会社には移らない(第 34 回: 潰れた最初の会社に 15 年後に移った)
      // 次の勤め先を一言(第 9 回ペルソナ: 希望退職に応じた後、どこにいるのか分からない)
      if (named || /移った|転職した|入った|拾われ|行くことにした|移ることにした|戻った|戻ることにした|会社員に戻/.test(ctxTx)) log(s, freshLine(s, [{ ja: `行き先は ${s.company.name.ja}。初日、受付で名前を 2 回聞き返された。`, en: `Destination: ${s.company.name.en}. On day one, reception asked your name twice.` }, { ja: `行き先は ${s.company.name.ja}。最初に覚えたのは、コピー機の紙詰まりの直し方だった。`, en: `Destination: ${s.company.name.en}. The first thing you learned was how to clear the copier jam.` }, { ja: `行き先は ${s.company.name.ja}。歓迎会の店は、前の会社の送別会と同じ店だった。`, en: `Destination: ${s.company.name.en}. The welcome party was at the same place as your farewell party.` }, { ja: `行き先は ${s.company.name.ja}。社内のチャットの使い方を、新人と並んで教わった。`, en: `Destination: ${s.company.name.en}. You learned the in-house chat tool sitting next to the new grads.` }], 'dest'), 'event'); /* 社名だけの 1 行で終わらせない(第 52・53 回) */ else /* 本文が移ったと言っていたら、社名だけを足す(第 49 回: 「移った。」の直後に「◯◯に入った。初日…」) */ log(s, freshLine(s, [{ ja: `次の勤め先は ${s.company.name.ja}。入館証の写真を撮る係の人が、3 回「笑ってください」と言った。`, en: `Next stop: ${s.company.name.en}. The person taking ID photos said "Smile, please" three times.` }, { ja: `${s.company.name.ja} に移った。机の引き出しの位置が、前の会社と左右逆だった。`, en: `You moved to ${s.company.name.en}. The desk drawers were on the opposite side from the last place.` }, { ja: `${s.company.name.ja} に拾われた。初日、社食の食券の買い方が分からず、後ろに 5 人並んだ。`, en: `${s.company.name.en} took you in. On day one you couldn't work the cafeteria ticket machine. Five people lined up behind you.` }, { ja: `${s.company.name.ja} に入った。歓迎会で、前の会社の悪口を言うのをこらえた。`, en: `You joined ${s.company.name.en}. At the welcome party, you held back from badmouthing the old place.` }, { ja: `${s.company.name.ja} に移った。最初の 1 週間、前の会社の電話の出方で出てしまった。`, en: `You moved to ${s.company.name.en}. For the first week you kept answering the phone with your old company's greeting.` }, { ja: `${s.company.name.ja} で出直し。新しい机には、前の人の付箋が 1 枚だけ残っていた。「がんばれ」。`, en: `A fresh start at ${s.company.name.en}. The new desk had one sticky note left by the last person: "Hang in there."` }], 'nextco'), 'event');
      s.inner.nextWorkYear = s.year + s.rng.int(tune('work.everyMin'), tune('work.everyMax'));
    } else if (f === 'do_go_indie') {
      setStatus(s, 'indie'); s.flags.own_co = true; s.company = { id: 'co_indie_self', name: { ja: `${s.name.ja.split(' ')[0]}ゲームス`, en: `${s.name.en.split(' ').slice(-1)[0]} Games` }, size: 'indie' };
      s.companies.push({ company: s.company, year: s.year });
      s.inner.nextWorkYear = s.year + s.rng.int(1, 3);
    } else if (f === 'do_return') {
      s.job = s.inner.prevJob; s.company = newCompany(s.rng, s.rng.pick(['mid', 'small', 'sub'] as const), s.year, [s.company.id]); s.companies.push({ company: s.company, year: s.year });
      setStatus(s, 'employed'); s.inner.companyYears = 0; s.inner.leftYear = 0; s.flags.came_back = true;
      s.inner.nextWorkYear = s.year + s.rng.int(1, 3);
    } else if (f === 'do_end') {
      end(s, s.flags.ai_seat ? 'end_ai_seat' : ctx === 'ev_sys_comeback' ? 'end_burnout' : 'end_retire', out, cause);
    } else if (f === 'do_arrest') {
      end(s, 'end_arrest', out, cause);
    } else if (f === 'do_switch') { // ゲームの外の仕事へ転身して、ゲーム人生を終える(イラストレーター・漫画家・作家・コンサル …)
      end(s, 'end_switch', out, cause);
    } else if (f === 'do_teach') { // 専門学校・大学の先生になる(作品は出なくなる。戻るなら do_return)
      s.inner.prevJob = s.job === 'teacher' ? s.inner.prevJob : s.job; s.job = 'teacher';
      s.company = newCompany(s.rng, 'school', s.year, [s.company.id]); s.companies.push({ company: s.company, year: s.year });
      setStatus(s, 'employed'); s.inner.companyYears = 0; s.flags.taught = true;
    } else if (f === 'do_prison') { // 服役(3 年)。明けたら個人開発者として再起する
      s.inner.prevJob = s.job; s.flags.in_prison = true; s.inner.prisonUntil = s.year + 3;
      setStatus(s, 'left'); s.job = 'other'; s.inner.otherJob = { ja: '塀の中', en: 'prison' };
    } else if (f === 'do_restart') { // 2027 年の区切り(同期との掛け合いは end の中で)
      end(s, 'end_restart', out);
    } else if (f === 'do_promote') { // 管理職への昇進を受ける(選択肢から)
      promote(s);
    } else if (f === 'do_join_sega' && SEGA()) { // セガに入る(PLAN §11)
      s.company = { id: 'co_sega', name: nameAt(SEGA()!, s.year), size: 'big' }; s.companies.push({ company: s.company, year: s.year });
      setStatus(s, 'employed'); s.inner.companyYears = 0;
      s.inner.nextWorkYear = s.year + s.rng.int(tune('work.everyMin'), tune('work.everyMax'));
    } else if (f === 'do_mega') { // 終わらない巨大プロジェクト(5 年、作品が出ない)
      s.flags.mega_project = true; s.inner.nextWorkYear = s.year + 5;
    }
  }
}
function setStatus(s: State, st: State['status']) {
  if (st === 'left' && s.status !== 'left') { s.inner.leftYear = s.year; s.inner.searchFails = 0; s.company = { id: 'co_none', name: { ja: '無職', en: 'unemployed' }, size: 'none' }; }
  s.status = st;
}
function schedule(s: State, later: { after: number; event: string }[] | undefined) {
  for (const l of later ?? []) s.pending.push({ year: s.year + l.after, event: l.event, co: s.company.id });
}
function count(s: State, ev: GameEvent) {
  for (const t of ev.tag ?? []) s.inner.counts[t] = (s.inner.counts[t] ?? 0) + 1;
}

// ---- 終わり ----
function end(s: State, id: EndingId, out: string[], custom?: Text) {
  if (s.ending) return;
  if (!s.inner.isPeer) kidsReturn(s, id);
  s.ending = makeEnding(s, id, custom);
  s.status = 'ended';
  s.choice = undefined;
  s.inner.queue = [];
  if (s.inner.isPeer) log(s, s.ending.cause, 'event', ['ending']); // 本人の死因は結果画面に大きく出るので、ログには重ねない
  out.push('ended');
}
function checkEnd(s: State, out: string[]) {
  if (s.ending) return;
  if (s.stat.hp <= 0) {
    if (!s.flags.collapsed && s.age < 45) { s.flags.collapsed = true; s.stat.hp = 30; logEvent(s, 'ev_sys_collapse', 'event'); apply(s, EVENT_BY_ID.get('ev_sys_collapse')?.effect, '', out); }
    else if (!s.inner.recent?.length && !s.inner.isPeer && s.year - s.startYear < 12) { s.stat.hp = 25; log(s, { ja: 'また倒れた。今度は 2 週間で戻った。医者の目は笑っていなかった。机の上に、誰かが置いたのど飴が 3 袋。', en: 'You collapsed again. Back in two weeks this time. The doctor was not smiling. Someone had left three bags of throat drops on your desk.' }, 'event'); } // 初めての 1 回は、若いうちに体で終わらせない(第 37 回: 1 回目が 25 歳で体を壊して終わり、2 回目を遊んでもらえない)
    else return end(s, 'end_body', out);
  }
  if (s.stat.passion <= 0 && (s.status === 'employed' || s.status === 'indie')) {
    if (s.flags.burned) return end(s, 'end_burnout', out);
    s.flags.burned = true; s.inner.prevJob = s.job; s.inner.otherJob = s.rng.pick(OTHER_JOBS);
    logEvent(s, 'ev_sys_burnout', 'event');
    apply(s, EVENT_BY_ID.get('ev_sys_burnout')?.effect, '', out);
    s.stat.passion = 25; s.inner.queue = [];
  }
  if (s.stat.money <= tune('job.debtLimit') && s.status !== 'employed' && !s.flags.in_prison) return end(s, 'end_debt', out);
  if (s.inner.searchFails >= 3) return end(s, 'end_blacklist', out);
}

// ---- 1 年 ----
function beginYear(s: State, out: string[]) {
  s.era = eraOf(s.year);
  syncCompany(s);
  const r = s.rng;
  // 年表は 1 年 2 行まで(3〜4 行並ぶと自分の話が押し流される、とペルソナ通読で指摘)
  const tl = TIMELINE_BY_YEAR.get(s.year) ?? [];
  // 2 回目からは 1 年 1 行、どれを出すかも散らす(第 33 回: 3 回続けると「同じ新聞を読み返している」)
  const tlShow = s.inner.recent?.length && !s.inner.isPeer ? (tl.length > 1 ? [tl[r.int(0, Math.min(tl.length, 3) - 1)]] : tl) : tl.slice(0, 2);
  for (const t of tlShow) log(s, t.text, 'timeline', [t.kind]);
  if ((TIMELINE_BY_YEAR.get(s.year) ?? []).length) out.push('timeline');
  // 2027 年: AI のパラダイムシフトで人生の区切り(2026-10-16 Mukkii)。その年は「どうする?」の選択だけ → キッズ・リターンのパロディで前向きに終わる
  if (s.year >= tune<number>('life.finalYear') && s.age < 70 && !s.flags.in_prison) { s.inner.queue = ['ev_sys_shift']; return; } // 塀の中の間は、出てから(第 14 回ペルソナ: 服役中に「発売日に並ぶ」)
  const q: string[] = [];
  const sys: string[] = [];
  // 予約(later)
  const due = s.pending.filter((p) => p.year <= s.year);
  s.pending = s.pending.filter((p) => p.year > s.year);
  // 会社の中の大作の結末(tag mega)は、同じ会社にいる時だけ(第 7 回ペルソナ: 潰れた会社の巨大作が「やっと出た」)
  // 2023〜2025 年: AI の現場あるあるを毎年 1 本、2024 年には「生成 AI をどう使うか」(第 16 回ペルソナ: 1 人生に 1〜2 個しか無く、2026 年が唐突)
  if (s.year >= 2023 && s.year <= 2025 && s.status === 'employed' && !s.flags.in_prison && !s.inner.isPeer) {
    const aiqY = (s.inner.aiqYear ??= s.inner.recent?.length ? (s.inner.recent.includes('ev_aiq_use') && r.chance(0.5) ? 9999 : 2023 + r.int(0, 2)) : 2024); // 2 回目からは、直近で見ていたら半分は出さない(第 40 回: 毎回同じ選択の並び。仮決め・QUESTIONS.md) // 2 回目からは 2023〜25 年のどこか(第 25 回まで: 毎回 2024 年で骨組みが見える。仮決め・QUESTIONS.md)
    if (s.year >= aiqY && !s.flags.aiq_asked && EVENT_BY_ID.get('ev_aiq_use') && eligible(s, EVENT_BY_ID.get('ev_aiq_use')!)) { s.flags.aiq_asked = true; q.push('ev_aiq_use'); }
    else {
      const pool = EVENTS_ALL().filter((e) => e.id.startsWith('ev_aia_') && eligible(s, e, 99, 1));
      const fresh = pool.filter((e) => !s.inner.recent?.includes(e.id));
      if (pool.length) q.push(draw(r, fresh.length ? fresh : pool, 1, () => 1)[0].id);
    }
  }
  // 2026 年: AI 時代の衝撃の事件が立て続けに 3 本(2026-10-16 Mukkii: どのプレイでも 2026 年に)。直近の人生で見ていないものから
  if (s.year === 2026 && !s.flags.ai26 && !s.inner.isPeer) {
    s.flags.ai26 = true;
    const pool = EVENTS_ALL().filter((e) => e.id.startsWith('ev_ai26_') && (!e.jobs || e.jobs.includes(s.job)) && ![e.motif, ...(e.motifAll ?? [])].some((m) => m && s.inner.motifs?.includes(m)) && (e.when ?? []).every((c) => test(s, c))); // 職種も見る(第 56 回: グラフィッカーに「昔のバグ表を読み返した」)
    const fresh = pool.filter((e) => !s.inner.recent?.includes(e.id));
    const nAi = s.inner.recent?.length ? 2 : 3; // 2 回目からは 2 本(第 38 回: 2026 年に AI の行が 4〜5 行並ぶ。立て続けは保つ)
    const pick = draw(r, fresh.length >= nAi ? fresh : pool, nAi, () => 1);
    q.push(...pick.map((e) => e.id));
  }
  for (const p of due) if (!((EVENT_BY_ID.get(p.event)?.tag?.includes('mega') || /^ev_wk_fu_|^ev_ch_yonige_(struggle|postcard|payoff)|^ev_ch2_shokudo_(shugyo|test|payoff)/.test(p.event)) && p.co && p.co !== s.company.id)) q.push(p.event); // 会社の中の後日談は、同じ会社にいる時だけ
  // 職と年齢の節目
  if (s.year > 2040) { sys.push(s.status === 'left' ? '@end:end_switch' : '@end:end_ai_seat'); } // 業界を出た人に「AI に席を譲った」は無い(第 26 回)
  else if (s.age >= 70) sys.push('@end:end_pen_down');
  else if (s.age === 65 && (s.status === 'employed' || s.status === 'indie')) sys.push('ev_sys_age65', '@check65');
  else if (s.age >= 60 && !s.flags.age60 && s.status === 'employed') { s.flags.age60 = true; sys.push('ev_sys_age60'); } // 独立した人に定年は来ない(第 18 回ペルソナ)
  if (s.inner.abroadUntil && s.year >= s.inner.abroadUntil && s.status === 'employed' && s.company.size === 'abroad') comeHome(s);
  if (s.status === 'employed') {
    const mult = { big: 0.3, mid: 1, small: 1.6, sub: 2, abroad: 1, indie: 0, school: 0, none: 0 }[s.company.size];
    const bad = [1983, 1991, 1992, 2001, 2008, 2009, 2023, 2024].includes(s.year) ? 2 : 1;
    const realCo = COMPANIES.real.some((c) => c.id === s.company.id); // 実在の会社は史実に無い倒産をさせない
    if (s.job !== 'teacher' && !realCo && r.chance(tune('job.bankrupt') * mult * bad)) sys.push(vary(s, ['ev_sys_bankrupt', 'ev_sys_bankrupt_b', 'ev_sys_bankrupt_c']));
    else {
      if (s.year >= s.inner.nextWorkYear && s.job !== 'teacher') q.push('@release');
      const lastOffer = Math.max(s.inner.seen.ev_sys_offer ?? -99, s.inner.seen.ev_sys_offer_b ?? -99, s.inner.seen.ev_sys_offer_c ?? -99);
      if (!s.flags.age60 && s.inner.companyYears >= 2 && s.age >= 20 && s.year - lastOffer >= 6 && r.chance(tune('job.offer') + s.stat.network / 1500)) sys.push(vary(s, ['ev_sys_offer', 'ev_sys_offer_b', 'ev_sys_offer_c']));
      // 昇進: 半分は「受けるか、現場に残るか」の選択(ev_wk_promote_ask)。残りはそのまま辞令
      else if (canPromote(s) && !s.flags.promo_declined && r.chance(tune<number>('job.promote') * (s.job === 'planner' ? 0.3 : s.job === 'director' ? 0.15 : 0.1)) /* 2026-10-17 Mukkii: どの職種からも上に行けるが、いつもではない。プランナーは少し多め */) sys.push(r.chance(0.5) && !s.flags.promoted && !s.inner.used.includes('ev_wk_promote_ask') && !s.inner.recent?.includes('ev_wk_promote_ask') ? 'ev_wk_promote_ask' : vary(s, ['ev_sys_promote', 'ev_sys_promote_b', 'ev_sys_promote_c']));
      if (s.year >= 2027 && !s.inner.used.includes('ev_sys_ai_seat') && r.chance(Math.min(0.6, tune('ai.seat') * (1 + 2 * Math.min(1, (s.year - 2027) / 8)) + Math.max(0, s.year - 2035) * 0.12))) sys.push('ev_sys_ai_seat');
    }
  } else if (s.status === 'indie') {
    if (s.year >= s.inner.nextWorkYear) q.push('@release');
    if (r.chance(0.25 + s.stat.network / 400) && s.stat.money < 100) sys.push('@rehire_offer');
  } else if (s.status === 'left') {
    if (s.flags.in_prison) {
      if (s.year >= s.inner.prisonUntil) sys.push('ev_sys_prison_out');
    } else if (s.flags.burned && s.job === 'other') {
      if (s.year - s.inner.leftYear >= 5) sys.push('@end:end_burnout');
      else if (!s.inner.used.includes('ev_sys_comeback') && r.chance(tune('job.comeback') + s.stat.network / 400)) sys.push('ev_sys_comeback');
    } else if (s.year > s.inner.leftYear) sys.push('@search');
  }
  // 人生に一度の大挫折と大成功(当てはまる話が無ければ翌年に持ち越す)
  const turning: string[] = [];
  for (const [tag, at, done] of [['pit', 'pitAt', 'pitDone'], ['peak', 'peakAt', 'peakDone'], ['bond', 'bondAt', 'bondDone'], ['gravity', 'gravAt', 'gravDone']] as const) {
    if (s.inner[done] || s.year - s.startYear < s.inner[at] || s.status === 'left') continue;
    if (tag === 'gravity' && (s.flags.sega || s.flags.ex_sega)) continue; // セガの引力はセガに入らなかった人生でだけ
    const pool0 = POOL.filter((e) => e.tag?.includes(tag) && eligible(s, e) && (!s.inner.isPeer || !e.tag.includes('early_exit')));
    if (!pool0.length) continue;
    s.inner[done] = true;
    // 人生の山場は、直近の人生で見ていないものから。全部見ていたら、今回は山場なし(第 10 回ペルソナ: 毎回同じ年に同じ筋)
    const pool = freshOnly(s, pool0);
    if (!pool.length) continue;
    turning.push(draw(r, pool, 1, wOf(s))[0].id);
  }
  // 数年に一回の大きな選択(すごく悩むやつ)
  if (s.year >= s.inner.nextBig && s.status !== 'left') {
    const pool = POOL.filter((e) => e.tag?.includes('big') && !(s.inner.isPeer && e.tag.includes('early_exit')) && !e.tag.includes('hardware') && !e.tag.includes('worklife') && (!e.tag.includes('insider') || !s.inner.counts.insider) && e.choices && eligible(s, e, 99));
    const fresh = freshOnly(s, pool);
    if (pool.length) { if (fresh.length) turning.push(draw(r, fresh, 1, wOf(s))[0].id); s.inner.nextBig = s.year + r.int(tune<number>('choice.bigMin'), tune<number>('choice.bigMax')); }
  }
  // どのハードに賭けるか(hardware.json。大きな選択と同じ年には出さない)
  const holder = s.status === 'employed' && (s.company.id === 'co_sony' || s.company.id === 'co_nintendo' || (s.company.id === 'co_sega' && s.year < 2001)); // ハードを作る会社の社員は機種を選ばない
  if (s.year >= (s.inner.nextHw ?? 0) && !turning.length && !holder && (s.status === 'employed' || s.status === 'indie')) {
    const holder = s.company.id === 'co_sony' || s.company.id === 'co_nintendo' || (s.company.id === 'co_sega' && s.year < 2001); // ハードを作る会社の社員に、どの機種で出すかを選ばせない(第 51 回: SCE の社員が Wii を選んだ)
    const pool0 = holder ? [] : POOL.filter((e) => e.tag?.includes('hardware') && e.choices && eligible(s, e, 99, 1));
    const fresh = freshOnly(s, pool0); const pool = fresh.length ? fresh : r.chance(0.2) ? pool0 : []; // 第 22 回: Switch かスマホかがまだ 3 人生とも → 0.35 から 0.2 // 第 20 回ペルソナ: 3 人生とも「ソシャゲか残るか」「Switch かスマホか」。直近に見た選択だけなら 65% で今回は出さない
    if (pool0.length && !pool.length) s.inner.nextHw = s.year + r.int(tune<number>('choice.hwMin'), tune<number>('choice.hwMax'));
    if (pool.length) { turning.push(draw(r, pool, 1, wOf(s))[0].id); s.inner.nextHw = s.year + r.int(tune<number>('choice.hwMin'), tune<number>('choice.hwMax')); }
  }
  // 仕事の選択(worklife.json: タイトル・続編か新作か・チーム・エンジン・延期かカットか・海外版・リストラ)。他の大きな選択と同じ年には出さない
  if (s.year >= (s.inner.nextWk ?? s.startYear + 3) && !turning.length && s.status === 'employed') {
    const pool0 = POOL.filter((e) => e.tag?.includes('worklife') && e.choices && eligible(s, e, 99, 1));
    const fresh = freshOnly(s, pool0); const pool = fresh.length ? fresh : r.chance(0.15) ? pool0 : []; // 第 33 回: タイトル会議・名前の 3 案・エンジン選びが人生をまたいで → 0.35 から 0.15
    if (pool0.length && !pool.length) s.inner.nextWk = s.year + r.int(tune<number>('choice.wkMin'), tune<number>('choice.wkMax'));
    if (pool.length) { turning.push(draw(r, pool, 1, wOf(s))[0].id); s.inner.nextWk = s.year + r.int(tune<number>('choice.wkMin'), tune<number>('choice.wkMax')); }
  }
  mentorArcs(s, r, out);
  const arcIds = storyArcs(s, r);
  // 入社した年に、その会社の社風の一言(company_traits.json)
  const trait = CO_TRAITS[s.company.id];
  if (trait?.lines?.length && s.status === 'employed' && !(s.inner.coShown ??= []).includes(s.company.id)) {
    s.inner.coShown.push(s.company.id);
    // 年代に合わない社風の一言は出さない(第 14 回ペルソナ: 1991 年に「スマホの画面に収まる剣と魔法」)
    const fits = trait.lines.filter((l) => !(s.year < 2008 && /スマホ|SNS|アプリ|ガチャ|配信/.test(l.ja)) && !(s.year < 1999 && /ケータイ/.test(l.ja)) && !(/描いた|あなたの絵/.test(l.ja) && !['artist', 'director'].includes(s.job)) && !(/あなたのコード|書いたコード/.test(l.ja) && s.job !== 'programmer') && !(/あなたの曲/.test(l.ja) && s.job !== 'sound') && !(s.inner.recent?.includes(`line:${l.ja}`) && r.chance(0.8))); // 職種に合わない社風の一言は出さない(第 21 回)、直近の人生で見た一言は避ける
    const freshFits = fits.filter((l) => !s.inner.recent?.includes(`line:${l.ja}`)); // 同じ会社に続けて入っても、社風の一言は前の人生と変える(自動点検: 「社歌より先に、起動時のあの声」が人生をまたいで同じ)
    if (freshFits.length || (fits.length && r.chance(0.3))) { const t = r.pick(freshFits.length ? freshFits : fits); (s.inner.saidLines ??= []).push(t.ja); log(s, t, 'event', ['company']); }
  }
  // 他の人の人生(名前を入れて遊んだ誰か)が、先輩・同期・後輩・記事として顔を出す
  if (s.inner.others?.length && (s.status === 'employed' || s.status === 'indie') && (s.inner.othersShown ?? 0) < tune<number>('others.max') && r.chance(tune('others.chance'))) {
    const line = otherLine(s, r);
    if (line) { log(s, line, 'event', ['other']); s.inner.othersShown = (s.inner.othersShown ?? 0) + 1; }
  }
  // 歴史の事件(その年の業界の大事件が、今の立場で自分に降ってくる)
  const hist = pickHist(s);
  // データのイベント
  const n = (s.flags.in_prison ? 1 : r.int(tune('life.eventsMin'), tune('life.eventsMax'))) - (q.length > 0 ? 1 : 0) - hist.length;
  const sysChoice = [...sys, ...q, ...hist, ...turning].some((id) => EVENT_BY_ID.get(id)?.choices);
  const allowChoice = !sysChoice && r.chance(tune('life.choiceEvery'));
  const pool = POOL.filter((e) => eligible(s, e, tune<number>('life.repeatGap'), tune<number>('life.maxRepeat')) && (allowChoice || !e.choices) && (!e.tag?.includes('afterlife') || hasOldWork(s)) && (!e.tag?.includes('crime') || !s.inner.counts.crime) && (!e.tag?.includes('quote') || (s.inner.counts.quote ?? 0) < 1) && (!e.tag?.includes('slang') || (s.inner.counts.slang ?? 0) < 4) && (!s.flags.in_prison || (e.when ?? []).some((c) => c.includes('prison'))) && !['pit', 'peak', 'bond', 'big', 'gravity', 'prologue', 'hardware', 'worklife'].some((t) => e.tag?.includes(t)));
  const freshP = freshOnly(s, pool); // 直近の人生で見た話は、新しい話が十分あれば出さない(第 28 回: 人生をまたいで一字一句同じ文が 6 本)
  let picked = draw(r, freshP.length >= Math.max(1, n) * 3 ? freshP : pool, Math.max(1, n), wOf(s));
  // 選択は 1 年に 1 本まで、作品の後日談も 1 年に 1 本まで
  let seenChoice = false, seenAfter = false;
  picked = picked.filter((e) => {
    if (e.tag?.includes('afterlife')) { if (seenAfter) return false; seenAfter = true; }
    if (!e.choices) return true; if (seenChoice) return false; seenChoice = true; return true;
  });
  const ids = picked.map((e) => e.id);
  // 作品の発売は真ん中あたりに
  const rel = q.indexOf('@release');
  if (rel >= 0) { q.splice(rel, 1); ids.splice(r.int(0, ids.length), 0, '@release'); }
  // 歴史の事件は頭に(その年の空気を最初に)
  const all = [...hist, ...turning, ...arcIds, ...q, ...ids, ...sys];
  const jailing = (id: string) => !!EVENT_BY_ID.get(id)?.effect?.flag?.do_prison;
  s.inner.queue = [...all.filter((id) => !jailing(id)), ...all.filter(jailing)]; // 実刑はその年の最後に(第 30 回: 判決の年に「続編は手堅く売れた」「新人が入ってきた」)
}

/** その年に起きる歴史の事件から、今の立場で受ける版を選ぶ。年表図鑑でまだ触れていない事件・立場ほど出やすい */
function pickHist(s: State): string[] {
  const seen = new Set(s.options.seen ?? []);
  const seenHist = new Set([...seen].map((k) => k.split(':')[0]));
  const cands: { id: string; w: number; stale?: boolean }[] = [];
  for (const h of HIST) {
    if (h.year > s.year) break;
    if (s.year > (h.until ?? h.year) || s.inner.histDone.includes(h.id)) continue;
    if (h.group && s.inner.histDone.some((id) => HIST.find((x) => x.id === id)?.group === h.group)) continue; // 同じ組の事件は 1 人生 1 つ(2026-10-17 Mukkii の作品)
    const vs = h.variants.map((x) => EVENT_BY_ID.get(x.id)!).filter((ev) => eligible(s, ev) && (!s.flags.in_prison || (ev.when ?? []).some((c) => c.includes('prison'))));
    if (!vs.length) continue;
    // 事件そのものは何度出てもよいが、付いている小ネタの版は直近の人生で見ていないものを(第 8 回ペルソナ: 歴史の小ネタが 3 回続けて同じ文)
    const freshV = vs.find((ev) => !s.inner.recent?.includes(ev.id) && !(ev.motif && (s.inner.recent?.includes(`line:motif:${ev.motif}`) || s.inner.motifs?.includes(ev.motif)))); // ネタの型も見る(第 18 回ペルソナ: 年表への反応の型が毎回同じ)
    const v = freshV ?? vs[0];
    const stale = freshV ? 1 : tune<number>('life.recentPenalty') * 4;
    const novelty = !seenHist.has(h.id) ? tune<number>('hist.newBoost') : !seen.has(`${h.id}:${v.id}`) ? tune<number>('hist.newPosBoost') : 0.5;
    // 前に選んだこと(flag)を回収する版なら、ほぼ必ず出す(陣営・全力・闇の誘いの結末)
    const callback = (v.when ?? []).some((c) => c.startsWith('flag.') && !/^flag\.(partner|child|married|sega|ex_sega|ex_prison|real_co)$/.test(c)) && !s.inner.recent?.includes(v.id) ? tune<number>('hist.callbackBoost') : 1; // 状態の印(パートナーがいる等)は回収ではない。直近に見た版は回収でも押さない(第 43 回: 「そこ、弾いて」が 2 人生で一字一句同じ)
    cands.push({ id: v.id, w: (h.weight ?? 1) * novelty * callback * (callback > 1 ? 1 : stale), stale: !freshV && callback === 1 });
  }
  // 直近の人生で見た小ネタしか残っていない年は、無理に出さない(年表には出る。第 9 回ペルソナ: 尽きた年は埋めない方が冷めない)
  if (cands.some((c) => !c.stale)) { for (let i = cands.length - 1; i >= 0; i--) if (cands[i].stale) cands.splice(i, 1); }
  else if (cands.length && s.rng.chance(0.9)) return [];
  if (!cands.length) return [];
  if (s.rng.chance(tune<number>('hist.skip')) && !cands.some((c) => c.w > 20)) return []; // 歴史の事件が自分に降ってこない年もある(回収の版は除く。2026-10-16 Mukkii「ちょっと長い」)
  const n = Math.min(cands.length, s.rng.chance(tune<number>('hist.second')) ? 2 : 1);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const total = cands.reduce((t, c) => t + c.w, 0);
    let x = s.rng.next() * total, k = 0;
    for (; k < cands.length - 1; k++) { x -= cands[k].w; if (x < 0) break; }
    out.push(cands.splice(k, 1)[0].id);
  }
  // 選ばれなかった事件も「この年に過ぎた」扱いにはしない(until までの年でまた候補になる)
  return out;
}

function hasOldWork(s: State) { return s.works.some((w) => s.year - w.year >= 2); }
/** 貯金が貯まったころに来る、人生の出費(2026-10-17 Mukkii「増えたお金がどこかでボーンと減る。お金も一喜一憂のネタに」)。ヒットの多い人はたまにしか来ない */
function moneyShock(s: State) {
  if (s.inner.isPeer || s.flags.in_prison || s.stat.money < 200) return;
  const hits = s.works.filter((w) => w.result === 'hit' || w.result === 'legend').length;
  if (!s.rng.chance(tune<number>('money.shock') * (hits >= 3 ? 0.5 : 1) * (s.stat.money > 1500 ? 1.5 : 1))) return;
  const loss = Math.round(s.stat.money * (tune<number>('money.shockMin') + s.rng.next() * (tune<number>('money.shockMax') - tune<number>('money.shockMin'))) / 10) * 10;
  if (loss <= 0) return;
  s.stat.money -= loss;
  const m = `${loss.toLocaleString('ja-JP')} 万円`, me = `${loss.toLocaleString('en-US')}0,000 yen`;
  const pool: Text[] = [
    { ja: `実家の屋根が台風で飛んだ。直すのに ${m}。屋根屋さんは「ゲームの人? 儲かるんでしょ」と言った。`, en: `A typhoon took the roof off your parents' house. Repairs: ${me}. The roofer said, "Game guy? You must be rolling in it."` },
    { ja: `「絶対に上がる」と言われた投資話に乗った。${m}が、ガチャより早く溶けた。`, en: `You bought into a "can't-lose" investment. ${me} melted faster than a gacha pull.` },
    { ja: `友人の借金の保証人になっていた。友人は消え、請求書だけが届いた。${m}。`, en: `You had co-signed a friend's loan. The friend vanished; the bill did not. ${me}.` },
    { ja: `歯医者で「全部やりましょう」と言われた。全部やった。${m}。噛み合わせは完璧になった。`, en: `The dentist said, "Let's do all of it." You did all of it. ${me}. Your bite is now perfect.` },
    { ja: `車が止まった。直すより買う方が安いと言われ、買った。${m}。前の車にはまだ 3 年分のローンが残っていた。`, en: `The car died. Cheaper to buy than fix, they said. ${me}. The old car still had three years of loan on it.` },
    { ja: `税務署から封筒。去年のヒットの分を、まとめて払うことになった。${m}。ヒットは 2 回来る。2 回目は請求書で。`, en: `An envelope from the tax office: last year's success, due all at once. ${me}. A hit comes twice. The second time, as a bill.` },
    { ja: `親の入院と介護が重なった。${m}が出ていった。お金の話をしたのは、その年がいちばん多かった。`, en: `A parent's hospital stay and care came at once. ${me} went out. You never talked about money more than that year.` },
    { ja: `昔のゲーム機を「資料」として集め始めたら止まらなくなった。${m}。押し入れはもう閉まらない。`, en: `You started collecting old consoles "for research" and couldn't stop. ${me}. The closet no longer closes.` },
    { ja: `引っ越した。敷金、礼金、新しい机、新しい椅子。気づけば ${m}。仕事は前と同じ机の上でした方がはかどった。`, en: `You moved. Deposit, key money, a new desk, a new chair: ${me} before you knew it. You worked better at the old desk.` },
    { ja: `自分のゲームを作るための機材を一式そろえた。${m}。1 年たって、主に動画を見る機械になっている。`, en: `You bought a full rig to make your own game. ${me}. A year later, it's mostly for watching videos.` },
  ];
  // 半分は前向きな使い道(2026-10-17 Mukkii「損してばっかりは嫌。家を買った、豪華な結婚式、みたいなポジティブな出費も」)
  const kid = s.inner.childYear ? s.year - s.inner.childYear : -1;
  const good: [boolean, Text, (() => void)?][] = [
    [s.age >= 30, { ja: `家を買った。頭金で ${m}。玄関の横に、ゲーム部屋だけは譲らなかった。`, en: `You bought a house. ${me} for the down payment. The game room by the entrance was non-negotiable.` }],
    [!!s.flags.partner && !s.flags.lv_married, { ja: `結婚式をやった。豪華にやった。${m}。余興は同僚が作った専用ゲームで、新郎新婦がラスボスだった。`, en: `You had the wedding. A lavish one. ${me}. The entertainment was a game your coworkers made, with the couple as the final boss.` }, () => { s.flags.lv_married = true; }],
    [kid >= 15 && kid <= 22, { ja: `子どもの学費を払った。${m}。入学式の帰り、子どもが「親のゲームで勉強した」と言った。受験に出たらしい。`, en: `You paid your kid's tuition. ${me}. After the ceremony, your kid said they'd studied with your game. It came up on the exam, apparently.` }],
    [!s.flags.father_gone || !s.flags.mother_gone, { ja: `親を温泉旅行に連れていった。少しいい宿にした。${m}。親は宿のゲームコーナーで、あなたの昔のゲームを探していた。`, en: `You took your parents to a hot-spring inn. A nice one. ${me}. They spent the trip looking for your old game in the inn's arcade corner.` }],
    [true, { ja: `ずっと欲しかった筐体を買った。${m}。リビングの真ん中に置いた。家族会議は 3 時間かかったが、勝った。`, en: `You finally bought the arcade cabinet you'd always wanted. ${me}. It sits in the middle of the living room. The family meeting took three hours. You won.` }],
    [true, { ja: `仕事を 1 か月休んで、世界中のゲーム博物館を回った。${m}。帰りの飛行機で、次のゲームの案が 3 つできた。`, en: `You took a month off to visit game museums around the world. ${me}. Three ideas for your next game were ready by the flight home.` }],
    [s.works.length >= 3, { ja: `母校に、生徒が自由に使える開発用のパソコンを 20 台寄付した。${m}。卒業生の欄に、自分の作品名が並んだ。`, en: `You donated 20 dev PCs to your old school. ${me}. Your game titles now hang under the alumni plaque.` }],
    [true, { ja: `防音の作業部屋を作った。${m}。誰にも邪魔されない部屋で、最初にしたのは昼寝だった。`, en: `You built a soundproof workroom. ${me}. The first thing you did in it, undisturbed, was take a nap.` }],
  ];
  const said = (s.inner.saidLines ??= []);
  const goods = good.map((g, i) => [g, i] as const).filter(([g, i]) => g[0] && !said.includes(`moneygood:${i}`)); // 番号で覚える(額が毎回違うので文では覚えられない)
  if (goods.length && s.rng.chance(0.6)) {
    const fresh = goods.filter(([, i]) => !s.inner.recent?.includes(`line:moneygood:${i}`));
    const [g, i] = s.rng.pick(fresh.length ? fresh : goods);
    said.push(`moneygood:${i}`); g[2]?.(); const t = g[1];
    s.stat.passion = clamp(s.stat.passion + 6);
    log(s, t, 'event', ['money', 'high']);
    return;
  }
  const bads = pool.map((t, i) => [t, i] as const).filter(([, i]) => !said.includes(`moneyshock:${i}`));
  const bf = bads.filter(([, i]) => !s.inner.recent?.includes(`line:moneyshock:${i}`));
  const [bt, bi] = s.rng.pick(bf.length ? bf : bads.length ? bads : pool.map((t, i) => [t, i] as const));
  said.push(`moneyshock:${bi}`);
  log(s, bt, 'event', ['money']);
}

function canPromote(s: State) {
  if (s.flags.sub_ceo || s.flags.own_co) return false; // 子会社の社長・自分の会社の人は昇進しない(第 62 回: 社長なのに「昇進した」)
  if (s.inner.companyYears < 3 || s.age < 26) return false;
  if (s.job === 'qa') return s.stat.skill >= 35;
  if (s.job === 'director') return s.stat.skill >= 70 && s.stat.network >= 50 && s.age >= 38;
  if (s.job === 'producer' || s.job === 'other') return false;
  return s.stat.skill >= 55 && s.stat.network >= 25;
}

function runQueue(s: State, out: string[]) {
  while (s.inner.queue.length && !s.choice && !s.ending) {
    const id = s.inner.queue.shift()!;
    runItem(s, id, out);
    checkEnd(s, out);
  }
}

function runItem(s: State, id: string, out: string[]) {
  const r = s.rng;
  if (id.startsWith('@end:')) return end(s, id.slice(5) as EndingId, out);
  if (id === '@release') {
    if (s.status !== 'employed' && s.status !== 'indie' || s.flags.in_prison || s.inner.queue.some((q) => !!EVENT_BY_ID.get(q)?.effect?.flag?.do_prison)) return; // 判決の年は発売しない(第 35 回: 実刑の年にリードで発売)
    if (s.flags.callcenter) { s.inner.nextWorkYear = s.year + 1; return; } // カスタマーセンターにいる間は作品を出さない(第 12 回ペルソナ)
    const { line, work } = release(s);
    log(s, line, 'work'); out.push('work');
    if (work.result === 'hit' || work.result === 'legend') s.inner.highs.push({ year: s.year, age: s.age, text: { ja: `${work.name.ja}が${RESULT_TEXT[work.result].ja}になった`, en: `${work.name.en} became a ${RESULT_TEXT[work.result].en.toLowerCase()}` }, w: (work.result === 'legend' ? 9 : 4) + s.rng.next(), kind: 'work' });
    s.inner.nextWorkYear = s.year + r.int(tune('work.everyMin'), tune('work.everyMax'));
    s.flags.mega_project = false;
    return;
  }
  if (id === '@check65') { if (s.stat.hp < 40) end(s, 'end_retire', out); return; }
  if (id === '@search') {
    if (s.flags.in_prison) return; // 年の初めに積んだ就職活動でも、その年に実刑になったら塀の中(第 29 回: 判決の直後に任天堂へ再就職)
    // 業界に入って数年は拾ってもらいやすい(第 11 回ペルソナ: 25 歳で作品ゼロのまま業界を去る人生が続いた)
    const p = tune('job.rehire') + (s.stat.skill + s.stat.network) / 250 + (s.year - s.startYear < 6 ? 0.4 : 0);
    if (r.chance(p)) {
      const size: CompanySize = s.stat.skill >= 65 ? r.pick(['big', 'mid'] as const) : r.pick(['mid', 'small', 'sub', 'sub'] as const);
      s.company = newCompany(r, size, s.year, [...(s.inner.deadCos ?? []), s.company.id]); s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0;
      logEvent(s, 'ev_sys_rehired', 'event'); apply(s, EVENT_BY_ID.get('ev_sys_rehired')?.effect, id, out);
      s.inner.nextWorkYear = s.year + r.int(1, 3);
    } else { s.inner.searchFails++; const f = vary(s, ['ev_sys_search_fail', 'ev_sys_search_fail_b', 'ev_sys_search_fail_c']); s.inner.uses[f] = (s.inner.uses[f] ?? 0) + 1; logEvent(s, f, 'event'); apply(s, EVENT_BY_ID.get(f)?.effect, id, out); }
    out.push('event');
    return;
  }
  if (id === '@rehire_offer') return runItem(s, vary(s, ['ev_sys_indie_offer', 'ev_sys_indie_offer_b']), out); // 独立中にお金が尽きかけたら、会社員に戻る誘い

  const ev = EVENT_BY_ID.get(id);
  if (!ev) return;
  if (ev.years && (s.year < ev.years[0] || s.year > ev.years[1])) return;
  if (ev.once && s.inner.used.includes(ev.id)) return;
  // 爆死した作品を、てっぺんの話で急にヒットにしない(第 13 回ペルソナ: 中古 50 円の作品が 2 年後に社会現象)
  if (ev.effect?.work?.last?.result && (s.works[s.works.length - 1]?.result === 'flop' || s.year - (s.works[s.works.length - 1]?.year ?? s.year) > 1)) return; // 何年も前の作品を、理由もなく急にヒットにしない(第 21 回)
  // 1 年に会社が 2 回変わらない(第 13 回ペルソナ: 地元に帰って会社を作った同じ年に、別の会社に拾われる)
  const moves = (x: { flag?: Record<string, boolean> } | undefined) => Object.keys(x?.flag ?? {}).some((f) => ['do_change_company', 'do_go_indie', 'do_join_sega', 'life_abroad', 'went_abroad'].includes(f));
  if ((moves(ev.effect) || ev.choices?.some((c) => moves(c.effect))) && s.companies.length > 1 && s.companies[s.companies.length - 1].year === s.year) return;
  if (/^ev_(sys_promote|wk_promote_ask)/.test(ev.id) && (s.status !== 'employed' || s.companies[s.companies.length - 1].year === s.year || Object.entries(s.inner.seen).some(([k, y]) => /^ev_(sys_promote|wk_promote_ask)/.test(k) && s.year - y < 4))) return; // 昇進は 4 年に 1 回まで(第 58 回: 2 年続けて昇進) // 辞めた・移った年に昇進しない(第 48 回: 独立した年に「人の給料を決める側に回った」)
  if (ev.id.startsWith('ev_sys_bankrupt') && (s.companies[s.companies.length - 1].year === s.year || COMPANIES.real.some((c) => c.id === s.company.id))) return; // 年の初めに決まった倒産でも、その年に移った先(セガなど)は潰さない(第 20 回)
  if (s.companies.length > 1 && s.companies[s.companies.length - 1].year === s.year && /に拾われ|に入った|に移った|に転職|に入社|に再就職|社員 ?\d+ 人の会社を売/.test([ev.text, ...(ev.alt ?? [])].map((x) => x.ja).join(" "))) return; // 移った年に、本文だけでまた移る話を出さない(第 20 回: 1 年に 3 社)
  // 同じ後日談は 1 人生に 1 回(第 12 回ペルソナ: 「コンシューマに残った」が選択なしで 2 回)
  if (((ev.weight ?? 1) === 0 || ev.tag?.includes('followup')) && s.inner.seen[ev.id] !== undefined && !ev.tag?.includes('repeatable') && !/^ev_(fa|rv|mt|me|sys)_/.test(ev.id)) return;
  if (ev.id === 'ev_wk_fu_callcenter') s.flags.callcenter = false; // 開発に戻る
  // 選択の後日談(weight 0 で later から来る話)は、直近の人生で見ていたら 7 割で出さない(長い話の続き・大作の結末は除く)
  if ((ev.weight ?? 1) === 0 && !ev.tag?.some((t) => t === 'mega' || t === 'rival') && !/^ev_(fa|rv|mt|me|sys|ai26)_/.test(ev.id) && s.inner.recent?.includes(ev.id) && r.chance(0.7)) return; // 仕組みの話(2027 年の区切りなど)は落とさない(第 26 回: 区切りが 2034 年までずれて 7 年空いた)
  if (ev.when && !ev.when.every((c) => test(s, c))) return; // 同じ年のうちに独立・転職・服役した時は出さない
  if (s.flags.in_prison && ev.id !== 'ev_sys_shift' && !ev.id.startsWith('ev_ai26_') && !ev.id.includes('prison') && !(ev.when ?? []).some((c) => c.includes('prison'))) return; // 塀の中に社内の話は届かない
  // 後日談: 発売から 2 年以上たった作品を 1 本選ぶ
  s.inner.workTarget = -1;
  if (ev.tag?.includes('afterlife')) {
    // 運営型の話(サービス終了・ガチャ…)は、配信の作品にだけ(第 7 回ペルソナ: DS や Wii のパッケージに「排出率が全部 100%」)
    const online = /サービス終了|排出率|ガチャ|運営|ログイン/.test(ev.text.ja);
    // 箱のある話(未開封・見本盤・中古・ワゴン …)は、配信だけの作品には付けない(第 11 回ペルソナ: ケータイアプリの未開封品が 80 万円)
    const boxed = /未開封|見本盤|中古|ワゴン|カートリッジ|押し入れ|箱|棚|パッケージ|説明書|箱絵/.test(ev.text.ja);
    const digital = (w: { platform: string }) => /スマホ|ケータイ|ソシャゲ|ブラウザ|オンライン|AI クラウド|Steam|itch|Flash|iPhone/.test(w.platform);
    const allTx = [ev.text, ...(ev.alt ?? [])].map((x) => x.ja).join(' ');
    const bad = /クソゲー|爆死|ワゴン|投げ売り/.test(allTx), good = /名作|大ヒット|伝説|殿堂(?!入りを果たし)|同じハードに|続編|リマスター|父と遊んだ|親子で/.test(allTx) && !bad; // 爆死した作品を新しいハードに出し直さない(第 38 回)
    const hitW = (w: { result: string }) => w.result === 'hit' || w.result === 'legend';
    const gen = /父と遊んだ|親子で|いまは息子|いまは娘/.test(allTx); // 親子二代の話は 15 年以上前の作品だけ(第 43 回: 1 年前の作品で「父と遊んだ」)
    const old = s.works.map((w, i) => [w, i] as const).filter(([w]) => s.year - w.year >= (gen ? 15 : bad ? 4 : 2) && (!online || digital(w)) && (!boxed || !digital(w)) && (!bad || !hitW(w)) && (!good || hitW(w)) && !(w.platform === '業務用' && /ワゴン|店頭|店に並|\d+ ?本|万本|携帯機|中古屋|古物屋|ダウンロード版/.test(allTx)) /* 業務用の基板は店で売らない(第 52 回) */ && !(/同じハードに/.test(allTx) && /スマホ|ケータイ|ソシャゲ|ブラウザ|iPhone/.test(w.platform)) && !(/日本で \d+ 本/.test(allTx) && hitW(w)) && !(/サービス終了|配信を止め|配信停止/.test(ev.text.ja) && w.history.some((h) => (h as { key?: string }).key === 'eos'))); // ヒット作をクソゲー扱いしない・普通の作品を名作扱いしない(第 21 回)
    if (!old.length) return;
    s.inner.workTarget = r.pick(old)[1];
  }
  if (/\{other\}/.test(ev.text.ja) && !s.inner.others?.length) return; // 他の人の名前が無い時に「知人が」で出さない(第 28 回)
  if ((s.flags.callcenter || s.status === 'left') && !/^ev_(sys|fa|rv|mt|me)_/.test(ev.id) && !ev.tag?.some((t) => t === 'system' || t === 'hist' || t === 'chain' || t === 'big_after' || t === 'followup') && !(ev.when ?? []).some((c) => /callcenter|status|pos=/.test(c)) && /マスターアップ|締め切り|隣の席|社内|会議室|会議で|続編を|カード絵|(?<!元)課長|(?<!元)部長|(?<!元)上司|仕様書|企画会議|チームの/.test(ev.text.ja)) return; // 電話の窓口・失業中に開発の席の話を出さない(第 49 回: カスタマーセンターで「今の作品はマスターアップ直前」、失業中に「隣の席の 4 人」)
  if (!/^ev_(sys|fa|rv|mt|me|ai26|aiq)_/.test(ev.id) && !ev.choices && !ev.tag?.some((t) => t === 'chain' || t === 'followup' || t === 'big_after') && s.log.filter((l) => l.year === s.year && l.kind !== 'timeline').length >= 5) return; // 1 年に 5 行まで(2026-10-16 Mukkii「ちょっと長い」で 8 → 6)(自動点検: 1 年に 9〜12 行の年が 1 組に 1.5 回)
  if (s.status === 'indie' && !/^ev_(sys|fa|rv|mt|me)_/.test(ev.id) && !ev.tag?.some((t) => t === 'chain' || t === 'followup' || t === 'big_after' || t === 'timeline') && !(ev.when ?? []).some((c) => /status|pos=|own_co/.test(c)) && /出社|送別会|定年|会社に着|通勤|社員証|人事|社長は|おかえり|隣の部署|うちの部長|課長|チーム全員|法務の|絵描きが|休日出勤|会社の単三|会社の備品/.test(ev.text.ja)) return; // ひとりで作っている間に「最後の出社」「送別会」を出さない(第 51 回)
  if ((s.company.id === 'co_sony' || s.company.id === 'co_nintendo' || (s.company.id === 'co_sega' && s.year < 2001)) && (/^ev_hw_(?!fu)/.test(ev.id) || (ev.choices ?? []).some((c) => Object.keys(c.effect?.flag ?? {}).some((f) => /^(hw_|bet_)/.test(f))))) return; // ハードを作る会社の社員に、よその機械に賭ける選択を出さない(第 59 回: セガの社員がピピン、任天堂の社員が CD の陣営・Vita)
  if (s.job === 'teacher' && !ev.tag?.some((t) => t === 'teach' || t === 'teacher' || t === 'system') && !ev.id.startsWith('ev_sys_') && !(ev.when ?? []).some((c) => c.includes('teacher')) && /発売|作品|開発|マスター|チーム|社内|会議|企画|締め切り|仕様/.test(ev.text.ja)) return; // 先生になった後に開発の話を出さない(第 36 回: 塾の講師になって 5 年「開発者の幽霊」)
  if (ev.choices && isHwChoice(ev)) { if (s.inner.lastHwChoice !== undefined && s.year - s.inner.lastHwChoice < 3) return; s.inner.lastHwChoice = s.year; } // どの機械に付くかの選択は 3 年に 1 回まで(2026-10-16「ちょっと長い」で 2 → 3)(第 23 回: DS か PSP かが同じ年に 2 回、ドリキャスが 2 年続けて)
  if (ev.choices && ev.motif && s.inner.motifs?.includes(ev.motif)) return; // 年の初めに積んだ選択でも、同じ年に同じ型の選択が先に出ていたら出さない(第 20 回: ソシャゲに行くかが 1 年に 2 回)
  const hs = HIST_OF.get(ev.id);
  if (hs) { if (s.inner.histDone.includes(hs)) return; s.inner.histDone.push(hs); s.chronicle.push(`${hs}:${ev.id}`); }
  if (ev.once || ev.id.startsWith('ev_sys_')) s.inner.used.push(ev.id);
  s.inner.seen[ev.id] = s.year;
  s.inner.uses[ev.id] = (s.inner.uses[ev.id] ?? 0) + 1;
  if (ev.motif) { (s.inner.motifs ??= []).push(ev.motif); (s.inner.saidLines ??= []).push(`motif:${ev.motif}`); }
  if (ev.motifAll) { (s.inner.motifs ??= []).push(...ev.motifAll); (s.inner.saidLines ??= []).push(...ev.motifAll.map((m) => `motif:${m}`)); }
  count(s, ev);
  if (ev.id.startsWith('ev_sys_promote')) promote(s);
  if (ev.id.startsWith('ev_sys_bankrupt')) (s.inner.deadCos ??= []).push(s.company.id);
  if (ev.id === 'ev_sys_prison_out') { s.stat.money = Math.max(s.stat.money, 50); s.flags.ex_prison = true; } // 出所したら借金は帳消しで再起(罰金・没収は判決で済んでいる)
  if (ev.id.startsWith('ev_sys_offer')) s.inner.seen.ev_sys_offer = s.year; // 言い回し違いの版も同じ 4 年の間隔に数える
  if (ev.choices) {
    s.choice = { eventId: ev.id, choices: ev.choices.map((c) => ({ ...c, label: fill(s, c.label) })), text: fill(s, evText(s, ev)) };
    log(s, s.choice.text, 'event', ev.tag); if (hs) s.log[s.log.length - 1].hist = hs;
    out.push('choice');
    return;
  }
  log(s, fill(s, evText(s, ev)), ev.tag?.includes('afterlife') ? 'work' : 'event', ev.tag);
  if (hs) s.log[s.log.length - 1].hist = hs;
  if (ev.tag?.includes('afterlife')) out.push('work'); else out.push('event');
  remember(s, ev, ev.memory);
  apply(s, ev.effect, ev.id, out, ev.cause);
  schedule(s, ev.later);
  s.inner.workTarget = -1;
}

/** テンションが上がった瞬間を覚えておく(最後の 1 行に使う)。ファン・ライバルの筋の結末がいちばん(第 21 回: 筋を回収せずにテレビに 4 秒映った話で締めた) */
function remember(s: State, ev: GameEvent, memory?: Text) {
  const t = ev.tag ?? [];
  const w = /^ev_(fa|rv)_5/.test(ev.id) || (t.includes('chain') && t.includes('high')) ? 7 : /^ev_(fa|me)_4/.test(ev.id) ? 6 : t.includes('chain') && t.includes('followup') && !/whatif/.test(ev.id) ? 5 : /* 連鎖の途中の回も、その人生の柱として締めの候補に(第 48 回: 眠い村人・聖地の町が締めで拾われない) */ t.includes('peak') ? 6 : t.includes('bond') ? 5 : t.includes('warm') ? 4 : t.includes('celeb') ? 3 : t.includes('high') ? 2 : 0;
  if (!w && !memory) return;
  const first = (x: string, sep: RegExp) => x.split(sep)[0];
  const text = memory ? fill(s, memory) : (() => { const f = s.log[s.log.length - 1]?.text ?? fill(s, ev.text); return { ja: first(f.ja, /。/), en: first(f.en, /\. /) }; })();
  const kind = w === 7 ? 'arc' : t.includes('peak') ? 'peak' : t.includes('bond') || t.includes('celeb') ? 'celeb' : t.includes('warm') || t.includes('life') ? 'warm' : 'high';
  s.inner.highs.push({ year: s.year, age: s.age, text, w: (w || 2) + s.rng.next(), kind });
}

function promote(s: State) {
  const to: Partial<Record<Job, Job>> = { ta: 'director', qa: 'planner', programmer: 'director', planner: 'director', artist: 'director', sound: 'director', sales: 'producer', director: 'producer' };
  const next = to[s.job];
  if (next) { s.job = next; const jn = JOB_TEXT[next]; const last = s.log[s.log.length - 1]; if (last && last.year === s.year && last.kind !== 'timeline') last.text = { ja: `${last.text.ja}名刺の職種は「${jn.ja}」になった。`, en: `${last.text.en} Your card now says "${jn.en}."` }; else log(s, { ja: `名刺の職種の欄が「${jn.ja}」になった。`, en: `Your business card now says "${jn.en}."` }, 'event'); /* 昇進の行に職種を足す(第 62 回: 「職種が変わった」と「昇進した」の 2 行が毎回続いた) */ } // 職種が変わったことを書く(第 60 回: 営業なのに「あなたはリード」)
  s.flags.promoted = true;
}

function endYear(s: State, out: string[]) {
  const r = s.rng;
  // 作品棚: 発売後に勝手に起きること
  for (const { text } of tickWorks(s)) { log(s, text, 'work', ['afterlife']); out.push('work'); }
  // 毎年の変化
  // 体力は毎年いくらか戻る(戻る上限は年齢で下がる)。徹夜が続くと戻りきらない
  const cap = 100 - Math.max(0, s.age - 18) * tune('year.hp') * (s.age >= 40 ? 1.5 : 1);
  if (s.stat.hp < cap) s.stat.hp = clamp(s.stat.hp + (cap - s.stat.hp) * tune('year.hpRegen') + (s.status === 'left' ? 5 : 0));
  if (s.status === 'employed' || s.status === 'indie') {
    s.stat.hp = clamp(s.stat.hp - tune('year.hpWork') * (s.age >= 45 ? 1.5 : 1));
    s.stat.passion = clamp(s.stat.passion - tune('year.passion'));
    s.stat.skill = clamp(s.stat.skill + r.int(tune('year.skillMin'), tune('year.skillMax')) * (s.age >= 50 ? 0.5 : 1));
  }
  if (s.status === 'employed') {
    const mult = { big: 1.5, mid: 1, small: 0.8, sub: 0.5, abroad: 1.6, indie: 0, school: 0.9, none: 0 }[s.company.size] * (s.job === 'director' || s.job === 'producer' ? 1.4 : 1) * (s.flags.rehired || s.flags.parttime ? 0.4 : 1);
    s.stat.money += Math.round(tune('year.salary') * mult);
    s.inner.companyYears++;
  } else if (s.status === 'indie') s.stat.money -= tune('year.indieCost');
  else if (s.status === 'left' && s.job !== 'other') s.stat.money -= tune('year.leftCost');
  moneyShock(s);
  checkEnd(s, out);
  // 同期
  if (!s.inner.isPeer) peersYear(s, out);
  if (s.ending) return;
  s.year++; s.age++;
  out.push('year');
}

// ---- 同期 3 人(bots.ts のボットで並走。PLAN §2 の 4) ----
function peerSummary(p: State): Text {
  if (p.ending) return p.ending.cause;
  const j = JOB_TEXT[p.job];
  if (p.status === 'indie') return { ja: `独立して${p.company.name.ja}`, en: `Indie: ${p.company.name.en}` };
  if (p.status === 'left') return { ja: p.job === 'other' ? `${p.inner.otherJob?.ja ?? '別の仕事'}で働いている` : '求職中', en: p.job === 'other' ? `Working at a ${p.inner.otherJob?.en ?? 'job'}` : 'Job hunting' };
  return { ja: `${p.company.name.ja}の${j.ja}`, en: `${j.en} at ${p.company.name.en}` };
}
function peersYear(s: State, out: string[]) {
  let said = false; // 同期の話は 1 年に 1 本まで(うるさくしない)
  s.inner.peerStates.forEach((p, i) => {
    if (p.ending) return;
    const before = { works: p.works.length, status: p.status, job: p.job };
    const bot = BOTS[p.inner.bot] ?? BOTS.think;
    let guard = 0;
    advance(p);
    while (p.choice && guard++ < 10) choose(p, bot(p, p.choice.choices));
    const nm = p.name.ja.split(' ')[0], en = p.name.en.split(' ').slice(-1)[0];
    const newHit = p.works.slice(before.works).find((w) => w.result === 'hit' || w.result === 'legend');
    let line: Text | null = null;
    const pe = p.ending as State['ending'];
    // 同期の話は種類ごとに回数を絞る(ヒット 2・独立と昇進は 1 人 1 回・塀の中は 1 人生 1 回)。言い回しも変える
    const pc = (s.inner.peerTold ??= {});
    const ok = (k: string, max: number) => (pc[k] ?? 0) < max;
    const said1 = (k: string) => { pc[k] = (pc[k] ?? 0) + 1; };
    const hitL: [string, string][] = [
      [`同期の${nm}の${newHit?.name.ja}が${newHit ? RESULT_TEXT[newHit.result].ja : ''}。飲み会でずっとその話をしていた。`, `Your peer ${en}'s ${newHit?.name.en} was a hit. It was all they talked about at drinks.`],
      [`同期の${nm}の${newHit?.name.ja}が売れた。${s.year < 1996 ? 'お祝いの手紙' : 'お祝いのメール'}に「おめでとう」と書いて、3 回消して、また書いた。`, `Your peer ${en}'s ${newHit?.name.en} sold well. You typed "congrats", deleted it three times, and typed it again.`],
      [`同期の${nm}の${newHit?.name.ja}が売れた。店で平積みになっているのを見て、1 本だけ向きを直してから帰った。`, `Your peer ${en}'s ${newHit?.name.en} sold well. You saw it stacked in a shop, straightened one copy, and left.`],
      [`同期の${nm}の${newHit?.name.ja}がヒット。社内報の表紙に載った。あなたは同じ号の 14 ページ目、「今月の誕生日」の欄にいた。`, `Your peer ${en}'s ${newHit?.name.en} was a hit and made the cover of the company newsletter. You were on page 14 of the same issue, under "birthdays this month".`],
      [`同期の${nm}の${newHit?.name.ja}が売れた。親戚の集まりで「あの子、すごいのね」と言われた。あなたの話は出なかった。`, `Your peer ${en}'s ${newHit?.name.en} sold well. At a family gathering, a relative said: "That one's really something." You didn't come up.`],
      [`同期の${nm}の${newHit?.name.ja}がヒット。こっそり買って、こっそり最後まで遊んだ。悔しいが、面白かった。`, `Your peer ${en}'s ${newHit?.name.en} was a hit. You bought it quietly and played it to the end quietly. Annoyingly, it was good.`],
    ];
    if (pe && pe.id === 'end_restart' && !ok('restart', 1)) line = null; // 2027 年の区切りで同期が一斉に終わるのは 1 人だけ伝える
    else if (pe && pe.id === 'end_restart') { said1('restart'); line = freshLine(s, [{ ja: `同期の${nm}も、AI の騒ぎの中で次の一歩を決めたらしい。年賀状に「まだやる」とだけあった。`, en: `Your peer ${en} chose a next step amid the AI upheaval too. Their New Year card said only: "Still at it."` }, { ja: `同期の${nm}から久しぶりに電話。「お前はどうする」。答える前に、向こうが自分の答えを 30 分しゃべった。`, en: `A call from your peer ${en}, first in ages: "What are you doing?" Before you could answer, they talked about their own plan for thirty minutes.` }], 'peerrestart'); }
    else if ((pe && /arrest|prison/.test(pe.id) || p.status !== before.status && p.flags.in_prison) && ok('prison', 1) && s.inner.recent?.some((x) => x.startsWith('line:peerprison')) && s.rng.chance(0.8)) { said1('prison'); line = null; } // 直近の人生で同期の逮捕を伝えていたら、今回はたいてい伝えない(第 21 回: 3 人生とも同期が逮捕)
    else if (pe && !ok(`left${i}`, 1)) line = null; // 業界を離れたと伝えた同期の 2 度目の知らせは出さない(第 38 回: 同じ同期が 2 回実家の農業へ)
    else if (pe && /arrest|prison/.test(pe.id) && !ok('prison', 1)) line = null; // 第 19 回: 同期が捕まった知らせが 2 回
    else if (pe) { if (/arrest|prison/.test(pe.id)) { said1('prison'); (s.inner.saidLines ??= []).push('peerprison:end'); /* 次の人生で「直近に同期の逮捕を伝えた」と分かるように */ } line = { ja: `同期の${nm}の知らせ。${pe.cause.ja.replace(/^\d+ 歳、/, '')}。`, en: `News of your peer ${en}: ${pe.cause.en.replace(/^At \d+, /, '')}.` }; }
    else if (newHit && ok('hit', 1) && !(s.inner.recent?.some((x) => x.startsWith('line:peerhit')) && s.rng.chance(0.5)) && !p.flags.in_prison && !p.flags.ex_prison && !s.works.some((w) => w.name.ja === newHit.name.ja) && (newHit.result === 'legend' || s.rng.chance(0.4))) { line = freshLine(s, hitL.map(([ja, enT]) => ({ ja, en: enT })), 'peerhit'); said1('hit'); }
    else if (p.status !== before.status && p.status === 'indie' && !p.flags.ex_prison && ok('indie', 1)) { said1('indie'); line = freshLine(s, [{ ja: `同期の${nm}が独立した。名刺の肩書きは「CEO」。社員は本人だけ。`, en: `Your peer ${en} went indie. Business card: "CEO." Staff: one.` }, { ja: `同期の${nm}が会社を辞めて、自分のスタジオを作った。開業祝いに観葉植物を贈ったら、社員より大きかった。`, en: `Your peer ${en} quit to start a studio. The potted plant you sent as a gift was bigger than the staff.` }, { ja: `同期の${nm}が独立した。最初の作品の告知は、あなたにだけ 1 日早く届いた。`, en: `Your peer ${en} went indie. The announcement of their first game reached you a day before anyone else.` }], 'peerindie'); }
    else if (p.job !== before.job && (p.job === 'director' || p.job === 'producer') && !p.flags.ex_prison && !p.flags.in_prison && ok('promo', 1) && !(s.inner.recent?.some((x) => x.startsWith('line:peerpromo')) && s.rng.chance(0.7))) { said1('promo'); line = freshLine(s, [{ ja: `同期の${nm}が${JOB_TEXT[p.job].ja}に昇進した。あなたより先に。`, en: `Your peer ${en} was promoted to ${JOB_TEXT[p.job].en}. Before you.` }, { ja: `同期の${nm}の名刺に「${JOB_TEXT[p.job].ja}」と入った。もらった名刺は、引き出しの一番奥にしまった。`, en: `Your peer ${en}'s new card read "${JOB_TEXT[p.job].en}." You filed it at the very back of your drawer.` }, ...(s.status === 'employed' && !s.flags.promoted && !s.flags.sub_ceo && !['director', 'producer'].includes(s.job) ? [{ ja: `同期の${nm}が${JOB_TEXT[p.job].ja}になった。お祝いの寄せ書きに「次は自分」と書いた。誰も笑わなかった。`, en: `Your peer ${en} became ${JOB_TEXT[p.job].en}. On the congratulations card you wrote "I'm next." Nobody laughed.` }] : [])], 'peerpromo'); }
    else if (p.status !== before.status && p.flags.in_prison && ok('prison', 1)) { said1('prison'); line = freshLine(s, [{ ja: `同期の${nm}が塀の中へ。差し入れにゲーム雑誌を送った。付箋だらけで返ってきた。`, en: `Your peer ${en} went to prison. You sent game magazines. They came back covered in sticky notes.` }, { ja: `同期の${nm}が捕まったとニュースで知った。写真が新人研修の時のものだった。あの頃の顔だった。`, en: `You learned from the news that ${en} had been arrested. The photo was from your rookie training days.` }, { ja: `同期の${nm}が逮捕された。${s.year >= 2012 ? '同期のグループチャット' : '同期の電話の回し合い'}が 3 日だけ静かになり、4 日目に誰かが「差し入れ、何がいい?」と${s.year >= 2012 ? '書いた' : '言った'}。`, en: `Your peer ${en} was arrested. The peer group chat went quiet for three days. On the fourth, someone wrote: "What should we send them?"` }], 'peerprison'); }
    else if (p.status !== before.status && p.status === 'left' && p.job === 'other' && !p.flags.in_prison && !p.flags.ex_prison && p.inner.otherJob?.ja !== '塀の中') { said1(`left${i}`); line = { ja: `同期の${nm}が業界を離れ、${p.inner.otherJob?.ja ?? '別の仕事'}へ。年賀状の写真が明るくなった。`, en: `Your peer ${en} left the industry for a ${p.inner.otherJob?.en ?? 'new job'}. Their New Year card looks happier.` }; }
    s.peers[i].summary = peerSummary(p);
    if (s.inner.rival && i === 1) line = null; // ライバルの筋は arcs.json だけで語る(同期の知らせが混ざると筋が壊れる)
    if (s.flags.in_prison) line = null;
    if (line && (p.flags.in_prison || p.flags.ex_prison) && !/塀|捕ま|逮捕|差し入れ/.test(line.ja)) line = null; // 捕まった同期のその後は、何事も無かったようには語らない
    if (line && (!said || pe)) { said = true; log(s, line, 'peer'); out.push('peer'); }
  });
}

// ---- 公開の口 ----
/** 1 年進める。選択が出たら state.choice が埋まり 'choice' を返す。終われば 'ended' */
export function advance(s: State): string[] {
  const out: string[] = [];
  if (s.ending || s.choice) return out;
  if (!s.inner.queue.length) beginYear(s, out);
  runQueue(s, out);
  if (!s.choice && !s.ending && !s.inner.queue.length) endYear(s, out);
  return out;
}

/** 選択を適用して、その年の続きを進める */
export function choose(s: State, choiceId: string): string[] {
  const out: string[] = [];
  if (!s.choice) return ['invalid'];
  const c: Choice | undefined = s.choice.choices.find((x) => x.id === choiceId);
  if (!c) return ['invalid'];
  const eventId = s.choice.eventId;
  s.choice = undefined;
  s.inner.choicesMade++;
  log(s, fill(s, c.alt?.length ? freshLine(s, [c.result ?? c.label, ...c.alt]) : c.result ?? c.label), 'choice', ['choice']);
  out.push('chosen');
  const cev = EVENT_BY_ID.get(eventId);
  if (cev && (c.memory || cev.memory || (cev.tag ?? []).some((t) => t === 'high' || t === 'celeb'))) remember(s, cev, c.memory ?? cev.memory);
  apply(s, c.effect, eventId, out, c.cause ?? cev?.cause);
  schedule(s, c.later);
  s.inner.workTarget = -1;
  checkEnd(s, out);
  runQueue(s, out);
  if (!s.choice && !s.ending && !s.inner.queue.length) endYear(s, out);
  return out;
}

/** 最後まで自動で進める(sim・テスト用)。bot は選択肢から ID を返す関数 */
export function runToEnd(s: State, bot: (s: State, c: Choice[]) => string, limit = 200): State {
  for (let i = 0; i < limit && !s.ending; i++) {
    advance(s);
    let g = 0;
    while (s.choice && g++ < 10) choose(s, bot(s, s.choice.choices));
  }
  return s;
}

// ---- 他の人の人生(サーバーの記録)----
/** その年に業界にいる誰かを 1 人選び、自分との関係(先輩・同期・後輩・記事・引退の噂)で 1 行にする */
function otherLine(s: State, r: Rng): Text | null {
  // 同じ人は 1 人生に 1 回だけ(引退の噂だけはもう 1 回)
  const seen = (s.inner.othersSeen ??= []);
  const live = (s.inner.others ?? []).filter((o) => o.startYear <= s.year && s.year <= o.endYear + 1 && seen.filter((x) => x === fullName(o)).length < (s.year >= o.endYear ? 2 : 1));
  if (!live.length) return null;
  const o: OtherLife = r.pick(live);
  seen.push(fullName(o));
  const d = o.startYear - s.startYear;
  const c = callName(o), f = fullName(o), co = o.company || 'どこかの会社', job = o.job || '開発', w = o.work ? `『${o.work.replace(/^[『「]|[』」]$/g, '')}』` : '';
  const cands: Text[] = [];
  const add = (ja: string, en: string) => cands.push({ ja, en });
  if (s.year >= o.endYear) add(`${c}が業界を去ったと聞いた。「${o.ending}」。いいゲーム人生だったらしい。少しだけ、自分の残り時間を数えた。`, `Word came that ${f} had left the industry: "${o.ending}". A good game life, by all accounts. You counted your own years for a moment.`);
  else if (d < -1 && d >= -15) {
    add(`先輩の${c}(${co}の${job})に飲みに連れて行かれた。説教は 2 時間、おごりは 1 杯だった。`, `Your senior ${f} (${job} at ${co}) took you drinking. Two hours of lecture, one drink on them.`);
    if (w) add(`業界の先輩、${c}の噂を聞いた。${co}で${w}を作った人らしい。なぜか自分のことのように嬉しかった。`, `You heard about ${f}, an industry senior who made ${w} at ${co}. Somehow you felt proud of it yourself.`);
  } else if (Math.abs(d) <= 1) {
    add(`同期の${c}とイベントで再会した。${co}で${job}をやっているという。名刺交換の手つきが、2 人とも同じくらい下手だった。`, `You ran into ${f}, from your year, at an event — now ${job} at ${co}. You were both equally bad at exchanging business cards.`);
    if (w) add(`同じ年に業界に入った${c}が${w}を出したと聞いた。悔しくて、その夜は眠れなかった。翌朝、買った。`, `${f}, who started the same year as you, shipped ${w}. Jealousy kept you up all night. Next morning, you bought it.`);
  } else if (d > 1 && d <= 15) {
    add(`後輩の${c}が入ってきた。最初の週に、あなたのバグを 3 つ見つけた。頼もしいが、少しむかついた。`, `${f} joined as a junior. In their first week they found three of your bugs. Reassuring. Also annoying.`);
    if (w) add(`後輩の${c}が${w}に関わったと聞いた。昔あなたが貸した攻略本を、まだ返してもらっていない。`, `Your junior ${f} worked on ${w}. They still haven't returned the strategy guide you lent them.`);
  }
  if (s.year >= 1980) add(`ゲーム雑誌で${f}さんのインタビューを読んだ。${co}の${job}。写真の背景の散らかった机に、親近感がわいた。`, `You read an interview with ${f}, ${job} at ${co}, in a game magazine. The messy desk behind them felt like home.`);
  if (s.year >= 1998 && w) add(`ネットの記事で${f}さんの名前を見かけた。${w}の裏話をしていた。いつか会ってみたい。`, `You spotted ${f} in an online article, telling stories behind ${w}. You'd like to meet them someday.`);
  return cands.length ? r.pick(cands) : null;
}

// ---- メンター(直属の先輩)とメンティー(直属の後輩)。人生に 1 人ずつ、5 段の話(mentors.json)----
// 名前を入れて遊んだ誰か(サーバーの記録)がちょうどいい年回りなら、その人が先輩・後輩になる
// 同じ会社にいないと成り立たない版(廊下ですれ違う・部長になった・上司になった …)
const SAME_CO = new Set(['ev_mt_2a', 'ev_mt_2b', 'ev_mt_2c', 'ev_mt_3a', 'ev_mt_3b', 'ev_mt_3c', 'ev_mt_4c', 'ev_me_2a', 'ev_me_2b', 'ev_me_2c', 'ev_me_3b', 'ev_me_3c', 'ev_me_4c']);
const ARC_GAP: Record<'mentor' | 'mentee', [number, number][]> = {
  mentor: [[1, 2], [2, 3], [3, 5], [8, 14]],
  mentee: [[1, 2], [2, 3], [3, 6], [6, 10]],
};
function arcName(s: State, r: Rng, lo: number, hi: number, born: number): Text {
  const fit = (s.inner.others ?? []).filter((o) => o.startYear >= lo && o.startYear <= hi && o.endYear >= s.year);
  if (fit.length && r.chance(0.7)) {
    const o = r.pick(fit);
    s.inner.others = s.inner.others!.filter((x) => x !== o); // 同じ人が別の役で出ない
    return { ja: callName(o), en: fullName(o) };
  }
  // 同期と同じ苗字は避ける(師匠の小山さんと同期の小山が別人で混乱した)
  const taken = [...s.inner.peerStates.map((p) => p.name.ja.split(' ')[0]), s.name.ja.split(' ')[0], ...[s.inner.mentor, s.inner.mentee].filter(Boolean).map((a) => a!.name.ja.replace(/さん$/, ''))]; // 自分・先輩・後輩とも被らせない(第 32 回: 先輩の福島さんと後輩の福島さん)
  let p = personName(r, born);
  for (let i = 0; i < 5 && taken.includes(p.ja.split(' ')[0]); i++) p = personName(r, born);
  return { ja: `${p.ja.split(' ')[0]}さん`, en: p.en.split(' ').slice(-1)[0] };
}
/** 一人の人の長い話(ファン・ライバル・先輩・後輩)をこの人生でやるか。直近の人生でやった話は出にくく(第 8 回ペルソナ: 3 回とも同じ筋で先が読めた) */
function arcOn(s: State, r: Rng, kind: string, pre: string): boolean {
  const k = (s.inner.arcOn ??= {});
  // どの人生にも長い筋を 1 本は通す(第 34 回まで: 筋の通った人生は 8 点、無い人生は「部品の寄せ集め」)。直近で見ていない種類を優先
  if (k.must === undefined) { const all: [string, string][] = [['fan', 'ev_fa_'], ['rival', 'ev_rv_'], ['mentor', 'ev_mt_'], ['mentee', 'ev_me_']]; const fresh = all.filter(([, p]) => !s.inner.recent?.some((id) => id.startsWith(p))); const age = ([, p]: [string, string]) => { const i = s.inner.recent?.findIndex((id) => id.startsWith(p)) ?? -1; return i < 0 ? 1e9 : i; }; const oldest = [...all].sort((a, b) => age(b) - age(a))[0]; (k as Record<string, boolean | string>).must = fresh.length ? r.pick(fresh)[0] : (oldest && r.chance(0.1) ? oldest[0] : ''); } // 全部見ていたら決め打ちはたいてい無し(第 44 回: 一番前に見た種類を選ぶと 1 つおきに同じ筋。新しい連鎖が穴を埋める) // 全部見ていたら、いちばん前に見た種類(recent は新しい人生が先頭。第 41 回: ライバルの企画コンペが 3 人生とも)
  if ((k as Record<string, boolean | string>).must === kind) return true;
  if (k[kind] === undefined) k[kind] = s.inner.recent?.some((id) => id.startsWith(pre)) ? false : !r.chance(0.1); // 直近の人生で通った筋は、決め打ちの 1 本でなければ通さない(第 36 回: ファンの子の筋が 2 人生続けて) // 第 20 回: ファンの子の筋が 2 人生続けて → 0.9 // 第 15 回ペルソナ: まだ続けて来る → 0.6 から 0.8
  return k[kind];
}
function mentorArcs(s: State, r: Rng, out: string[]) {
  if (s.inner.isPeer) return;
  const career = s.year - s.startYear;
  if (!s.inner.mentor && s.status === 'employed' && career <= 3 && s.company.size !== 'indie' && arcOn(s, r, 'mentor', 'ev_mt_'))
    s.inner.mentor = { name: arcName(s, r, s.startYear - 15, s.startYear - 3, s.year - s.age - r.int(5, 12)), step: 0, next: s.year, used: [], co: s.company.id };
  if (!s.inner.mentee && s.status === 'employed' && career >= (s.inner.menteeAt ?? 8) && s.age < 62 && arcOn(s, r, 'mentee', 'ev_me_'))
    s.inner.mentee = { name: arcName(s, r, s.year - 2, s.year + 1, s.year - 22), step: 0, next: s.year, used: [], co: s.company.id };
  for (const kind of ['mentor', 'mentee'] as const) {
    const a: Arc | undefined = s.inner[kind];
    if (!a || a.step >= 5 || s.year < a.next || s.flags.in_prison) continue;
    // 2・3 段目は同じ職場にいる時だけ(いなければ飛ばす)
    if ((a.step === 1 || a.step === 2) && (s.status !== 'employed' || (a.co && a.co !== s.company.id))) { a.step++; continue; }
    const pre = kind === 'mentor' ? 'ev_mt_' : 'ev_me_';
    const used = [...(s.inner.mentor?.used ?? []), ...(s.inner.mentee?.used ?? [])];
    const vs0 = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => EVENT_BY_ID.get(`${pre}${a.step + 1}${x}`)).filter((e): e is GameEvent => !!e && (!e.needs || used.includes(e.needs)) && (!e.jobs || e.jobs.includes(s.job)) && (!e.planOnly || ['planner', 'director', 'producer'].includes(s.job) || s.year - s.startYear >= 8) && (!(SAME_CO.has(e.id) || /上司|社内|会議|隣の席|部署|チーム|配属|社員食堂|異動/.test(e.text.ja)) || (s.status === 'employed' && a.co === s.company.id))); // 会社の中の話は同じ会社にいる間だけ(第 11 回ペルソナ: 潰れた会社の上司がずっと出てくる)
    const freshV = vs0.filter((e) => !s.inner.recent?.includes(e.id));
    const vs = freshV.length ? freshV : vs0;
    if (vs.length) {
      const ev = r.pick(vs);
      a.used.push(ev.id);
      s.inner.seen[ev.id] = s.year;
      log(s, fill(s, evText(s, ev)), 'event', ev.tag);
      if (a.step >= 3) remember(s, { ...ev, tag: [...(ev.tag ?? []), 'bond'] }, ev.memory); // 先輩・後輩の筋の終わりの方は、結果画面の山場の候補に(第 40 回)
      apply(s, ev.effect, ev.id, out);
    }
    if (a.step < 4) { const [lo, hi] = ARC_GAP[kind][a.step]; a.next = s.year + r.int(lo, hi); }
    a.step++;
  }
}

/** 言い回し違いの版から、この人生でまだ出ていないものを先に選ぶ(全部出たら乱数) */
function vary(s: State, ids: string[]): string {
  const ok = ids.filter((id) => EVENT_BY_ID.has(id));
  const fresh = ok.filter((id) => !(s.inner.uses[id] ?? 0));
  const fresher = fresh.filter((id) => !s.inner.recent?.includes(id));
  return fresher.length ? s.rng.pick(fresher) : fresh.length ? s.rng.pick(fresh) : s.rng.pick(ok);
}

/** 締めの名台詞(1 行目 = 相方の問い、2 行目 = 名台詞)。0 番はキッズ・リターン */
type Finale = { t: Text; fit?: (s: State, id: EndingId) => boolean; parody?: RegExp };
const bad = (id: EndingId) => id === 'end_debt' || id === 'end_burnout' || id === 'end_blacklist' || id === 'end_body';
const FINALES: Finale[] = [
  { t: { ja: '「なあ、俺たち、もう終わっちゃったのかな」\n「バカヤロー、まだ始まっちゃいねえよ」', en: '"Hey... are we finished?"\n"Idiot. We haven\'t even started yet."' } }, // キッズ・リターン(どの人生にも)
  { t: { ja: '「明日から、どうする?」\n「明日は明日の風が吹くさ」', en: '"So what about tomorrow?"\n"Tomorrow is another day."' } }, // どの人生にも(キッズ・リターンが続かないように) // 風と共に去りぬ: うまくいかなかった人生に
  { t: { ja: '「まだ希望なんて持ってるのか」\n「希望はいいものだ。たぶん最高のものだ。いいものは決して滅びない」', en: '"You still have hope?"\n"Hope is a good thing, maybe the best of things, and no good thing ever dies."' }, fit: (s) => !!(s.flags.ex_prison || s.flags.in_prison) }, // ショーシャンクの空に: 塀の中を通った人生に
  { t: { ja: '「この先、どうなるんだろうな」\n「未来は決まっていない。運命なんてない。自分で作るものだ」', en: '"Wonder what happens now."\n"The future\'s not set. There\'s no fate but what we make for ourselves."' }, fit: (s) => !!(s.flags.shift_hand || s.flags.shift_partner) }, // ターミネーター 2: AI の時代にまだ作る人生に
  { t: { ja: '「人生って、何が出るか分からないな」\n「人生はチョコレートの箱みたいなもんさ。開けてみるまで中身は分からない」', en: '"You never know what life\'ll throw at you."\n"Life is like a box of chocolates. You never know what you\'re gonna get."' }, fit: (s) => s.companies.length >= 4 || !!s.flags.ex_prison }, // フォレスト・ガンプ: 浮き沈みの多い人生に
  { t: { ja: '「まだ行く気か」\n「無限の彼方へ、さあ行くぞ!」', en: '"You\'re still going?"\n"To infinity and beyond!"' }, fit: (s, id) => id === 'end_pen_down' || !!s.flags.shift_partner, parody: /無限の.*彼方/ }, // トイ・ストーリー: まだ作り続ける人生に
  { t: { ja: '「で、これからどうするんだ」\n「落ち込んだりもしたけれど、私はげんきです」', en: '"So, what now?"\n"I\'ve had my ups and downs, but I\'m doing fine."' }, fit: (_s, id) => id === 'end_retire' || id === 'end_body' || id === 'end_switch' }, // 魔女の宅急便: 去った後も元気な人生に
  { t: { ja: '「もう、さすがに潮時かな」\n「あきらめたら、そこで試合終了ですよ」', en: '"Maybe it\'s time to call it."\n"If you give up, the game is over."' }, fit: (s, id) => id === 'end_pen_down' || !!s.flags.shift_hand, parody: /あきらめたら/ }, // SLAM DUNK: あきらめなかった人生に
  { t: { ja: '「じゃあ、元気でな。たまには連絡しろよ」\n「フォースと共にあらんことを」', en: '"Take care. Call once in a while."\n"May the Force be with you."' }, fit: (_s, id) => id === 'end_retire' || id === 'end_switch', parody: /と共にあらんことを/ }, // スター・ウォーズ: 送り出す人生に
  { t: { ja: '「AI が全部作る時代だぞ。まだやるのか」\n「オレはようやくのぼりはじめたばかりだからな　このはてしなく遠いゲーム坂をよ…」', en: '"AI makes everything now. You\'re still at it?"\n"I\'ve only just started climbing, you know. This endlessly long game-dev hill..."' }, fit: (s, id) => id === 'end_restart' && !s.flags.shift_play, parody: /はてしなく遠い|のぼりはじめたばかり/ }, // 2027 年に AI で挫折しかけても、まだ開発者のまま終わる人生(2026-10-17 Mukkii。男坂のもじり)
];
/** どの終わり方でも、最後は同期との掛け合い(キッズ・リターンのパロディ)。場面だけ終わり方で変える */
function kidsReturn(s: State, id: EndingId) {
  // 2 回目からは、3 回に 1 回は掛け合い無しで、結果画面の 1 行だけで終える(第 42 回まで: 締めの形が毎回同じ。仮決め・QUESTIONS.md)
  if (s.inner.recent?.some((x) => /^line:(finale|plainfin|fanfin):/.test(x)) && s.rng.chance(0.33)) { s.inner.krNone = true; return; }
  // 相方: まだ業界にいて塀の外の同期。会社に入らず始めた人生なら「昔の仲間」
  const seenName = (x: State) => s.log.some((l) => l.text.ja.includes(x.name.ja.split(' ')[0]));
  const outside = s.inner.peerStates.filter((x) => !x.flags.in_prison && !x.flags.ex_prison && (!x.ending || x.ending.id === 'end_restart')); // 業界を去った同期は相方にしない(第 17 回ペルソナ) // 捕まった同期は相方にしない(第 9 回ペルソナ)
  const rivalSt = s.inner.rival && s.inner.rival.step >= 2 ? outside.find((x) => s.inner.rival!.name.ja.startsWith(x.name.ja.split(' ')[0])) : undefined; // ライバルの同期がいれば、その人と
  const seenCount = (x: State) => s.log.filter((l) => l.text.ja.includes(x.name.ja.split(' ')[0])).length;
  const byCount = [...outside].sort((a, b) => seenCount(b) - seenCount(a)); // いちばん多く出てきた同期と締める(第 28 回: 1 回しか出ていない同期が最後の相方)
  const bud = rivalSt ?? byCount.find((x) => !x.ending && seenName(x)) ?? byCount.find(seenName);
  const indieStart = s.companies[0]?.company.size === 'indie';
  // 一度も出てこなかった同期の名前で締めない(第 9 回ペルソナ: 最後の相方が知らない人)。先輩・後輩がいればその人、いなければ名前を出さない
  const arc = !bud ? (s.inner.mentee ?? s.inner.mentor) : undefined;
  const rel = arc ? (arc === s.inner.mentee ? { ja: '後輩の', en: 'your old junior' } : { ja: '先輩の', en: 'your old mentor' }) : indieStart ? { ja: '昔の仲間の', en: 'your old friend' } : { ja: '同期の', en: 'your old peer' };
  const nmJa = bud ? bud.name.ja.split(' ')[0] : arc ? arc.name.ja : '';
  const nmEn = bud ? bud.name.en.split(' ').slice(-1)[0] : arc ? arc.name.en : '';
  let p = nmJa ? `${rel.ja}${nmJa}` : rel.ja.replace(/の$/, ''), pe = `${rel.en} ${nmEn}`.trim();
  // ファンの子の筋が最後まで通った人生は、半分はその子と締める(第 36 回: 1 回しか出ない同期より、筋の相手)
  let fanTalk = false;
  if (s.inner.fan && s.inner.fan.step >= 4 && !s.flags.in_prison && id !== 'end_arrest' && s.rng.chance(0.5)) { p = s.inner.fan.name.ja; pe = s.inner.fan.name.en; fanTalk = true; }
  const jail = s.flags.in_prison || id === 'end_arrest';
  const where: Partial<Record<EndingId, Text>> = {
    end_restart: freshLine(s, [
      { ja: `帰り道、${p}がぽつりと言った。`, en: `On the way home, ${pe} said quietly:` },
      { ja: `打ち上げの後の屋台で、${p}が湯気の向こうで言った。`, en: `At a food stall after the wrap party, ${pe} said through the steam:` },
      ...(s.flags.shift_play ? [{ ja: `ゲーセンの対戦台の向こうから、${p}が言った。`, en: `From across the arcade versus cabinet, ${pe} said:` }] : [{ ja: `夜中の開発室に、ふたりだけ残っていた。${p}がモニターを見たまま言った。`, en: `Only the two of you were left in the dev room at night. ${pe} said, still staring at the monitor:` }]), // 遊ぶ側に回った人生に開発室は出さない
      { ja: `終電を待つホームで、${p}が言った。`, en: `Waiting for the last train, ${pe} said:` },
    ], 'krw_restart'), /* 締めの場面も直近の人生と変える(第 51・54 回: 屋台の湯気が一字一句同じ) */
    end_retire: freshLine(s, [
      { ja: `送別会の帰り、${p}が言った。`, en: `Leaving the farewell party, ${pe} said:` },
      { ja: `最後の出社の日、エレベーターの中で${p}が言った。`, en: `On your last day, in the elevator, ${pe} said:` },
      { ja: `机の私物を段ボールに詰めていると、${p}が手伝いに来て言った。`, en: `As you packed your desk into a box, ${pe} came to help and said:` },
      { ja: `社員証を返した帰り、駅前の喫茶店で${p}が言った。`, en: `After returning your ID badge, at the café by the station, ${pe} said:` },
    ], 'krw_retire'),
    end_pen_down: { ja: `70 歳の誕生日、${p}から電話があった。`, en: `On your 70th birthday, ${pe} called:` },
    end_body: { ja: `病院のベッドの横で、${p}が言った。`, en: `By your hospital bed, ${pe} said:` },
    end_debt: { ja: `店をたたんだ夜、${p}が缶ビールを持って来て言った。`, en: `The night you closed shop, ${pe} came by with canned beer and said:` },
  };
  const w = jail ? { ja: `面会室で、${p}がアクリル板ごしに言った。`, en: `In the visiting room, ${pe} said through the acrylic panel:` }
    : where[id] ?? { ja: `最後の日、${p}と並んで歩きながら、${p.replace(/^.*の/, '')}が言った。`, en: `Walking side by side on your last day, ${pe} said:` };
  // 締めの掛け合い: 希望のある名台詞をほぼそのまま(2026-10-16 Mukkii: キッズ・リターン 1 つだと 3 回目に「はいはい」になる → 何種類か)。
  // 初めて遊ぶ人はキッズ・リターン。続けて遊ぶ人には、直近の人生で出ていないものを
  // その人生に合う台詞だけ(第 11 回ペルソナ: 合う時は鳥肌、合わないと「型」に見える)。途中で同じ台詞のもじりが出た人生では使わない
  const said = (s.inner.saidLines ??= []);
  const okF = FINALES.map((f, i) => [f, i] as const).filter(([f]) => (!f.fit || f.fit(s, id)) && !(f.parody && s.log.some((l) => f.parody!.test(l.text.ja))));
  const freshF = okF.filter(([, i]) => !s.inner.recent?.includes(`line:finale:${i}`));
  // 2 回目からは、直近に名台詞で締めていたら半分は普通の掛け合いで(第 25 回まで: 毎回名台詞で 3 回目に読める。仮決め・QUESTIONS.md)
  const plainOk = !!s.inner.recent?.some((x) => x.startsWith('line:finale:')) && s.rng.chance(0.5);
  let finale: Text;
  if (fanTalk) finale = freshLine(s, [ // ファンだった子との締め。同期の口調(「なあ、俺たち」「バカヤロー」)は使わない(第 41 回)
    { ja: '「あの時の返事、まだ持ってます」\nあなたは、何て書いたか思い出せなかった。それでいいと思った。', en: '"I still have the reply you sent me back then."\nYou couldn\'t remember what you\'d written. That felt right.' },
    { ja: '「次は、私のゲームを遊んでください」\n「難易度は、下げなくていいからな」', en: '"Next time, play one of mine."\n"Don\'t you dare lower the difficulty."' },
    { ja: '「ずっと、追いかけてました」\n「追い越していいぞ。もう、とっくに」', en: '"I\'ve been chasing you all this time."\n"You can pass me. You already did."' },
  ], 'fanfin');
  else if (plainOk) finale = freshLine(s, [
    { ja: '「次、何作る?」\n「まだ決めてない。決めてないのが、いちばん楽しい」', en: '"What are you making next?"\n"Haven\'t decided. That\'s the best part."' },
    { ja: '「後悔してる?」\n「セーブデータは、全部残してある」', en: '"Any regrets?"\n"I kept every save file."' },
    { ja: '「疲れたな」\n「ああ。でも、もう 1 面だけ」', en: '"Tired?"\n"Yeah. Just one more stage."' },
    { ja: '「お前のゲーム、まだ実家にあるぞ」\n「電池、切れてないといいな」', en: '"Your game\'s still at my parents\' place."\n"Hope the battery\'s still alive."' },
    { ja: '「また一緒にやるか」\n「次は、締め切りを守る方で」', en: '"Want to do it again sometime?"\n"Sure. The kind where we hit the deadline."' },
  ], 'plainfin');
  else { const zaka = freshF.find(([f]) => f.parody?.source.includes('はてしなく遠い')); const [fin, fi] = !s.inner.recent?.length ? okF[0] : zaka && s.rng.chance(0.5) ? zaka : s.rng.pick(freshF.length ? freshF : okF); said.push(`finale:${fi}`); finale = fin.t; } // 2027 年にまだ開発者なら、ゲーム坂を半分の確率で(2026-10-17 Mukkii)
  s.inner.kr = { ja: `${w.ja}\n${finale.ja}`, en: `${w.en}\n${finale.en}` };
}

// ---- 一人のファンの一生 / ライバルの同期(arcs.json。2026-10-16 Mukkii: 感情移入できる相手を)----
const STORY_GAP: Record<'fan' | 'rival', [number, number][]> = {
  fan: [[5, 6], [2, 3], [4, 5], [5, 9]], // 小学生 → 高校生 → 進路の相談 → 就職 → 一本立ち
  rival: [[2, 4], [3, 6], [3, 6], [6, 10]],
};
function storyArcs(s: State, r: Rng): string[] {
  const outIds: string[] = [];
  if (s.inner.isPeer || s.flags.in_prison) return outIds;
  // ファン: 最初の作品が出た後に、子どもから便りが来る
  const firstWork = s.works.find((w) => w.role !== 'solo') ?? s.works[0];
  if (!s.inner.fan && firstWork && s.year > firstWork.year && s.year < 2022 && arcOn(s, r, 'fan', 'ev_fa_')) {
    const p = personName(r, s.year - 10);
    const given = p.ja.split(' ')[1] ?? p.ja;
    s.inner.fan = { name: { ja: `${given}さん`, en: p.en.split(' ')[0] }, step: 0, next: s.year, used: [], work: firstWork.name };
  }
  // ライバル: 同じ会社の同期(本人の同期の 2 人目)
  const rp = s.inner.peerStates[1];
  if (!s.inner.rival && rp && s.status === 'employed' && s.year - s.startYear >= 2 && s.company.size !== 'indie' && arcOn(s, r, 'rival', 'ev_rv_'))
    s.inner.rival = { name: { ja: rp.name.ja.split(' ')[0], en: rp.name.en.split(' ').slice(-1)[0] }, step: 0, next: s.year, used: [], co: s.company.id };
  for (const kind of ['fan', 'rival'] as const) {
    const a = s.inner[kind];
    if (!a || a.step >= 5 || s.year < a.next) continue;
    let id: string | null = null;
    if (kind === 'fan') {
      const fw = s.works.find((w) => w.name.ja === s.inner.fan?.work?.ja);
      const first = fw?.result === 'flop' ? ['ev_fa_1f', 'ev_fa_1fb', 'ev_fa_1c'] : fw?.result === 'hit' ? ['ev_fa_1h', 'ev_fa_1hb', 'ev_fa_1c'] : ['ev_fa_1', 'ev_fa_1b', 'ev_fa_1c'];
      const steps: string[][] = [first, ['ev_fa_2', 'ev_fa_2b', 'ev_fa_2c'], ['ev_fa_3', 'ev_fa_3b', 'ev_fa_3c'], s.status === 'employed' && s.company.size !== 'indie' ? ['ev_fa_4', 'ev_fa_4c', 'ev_fa_4d'] : ['ev_fa_4b'], ['ev_fa_5', 'ev_fa_5b', 'ev_fa_5c']];
      id = pickFresh(s, r, steps[a.step]);
    } else {
      const sameCo = s.status === 'employed' && a.co === s.company.id; // 競う・隣に座る・引き抜かれるは同じ会社の時だけ
      id = pickFresh(s, r, [['ev_rv_1', 'ev_rv_1b'], ['ev_rv_2', 'ev_rv_2b', 'ev_rv_2c'], ['ev_rv_3', 'ev_rv_3b', 'ev_rv_3c'], ['ev_rv_4', 'ev_rv_4b', 'ev_rv_4c'], ['ev_rv_5', 'ev_rv_5b', 'ev_rv_5c']][a.step]);
      if ((a.step === 0 || a.step === 2 || a.step === 3) && !sameCo) id = null;
    }
    const ev = id ? EVENT_BY_ID.get(id) : undefined;
    if (ev) {
      a.used.push(ev.id);
      outIds.push(ev.id); // 選択のある話もあるので、ほかの話と同じ列に並べる
    }
    if (a.step < 4) { const [lo, hi] = STORY_GAP[kind][a.step]; a.next = s.year + r.int(lo, hi); }
    a.step++;
  }
  return outIds;
}

/** 選ぶ時の重み: 直近の人生で見た話は tune('life.recentPenalty') 倍(続けて遊んだ時に同じ小ネタが出ないように) */
const THEMES = ['family', 'celeb', 'cruel', 'money', 'petty', 'crunch', 'magazine'];
function wOf(s: State): (e: GameEvent) => number {
  const rec = s.inner.recent;
  // 人生ごとの色(第 33 回: 3 回続けると「同じ骨組みの色違い」→ 1 人生ごとに出やすい話の種類を 1 つ決める。直近の人生と同じ色は避ける)
  const th = (s.inner.theme ??= (() => { const ok = THEMES.filter((t) => !rec?.includes(`theme:${t}`)); return s.inner.isPeer ? '' : s.rng.pick(ok.length ? ok : THEMES); })());
  const p = tune<number>('life.recentPenalty');
  return (e) => (e.weight ?? 1) * (th && e.tag?.includes(th) ? 2.5 : 1) * (e.jobs && e.jobs.length <= 2 && e.jobs.includes(s.job) ? (s.year - s.startYear <= 7 ? 4 : 2) : 1) * (e.tag?.includes('indie') && s.year >= 2016 ? 2.5 : 1) /* 2015 年のインディーの衝撃の後は、独立の話が出やすい(2026-10-17 Mukkii) */ /* 職種の味(第 38 回: サウンドなのに音の話がほぼ無い) */ * (rec?.includes(e.id) ? p : 1) * (e.motif && rec?.includes(`line:motif:${e.motif}`) ? 0.2 : 1) * (e.tag?.includes('insider') ? 0.4 : 1);
}

/** 直近の人生で見ていない話だけ(続けて遊んだ時に、人生の大きな筋が被らないように) */
function freshOnly(s: State, pool: GameEvent[]): GameEvent[] {
  return pool.filter((e) => !s.inner.recent?.includes(e.id) && !(e.motif && s.inner.recent?.includes(`line:motif:${e.motif}`)));
}
/** 版の中から、直近の人生で見ていないものを選ぶ(全部見ていたら乱数) */
function pickFresh(s: State, r: Rng, ids: string[]): string {
  const fresh = ids.filter((id) => !s.inner.recent?.includes(id));
  return r.pick(fresh.length ? fresh : ids);
}

/** 話の本文: 言い回し違い(alt)があれば、直近の人生とこの人生で使っていないものから */
const HW_CHOICE = new Map<string, boolean>();
function isHwChoice(ev: GameEvent): boolean {
  let v = HW_CHOICE.get(ev.id);
  if (v === undefined) { const tx = ev.text.ja + (ev.choices ?? []).map((c) => c.label.ja).join(' '); v = !!ev.tag?.includes('hardware') || /開発機|新型の|携帯機|ゲーム機|DS|PSP|ドリキャス|ドリームキャスト|PS2|プレイステーション|サターン|Switch|スイッチ|3DS|Wii/.test(tx) && (ev.choices ?? []).some((c) => /にする|に付く|に賭け|を選ぶ|行く|残る|DS|PSP|PS|Switch|スマホ|ドリ|サターン/.test(c.label.ja)); HW_CHOICE.set(ev.id, v); }
  return v;
}
function evText(s: State, ev: GameEvent): Text {
  return ev.alt?.length ? freshLine(s, [ev.text, ...ev.alt]) : ev.text;
}
/** 決まった流れの文: 直近の人生とこの人生で使っていない言い回しから選ぶ */
function freshLine(s: State, texts: Text[], key?: string): Text {
  // key があれば「key:番号」で覚える(同期の名前が人生ごとに変わる文でも、続けて遊んだ時に同じ型を避ける)
  const said = (s.inner.saidLines ??= []);
  const k = (t: Text) => (key ? `${key}:${texts.indexOf(t)}` : t.ja);
  const unsaid = texts.filter((x) => !said.includes(k(x)));
  const fresh = unsaid.filter((t) => !s.inner.recent?.includes(`line:${k(t)}`));
  const t = s.rng.pick(fresh.length ? fresh : unsaid.length ? unsaid : texts);
  said.push(k(t));
  return t;
}
