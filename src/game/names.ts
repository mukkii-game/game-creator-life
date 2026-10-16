// 架空の名前を作る(人・会社・作品)。実在の人・会社・作品は出さない(PLAN §6)。
import type { Rng } from '../core/rng';
import type { Text, CompanySize, Role, Job } from './types';

const SURNAMES: [string, string][] = [
  ['佐藤', 'Sato'], ['鈴木', 'Suzuki'], ['高橋', 'Takahashi'], ['田中', 'Tanaka'], ['渡辺', 'Watanabe'], ['伊藤', 'Ito'],
  ['山本', 'Yamamoto'], ['中村', 'Nakamura'], ['小林', 'Kobayashi'], ['加藤', 'Kato'], ['吉田', 'Yoshida'], ['山田', 'Yamada'],
  ['松本', 'Matsumoto'], ['井上', 'Inoue'], ['木村', 'Kimura'], ['林', 'Hayashi'], ['清水', 'Shimizu'], ['森', 'Mori'],
  ['池田', 'Ikeda'], ['橋本', 'Hashimoto'], ['石川', 'Ishikawa'], ['前田', 'Maeda'], ['藤田', 'Fujita'], ['岡田', 'Okada'],
];
const GIVEN: [string, string][] = [
  ['ひろし', 'Hiroshi'], ['まさと', 'Masato'], ['けんじ', 'Kenji'], ['ゆうこ', 'Yuko'], ['あきら', 'Akira'], ['みどり', 'Midori'],
  ['たかし', 'Takashi'], ['なおみ', 'Naomi'], ['しんじ', 'Shinji'], ['えり', 'Eri'], ['だいすけ', 'Daisuke'], ['さやか', 'Sayaka'],
  ['りょう', 'Ryo'], ['まい', 'Mai'], ['こうき', 'Koki'], ['あおい', 'Aoi'], ['はると', 'Haruto'], ['ゆい', 'Yui'],
];
export function personName(r: Rng): Text {
  const s = r.pick(SURNAMES), g = r.pick(GIVEN);
  return { ja: `${s[0]} ${g[0]}`, en: `${g[1]} ${s[1]}` };
}
export function surname(n: Text): Text { return { ja: n.ja.split(' ')[0], en: n.en.split(' ').slice(-1)[0] }; }

const CO_HEAD: [string, string][] = [
  ['ピコピコ', 'PicoPico'], ['ドット', 'Dot'], ['ネオ', 'Neo'], ['スーパー', 'Super'], ['ハイパー', 'Hyper'], ['銀河', 'Galaxy'],
  ['コズミック', 'Cosmic'], ['ブリキ', 'Tin'], ['テクノ', 'Techno'], ['電脳', 'Cyber'], ['まんぼう', 'Sunfish'], ['ちくわ', 'Chikuwa'],
  ['ラピッド', 'Rapid'], ['エンドレス', 'Endless'], ['ミッドナイト', 'Midnight'], ['カップ麺', 'CupNoodle'], ['徹夜', 'AllNighter'], ['ふじやま', 'Fujiyama'],
];
const CO_TAIL: Record<CompanySize, [string, string][]> = {
  big: [['ゲームス', 'Games'], ['エンタテインメント', 'Entertainment'], ['インタラクティブ', 'Interactive']],
  mid: [['ソフト', 'Soft'], ['スタジオ', 'Studio'], ['システム', 'Systems']],
  small: [['工房', 'Works'], ['企画', 'Planning'], ['電子', 'Electronics']],
  sub: [['開発', 'Dev'], ['プログラミング', 'Programming'], ['技研', 'Labs']],
  indie: [['ゲーム部', 'Game Club'], ['', '']],
  abroad: [['Inc.', 'Inc.'], ['Studios', 'Studios'], ['Ltd.', 'Ltd.']],
  school: [['ゲーム専門学校', 'Game College'], ['クリエイティブ専門学校', 'Creative Academy'], ['芸術大学', 'University of Arts'], ['情報大学', 'Information University']],
  none: [['', '']],
};
export function companyName(r: Rng, size: CompanySize, year: number): Text {
  const h = r.pick(CO_HEAD), t = r.pick(CO_TAIL[size]);
  if (size === 'abroad') return { ja: `${h[1]} ${t[0]}`, en: `${h[1]} ${t[1]}` };
  const pre = year < 1990 ? ['株式会社', ''] : ['', ''];
  return { ja: `${pre[0]}${h[0]}${t[0]}`, en: `${h[1]} ${t[1]}`.trim() };
}

