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
  // 第 7 回ペルソナ: 祖父の危篤・墓参りの翌年に「祖父に聞かれた」
  [/祖父/, 'grandpa_gone', ['ev_lv_big_grandpa', 'ev_lv_grandpa_funeral_brag', 'ev_lv_grandpa_grave']],
];
for (const e of EVENTS) for (const [re, flag, deaths] of KIN) {
  if (deaths.includes(e.id)) { e.effect = { ...(e.effect ?? {}), flag: { ...(e.effect?.flag ?? {}), [flag]: true } }; continue; }
  if ((e.weight ?? 1) > 0 && re.test([e.text, ...(e.alt ?? [])].map((x) => x.ja).join('')) && !(e.when ?? []).includes(`!flag.${flag}`)) e.when = [...(e.when ?? []), `!flag.${flag}`];
}

// 本文から職種を読む(第 10 回ペルソナ: プログラマに「自分の描いた木」、営業に開発の話)。job_hints.json に無い話だけ
const JOB_WORDS: [RegExp, import('./types').Job[]][] = [
  [/自分の描いた|あなたの描いた|自分が描いた|あなたの絵|自分の絵|描き直し|ドット絵を|原画を/, ['artist', 'director']],
  [/あなたの曲|自分の曲|あなたの昔の曲|作曲|効果音を作/, ['sound', 'director']],
  [/自分のコード|あなたのコード|コードを見た|自分の書いたコード|ソースを読|バグを直した夜/, ['programmer', 'director']],
  [/あなたの企画書|自分の企画書|企画書を見せ|企画書を書/, ['planner', 'director', 'producer', 'programmer', 'artist', 'sound']],
];
const jobWord = (e: GameEvent) => { const tx = [e.text, ...(e.alt ?? [])].map((x) => x.ja).join(''); for (const [re, j] of JOB_WORDS) if (re.test(tx)) return j; return undefined; };
// 職種と話のずれを防ぐ(ペルソナ通読: サウンドなのに絵の話ばかり)。job_hints.json = 本文が特定の職種の作業を前提にしている話 → 出してよい職種
const jhMod = import.meta.glob('../data/job_hints.json', { eager: true, import: 'default' }) as Record<string, Record<string, string[] | string>>;
const JOB_HINTS = Object.values(jhMod)[0] ?? {};
for (const e of EVENTS) { const j = JOB_HINTS[e.id]; if (Array.isArray(j) && j.length) e.jobs = j as import('./types').Job[]; else if (!e.id.startsWith('ev_sys_')) { const w = jobWord(e); if (w) e.jobs = w; } }

// 文の中身から、出してよい時を自動で絞る(ペルソナ 3 回目の通読: 家族の順番・無職なのに社内・入社 1 年目に「10 年前」など)。
// データに同じ種類の条件がもう書いてあれば足さない
const has = (e: GameEvent, k: string) => (e.when ?? []).some((c) => c.replace(/^!/, '').startsWith(k));
const add = (e: GameEvent, c: string) => { e.when = [...(e.when ?? []), c]; };
for (const e of EVENTS) {
  if ((e.weight ?? 1) <= 0 || e.id.startsWith('ev_sys_')) continue;
  // 言い回し違い(alt)のどれが出ても合うように、本文は全部つないで見る
  const tx = [e.text, ...(e.alt ?? [])].map((x) => x.ja).join('');
  const t = tx + (e.choices ?? []).map((c) => c.label.ja + (c.result?.ja ?? '') + (c.alt ?? []).map((x) => x.ja).join('')).join('');
  // 家族: 恋人の話は結婚前だけ / 籍を入れる話は結婚前だけ / 義理の親・配偶者の話は結婚後だけ
  if (/恋人/.test(t) && !has(e, 'flag.lv_married')) add(e, '!flag.lv_married');
  if (/恋人/.test(t) && !/元恋人/.test(t) && !has(e, 'flag.child')) add(e, '!flag.child');
  // 自分の子どもの話は、子どもの年齢に合う時だけ(第 9 回ペルソナ: 1 歳でケータイのゲーム、2 歳でナワバリバトル)
  if ((/child|kid/.test(e.id) || /^子どもが|^子どもに|^子どもと/.test(tx)) && !/生まれ/.test(tx) && !/^ev_hs_.*_(any|abroad|client|client_lead)$|ev_sega|boss_kid|fan_parent/.test(e.id) && !has(e, 'kid')) {
    add(e, /就職|内定|ゲーム会社に入|面接|成人|初任給/.test(tx) ? 'kid>=20' : /思春期/.test(tx) ? 'kid>=13' : /学校|作文|宿題|クラス|授業参観|運動会|ノート|定規/.test(tx) ? 'kid>=7' : 'kid>=4');
  }
  if (/籍を入れ|プロポーズ/.test(t) && !has(e, 'flag.lv_married')) add(e, '!flag.lv_married');
  if (/義理の(母|父)|義母|義父|妻が|夫が|配偶者/.test(e.text.ja) && !has(e, 'flag.lv_married')) add(e, 'flag.lv_married');
  // 会社の中の話は、会社にいる時だけ
  if (/社内|会議|上司|部長|出社|同僚|課長|朝礼|昼休み|ボーナス|人事に呼ばれ|辞令|うちのチーム|チームの|部下|社員証|社内報|配属|入社以来|新人が|新人の|定時|チャイム|社員食堂|総務|経理|社員旅行|忘年会|送別会|歓迎会|会社の照明|会社のドア|会社の椅子|入館証/.test(tx) && !has(e, 'status') && !has(e, 'pos') && !has(e, 'job=teacher')) add(e, 'status=employed');
  // 年数: 「N 年前」「N 年ぶり」はキャリアが N 年以上 / 入社直後の話はキャリア 1 年目まで
  const ago = /(\d+) 年(前|ぶり|分|越し|間ずっと)/.exec(tx);
  if (ago && +ago[1] >= 5 && !has(e, 'career')) add(e, `career>=${+ago[1]}`);
  if (/入社 ?\d+ ?日目|新人研修|配属初日|入社初日|新入社員/.test(tx) && !has(e, 'career')) add(e, 'career<=1');
  // 自分の作品が前提の話は、作品を 1 本以上出してから(作品 0 本なのに「自分の作品で…」が出ていた)
  if (/自分の作品|あなたの作品|自分のゲーム|あなたのゲーム|昔作った|発売された箱|自分が作った|自作の|自分の昔の|昔の作品|マスター ROM|過去作|自分の担当した/.test(tx) && !has(e, 'works')) add(e, 'works>=1');
  // 仕事の書類の話は、無職の間は出さない(独立中は出してよい)
  if (/仕様書|企画書|本業|会社にばれ|勤め先|定時/.test(tx) && !has(e, 'status') && !has(e, 'pos')) add(e, 'status!=left');
  // 親友を見送った後に、その親友が出てくる話は出さない
  if (/親友/.test(tx) && !has(e, 'flag.friend_gone')) add(e, '!flag.friend_gone');
  // 会社が潰れる・営業停止の話は、実在の会社にいる時は出さない(史実に無い倒産)
  if (/営業を停止|倒産|事務所が空っぽ|会社が潰れ|会社がつぶれ/.test(tx) && !has(e, 'flag.real_co')) add(e, '!flag.real_co');
  // 2020〜21 年は即売会がほぼ開かれなかった
  if (/即売会/.test(tx) && e.years[0] <= 2021 && e.years[1] >= 2020) add(e, 'year!=2020'), add(e, 'year!=2021');
  // 昔の作品の話は、2 年以上前の作品がある時だけ(出したばかりの作品に「リマスター」が来ない)
  if (/\{work\}/.test(tx) && /リマスター|復刻|昔の|移植版|再販/.test(tx) && !e.tag?.includes('afterlife')) e.tag = [...(e.tag ?? []), 'afterlife'];
}

