// 架空の名前を作る(人・会社・作品)。実在の人・会社・作品は出さない(PLAN §6)。
import type { Rng } from '../core/rng';
import type { Text, CompanySize, Role, Job } from './types';

const SURNAMES: [string, string][] = [['佐藤', 'Sato'],['鈴木', 'Suzuki'],['高橋', 'Takahashi'],['田中', 'Tanaka'],['渡辺', 'Watanabe'],['伊藤', 'Ito'],['山本', 'Yamamoto'],['中村', 'Nakamura'],['小林', 'Kobayashi'],['加藤', 'Kato'],['吉田', 'Yoshida'],['山田', 'Yamada'],['佐々木', 'Sasaki'],['松本', 'Matsumoto'],['井上', 'Inoue'],['木村', 'Kimura'],['林', 'Hayashi'],['清水', 'Shimizu'],['山崎', 'Yamazaki'],['森', 'Mori'],['池田', 'Ikeda'],['橋本', 'Hashimoto'],['阿部', 'Abe'],['石川', 'Ishikawa'],['山下', 'Yamashita'],['中島', 'Nakajima'],['石井', 'Ishii'],['小川', 'Ogawa'],['前田', 'Maeda'],['岡田', 'Okada'],['長谷川', 'Hasegawa'],['藤田', 'Fujita'],['後藤', 'Goto'],['近藤', 'Kondo'],['村上', 'Murakami'],['遠藤', 'Endo'],['青木', 'Aoki'],['坂本', 'Sakamoto'],['斉藤', 'Saito'],['福田', 'Fukuda'],['太田', 'Ota'],['西村', 'Nishimura'],['藤井', 'Fujii'],['金子', 'Kaneko'],['岡本', 'Okamoto'],['藤原', 'Fujiwara'],['中野', 'Nakano'],['三浦', 'Miura'],['原田', 'Harada'],['中川', 'Nakagawa'],['松田', 'Matsuda'],['竹内', 'Takeuchi'],['小野', 'Ono'],['田村', 'Tamura'],['中山', 'Nakayama'],['和田', 'Wada'],['石田', 'Ishida'],['森田', 'Morita'],['上田', 'Ueda'],['原', 'Hara'],['内田', 'Uchida'],['柴田', 'Shibata'],['酒井', 'Sakai'],['宮崎', 'Miyazaki'],['横山', 'Yokoyama'],['高木', 'Takagi'],['安藤', 'Ando'],['宮本', 'Miyamoto'],['大野', 'Ono'],['小島', 'Kojima'],['谷口', 'Taniguchi'],['今井', 'Imai'],['工藤', 'Kudo'],['高田', 'Takada'],['増田', 'Masuda'],['丸山', 'Maruyama'],['杉山', 'Sugiyama'],['村田', 'Murata'],['大塚', 'Otsuka'],['新井', 'Arai'],['小山', 'Koyama'],['平野', 'Hirano'],['藤本', 'Fujimoto'],['河野', 'Kono'],['上野', 'Ueno'],['野口', 'Noguchi'],['武田', 'Takeda'],['松井', 'Matsui'],['千葉', 'Chiba'],['岩崎', 'Iwasaki'],['菅原', 'Sugawara'],['木下', 'Kinoshita'],['久保', 'Kubo'],['佐野', 'Sano'],['野村', 'Nomura'],['松尾', 'Matsuo'],['菊地', 'Kikuchi'],['杉本', 'Sugimoto'],['市川', 'Ichikawa'],['古川', 'Furukawa'],['大西', 'Onishi'],['島田', 'Shimada'],['水野', 'Mizuno'],['桜井', 'Sakurai'],['高野', 'Takano'],['渡部', 'Watanabe'],['吉川', 'Yoshikawa'],['山内', 'Yamauchi'],['西田', 'Nishida'],['飯田', 'Iida'],['菊池', 'Kikuchi'],['西川', 'Nishikawa'],['小松', 'Komatsu'],['北村', 'Kitamura'],['安田', 'Yasuda'],['五十嵐', 'Igarashi'],['川口', 'Kawaguchi'],['平田', 'Hirata'],['関', 'Seki'],['中田', 'Nakata'],['久保田', 'Kubota'],['服部', 'Hattori'],['東', 'Higashi'],['岩田', 'Iwata'],['土屋', 'Tsuchiya'],['川崎', 'Kawasaki'],['福島', 'Fukushima'],['本田', 'Honda'],['辻', 'Tsuji'],['樋口', 'Higuchi'],['秋山', 'Akiyama'],['田口', 'Taguchi'],['永井', 'Nagai'],['山中', 'Yamanaka'],['中西', 'Nakanishi'],['吉村', 'Yoshimura'],['川上', 'Kawakami'],['石原', 'Ishihara'],['大橋', 'Ohashi'],['松岡', 'Matsuoka'],['馬場', 'Baba'],['浅野', 'Asano'],['荒木', 'Araki'],['大久保', 'Okubo'],['野田', 'Noda'],['小池', 'Koike'],['星野', 'Hoshino'],['熊谷', 'Kumagai'],['須藤', 'Sudo'],['堀', 'Hori'],['片山', 'Katayama'],['宮下', 'Miyashita'],['黒田', 'Kuroda'],['望月', 'Mochizuki'],['篠原', 'Shinohara'],['堀内', 'Horiuchi']];
// 下の名前は生まれた年代で変わる(昭和ひとけた〜平成生まれ)。同じ名前ばかりにならないよう多めに
const GIVEN: Record<'old' | 'mid' | 'gen' | 'new', [string, string][]> = {
  old: [['ひろし', 'Hiroshi'],['たかし', 'Takashi'],['あきら', 'Akira'],['まさお', 'Masao'],['しげる', 'Shigeru'],['かずお', 'Kazuo'],['よしお', 'Yoshio'],['ただし', 'Tadashi'],['おさむ', 'Osamu'],['すすむ', 'Susumu'],['つとむ', 'Tsutomu'],['まもる', 'Mamoru'],['のぼる', 'Noboru'],['いさむ', 'Isamu'],['ひでお', 'Hideo'],['てつお', 'Tetsuo'],['のりお', 'Norio'],['みのる', 'Minoru'],['けいこ', 'Keiko'],['ようこ', 'Yoko'],['かずこ', 'Kazuko'],['ひろこ', 'Hiroko'],['まさこ', 'Masako'],['のりこ', 'Noriko'],['さちこ', 'Sachiko'],['えつこ', 'Etsuko'],['じゅんこ', 'Junko'],['みちこ', 'Michiko'],['としこ', 'Toshiko'],['ゆみこ', 'Yumiko'],['きよし', 'Kiyoshi'],['こうじ', 'Koji'],['まさゆき', 'Masayuki'],['としお', 'Toshio']],
  mid: [['まこと', 'Makoto'],['けんじ', 'Kenji'],['こうじ', 'Koji'],['ひでき', 'Hideki'],['てつや', 'Tetsuya'],['なおき', 'Naoki'],['ひろゆき', 'Hiroyuki'],['まさひろ', 'Masahiro'],['かずや', 'Kazuya'],['しんじ', 'Shinji'],['たかひろ', 'Takahiro'],['じゅん', 'Jun'],['さとし', 'Satoshi'],['ゆうじ', 'Yuji'],['やすし', 'Yasushi'],['あつし', 'Atsushi'],['のぶゆき', 'Nobuyuki'],['ともや', 'Tomoya'],['ゆうこ', 'Yuko'],['なおみ', 'Naomi'],['まゆみ', 'Mayumi'],['くみこ', 'Kumiko'],['ともこ', 'Tomoko'],['みどり', 'Midori'],['あけみ', 'Akemi'],['えみ', 'Emi'],['かおり', 'Kaori'],['ゆかり', 'Yukari'],['りえ', 'Rie'],['まき', 'Maki'],['ちえ', 'Chie'],['さとみ', 'Satomi'],['みき', 'Miki'],['なつこ', 'Natsuko']],
  gen: [['だいすけ', 'Daisuke'],['たくや', 'Takuya'],['けんた', 'Kenta'],['しょうた', 'Shota'],['ゆうすけ', 'Yusuke'],['こうへい', 'Kohei'],['りょうすけ', 'Ryosuke'],['たつや', 'Tatsuya'],['まさき', 'Masaki'],['かずき', 'Kazuki'],['ゆうき', 'Yuki'],['なおと', 'Naoto'],['しゅんすけ', 'Shunsuke'],['とおる', 'Toru'],['ひろき', 'Hiroki'],['けいすけ', 'Keisuke'],['あい', 'Ai'],['まい', 'Mai'],['えり', 'Eri'],['さやか', 'Sayaka'],['あゆみ', 'Ayumi'],['めぐみ', 'Megumi'],['ゆか', 'Yuka'],['ちひろ', 'Chihiro'],['なつみ', 'Natsumi'],['あや', 'Aya'],['みほ', 'Miho'],['さおり', 'Saori'],['ともみ', 'Tomomi'],['えりか', 'Erika'],['りさ', 'Risa'],['のぞみ', 'Nozomi'],['かな', 'Kana'],['しおり', 'Shiori']],
  new: [['はると', 'Haruto'],['そうた', 'Sota'],['ゆうと', 'Yuto'],['れん', 'Ren'],['はやと', 'Hayato'],['りく', 'Riku'],['こうき', 'Koki'],['たいが', 'Taiga'],['かいと', 'Kaito'],['そら', 'Sora'],['ゆうま', 'Yuma'],['だいき', 'Daiki'],['りょう', 'Ryo'],['しゅん', 'Shun'],['あおい', 'Aoi'],['ゆい', 'Yui'],['ひな', 'Hina'],['さくら', 'Sakura'],['みゆ', 'Miyu'],['りん', 'Rin'],['ここな', 'Kokona'],['ひかり', 'Hikari'],['あかり', 'Akari'],['ゆな', 'Yuna'],['みお', 'Mio'],['めい', 'Mei'],['ほのか', 'Honoka'],['まなみ', 'Manami'],['ななみ', 'Nanami'],['ちさと', 'Chisato'],['いつき', 'Itsuki'],['なぎさ', 'Nagisa']],
};
/** 生まれた年(わからなければ 1965 年生まれあたり) */
export function personName(r: Rng, born = 1965): Text {
  const band = born < 1955 ? 'old' : born < 1972 ? 'mid' : born < 1990 ? 'gen' : 'new';
  const s = r.pick(SURNAMES), g = r.pick(GIVEN[band]);
  return { ja: `${s[0]} ${g[0]}`, en: `${g[1]} ${s[1]}` };
}
export function surname(n: Text): Text { return { ja: n.ja.split(' ')[0], en: n.en.split(' ').slice(-1)[0] }; }

