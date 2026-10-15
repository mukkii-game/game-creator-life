// ゲームの中身(描画なし)。画面(src/ui)と結果(src/share)が呼ぶのは init / advance / choose だけ(docs/schema §6)。
// 決まり: Phaser・DOM・Math.random を使わない(乱数は state.rng)。数値は src/tuning.ts。
// 1 回の advance = 1 年。選択が出たら state.choice が埋まって止まり、choose で続きを進める。
import { Rng } from '../core/rng';
import { tune } from '../core/tuning';
import type { State, InitOptions, Text, Effect, GameEvent, Choice, Job, CompanySize, EndingId, Era, LogLine, Company } from './types';
import { EVENT_BY_ID, POOL, TIMELINE_BY_YEAR } from './data';
import { eligible, draw } from './select';
import { personName, companyName, OTHER_JOBS, JOB_TEXT } from './names';
import { release, tickWorks, clamp, RESULT_TEXT } from './works';
import { makeEnding } from './ending';
import { BOTS } from './bots';

export { JOB_TEXT };

export function eraOf(year: number): Era {
  return year <= 1985 ? 'era1' : year <= 1994 ? 'era2' : year <= 2003 ? 'era3' : year <= 2011 ? 'era4' : year <= 2019 ? 'era5' : 'era6';
}

// ---- 業界入りガチャ(PLAN §4) ----
const ERA_SPAN: [number, number, number][] = [[1978, 1985, 1], [1986, 1994, 3], [1995, 2003, 5], [2004, 2011, 7], [2012, 2019, 10], [2020, 2035, 12]];
function gachaYear(r: Rng, era?: Era): number {
  const last = tune('gacha.lastYear');
  const spans = ERA_SPAN.map(([a, b, w]) => [a, Math.min(b, last), w] as const).filter(([a, b], i) => a <= b && (!era || `era${i + 1}` === era));
  if (!spans.length) return 1986;
  const total = spans.reduce((t, [, , w]) => t + w, 0);
  let x = r.next() * total;
  for (const [a, b, w] of spans) { x -= w; if (x < 0) return r.int(a, b); }
  return spans[spans.length - 1][1];
}
function gachaAge(r: Rng): number {
  const x = r.next();
  if (x < tune('gacha.age18')) return 18;
  if (x < tune('gacha.age18') + tune('gacha.lateBloomer')) return r.int(26, 35);
  return 22;
}
type Entry = { size: CompanySize; text: Text; w: (age: number, year: number) => number; indie?: boolean };
const ENTRIES: Entry[] = [
  { size: 'big', text: { ja: '大手に新卒で入り', en: 'fresh graduate at a major' }, w: (a) => (a === 22 ? 3 : 0.3) },
  { size: 'mid', text: { ja: '中堅のソフトハウスに入り', en: 'mid-size studio' }, w: () => 3 },
  { size: 'small', text: { ja: '社員 8 人の会社に入り', en: 'eight-person company' }, w: () => 3 },
  { size: 'sub', text: { ja: '下請けの開発会社に入り', en: 'contract dev shop' }, w: () => 2.5 },
  { size: 'mid', text: { ja: 'アーケードのメーカーに入り', en: 'arcade maker' }, w: (_a, y) => (y < 2000 ? 2 : 0.3) },
  { size: 'indie', text: { ja: '同人から', en: 'from doujin circles' }, w: (a, y) => (y >= 1982 ? (a === 18 ? 1.5 : 0.6) : 0.2), indie: true },
  { size: 'small', text: { ja: '異業種から転職し', en: 'career change' }, w: (a) => (a >= 26 ? 5 : 0) },
  { size: 'abroad', text: { ja: '海外のスタジオに入り', en: 'overseas studio' }, w: (_a, y) => (y >= 1990 ? 0.6 : 0.2) },
];
const JOBS: [Job, number][] = [['programmer', 30], ['planner', 20], ['artist', 20], ['sound', 7], ['qa', 15], ['sales', 6]];
const REGIONS: Text[] = [{ ja: '東京', en: 'Tokyo' }, { ja: '東京', en: 'Tokyo' }, { ja: '京都', en: 'Kyoto' }, { ja: '大阪', en: 'Osaka' }, { ja: '福岡', en: 'Fukuoka' }, { ja: '地方', en: 'the countryside' }];

function wpick<T>(r: Rng, items: T[], w: (t: T) => number): T {
  const total = items.reduce((a, t) => a + w(t), 0);
  let x = r.next() * total;
  for (const t of items) { x -= w(t); if (x < 0) return t; }
  return items[items.length - 1];
}