// 業界を去る選択(do_end / do_switch)は、入って 5 年たってから(第 11 回ペルソナ: 22 歳のうちに玉の輿で退場、初めての人が「ゲームはどこ?」)
for (const e of EVENTS) {
  if (e.id.startsWith('ev_sys_') || has(e, 'career')) continue;
  const fl = [e.effect, ...(e.choices ?? []).map((c) => c.effect)].flatMap((x) => Object.keys(x?.flag ?? {}));
  if (fl.some((f) => f === 'do_end' || f === 'do_switch')) add(e, 'career>=5');
}
// てっぺんの話の「作品が」は作品名に(第 11 回ペルソナ: 「作品が 100 万本」がどの作品か分からない)
for (const e of EVENTS) if (e.id.startsWith('ev_tn_pk_')) for (const t of [e.text, ...(e.alt ?? [])]) { if (t.ja.startsWith('作品が')) { t.ja = t.ja.replace(/^作品が/, '{work}が'); t.en = t.en.replace(/^(Your game|The game)/, '{work}'); } }
// 題名の選択を、次の作品の名前に効かせる(第 11 回ペルソナ: 「漢字 4 文字」を選んだのに『ぷるぷるパネル』)
for (const e of EVENTS) for (const c of e.choices ?? []) {
  const st = ({ ch_wk_tt_kanji: 'tt_kanji', ch_wk_tt_ceo: 'tt_ceo', ch_wk_tn_long: 'tt_long' } as Record<string, string>)[c.id];
  if (st) c.effect = { ...c.effect, flag: { ...(c.effect.flag ?? {}), [st]: true } };
}

// ヒットが前提の話(第 8 回ペルソナ: 「普通」の 1 本しか無いのに「作品が大ヒットし、父が全クリ」がてっぺんに)。
// てっぺんの話は、その話で直近の作品をヒットにする。それ以外はヒットが 1 本以上ある時だけ
for (const e of EVENTS) {
  const t = [e.text, ...(e.alt ?? [])].map((x) => x.ja).join('');
  if (!/大ヒット|ヒットし|ヒット記念|段ボール 3 箱|ヒットのボーナス/.test(t) || /他社|脳トレ|パズル&|ELDEN|パルワールド|横スクロールの|そっくりなゲーム|大ヒット作の開発者/.test(t)) continue;
  if (e.id.startsWith('ev_tn_pk_')) {
    if (!e.effect?.work) { e.effect = { ...(e.effect ?? {}), work: { last: { result: 'hit' } } }; if (!has(e, 'works')) add(e, 'works>=1'); }
  } else if (!has(e, 'hits')) add(e, 'hits>=1');
}

// 海外の会社にいる時に「海外版を出すか」は聞かれない(第 9 回ペルソナ: 海を渡った後に社長が「英語が得意な社員はいない」)
for (const id of ['ev_wk_overseas', 'ev_wk_fu_overseas']) { const e = EVENTS.find((x) => x.id === id); if (e) e.when = [...(e.when ?? []), 'company.size!=abroad']; }

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