// 作品名: 「頭 + 本体 + しっぽ」。時代でしっぽの流行が変わる(副題・数字・〜オンライン・〜の巻 …)
const W_HEAD: [string, string][] = [
  ['伝説の', 'Legend of '], ['超時空', 'Hyper-Time '], ['ドキドキ', 'Doki-Doki '], ['魔界', 'Demon-World '], ['爆走', 'Turbo '],
  ['がんばれ', 'Go Go '], ['銀河', 'Galactic '], ['激闘', 'Fierce '], ['ぷにぷに', 'Puni-Puni '], ['真・', 'True '], ['新', 'Neo '], ['ときめき', 'Heartbeat '],
];
const W_BODY: [string, string][] = [
  ['プリンセス', 'Princess'], ['ファイター', 'Fighter'], ['クエスト', 'Quest'], ['大冒険', 'Adventure'], ['ドラゴン', 'Dragon'], ['ラーメン', 'Ramen'],
  ['忍者', 'Ninja'], ['探偵', 'Detective'], ['麻雀', 'Mahjong'], ['釣り', 'Fishing'], ['戦記', 'Chronicle'], ['パズル', 'Puzzle'],
  ['ハムスター', 'Hamster'], ['サラリーマン', 'Salaryman'], ['ゴルフ', 'Golf'], ['ロボ', 'Robo'], ['牧場', 'Ranch'], ['ダンジョン', 'Dungeon'],
];
function tail(r: Rng, year: number): [string, string] {
  if (year < 1986) return r.pick([['', ''], ['II', ' II'], ['DX', ' DX']]);
  if (year < 1995) return r.pick([['II', ' II'], ['III', ' III'], ['外伝', ' Gaiden'], ['〜光と闇の序章〜', ': Prelude of Light and Dark']]);
  if (year < 2004) return r.pick([['2000', ' 2000'], ['〜永遠の約束〜', ': Eternal Promise'], ['X', ' X'], ['3D', ' 3D']]);
  if (year < 2012) return r.pick([['DS', ' DS'], ['ポータブル', ' Portable'], ['オンライン', ' Online'], ['〜脳を鍛える〜', ': Brain Workout']]);
  if (year < 2020) return r.pick([['ドロップス', ' Drops'], ['〜ガチャ無料〜', ': Free Pulls'], ['ストライク', ' Strike'], ['リバース', ' Rebirth'], ['VR', ' VR']]);
  return r.pick([['リマスター', ' Remastered'], ['サバイバーズ', ' Survivors'], ['ライク', '-like'], ['AI エディション', ' AI Edition'], ['〜人間が作った〜', ': Made by Humans']]);
}
export function workName(r: Rng, year: number): Text {
  const h = r.pick(W_HEAD), b = r.pick(W_BODY), t = tail(r, year);
  return { ja: `『${h[0]}${b[0]}${t[0]}』`, en: `"${h[1]}${b[1]}${t[1]}"` };
}

/** その年に作る機種(表示用)。実名のハードは史実として出してよい(PLAN §6) */
// ハードの選択(hardware.json の hw_* フラグ)→ そのハードで出しやすくなる
const HW_PREF: [string, (p: string) => boolean][] = [
  ['hw_mk_sega', (p) => /メガドライブ|セガサターン|ドリームキャスト/.test(p)],
  ['hw_mk_nintendo', (p) => /ファミコン|NINTENDO64|ゲームボーイ|DS|Wii|Switch/.test(p)],
  ['hw_mk_sony', (p) => /PlayStation|PSP|PS\d/.test(p)],
  ['hw_mk_nec', (p) => /PC エンジン/.test(p)],
  ['hw_fm_handheld', (p) => /ゲームボーイ|DS|PSP|Switch/.test(p)],
  ['hw_fm_home', (p) => !/ゲームボーイ|DS|PSP|ケータイ|スマホ|ソシャゲ|業務用/.test(p)],
  ['hw_pl_arcade', (p) => p === '業務用'],
  ['hw_pl_consumer', (p) => p !== '業務用'],
  ['hw_dv_mobile', (p) => /ケータイ|スマホ|ソシャゲ/.test(p)],
  ['hw_dv_console', (p) => !/ケータイ|スマホ|ソシャゲ|業務用/.test(p)],
];