function newCompany(r: Rng, size: CompanySize, year: number): Company {
  return { id: `co_${size}_${r.int(1, 999)}`, name: companyName(r, size, year), size };
}

export function init(seed: number, options: InitOptions = {}): State {
  const r = new Rng(seed);
  const peerOf = options.peerOf;
  const year = options.year ?? peerOf?.year ?? gachaYear(r, options.era);
  const age = options.age ?? gachaAge(r);
  const entry = wpick(r, ENTRIES, (e) => e.w(age, year));
  const job = wpick(r, JOBS, ([, w]) => w)[0];
  const base = age <= 18 ? [80, 90, 10, 5, 10] : age <= 24 ? [70, 80, 25, 15, 30] : [60, 95, 15, 10, 100];
  const company: Company = entry.indie ? { id: 'co_indie_self', name: { ja: '自室', en: 'your bedroom' }, size: 'indie' }
    : peerOf && peerOf.company.size !== 'indie' ? peerOf.company : newCompany(r, entry.size, year);
  const s: State = {
    seed, year, age, startAge: age, startYear: year, era: eraOf(year), job, status: entry.indie ? 'indie' : 'employed',
    name: personName(r), entry: entry.text, region: entry.size === 'abroad' ? { ja: '海外', en: 'abroad' } : r.pick(REGIONS),
    company,
    stat: { hp: base[0], passion: base[1], skill: base[2], network: base[3], money: base[4], fame: 0 },
    flags: {}, works: [], peers: [], log: [], pending: [], rng: r,
    inner: {
      used: [], queue: [], nextWorkYear: year + r.int(tune('work.everyMin'), tune('work.everyMax')), companyYears: 0, searchFails: 0,
      leftYear: 0, otherJob: null, counts: {}, lastTag: '', choicesMade: 0, peerStates: [], isPeer: !!peerOf, bot: peerOf?.bot ?? '',
      workTarget: -1, startJob: job, prevJob: job,
    },
  };
  if (!peerOf) {
    const bots = ['think', 'dreamer', 'stable'];
    for (let i = 0; i < 3; i++) {
      const p = init((seed * 31 + i * 7919 + 1) >>> 0, { peerOf: { year, company: s.company, bot: bots[i] }, age: r.pick([18, 22, 22, 24]) });
      s.inner.peerStates.push(p);
      s.peers.push({ name: p.name.ja, bot: bots[i], summary: peerSummary(p) });
    }
  }
  logEvent(s, s.status === 'indie' ? 'ev_sys_start_indie' : 'ev_sys_start', 'event');
  return s;
}

// ---- 文の差し込み ----
function fill(s: State, t: Text): Text {
  const w = s.inner.workTarget >= 0 ? s.works[s.inner.workTarget] : s.works[s.works.length - 1];
  const peer = s.inner.peerStates.length ? s.inner.peerStates[s.year % s.inner.peerStates.length].name : { ja: '同期', en: 'a peer' };
  const other = s.inner.otherJob ?? { ja: '別の仕事', en: 'another job' };
  const rep = (str: string, l: 'ja' | 'en') => str
    .replace(/\{name\}/g, s.name[l]).replace(/\{company\}/g, s.company.name[l])
    .replace(/\{work\}/g, w ? w.name[l] : (l === 'ja' ? '『まだ名前の無い作品』' : '"an untitled game"'))
    .replace(/\{age\}/g, String(s.age)).replace(/\{year\}/g, String(s.year))
    .replace(/\{peer\}/g, l === 'ja' ? peer.ja.split(' ')[0] : peer.en.split(' ').slice(-1)[0]).replace(/\{other\}/g, other[l]);
  return { ja: rep(t.ja, 'ja'), en: rep(t.en, 'en') };
}
function log(s: State, text: Text, kind: LogLine['kind'], tag?: string[]) {
  s.log.push({ year: s.year, age: s.age, text, kind, tag });
}
function logEvent(s: State, id: string, kind: LogLine['kind']) {
  const ev = EVENT_BY_ID.get(id);
  if (ev) log(s, fill(s, ev.text), kind, ev.tag);
}

