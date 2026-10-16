// src/data/ の JSON をまとめて読む(ファイルを足せば自動で入る)。
import type { GameEvent, TimelineEntry, Hist } from './types';

const evMods = import.meta.glob('../data/events/*.json', { eager: true, import: 'default' }) as Record<string, GameEvent[]>;
const tlMods = import.meta.glob('../data/timeline*.json', { eager: true, import: 'default' }) as Record<string, TimelineEntry[]>;

const hsMods = import.meta.glob('../data/hist/*.json', { eager: true, import: 'default' }) as Record<string, Hist[]>;

/** 歴史の事件(年の順) */
export const HIST: Hist[] = Object.keys(hsMods).sort().flatMap((k) => hsMods[k]).sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0));
export const HIST_BY_ID = new Map(HIST.map((h) => [h.id, h]));
/** 事件の各立場(variant)を普通のイベントの形に直したもの。variant id → 事件 id */
export const HIST_OF = new Map<string, string>();
const histEvents: GameEvent[] = HIST.flatMap((h) => h.variants.map((v) => {
  HIST_OF.set(v.id, h.id);
  return { ...v, years: [h.year, h.until ?? h.year] as [number, number], tag: [...(v.tag ?? []), 'hist'] };
}));

export const EVENTS: GameEvent[] = [...Object.keys(evMods).sort().flatMap((k) => evMods[k]), ...histEvents];
export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));
export const TIMELINE: TimelineEntry[] = Object.values(tlMods).flat()
  .filter((t) => !t.unverified)
  .sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0));
/** 年 → その年の史実 */
export const TIMELINE_BY_YEAR = new Map<number, TimelineEntry[]>();
for (const t of TIMELINE) {
  if (!TIMELINE_BY_YEAR.has(t.year)) TIMELINE_BY_YEAR.set(t.year, []);
  TIMELINE_BY_YEAR.get(t.year)!.push(t);
}
// 家族が亡くなった後に、その人が出てくる話を出さない(ペルソナ通読: 母を見送った 4 年後に「母がゲームを作った」)。
// 遺品の話が flag を立て、本文に母・父が出てくる話には条件を足す(データを 1 本ずつ直さずに済むよう、読み込み時に)
const KIN: [RegExp, string, string[]][] = [
  [/(?<![祖叔伯保寮分])母(?![校国艦体])/, 'mother_gone', ['ev_lv_mother_save', 'ev_lv_mother_video']],
  [/(?<![祖叔伯神])父(?![兄])/, 'father_gone', ['ev_lv_father_shelf']],
];
for (const e of EVENTS) for (const [re, flag, deaths] of KIN) {
  if (deaths.includes(e.id)) { e.effect = { ...(e.effect ?? {}), flag: { ...(e.effect?.flag ?? {}), [flag]: true } }; continue; }
  if ((e.weight ?? 1) > 0 && re.test(e.text.ja) && !(e.when ?? []).includes(`!flag.${flag}`)) e.when = [...(e.when ?? []), `!flag.${flag}`];
}

// 職種と話のずれを防ぐ(ペルソナ通読: サウンドなのに絵の話ばかり)。job_hints.json = 本文が特定の職種の作業を前提にしている話 → 出してよい職種
const jhMod = import.meta.glob('../data/job_hints.json', { eager: true, import: 'default' }) as Record<string, Record<string, string[] | string>>;
const JOB_HINTS = Object.values(jhMod)[0] ?? {};
for (const e of EVENTS) { const j = JOB_HINTS[e.id]; if (Array.isArray(j) && j.length) e.jobs = j as import('./types').Job[]; }

/** 普通に抽選されるイベント(system と weight 0 は除く) */
export const POOL: GameEvent[] = EVENTS.filter((e) => !e.id.startsWith('ev_sys_') && !HIST_OF.has(e.id) && (e.weight ?? 1) > 0);

// 会社名の表(本当に有名な会社は実名、中小はパロディ名。PLAN §13)と、引退時の最後の台詞(lastwords)
export interface CoRow { id: string; name: import('./types').Text; years: [number, number]; weight?: number; size?: string; renames?: [number, import('./types').Text][] }
const coMod = import.meta.glob('../data/companies.json', { eager: true, import: 'default' }) as Record<string, { real: CoRow[]; parody: CoRow[] }>;
export const COMPANIES = Object.values(coMod)[0] ?? { real: [], parody: [] };
// 会社ごとの作風(作品のジャンルの寄せ先)と社風の一言(company_traits.json)
export interface CoTrait { genres?: string[]; lines?: import('./types').Text[] }
const ctMod = import.meta.glob('../data/company_traits.json', { eager: true, import: 'default' }) as Record<string, Record<string, CoTrait | string>>;
export const CO_TRAITS: Record<string, CoTrait> = Object.fromEntries(Object.entries(Object.values(ctMod)[0] ?? {}).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object')) as Record<string, CoTrait>;
export interface LastWord { id: string; endings: string[]; when?: string[]; text: import('./types').Text }
const lwMod = import.meta.glob('../data/lastwords.json', { eager: true, import: 'default' }) as Record<string, { lines: LastWord[] }>;
export const LASTWORDS: LastWord[] = Object.values(lwMod)[0]?.lines ?? [];
