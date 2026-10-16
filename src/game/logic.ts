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
import { release, tickWorks, clamp, RESULT_TEXT } from './works';
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
  { size: 'indie', text: { ja: '同人上がり', en: 'from doujin circles' }, w: (a, y) => (y >= 1982 ? (a === 18 ? 1.5 : 0.6) : 0.2), indie: true },
  { size: 'small', text: { ja: '異業種からの転職組', en: 'career change' }, w: (a) => (a >= 26 && a < 50 ? 5 : 0) },
  { size: 'sub', text: { ja: '早期退職からの再出発組', en: 'second career after early retirement' }, w: (a) => (a >= 50 ? 6 : 0) },
  { size: 'indie', text: { ja: '定年前に一念発起した独学組', en: 'self-taught late starter' }, w: (a) => (a >= 50 ? 2 : 0), indie: true },
  { size: 'abroad', text: { ja: '海外のスタジオ', en: 'overseas studio' }, w: (_a, y) => (y >= 1990 ? 0.6 : 0.2) },
  // セガの引力(PLAN §11): 1983〜2001 年は業界入りの約 4 人に 1 人がセガ
  { size: 'big', sega: true, text: { ja: 'セガ', en: 'Sega' }, w: (a, y) => (a >= 50 ? 0.3 : y <= 1982 ? 1.3 : y <= 2001 ? 5 : y <= 2015 ? 2 : 1.3) },
  { size: 'sub', segaSub: true, text: { ja: 'セガの下請け', en: "Sega's contractor" }, w: (_a, y) => (y >= 1990 && y <= 2010 ? 0.8 : 0) },
];
const JOBS: [Job, number][] = [['programmer', 30], ['planner', 20], ['artist', 20], ['sound', 7], ['qa', 15], ['sales', 6]];
const REGIONS: Text[] = [{ ja: '東京', en: 'Tokyo' }, { ja: '東京', en: 'Tokyo' }, { ja: '京都', en: 'Kyoto' }, { ja: '大阪', en: 'Osaka' }, { ja: '福岡', en: 'Fukuoka' }, { ja: '地方', en: 'the countryside' }];

function wpick<T>(r: Rng, items: T[], w: (t: T) => number): T {
  const total = items.reduce((a, t) => a + w(t), 0);
  let x = r.next() * total;
  for (const t of items) { x -= w(t); if (x < 0) return t; }
  return items[items.length - 1];
}

/** 入力された名前があればそれ(乱数の並びは変えない = 同じ seed なら名前以外は同じ人生) */
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
function newCompany(r: Rng, size: CompanySize, year: number, avoid?: string | string[]): Company {
  const av = Array.isArray(avoid) ? avoid : avoid ? [avoid] : [];
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
  const year = options.year ?? peerOf?.year ?? gachaYear(r, options.era);
  const age = options.age ?? gachaAge(r);
  const entry = wpick(r, ENTRIES, (e) => e.w(age, year));
  const job = wpick(r, JOBS, ([, w]) => w)[0];
  const base = age <= 18 ? [80, 90, 10, 5, 10] : age <= 24 ? [70, 80, 25, 15, 30] : age < 50 ? [60, 95, 15, 10, 100] : [50, 95, 10, 30, 600];
  const company: Company = entry.indie ? { id: 'co_indie_self', name: { ja: '自室', en: 'your bedroom' }, size: 'indie' }
    : peerOf && peerOf.company.size !== 'indie' ? peerOf.company
    : entry.sega && SEGA() ? { id: 'co_sega', name: nameAt(SEGA()!, year), size: 'big' } : newCompany(r, entry.size, year);
  const s: State = {
    seed, year, age, startAge: age, startYear: year, era: eraOf(year), job, status: entry.indie ? 'indie' : 'employed',
    name: nameOf(personName(r, year - age), options.name), entry: entry.text, region: entry.size === 'abroad' ? { ja: '海外', en: 'abroad' } : r.pick(REGIONS),
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
    picked.forEach((ev, i) => {
      s.log.push({ year: base.y - off + i, age: base.a - off + i, text: fill(s, evText(s, ev)), kind: 'event', tag: ev.tag });
      applyInner(s, ev.effect ?? {}, ev.id, []);
      s.inner.used.push(ev.id);
    });
    [s.year, s.age] = [y0, a0];
  }
  { const st = s.status === 'indie' ? 'ev_sys_start_indie' : vary(s, ['ev_sys_start', 'ev_sys_start_b', 'ev_sys_start_c', 'ev_sys_start_d']); s.inner.seen[st] = s.year; logEvent(s, st, 'event'); }
  return s;
}