export function platformFor(r: Rng, year: number, role: Role, flags: Record<string, boolean> = {}): string {
  const base = platformBase(r, year, role);
  if (role === 'solo') return base;
  const prefs = HW_PREF.filter(([f]) => flags[f]);
  if (!prefs.length) return base; // 選んでいなければ乱数の使い方も前と同じ(古い replay が変わらない)
  let list = platformList(year);
  if (flags.hw_pl_arcade && year < 2030 && !list.includes('業務用')) list = [...list, '業務用']; // ゲーセン組は時代が進んでも業務用を作る
  for (const [, ok] of prefs) { const f = list.filter(ok); if (f.length) list = f; }
  return r.chance(0.75) ? r.pick(list) : base;
}

function platformList(year: number): string[] {
  for (const [until, list] of TABLE) if (year < until) return list;
  return ['AI クラウド', 'スマホ'];
}

const TABLE: [number, string[]][] = [
  [1978, ['業務用']], [1983, ['業務用', 'PC-8801']], [1986, ['ファミコン', '業務用']], [1990, ['ファミコン', 'メガドライブ', 'PC エンジン', 'ゲームボーイ']],
  [1994, ['スーパーファミコン', 'メガドライブ', 'ゲームボーイ']], [1998, ['PlayStation', 'セガサターン', 'NINTENDO64']],
  [2001, ['PlayStation', 'ドリームキャスト', 'PlayStation 2']], [2004, ['PlayStation 2', 'ゲームボーイアドバンス', 'ケータイ']],
  [2007, ['ニンテンドー DS', 'PSP', 'PlayStation 2', 'ケータイ']], [2010, ['ニンテンドー DS', 'Wii', 'PS3', 'ケータイ']],
  [2014, ['ソシャゲ', 'スマホ', '3DS', 'PS3']], [2017, ['スマホ', 'PS4', '3DS']], [2021, ['スマホ', 'Switch', 'PS4']],
  [2025, ['Switch', 'PS5', 'スマホ']], [2040, ['Switch 2', 'PS5', 'スマホ', 'AI クラウド']],
];

function platformBase(r: Rng, year: number, role: Role): string {
  if (role === 'solo') {
    if (year < 1984) return 'PC-8801';
    if (year < 1995) return r.pick(['PC-9801', 'MSX2', 'X68000']);
    if (year < 2008) return r.pick(['Windows', '同人 CD-R']);
    if (year < 2016) return r.pick(['Steam', 'iPhone', 'Flash']);
    return r.pick(['Steam', 'itch.io', 'Switch', 'スマホ']);
  }
  for (const [until, list] of TABLE) if (year < until) return r.pick(list);
  return r.pick(['AI クラウド', 'スマホ']);
}

export const JOB_TEXT: Record<Job, Text> = {
  programmer: { ja: 'プログラマ', en: 'programmer' }, planner: { ja: 'プランナー', en: 'planner' }, artist: { ja: 'グラフィッカー', en: 'artist' },
  sound: { ja: 'サウンド', en: 'sound designer' }, qa: { ja: 'デバッガー', en: 'QA tester' }, sales: { ja: '営業', en: 'sales rep' },
  director: { ja: 'ディレクター', en: 'director' }, producer: { ja: 'プロデューサー', en: 'producer' }, teacher: { ja: '講師', en: 'teacher' }, other: { ja: '業界の外', en: 'outside the industry' },
};
export const OTHER_JOBS: Text[] = [
  { ja: '実家の農業', en: 'family farm' }, { ja: 'ラーメン屋', en: 'ramen shop' }, { ja: '不動産屋', en: 'real-estate office' },
  { ja: '市役所', en: 'city hall' }, { ja: 'パン屋', en: 'bakery' }, { ja: '塾の講師', en: 'cram school' }, { ja: 'タクシー会社', en: 'taxi company' },
  { ja: '喫茶店', en: 'coffee shop' }, { ja: '温泉旅館', en: 'hot-spring inn' },
];

/** 立場の呼び名(社員証と年表図鑑に出す) */
export const POS_TEXT: Record<import('./types').Pos, Text> = {
  client_lead: { ja: '発注元の責任者', en: 'publisher-side lead' }, client: { ja: '発注元(大手)', en: 'publisher staff' },
  dev_lead: { ja: '開発会社の責任者', en: 'studio lead' }, dev: { ja: '開発会社', en: 'studio staff' },
  sub: { ja: '下請け', en: 'subcontractor' }, qa: { ja: 'デバッガー', en: 'QA tester' },
  indie: { ja: '独立', en: 'indie' }, abroad: { ja: '海外', en: 'overseas' }, teacher: { ja: '先生', en: 'teacher' }, prison: { ja: '塀の中', en: 'in prison' }, outside: { ja: '業界の外', en: 'outside the industry' },
};