const CO_HEAD: [string, string][] = [
  ['テクノ', 'Techno'], ['電脳', 'Cyber'], ['ネオ', 'Neo'], ['ミッドナイト', 'Midnight'], ['ハイパー', 'Hyper'], ['コズミック', 'Cosmic'],
  ['ラピッド', 'Rapid'], ['エンドレス', 'Endless'], ['スーパー', 'Super'], ['ギャラクシー', 'Galaxy'], ['アルファ', 'Alpha'], ['ビット', 'Bit'],
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
export function companyName(r: Rng, size: CompanySize, _year: number): Text {
  const h = r.pick(CO_HEAD), t = r.pick(CO_TAIL[size]);
  if (size === 'abroad') return { ja: `${h[1]} ${t[0]}`, en: `${h[1]} ${t[1]}` };
  return { ja: `${h[0]}${t[0]}`, en: `${h[1]} ${t[1]}`.trim() };
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
  if (year < 2012) return r.pick([['DS', ' DS'], ['ポータブル', ' Portable'], ['オンライン', ' Online'], ['〜でもいっしょ〜', ': Together'], ...(year >= 2006 ? [['〜脳を鍛える〜', ': Brain Workout']] as [string, string][] : [])]); // 脳トレは 2005 年末から(第 20 回: 2004 年に「脳を鍛える」)
  if (year < 2020) return r.pick([['ドロップス', ' Drops'], ['〜ガチャ無料〜', ': Free Pulls'], ['ストライク', ' Strike'], ['リバース', ' Rebirth'], ['ラッシュ', ' Rush']]); // VR はハードを選んだ時だけ(第 48 回: 3DS に『〜VR』)
  return r.pick([['リマスター', ' Remastered'], ['サバイバーズ', ' Survivors'], ['ライク', '-like'], ['AI エディション', ' AI Edition'], ['〜人間が作った〜', ': Made by Humans']]);
}
/** 題名の部品(頭・体)。1 人生の中で同じ部品を使い回さない(第 50 回: 「麻雀」「魔界」「銀河」が 3 本ずつ) */
export function partsOf(name: string): string[] { return [...W_HEAD, ...W_BODY].map((x) => x[0]).filter((x) => x && name.includes(x)); }
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
  ['hw_mk_nec', (p) => /PC エンジン|PC-FX/.test(p)],
  ['hw_mk_3do', (p) => /3DO/.test(p)],
  ['hw_fm_handheld', (p) => /ゲームボーイ|DS|PSP|Switch/.test(p)],
  ['hw_fm_home', (p) => !/ゲームボーイ|DS|PSP|ケータイ|スマホ|ソシャゲ|業務用/.test(p)],
  ['hw_pl_arcade', (p) => p === '業務用'],
  ['hw_pl_consumer', (p) => p !== '業務用'],
  ['hw_dv_mobile', (p) => /ケータイ|スマホ|ソシャゲ/.test(p)],
  ['hw_dv_console', (p) => !/ケータイ|スマホ|ソシャゲ|業務用/.test(p)],
];