// ---- 効果 ----
function apply(s: State, e: Effect | undefined, ctx: string, out: string[]) {
  if (!e) return;
  for (const k of ['hp', 'passion', 'skill', 'network', 'fame'] as const) if (e[k]) s.stat[k] = clamp(s.stat[k] + e[k]!);
  if (e.money) s.stat.money += e.money;
  if (e.job) s.job = e.job;
  if (e.status && e.status !== s.status) setStatus(s, e.status);
  if (e.work?.add) {
    const { work, line } = release(s);
    if (e.work.add.platform) work.platform = e.work.add.platform;
    if (e.work.add.role) work.role = e.work.add.role;
    log(s, line, 'work'); out.push('work');
  }
  if (e.work?.last) {
    const w = s.inner.workTarget >= 0 ? s.works[s.inner.workTarget] : s.works[s.works.length - 1];
    if (w) {
      if (e.work.last.result) w.result = e.work.last.result;
      if (e.work.last.history) w.history.push({ year: s.year, text: e.work.last.history });
    }
  }
  for (const [f, v] of Object.entries(e.flag ?? {})) {
    if (!f.startsWith('do_')) { s.flags[f] = v; continue; }
    if (!v) continue;
    if (f === 'do_change_company') {
      const size: CompanySize = s.stat.skill >= 60 ? s.rng.pick(['big', 'mid'] as const) : s.rng.pick(['mid', 'small', 'sub'] as const);
      s.company = newCompany(s.rng, size, s.year); s.inner.companyYears = 0; setStatus(s, 'employed');
      s.inner.nextWorkYear = s.year + s.rng.int(tune('work.everyMin'), tune('work.everyMax'));
    } else if (f === 'do_go_indie') {
      setStatus(s, 'indie'); s.company = { id: 'co_indie_self', name: { ja: `${s.name.ja.split(' ')[0]}ゲームス`, en: `${s.name.en.split(' ').slice(-1)[0]} Games` }, size: 'indie' };
      s.inner.nextWorkYear = s.year + s.rng.int(1, 3);
    } else if (f === 'do_return') {
      s.job = s.inner.prevJob; s.company = newCompany(s.rng, s.rng.pick(['mid', 'small', 'sub'] as const), s.year);
      setStatus(s, 'employed'); s.inner.companyYears = 0; s.inner.leftYear = 0; s.flags.came_back = true;
      s.inner.nextWorkYear = s.year + s.rng.int(1, 3);
    } else if (f === 'do_end') {
      end(s, s.flags.ai_seat ? 'end_ai_seat' : ctx === 'ev_sys_comeback' ? 'end_burnout' : 'end_retire', out);
    }
  }
}
function setStatus(s: State, st: State['status']) {
  if (st === 'left' && s.status !== 'left') { s.inner.leftYear = s.year; s.inner.searchFails = 0; s.company = { id: 'co_none', name: { ja: '無職', en: 'unemployed' }, size: 'none' }; }
  s.status = st;
}
function schedule(s: State, later: { after: number; event: string }[] | undefined) {
  for (const l of later ?? []) s.pending.push({ year: s.year + l.after, event: l.event });
}
function count(s: State, ev: GameEvent) {
  for (const t of ev.tag ?? []) s.inner.counts[t] = (s.inner.counts[t] ?? 0) + 1;
}

// ---- 終わり ----
function end(s: State, id: EndingId, out: string[]) {
  if (s.ending) return;
  s.ending = makeEnding(s, id);
  s.status = 'ended';
  s.choice = undefined;
  s.inner.queue = [];
  log(s, s.ending.cause, 'event', ['ending']);
  out.push('ended');
}
function checkEnd(s: State, out: string[]) {
  if (s.ending) return;
  if (s.stat.hp <= 0) {
    if (!s.flags.collapsed) { s.flags.collapsed = true; s.stat.hp = 35; logEvent(s, 'ev_sys_collapse', 'event'); apply(s, EVENT_BY_ID.get('ev_sys_collapse')?.effect, '', out); }
    else return end(s, 'end_body', out);
  }
  if (s.stat.passion <= 0 && (s.status === 'employed' || s.status === 'indie')) {
    if (s.flags.burned) return end(s, 'end_burnout', out);
    s.flags.burned = true; s.inner.prevJob = s.job; s.inner.otherJob = s.rng.pick(OTHER_JOBS);
    logEvent(s, 'ev_sys_burnout', 'event');
    apply(s, EVENT_BY_ID.get('ev_sys_burnout')?.effect, '', out);
    s.stat.passion = 25; s.inner.queue = [];
  }
  if (s.stat.money <= tune('job.debtLimit') && s.status !== 'employed') return end(s, 'end_debt', out);
  if (s.inner.searchFails >= 3) return end(s, 'end_blacklist', out);
}