// ---- 文の差し込み ----
function fill(s: State, t: Text): Text {
  const w = s.inner.workTarget >= 0 ? s.works[s.inner.workTarget] : s.works[s.works.length - 1];
  const rivalP = s.inner.rival ? s.inner.peerStates[1] : undefined;
  const live = s.inner.peerStates.filter((p) => !p.ending && !p.flags.in_prison && p !== rivalP); // 引退・服役した同期、ライバルは出さない
  const peer = live.length ? live[s.year % live.length].name : { ja: '同期', en: 'a peer' };
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
  return { ja: rep(t.ja, 'ja').replace(/([ぁ-んァ-ヶ一-龠ー])(SNS)/g, '$1 $2'), en: rep(t.en, 'en') };
}
function log(s: State, text: Text, kind: LogLine['kind'], tag?: string[]) {
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
      s.flags[f] = v;
      continue;
    }
    if (!v) continue;
    if (f === 'do_change_company') {
      s.flags.changed_co = true;
      const size: CompanySize = s.stat.skill >= 60 ? s.rng.pick(['big', 'mid'] as const) : s.rng.pick(['mid', 'small', 'sub'] as const);
      s.company = newCompany(s.rng, size, s.year); s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0; setStatus(s, 'employed');
      s.inner.nextWorkYear = s.year + s.rng.int(tune('work.everyMin'), tune('work.everyMax'));
    } else if (f === 'do_go_indie') {
      setStatus(s, 'indie'); s.flags.own_co = true; s.company = { id: 'co_indie_self', name: { ja: `${s.name.ja.split(' ')[0]}ゲームス`, en: `${s.name.en.split(' ').slice(-1)[0]} Games` }, size: 'indie' };
      s.companies.push({ company: s.company, year: s.year });
      s.inner.nextWorkYear = s.year + s.rng.int(1, 3);
    } else if (f === 'do_return') {
      s.job = s.inner.prevJob; s.company = newCompany(s.rng, s.rng.pick(['mid', 'small', 'sub'] as const), s.year); s.companies.push({ company: s.company, year: s.year });
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
      s.company = newCompany(s.rng, 'school', s.year); s.companies.push({ company: s.company, year: s.year });
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
  for (const t of (TIMELINE_BY_YEAR.get(s.year) ?? []).slice(0, 2)) log(s, t.text, 'timeline', [t.kind]);
  if ((TIMELINE_BY_YEAR.get(s.year) ?? []).length) out.push('timeline');
  // 2027 年: AI のパラダイムシフトで人生の区切り(2026-10-16 Mukkii)。その年は「どうする?」の選択だけ → キッズ・リターンのパロディで前向きに終わる
  if (s.year >= tune<number>('life.finalYear') && s.age < 70) { s.inner.queue = ['ev_sys_shift']; return; }
  const q: string[] = [];
  const sys: string[] = [];
  // 予約(later)
  const due = s.pending.filter((p) => p.year <= s.year);
  s.pending = s.pending.filter((p) => p.year > s.year);
  // 会社の中の大作の結末(tag mega)は、同じ会社にいる時だけ(第 7 回ペルソナ: 潰れた会社の巨大作が「やっと出た」)
  for (const p of due) if (!(EVENT_BY_ID.get(p.event)?.tag?.includes('mega') && p.co && p.co !== s.company.id)) q.push(p.event);
  // 職と年齢の節目
  if (s.year > 2040) { sys.push('@end:end_ai_seat'); }
  else if (s.age >= 70) sys.push('@end:end_pen_down');
  else if (s.age === 65 && (s.status === 'employed' || s.status === 'indie')) sys.push('ev_sys_age65', '@check65');
  else if (s.age >= 60 && !s.flags.age60 && (s.status === 'employed' || s.status === 'indie')) { s.flags.age60 = true; sys.push('ev_sys_age60'); }
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
      else if (canPromote(s) && !s.flags.promo_declined && r.chance(tune('job.promote'))) sys.push(r.chance(0.5) && !s.inner.used.includes('ev_wk_promote_ask') ? 'ev_wk_promote_ask' : vary(s, ['ev_sys_promote', 'ev_sys_promote_b', 'ev_sys_promote_c']));
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
    const pool = POOL.filter((e) => e.tag?.includes(tag) && eligible(s, e));
    if (!pool.length) continue;
    s.inner[done] = true;
    turning.push(draw(r, pool, 1, wOf(s))[0].id);
  }
  // 数年に一回の大きな選択(すごく悩むやつ)
  if (s.year >= s.inner.nextBig && s.status !== 'left') {
    const pool = POOL.filter((e) => e.tag?.includes('big') && !e.tag.includes('hardware') && !e.tag.includes('worklife') && (!e.tag.includes('insider') || !s.inner.counts.insider) && e.choices && eligible(s, e, 99));
    if (pool.length) { turning.push(draw(r, pool, 1, wOf(s))[0].id); s.inner.nextBig = s.year + r.int(tune<number>('choice.bigMin'), tune<number>('choice.bigMax')); }
  }
  // どのハードに賭けるか(hardware.json。大きな選択と同じ年には出さない)
  if (s.year >= (s.inner.nextHw ?? 0) && !turning.length && (s.status === 'employed' || s.status === 'indie')) {
    const pool = POOL.filter((e) => e.tag?.includes('hardware') && e.choices && eligible(s, e, 99));
    if (pool.length) { turning.push(draw(r, pool, 1, wOf(s))[0].id); s.inner.nextHw = s.year + r.int(tune<number>('choice.hwMin'), tune<number>('choice.hwMax')); }
  }
  // 仕事の選択(worklife.json: タイトル・続編か新作か・チーム・エンジン・延期かカットか・海外版・リストラ)。他の大きな選択と同じ年には出さない
  if (s.year >= (s.inner.nextWk ?? s.startYear + 3) && !turning.length && s.status === 'employed') {
    const pool = POOL.filter((e) => e.tag?.includes('worklife') && e.choices && eligible(s, e, 99));
    if (pool.length) { turning.push(draw(r, pool, 1, wOf(s))[0].id); s.inner.nextWk = s.year + r.int(tune<number>('choice.wkMin'), tune<number>('choice.wkMax')); }
  }
  mentorArcs(s, r, out);
  const arcIds = storyArcs(s, r);
  // 入社した年に、その会社の社風の一言(company_traits.json)
  const trait = CO_TRAITS[s.company.id];
  if (trait?.lines?.length && s.status === 'employed' && !(s.inner.coShown ??= []).includes(s.company.id)) {
    s.inner.coShown.push(s.company.id);
    log(s, r.pick(trait.lines), 'event', ['company']);
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
  const pool = POOL.filter((e) => eligible(s, e, tune<number>('life.repeatGap'), tune<number>('life.maxRepeat')) && (allowChoice || !e.choices) && (!e.tag?.includes('afterlife') || hasOldWork(s)) && (!e.tag?.includes('crime') || !s.inner.counts.crime) && (!e.tag?.includes('quote') || (s.inner.counts.quote ?? 0) < 2) && (!e.tag?.includes('slang') || (s.inner.counts.slang ?? 0) < 4) && (!s.flags.in_prison || (e.when ?? []).some((c) => c.includes('prison'))) && !['pit', 'peak', 'bond', 'big', 'gravity', 'prologue', 'hardware', 'worklife'].some((t) => e.tag?.includes(t)));
  let picked = draw(r, pool, Math.max(1, n), wOf(s));
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
  s.inner.queue = [...hist, ...turning, ...arcIds, ...q, ...ids, ...sys];
}