export function platformFor(r: Rng, year: number, role: Role, flags: Record<string, boolean> = {}, co?: string): string {
  const base = platformBase(r, year, role);
  if (role === 'solo') return base;
  // ハードを作る会社の社員は、自社のハードで出す(第 11 回ペルソナ: SCE の社員がドリキャス、ソニーで 3DS)
  const own = co === 'co_sony' ? /PlayStation|PSP|PS\d/ : co === 'co_nintendo' ? /ファミコン|NINTENDO64|ゲームボーイ|DS|Wii|Switch|3DS/ : null;
  if (own) { const l = platformList(year).filter((p) => own.test(p)); if (l.length) return r.pick(l); }
  // セガの社員は、ハードから撤退する 2001 年まではセガのハード(と業務用)でしか出さない
  if (flags.sega && year < 2001) { const own = platformList(year).filter((p) => /メガドライブ|セガサターン|ドリームキャスト|業務用|ゲームギア/.test(p)); return own.length ? r.pick(own) : (year < 1988 ? '業務用' : 'メガドライブ'); }
  // 新しく選んだハードほど先に効かせる(第 8 回ペルソナ: Switch を選んだのに、前に選んだスマホで出ていた)
  const prefs = Object.keys(flags).filter((k) => flags[k] && k.startsWith('hw_')).reverse().map((k) => HW_PREF.find(([f]) => f === k)).filter((x): x is [string, (p: string) => boolean] => !!x);
  if (!prefs.length) return base; // 選んでいなければ乱数の使い方も前と同じ(古い replay が変わらない)
  let list = platformList(year);
  if (flags.hw_pl_arcade && year < 2030 && !list.includes('業務用')) list = [...list, '業務用']; // ゲーセン組は時代が進んでも業務用を作る
  // 表に無いハード: PC エンジン(1987〜1994 は 16 ビット機と並んで戦う)・PC-FX(1995〜1998)・3DO(1994〜1996)
  if (flags.hw_mk_nec && year >= 1987 && year < 1995 && !list.includes('PC エンジン')) list = [...list, 'PC エンジン'];
  if (flags.hw_mk_nec && (year >= 1995 || (flags.hw_pcfx && year >= 1994)) && year < 1999) list = flags.hw_pcfx ? [...list.filter((p) => p !== 'PC エンジン'), 'PC-FX'] : [...list, 'PC-FX']; // PC-FX を選んだら、その年(1994 年 12 月発売)から PC-FX で出す(2026-10-17 Mukkii: PC-FX を選んだのに PC エンジンで出た)
  if (flags.hw_mk_3do && year >= 1994 && year < 1997) list = [...list, '3DO'];
  for (const [, ok] of prefs) { const f = list.filter(ok); if (f.length) list = f; }
  return r.chance(0.97) ? r.pick(list) : base; // 選んだハードで出す(同じ年に別のハードで出ていた、と通読で指摘。第 7 回ペルソナ: PSP を選んだのに DS → 0.9 から 0.97)
}