// ---- 1 年 ----
function beginYear(s: State, out: string[]) {
  s.era = eraOf(s.year);
  const r = s.rng;
  for (const t of TIMELINE_BY_YEAR.get(s.year) ?? []) log(s, t.text, 'timeline', [t.kind]);
  if ((TIMELINE_BY_YEAR.get(s.year) ?? []).length) out.push('timeline');
  const q: string[] = [];
  const sys: string[] = [];
  // 予約(later)
  const due = s.pending.filter((p) => p.year <= s.year);
  s.pending = s.pending.filter((p) => p.year > s.year);
  for (const p of due) q.push(p.event);
  // 職と年齢の節目
  if (s.year > 2040) { sys.push('@end:end_ai_seat'); }
  else if (s.age >= 70) sys.push('@end:end_pen_down');
  else if (s.age === 65 && (s.status === 'employed' || s.status === 'indie')) sys.push('ev_sys_age65', '@check65');
  else if (s.age >= 60 && !s.flags.age60 && (s.status === 'employed' || s.status === 'indie')) { s.flags.age60 = true; sys.push('ev_sys_age60'); }
  if (s.status === 'employed') {
    const mult = { big: 0.3, mid: 1, small: 1.6, sub: 2, abroad: 1, indie: 0, none: 0 }[s.company.size];
    const bad = [1983, 1991, 1992, 2001, 2008, 2009, 2023, 2024].includes(s.year) ? 2 : 1;
    if (r.chance(tune('job.bankrupt') * mult * bad)) sys.push('ev_sys_bankrupt');
    else {
      if (s.year >= s.inner.nextWorkYear) q.push('@release');
      if (!s.flags.age60 && r.chance(tune('job.offer') + s.stat.network / 600)) sys.push('ev_sys_offer');
      else if (canPromote(s) && r.chance(tune('job.promote'))) sys.push('ev_sys_promote');
      if (s.year >= 2027 && !s.inner.used.includes('ev_sys_ai_seat') && r.chance(Math.min(0.5, tune('ai.seat') * (1 + 2 * (s.year - 2027) / 8)))) sys.push('ev_sys_ai_seat');
    }
  } else if (s.status === 'indie') {
    if (s.year >= s.inner.nextWorkYear) q.push('@release');
    if (r.chance(0.08 + s.stat.network / 500) && s.stat.money < 100) sys.push('@rehire_offer');
  } else if (s.status === 'left') {
    if (s.flags.burned && s.job === 'other') {
      if (s.year - s.inner.leftYear >= 5) sys.push('@end:end_burnout');
      else if (!s.inner.used.includes('ev_sys_comeback') && r.chance(tune('job.comeback') + s.stat.network / 400)) sys.push('ev_sys_comeback');
    } else if (s.year > s.inner.leftYear) sys.push('@search');
  }
  // データのイベント
  const n = r.int(tune('life.eventsMin'), tune('life.eventsMax')) - (q.length > 0 ? 1 : 0);
  const sysChoice = sys.some((id) => EVENT_BY_ID.get(id)?.choices) || q.some((id) => EVENT_BY_ID.get(id)?.choices);
  const allowChoice = !sysChoice && r.chance(tune('life.choiceEvery'));
  const pool = POOL.filter((e) => eligible(s, e) && (allowChoice || !e.choices) && (!e.tag?.includes('afterlife') || hasOldWork(s)));
  let picked = draw(r, pool, Math.max(1, n));
  // 選択は 1 年に 1 本まで
  let seenChoice = false;
  picked = picked.filter((e) => { if (!e.choices) return true; if (seenChoice) return false; seenChoice = true; return true; });
  const ids = picked.map((e) => e.id);
  // 作品の発売は真ん中あたりに
  const rel = q.indexOf('@release');
  if (rel >= 0) { q.splice(rel, 1); ids.splice(r.int(0, ids.length), 0, '@release'); }
  s.inner.queue = [...q, ...ids, ...sys];
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
    const { line } = release(s);
    log(s, line, 'work'); out.push('work');
    s.inner.nextWorkYear = s.year + r.int(tune('work.everyMin'), tune('work.everyMax'));
    return;
  }
  if (id === '@check65') { if (s.stat.hp < 40) end(s, 'end_retire', out); return; }
  if (id === '@search') {
    const p = tune('job.rehire') + (s.stat.skill + s.stat.network) / 250;
    if (r.chance(p)) {
      const size: CompanySize = s.stat.skill >= 65 ? r.pick(['big', 'mid'] as const) : r.pick(['mid', 'small', 'sub', 'sub'] as const);
      s.company = newCompany(r, size, s.year); s.inner.companyYears = 0;
      logEvent(s, 'ev_sys_rehired', 'event'); apply(s, EVENT_BY_ID.get('ev_sys_rehired')?.effect, id, out);
      s.inner.nextWorkYear = s.year + r.int(1, 3);
    } else { s.inner.searchFails++; logEvent(s, 'ev_sys_search_fail', 'event'); apply(s, EVENT_BY_ID.get('ev_sys_search_fail')?.effect, id, out); }
    out.push('event');
    return;
  }
  if (id === '@rehire_offer') { // 独立中にお金が尽きかけたら、会社員に戻る誘い
    return runItem(s, 'ev_sys_offer', out);
  }
  const ev = EVENT_BY_ID.get(id);
  if (!ev) return;
  if (ev.years && (s.year < ev.years[0] || s.year > ev.years[1])) return;
  if (ev.once && s.inner.used.includes(ev.id)) return;
  // 後日談: 発売から 2 年以上たった作品を 1 本選ぶ
  s.inner.workTarget = -1;
  if (ev.tag?.includes('afterlife')) {
    const old = s.works.map((w, i) => [w, i] as const).filter(([w]) => s.year - w.year >= 2);
    if (!old.length) return;
    s.inner.workTarget = r.pick(old)[1];
  }
  if (ev.once || ev.id.startsWith('ev_sys_')) s.inner.used.push(ev.id);
  count(s, ev);
  if (ev.id === 'ev_sys_promote') promote(s);
  if (ev.choices) {
    s.choice = { eventId: ev.id, choices: ev.choices, text: fill(s, ev.text) };
    log(s, s.choice.text, 'event', ev.tag);
    out.push('choice');
    return;
  }
  log(s, fill(s, ev.text), ev.tag?.includes('afterlife') ? 'work' : 'event', ev.tag);
  if (ev.tag?.includes('afterlife')) out.push('work'); else out.push('event');
  apply(s, ev.effect, ev.id, out);
  schedule(s, ev.later);
  s.inner.workTarget = -1;
}

