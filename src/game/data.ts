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
/** 普通に抽選されるイベント(system と weight 0 は除く) */
export const POOL: GameEvent[] = EVENTS.filter((e) => !e.id.startsWith('ev_sys_') && !HIST_OF.has(e.id) && (e.weight ?? 1) > 0);