function platformList(year: number): string[] {
  for (const [until, list] of TABLE) if (year < until) return list;
  return ['AI クラウド', 'スマホ'];
}

// PS2 は 2000 年 3 月から(第 8 回ペルソナ: 1999 年に PS2)
const TABLE: [number, string[]][] = [
  [1978, ['業務用']], [1983, ['業務用', 'PC-8801']], [1986, ['ファミコン', '業務用']], [1988, ['ファミコン', 'PC エンジン', '業務用']], [1989, ['ファミコン', 'メガドライブ', 'PC エンジン']], [1990, ['ファミコン', 'メガドライブ', 'PC エンジン', 'ゲームボーイ']],
  [1995, ['スーパーファミコン', 'メガドライブ', 'ゲームボーイ']], [1996, ['PlayStation', 'セガサターン', 'スーパーファミコン']], [1998, ['PlayStation', 'セガサターン', 'NINTENDO64']],
  [2000, ['PlayStation', 'ドリームキャスト', 'NINTENDO64']], [2001, ['PlayStation', 'ドリームキャスト', 'PlayStation 2']], [2004, ['PlayStation 2', 'ゲームボーイアドバンス', 'ケータイ']],
  [2007, ['ニンテンドー DS', 'PSP', 'PlayStation 2', 'ケータイ']], [2011, ['ニンテンドー DS', 'Wii', 'PS3', 'ケータイ']],
  [2014, ['ソシャゲ', 'スマホ', '3DS', 'PS3']], [2017, ['スマホ', 'PS4', '3DS']], [2021, ['スマホ', 'Switch', 'PS4']],
  [2025, ['Switch', 'PS5', 'スマホ']], [2040, ['Switch 2', 'PS5', 'スマホ', 'AI クラウド']],
];