function promote(s: State) {
  const to: Partial<Record<Job, Job>> = { qa: 'planner', programmer: 'director', planner: 'director', artist: 'director', sound: 'director', sales: 'producer', director: 'producer' };
  const next = to[s.job];
  if (next) s.job = next;
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
    s.stat.passion = clamp(s.stat.passion - tune('year.passion'));
    s.stat.skill = clamp(s.stat.skill + r.int(tune('year.skillMin'), tune('year.skillMax')) * (s.age >= 50 ? 0.5 : 1));
  }
  if (s.status === 'employed') {
    const mult = { big: 1.5, mid: 1, small: 0.8, sub: 0.5, abroad: 1.6, indie: 0, none: 0 }[s.company.size] * (s.job === 'director' || s.job === 'producer' ? 1.4 : 1) * (s.flags.rehired || s.flags.parttime ? 0.4 : 1);
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
    if (pe) line = { ja: `同期の${nm}: ${pe.cause.ja}。`, en: `Your peer ${en}: ${pe.cause.en}.` };
    else if (newHit) line = { ja: `同期の${nm}の${newHit.name.ja}が${RESULT_TEXT[newHit.result].ja}。飲み会でずっとその話をしていた。`, en: `Your peer ${en}'s ${newHit.name.en} was a ${RESULT_TEXT[newHit.result].en.toLowerCase()}. It was all they talked about at drinks.` };
    else if (p.status !== before.status && p.status === 'indie') line = { ja: `同期の${nm}が独立した。名刺の肩書きは「CEO」。社員は本人だけ。`, en: `Your peer ${en} went indie. Business card: "CEO." Staff: one.` };
    else if (p.job !== before.job && (p.job === 'director' || p.job === 'producer')) line = { ja: `同期の${nm}が${JOB_TEXT[p.job].ja}に昇進した。あなたより先に。`, en: `Your peer ${en} was promoted to ${JOB_TEXT[p.job].en}. Before you.` };
    else if (p.status !== before.status && p.status === 'left' && p.job === 'other') line = { ja: `同期の${nm}が業界を離れ、${p.inner.otherJob?.ja ?? '別の仕事'}へ。年賀状の写真が明るくなった。`, en: `Your peer ${en} left the industry for a ${p.inner.otherJob?.en ?? 'new job'}. Their New Year card looks happier.` };
    s.peers[i].summary = peerSummary(p);
    if (line) { log(s, line, 'peer'); out.push('peer'); }
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
  log(s, fill(s, c.result ?? c.label), 'choice', ['choice']);
  out.push('chosen');
  apply(s, c.effect, eventId, out);
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
