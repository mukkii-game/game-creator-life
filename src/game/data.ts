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

// 文の中身から、出してよい時を自動で絞る(ペルソナ 3 回目の通読: 家族の順番・無職なのに社内・入社 1 年目に「10 年前」など)。
// データに同じ種類の条件がもう書いてあれば足さない
const has = (e: GameEvent, k: string) => (e.when ?? []).some((c) => c.replace(/^!/, '').startsWith(k));
const add = (e: GameEvent, c: string) => { e.when = [...(e.when ?? []), c]; };
for (const e of EVENTS) {
  if ((e.weight ?? 1) <= 0 || e.id.startsWith('ev_sys_')) continue;
  const t = e.text.ja + (e.choices ?? []).map((c) => c.label.ja + (c.result?.ja ?? '')).join('');
  // 家族: 恋人の話は結婚前だけ / 籍を入れる話は結婚前だけ / 義理の親・配偶者の話は結婚後だけ
  if (/恋人/.test(t) && !has(e, 'flag.lv_married')) add(e, '!flag.lv_married');
  if (/籍を入れ|プロポーズ/.test(t) && !has(e, 'flag.lv_married')) add(e, '!flag.lv_married');
  if (/義理の(母|父)|義母|義父|妻が|夫が|配偶者/.test(e.text.ja) && !has(e, 'flag.lv_married')) add(e, 'flag.lv_married');
  // 会社の中の話は、会社にいる時だけ
  if (/社内|会議|上司|部長|出社|同僚|課長|朝礼|昼休み/.test(e.text.ja) && !has(e, 'status') && !has(e, 'pos') && !has(e, 'job=teacher')) add(e, 'status=employed');
  // 年数: 「N 年前」「N 年ぶり」はキャリアが N 年以上 / 入社直後の話はキャリア 1 年目まで
  const ago = /(\d+) 年(前|ぶり|分|越し|間ずっと)/.exec(e.text.ja);
  if (ago && +ago[1] >= 5 && !has(e, 'career')) add(e, `career>=${+ago[1]}`);
  if (/入社 ?\d+ ?日目|新人研修|配属初日|入社初日|新入社員/.test(e.text.ja) && !has(e, 'career')) add(e, 'career<=1');
  // 自分の作品が前提の話は、作品を 1 本以上出してから(作品 0 本なのに「自分の作品で…」が出ていた)
  if (/自分の作品|あなたの作品|自分のゲーム|あなたのゲーム|昔作った|発売された箱|自分が作った|自作の/.test(e.text.ja) && !has(e, 'works')) add(e, 'works>=1');
  // 仕事の書類の話は、無職の間は出さない(独立中は出してよい)
  if (/仕様書|企画書|本業|会社にばれ|勤め先|定時/.test(e.text.ja) && !has(e, 'status') && !has(e, 'pos')) add(e, 'status!=left');
  // 親友を見送った後に、その親友が出てくる話は出さない
  if (/親友/.test(e.text.ja) && !has(e, 'flag.friend_gone')) add(e, '!flag.friend_gone');
  // 会社が潰れる・営業停止の話は、実在の会社にいる時は出さない(史実に無い倒産)
  if (/営業を停止|倒産|事務所が空っぽ|会社が潰れ|会社がつぶれ/.test(e.text.ja) && !has(e, 'flag.real_co')) add(e, '!flag.real_co');
  // 2020〜21 年は即売会がほぼ開かれなかった
  if (/即売会/.test(e.text.ja) && e.years[0] <= 2021 && e.years[1] >= 2020) add(e, 'year!=2020'), add(e, 'year!=2021');
  // 昔の作品の話は、2 年以上前の作品がある時だけ(出したばかりの作品に「リマスター」が来ない)
  if (/\{work\}/.test(e.text.ja) && /リマスター|復刻|昔の|移植版|再販/.test(e.text.ja) && !e.tag?.includes('afterlife')) e.tag = [...(e.tag ?? []), 'afterlife'];
}

// ソシャゲへの移籍は 1 回だけ(ハードの選択と時代の話の両方で出ていた)
{
  const tr = EVENTS.find((e) => e.id === 'ev_era4_social_transfer');
  if (tr) { tr.when = [...(tr.when ?? []), '!flag.hw_dv_mobile']; for (const c of tr.choices ?? []) if (c.id === 'ch_era4_social_go') c.effect = { ...c.effect, flag: { ...(c.effect.flag ?? {}), hw_dv_mobile: true } }; }
  const hw = EVENTS.find((e) => e.id === 'ev_hw_mobile_or_console');
  if (hw) hw.when = [...(hw.when ?? []), '!flag.hw_dv_mobile'];
}

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