function platformBase(r: Rng, year: number, role: Role): string {
  if (role === 'solo') {
    if (year < 1984) return 'PC-8801';
    if (year < 1995) return r.pick(['PC-9801', 'MSX2', 'X68000']);
    if (year < 2008) return r.pick(['Windows', '同人 CD-R']);
    if (year < 2013) return r.pick(['iPhone', 'Flash', '同人 CD-R']); // 個人の Steam は Greenlight(2012 年 8 月)から(第 9 回ペルソナ)
    if (year < 2017) return r.pick(['Steam', 'iPhone', 'スマホ']);
    return r.pick(['Steam', 'itch.io', 'Switch', 'スマホ']); // Switch は 2017 年 3 月から
  }
  for (const [until, list] of TABLE) if (year < until) return r.pick(list);
  return r.pick(['AI クラウド', 'スマホ']);
}

export const JOB_TEXT: Record<Job, Text> = {
  programmer: { ja: 'プログラマ', en: 'programmer' }, planner: { ja: 'プランナー', en: 'planner' }, artist: { ja: 'グラフィッカー', en: 'artist' },
  sound: { ja: 'サウンド', en: 'sound designer' }, qa: { ja: 'デバッガー', en: 'QA tester' }, sales: { ja: '営業', en: 'sales rep' },
  director: { ja: 'ディレクター', en: 'director' }, producer: { ja: 'プロデューサー', en: 'producer' }, teacher: { ja: '講師', en: 'teacher' }, ta: { ja: 'テクニカルアーティスト', en: 'technical artist' }, other: { ja: '業界の外', en: 'outside the industry' },
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