/** その年に起きる歴史の事件から、今の立場で受ける版を選ぶ。年表図鑑でまだ触れていない事件・立場ほど出やすい */
function pickHist(s: State): string[] {
  const seen = new Set(s.options.seen ?? []);
  const seenHist = new Set([...seen].map((k) => k.split(':')[0]));
  const cands: { id: string; w: number }[] = [];
  for (const h of HIST) {
    if (h.year > s.year) break;
    if (s.year > (h.until ?? h.year) || s.inner.histDone.includes(h.id)) continue;
    const v = h.variants.map((x) => EVENT_BY_ID.get(x.id)!).find((ev) => eligible(s, ev) && (!s.flags.in_prison || (ev.when ?? []).some((c) => c.includes('prison'))));
    if (!v) continue;
    const novelty = !seenHist.has(h.id) ? tune<number>('hist.newBoost') : !seen.has(`${h.id}:${v.id}`) ? tune<number>('hist.newPosBoost') : 0.5;
    // 前に選んだこと(flag)を回収する版なら、ほぼ必ず出す(陣営・全力・闇の誘いの結末)
    const callback = (v.when ?? []).some((c) => c.startsWith('flag.')) ? tune<number>('hist.callbackBoost') : 1;
    cands.push({ id: v.id, w: (h.weight ?? 1) * novelty * callback });
  }
  if (!cands.length) return [];
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
function canPromote(s: State) {
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
    if (s.status !== 'employed' && s.status !== 'indie') return;
    const { line, work } = release(s);
    log(s, line, 'work'); out.push('work');
    if (work.result === 'hit' || work.result === 'legend') s.inner.highs.push({ year: s.year, age: s.age, text: { ja: `${work.name.ja}が${RESULT_TEXT[work.result].ja}になった`, en: `${work.name.en} became a ${RESULT_TEXT[work.result].en.toLowerCase()}` }, w: (work.result === 'legend' ? 9 : 4) + s.rng.next(), kind: 'work' });
    s.inner.nextWorkYear = s.year + r.int(tune('work.everyMin'), tune('work.everyMax'));
    s.flags.mega_project = false;
    return;
  }
  if (id === '@check65') { if (s.stat.hp < 40) end(s, 'end_retire', out); return; }
  if (id === '@search') {
    const p = tune('job.rehire') + (s.stat.skill + s.stat.network) / 250;
    if (r.chance(p)) {
      const size: CompanySize = s.stat.skill >= 65 ? r.pick(['big', 'mid'] as const) : r.pick(['mid', 'small', 'sub', 'sub'] as const);
      s.company = newCompany(r, size, s.year, s.inner.deadCos); s.companies.push({ company: s.company, year: s.year }); s.inner.companyYears = 0;
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
  if ((ev.weight ?? 1) === 0 && ev.tag?.includes('big_after') && s.inner.recent?.includes(ev.id) && r.chance(0.7)) return;
  if (ev.when && !ev.when.every((c) => test(s, c))) return; // 同じ年のうちに独立・転職・服役した時は出さない
  if (s.flags.in_prison && ev.id !== 'ev_sys_shift' && !ev.id.includes('prison') && !(ev.when ?? []).some((c) => c.includes('prison'))) return; // 塀の中に社内の話は届かない
  // 後日談: 発売から 2 年以上たった作品を 1 本選ぶ
  s.inner.workTarget = -1;
  if (ev.tag?.includes('afterlife')) {
    // 運営型の話(サービス終了・ガチャ…)は、配信の作品にだけ(第 7 回ペルソナ: DS や Wii のパッケージに「排出率が全部 100%」)
    const online = /サービス終了|排出率|ガチャ|運営|ログイン/.test(ev.text.ja);
    const old = s.works.map((w, i) => [w, i] as const).filter(([w]) => s.year - w.year >= 2 && (!online || /スマホ|ケータイ|ソシャゲ|ブラウザ|オンライン|AI クラウド/.test(w.platform)));
    if (!old.length) return;
    s.inner.workTarget = r.pick(old)[1];
  }
  const hs = HIST_OF.get(ev.id);
  if (hs) { if (s.inner.histDone.includes(hs)) return; s.inner.histDone.push(hs); s.chronicle.push(`${hs}:${ev.id}`); }
  if (ev.once || ev.id.startsWith('ev_sys_')) s.inner.used.push(ev.id);
  s.inner.seen[ev.id] = s.year;
  s.inner.uses[ev.id] = (s.inner.uses[ev.id] ?? 0) + 1;
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

/** テンションが上がった瞬間を覚えておく(最後の 1 行に使う) */
function remember(s: State, ev: GameEvent, memory?: Text) {
  const t = ev.tag ?? [];
  const w = t.includes('peak') ? 6 : t.includes('bond') ? 5 : t.includes('warm') ? 4 : t.includes('celeb') ? 3 : t.includes('high') ? 2 : 0;
  if (!w && !memory) return;
  const first = (x: string, sep: RegExp) => x.split(sep)[0];
  const text = memory ? fill(s, memory) : (() => { const f = s.log[s.log.length - 1]?.text ?? fill(s, ev.text); return { ja: first(f.ja, /。/), en: first(f.en, /\. /) }; })();
  const kind = t.includes('peak') ? 'peak' : t.includes('bond') || t.includes('celeb') ? 'celeb' : t.includes('warm') || t.includes('life') ? 'warm' : 'high';
  s.inner.highs.push({ year: s.year, age: s.age, text, w: (w || 2) + s.rng.next(), kind });
}

function promote(s: State) {
  const to: Partial<Record<Job, Job>> = { qa: 'planner', programmer: 'director', planner: 'director', artist: 'director', sound: 'director', sales: 'producer', director: 'producer' };
  const next = to[s.job];
  if (next) s.job = next;
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
      [`同期の${nm}の${newHit?.name.ja}が売れた。お祝いのメールに「おめでとう」と書いて、3 回消して、また書いた。`, `Your peer ${en}'s ${newHit?.name.en} sold well. You typed "congrats", deleted it three times, and typed it again.`],
    ];
    if (pe) line = { ja: `同期の${nm}の知らせ。${pe.cause.ja.replace(/^\d+ 歳、/, '')}。`, en: `News of your peer ${en}: ${pe.cause.en.replace(/^At \d+, /, '')}.` };
    else if (newHit && ok('hit', 2) && !s.works.some((w) => w.name.ja === newHit.name.ja) && (newHit.result === 'legend' || s.rng.chance(0.4))) { line = freshLine(s, hitL.map(([ja, enT]) => ({ ja, en: enT }))); said1('hit'); }
    else if (p.status !== before.status && p.status === 'indie' && ok('indie', 1)) { said1('indie'); line = freshLine(s, [{ ja: `同期の${nm}が独立した。名刺の肩書きは「CEO」。社員は本人だけ。`, en: `Your peer ${en} went indie. Business card: "CEO." Staff: one.` }, { ja: `同期の${nm}が会社を辞めて、自分のスタジオを作った。開業祝いに観葉植物を贈ったら、社員より大きかった。`, en: `Your peer ${en} quit to start a studio. The potted plant you sent as a gift was bigger than the staff.` }, { ja: `同期の${nm}が独立した。最初の作品の告知は、あなたにだけ 1 日早く届いた。`, en: `Your peer ${en} went indie. The announcement of their first game reached you a day before anyone else.` }]); }
    else if (p.job !== before.job && (p.job === 'director' || p.job === 'producer') && ok('promo', 1)) { said1('promo'); line = freshLine(s, [{ ja: `同期の${nm}が${JOB_TEXT[p.job].ja}に昇進した。あなたより先に。`, en: `Your peer ${en} was promoted to ${JOB_TEXT[p.job].en}. Before you.` }, { ja: `同期の${nm}の名刺に「${JOB_TEXT[p.job].ja}」と入った。もらった名刺は、引き出しの一番奥にしまった。`, en: `Your peer ${en}'s new card read "${JOB_TEXT[p.job].en}." You filed it at the very back of your drawer.` }, { ja: `同期の${nm}が${JOB_TEXT[p.job].ja}になった。お祝いの寄せ書きに「次は俺」と書いた。誰も笑わなかった。`, en: `Your peer ${en} became ${JOB_TEXT[p.job].en}. On the congratulations card you wrote "I'm next." Nobody laughed.` }]); }
    else if (p.status !== before.status && p.flags.in_prison && ok('prison', 1)) { said1('prison'); line = freshLine(s, [{ ja: `同期の${nm}が塀の中へ。差し入れにゲーム雑誌を送った。付箋だらけで返ってきた。`, en: `Your peer ${en} went to prison. You sent game magazines. They came back covered in sticky notes.` }, { ja: `同期の${nm}が捕まったとニュースで知った。写真が新人研修の時のものだった。あの頃の顔だった。`, en: `You learned from the news that ${en} had been arrested. The photo was from your rookie training days.` }]); }
    else if (p.status !== before.status && p.status === 'left' && p.job === 'other' && !p.flags.in_prison) line = { ja: `同期の${nm}が業界を離れ、${p.inner.otherJob?.ja ?? '別の仕事'}へ。年賀状の写真が明るくなった。`, en: `Your peer ${en} left the industry for a ${p.inner.otherJob?.en ?? 'new job'}. Their New Year card looks happier.` };
    s.peers[i].summary = peerSummary(p);
    if (s.inner.rival && i === 1) line = null; // ライバルの筋は arcs.json だけで語る(同期の知らせが混ざると筋が壊れる)
    if (s.flags.in_prison) line = null;
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
  const taken = s.inner.peerStates.map((p) => p.name.ja.split(' ')[0]);
  let p = personName(r, born);
  for (let i = 0; i < 5 && taken.includes(p.ja.split(' ')[0]); i++) p = personName(r, born);
  return { ja: `${p.ja.split(' ')[0]}さん`, en: p.en.split(' ').slice(-1)[0] };
}
function mentorArcs(s: State, r: Rng, out: string[]) {
  if (s.inner.isPeer) return;
  const career = s.year - s.startYear;
  if (!s.inner.mentor && s.status === 'employed' && career <= 3 && s.company.size !== 'indie')
    s.inner.mentor = { name: arcName(s, r, s.startYear - 15, s.startYear - 3, s.year - s.age - r.int(5, 12)), step: 0, next: s.year, used: [], co: s.company.id };
  if (!s.inner.mentee && s.status === 'employed' && career >= (s.inner.menteeAt ?? 8) && s.age < 62)
    s.inner.mentee = { name: arcName(s, r, s.year - 2, s.year + 1, s.year - 22), step: 0, next: s.year, used: [], co: s.company.id };
  for (const kind of ['mentor', 'mentee'] as const) {
    const a: Arc | undefined = s.inner[kind];
    if (!a || a.step >= 5 || s.year < a.next || s.flags.in_prison) continue;
    // 2・3 段目は同じ職場にいる時だけ(いなければ飛ばす)
    if ((a.step === 1 || a.step === 2) && (s.status !== 'employed' || (a.co && a.co !== s.company.id))) { a.step++; continue; }
    const pre = kind === 'mentor' ? 'ev_mt_' : 'ev_me_';
    const used = [...(s.inner.mentor?.used ?? []), ...(s.inner.mentee?.used ?? [])];
    const vs0 = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => EVENT_BY_ID.get(`${pre}${a.step + 1}${x}`)).filter((e): e is GameEvent => !!e && (!e.needs || used.includes(e.needs)) && (!e.jobs || e.jobs.includes(s.job)) && (!SAME_CO.has(e.id) || (s.status === 'employed' && a.co === s.company.id)));
    const freshV = vs0.filter((e) => !s.inner.recent?.includes(e.id));
    const vs = freshV.length ? freshV : vs0;
    if (vs.length) {
      const ev = r.pick(vs);
      a.used.push(ev.id);
      s.inner.seen[ev.id] = s.year;
      log(s, fill(s, evText(s, ev)), 'event', ev.tag);
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

/** どの終わり方でも、最後は同期との掛け合い(キッズ・リターンのパロディ)。場面だけ終わり方で変える */
function kidsReturn(s: State, id: EndingId) {
  // 相方: まだ業界にいて塀の外の同期。会社に入らず始めた人生なら「昔の仲間」
  const seenName = (x: State) => s.log.some((l) => l.text.ja.includes(x.name.ja.split(' ')[0]));
  const outside = s.inner.peerStates.filter((x) => !x.flags.in_prison);
  const rivalSt = s.inner.rival && s.inner.rival.step >= 2 ? outside.find((x) => s.inner.rival!.name.ja.startsWith(x.name.ja.split(' ')[0])) : undefined; // ライバルの同期がいれば、その人と
  const bud = rivalSt ?? outside.find((x) => !x.ending && seenName(x)) ?? outside.find(seenName) ?? outside.find((x) => !x.ending) ?? outside[0] ?? s.inner.peerStates[0];
  const indieStart = s.companies[0]?.company.size === 'indie';
  const rel = indieStart ? { ja: '昔の仲間の', en: 'your old friend' } : { ja: '同期の', en: 'your old peer' };
  const p = `${rel.ja}${bud?.name.ja.split(' ')[0] ?? '相棒'}`, pe = `${rel.en} ${bud?.name.en.split(' ').slice(-1)[0] ?? ''}`.trim();
  const jail = s.flags.in_prison || id === 'end_arrest';
  const where: Partial<Record<EndingId, Text>> = {
    end_restart: s.rng.pick([
      { ja: `帰り道、${p}がぽつりと言った。`, en: `On the way home, ${pe} said quietly:` },
      { ja: `打ち上げの後の屋台で、${p}が湯気の向こうで言った。`, en: `At a food stall after the wrap party, ${pe} said through the steam:` },
      { ja: `夜中の開発室に、ふたりだけ残っていた。${p}がモニターを見たまま言った。`, en: `Only the two of you were left in the dev room at night. ${pe} said, still staring at the monitor:` },
      { ja: `終電を待つホームで、${p}が言った。`, en: `Waiting for the last train, ${pe} said:` },
    ]),
    end_retire: s.rng.pick([
      { ja: `送別会の帰り、${p}が言った。`, en: `Leaving the farewell party, ${pe} said:` },
      { ja: `最後の出社の日、エレベーターの中で${p}が言った。`, en: `On your last day, in the elevator, ${pe} said:` },
    ]),
    end_pen_down: { ja: `70 歳の誕生日、${p}から電話があった。`, en: `On your 70th birthday, ${pe} called:` },
    end_body: { ja: `病院のベッドの横で、${p}が言った。`, en: `By your hospital bed, ${pe} said:` },
    end_debt: { ja: `店をたたんだ夜、${p}が缶ビールを持って来て言った。`, en: `The night you closed shop, ${pe} came by with canned beer and said:` },
  };
  const w = jail ? { ja: `面会室で、${p}がアクリル板ごしに言った。`, en: `In the visiting room, ${pe} said through the acrylic panel:` }
    : where[id] ?? { ja: `最後の日、${p}と並んで歩きながら、${p.replace(/^.*の/, '')}が言った。`, en: `Walking side by side on your last day, ${pe} said:` };
  s.inner.kr = { ja: `${w.ja}\n「なあ、俺たち、もう終わっちゃったのかな」\n「バカヤロー、まだ始まっちゃいねえよ」`, en: `${w.en}\n"Hey... are we finished?"\n"Idiot. We haven't even started yet."` };
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
  if (!s.inner.fan && firstWork && s.year > firstWork.year && s.year < 2022) {
    const p = personName(r, s.year - 10);
    const given = p.ja.split(' ')[1] ?? p.ja;
    s.inner.fan = { name: { ja: `${given}さん`, en: p.en.split(' ')[0] }, step: 0, next: s.year, used: [], work: firstWork.name };
  }
  // ライバル: 同じ会社の同期(本人の同期の 2 人目)
  const rp = s.inner.peerStates[1];
  if (!s.inner.rival && rp && s.status === 'employed' && s.year - s.startYear >= 2 && s.company.size !== 'indie')
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
function wOf(s: State): (e: GameEvent) => number {
  const rec = s.inner.recent;
  const p = tune<number>('life.recentPenalty');
  return (e) => (e.weight ?? 1) * (rec?.includes(e.id) ? p : 1) * (e.tag?.includes('insider') ? 0.4 : 1);
}

/** 版の中から、直近の人生で見ていないものを選ぶ(全部見ていたら乱数) */
function pickFresh(s: State, r: Rng, ids: string[]): string {
  const fresh = ids.filter((id) => !s.inner.recent?.includes(id));
  return r.pick(fresh.length ? fresh : ids);
}

/** 話の本文: 言い回し違い(alt)があれば、直近の人生とこの人生で使っていないものから */
function evText(s: State, ev: GameEvent): Text {
  return ev.alt?.length ? freshLine(s, [ev.text, ...ev.alt]) : ev.text;
}
/** 決まった流れの文: 直近の人生とこの人生で使っていない言い回しから選ぶ */
function freshLine(s: State, texts: Text[]): Text {
  const said = (s.inner.saidLines ??= []);
  const fresh = texts.filter((t) => !said.includes(t.ja) && !s.inner.recent?.includes(`line:${t.ja}`));
  const t = s.rng.pick(fresh.length ? fresh : texts.filter((x) => !said.includes(x.ja)).length ? texts.filter((x) => !said.includes(x.ja)) : texts);
  said.push(t.ja);
  return t;
}
