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
  if (deaths.includes(e.id)) { const put = (x?: import('./types').Effect) => ({ ...(x ?? {}), flag: { ...(x?.flag ?? {}), [flag]: true } }); e.effect = put(e.effect); for (const c of e.choices ?? []) c.effect = put(c.effect); continue; } // 選択のある話は話そのものの effect が使われないので、選択ごとにも立てる(第 19 回: 危篤の祖父が生き返った)
  if ((e.weight ?? 1) > 0 && re.test([e.text, ...(e.alt ?? [])].map((x) => x.ja).join('')) && !(e.when ?? []).includes(`!flag.${flag}`)) e.when = [...(e.when ?? []), `!flag.${flag}`];
}

// 話ごとの「出してよい立場」(state_hints.json。第 19 回: 全部の話を読んで、本文が前提にしている立場を条件にした)
const shMod = import.meta.glob('../data/state_hints.json', { eager: true, import: 'default' }) as Record<string, Record<string, { when?: string[]; jobs?: string[] }>>;
const STATE_HINTS = Object.values(shMod)[0] ?? {};
for (const e of EVENTS) {
  const h = STATE_HINTS[e.id]; if (!h) continue;
  for (const c of h.when ?? []) if (!(e.when ?? []).includes(c)) e.when = [...(e.when ?? []), c];
  if (h.jobs?.length && !e.jobs) e.jobs = h.jobs as import('./types').Job[];
}
// 本文から職種を読む(第 10 回ペルソナ: プログラマに「自分の描いた木」、営業に開発の話)。job_hints.json に無い話だけ
const JOB_WORDS: [RegExp, import('./types').Job[]][] = [
  [/自分の描いた|あなたの描いた|自分が描いた|あなたの絵|自分の絵|描き直し|ドット絵を|原画を/, ['artist', 'director']],
  [/あなたの曲|自分の曲|あなたの昔の曲|作曲|効果音を作/, ['sound', 'director']],
  [/昔のバグ表|バグ票を書|再現手順を/, ['qa']],
  [/自分の作った(ステージ|敵|ボス|キャラ|面|ダンジョン)|調合表を作|あなたの作った(ステージ|敵|ボス|面)/, ['planner', 'programmer', 'artist', 'director']], // 第 24 回: QA・営業に「自分の作った敵キャラ」
  [/キャラを 1 人作|キーボードをなで|1 日 14 時間ゲームを作/, ['planner', 'programmer', 'artist', 'sound', 'director', 'producer']],
  [/自分のコード|あなたのコード|コードを見た|自分の書いたコード|ソースを読|バグを直した夜/, ['programmer', 'director']],
  [/あなたの企画書|自分の企画書|企画書を見せ|企画書を書/, ['planner', 'director', 'producer', 'programmer', 'artist', 'sound']],
];
const jobWord = (e: GameEvent) => { const tx = [e.text, ...(e.alt ?? [])].map((x) => x.ja).join(''); for (const [re, j] of JOB_WORDS) if (re.test(tx)) return j; return undefined; };
// 職種と話のずれを防ぐ(ペルソナ通読: サウンドなのに絵の話ばかり)。job_hints.json = 本文が特定の職種の作業を前提にしている話 → 出してよい職種
const jhMod = import.meta.glob('../data/job_hints.json', { eager: true, import: 'default' }) as Record<string, Record<string, string[] | string>>;
const JOB_HINTS = Object.values(jhMod)[0] ?? {};
for (const e of EVENTS) { const j = JOB_HINTS[e.id]; if (Array.isArray(j) && j.length) e.jobs = j as import('./types').Job[]; if (e.id.startsWith('ev_sys_')) continue; const w = jobWord(e); if (w) e.jobs = e.jobs ? (e.jobs.filter((x) => w.includes(x)).length ? e.jobs.filter((x) => w.includes(x)) : w) : w; } // 本文の言葉が決める職種は、手で付けた職種と重ねて絞る(第 21 回: QA に「あなたの描いた丸いキャラ」)

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
  // 付き合う前の話は結婚前だけ(第 12 回ペルソナ: 籍を入れて子どもが生まれた後に「結婚式の曲が決まった」)
  if (/結婚式の曲|別々の家から|付き合い始め|デート|告白|電話代を見て/.test(tx) && !has(e, 'flag.lv_married')) { add(e, '!flag.lv_married'); if (!has(e, 'flag.child')) add(e, '!flag.child'); }
  // 実在の会社に後ろ暗い話を付けない
  if (/宝石を売|サクラ|裏金|粉飾|横領|夜逃げ/.test(tx) && !has(e, 'flag.real_co')) add(e, '!flag.real_co');
  // 自分の子どもの話は、子どもの年齢に合う時だけ(第 9 回ペルソナ: 1 歳でケータイのゲーム、2 歳でナワバリバトル)
  if ((/child|kid/.test(e.id) || /^子どもが|^子どもに|^子どもと/.test(tx)) && !/生まれ/.test(tx) && !/^ev_hs_.*_(any|abroad|client|client_lead)$|ev_sega|boss_kid|fan_parent/.test(e.id) && !has(e, 'kid')) {
    add(e, /就職|内定|ゲーム会社に入|面接|成人|初任給/.test(tx) ? 'kid>=20' : /思春期/.test(tx) ? 'kid>=13' : /学校|作文|宿題|クラス|授業参観|運動会|ノート|定規/.test(tx) ? 'kid>=7' : 'kid>=4');
  }
  if (/籍を入れ|プロポーズ/.test(t) && !has(e, 'flag.lv_married')) add(e, '!flag.lv_married');
  if (/義理の(母|父)|義母|義父|妻が|夫が|配偶者/.test(e.text.ja) && !has(e, 'flag.lv_married')) add(e, 'flag.lv_married');
  // ソシャゲ側かコンシューマ側か(第 16 回ペルソナ: 「コンシューマに残った」人に運営とガチャ、ソシャゲに移った人に店の棚)
  if (!HIST_OF.has(e.id) && !e.tag?.includes('hardware')) {
    if (/ガチャ|運営|運用|イベントを回|障害の|ログイン|排出率|お詫びの石/.test(tx) && !has(e, 'flag.hw_dv_console')) add(e, '!flag.hw_dv_console');
    if (/パッケージ|店の棚|平積み|ワゴン|中古屋|発売日に並|見本盤|箱を/.test(tx) && /(自分|うち|あなた)の/.test(tx) && !has(e, 'flag.hw_dv_mobile')) add(e, '!flag.hw_dv_mobile');
  }
  // 作品名を差し込む話は、作品が出てから(第 18 回ペルソナ: 『まだ名前の無い作品』が賞を取った)
  if (/\{work\}/.test(tx) && !has(e, 'works')) add(e, 'works>=1');
  // 会社が無くなる話は、本当に会社を移る(第 18 回ペルソナ: 事務所が空っぽの翌年も同じ会社で焼肉)
  if (/事務所が空っぽ|シャッターが下り|鍵が替わっていた/.test(tx) && !e.choices && !e.effect?.flag) e.effect = { ...(e.effect ?? {}), flag: { do_change_company: true } };
  // 日本の会社・暮らしの話は、海外の会社にいる間は出さない
  if (/元請け|下請け|即売会|節電|社員旅行|忘年会|役員会|朝礼|社内報|電車|新幹線|地元|広報誌|コミケ|居酒屋|定食屋/.test(tx) && !has(e, 'company.size') && !has(e, 'pos')) add(e, 'company.size!=abroad');
  // 1〜3 月の社内の出来事は、その年の 4 月に入った新人には起きない(第 21 回: 2001 年入社なのに 1 月 31 日の朝礼にいる)
  if (/(^|[^0-9])[1-3] 月 \d+ 日/.test(tx) && /朝礼|社内|会社|先輩|上司/.test(tx) && !has(e, 'career')) add(e, 'career>=1');
  // 後輩がいるのは入って 2 年目から(第 24 回: 入社した年に「後輩が叫ぶ」)
  if (/後輩/.test(tx) && !/^ev_(me|mt|fa|rv)_/.test(e.id) && !has(e, 'career')) add(e, 'career>=2');
  // 同期と同じ社内にいる前提の話は、最初の会社にいる間だけ(第 24 回: 怪しい会社に移った後に「同期の堀内と最終面談」)
  if (/\{peer\}/.test(tx) && /面談|会議|社内|隣の|チーム|飲み会|椅子|揺り起こ/.test(tx) && !has(e, 'cos')) add(e, 'cos<=1');
  // 「まだ一度も稼いでいない」はヒットが無い時だけ
  if (/(稼いだ|売れた|ヒットした)ことは、?まだ一度も/.test(tx) && !has(e, 'hits')) add(e, 'hits<1');
  // 会社の中の話は、会社にいる時だけ
  if (/社内|会議|上司|部長|出社|同僚|課長|朝礼|昼休み|ボーナス|人事に呼ばれ|辞令|うちのチーム|チームの|部下|社員証|社内報|配属|入社以来|新人が|新人の|定時|チャイム|社員食堂|総務|経理|社員旅行|忘年会|送別会|歓迎会|会社の照明|会社のドア|会社の椅子|入館証|採用の権限|隣の部署|隣の島|仕事帰り|同期の|社長は|営業は|営業が|プランナー同士|チーム全員|ヒットのボーナス/.test(tx) && !has(e, 'status') && !has(e, 'pos') && !has(e, 'job=teacher')) add(e, 'status=employed');
  // 年数: 「N 年前」「N 年ぶり」はキャリアが N 年以上 / 入社直後の話はキャリア 1 年目まで
  const ago = /(\d+) 年(前|ぶり|分|越し|間ずっと|磨いた|借り続け|続けてきた|使い続け)/.exec(tx); // 第 24 回: 入社 6 年で「10 年磨いたドット絵」
  if (ago && +ago[1] >= 5 && !has(e, 'career')) add(e, `career>=${+ago[1]}`);
  if (/入社 ?\d+ ?日目|新人研修|配属初日|入社初日|新入社員/.test(tx) && !has(e, 'career')) add(e, 'career<=1');
  // 自分の作品が前提の話は、作品を 1 本以上出してから(作品 0 本なのに「自分の作品で…」が出ていた)
  if (/自分の作品|あなたの作品|自分のゲーム|あなたのゲーム|昔作った|発売された箱|自分が作った|自作の|自分の昔の|昔の作品|マスター ROM|過去作|自分の担当した|あなたの作った|あなたの新作/.test(tx) && !has(e, 'works')) add(e, 'works>=1');
  // 仕事の書類の話は、無職の間は出さない(独立中は出してよい)
  if (/仕様書|企画書|本業|会社にばれ|勤め先|定時/.test(tx) && !has(e, 'status') && !has(e, 'pos')) add(e, 'status!=left');
  // 親友を見送った後に、その親友が出てくる話は出さない
  if (/親友/.test(tx) && !has(e, 'flag.friend_gone')) add(e, '!flag.friend_gone');
  // 会社が潰れる・営業停止の話は、実在の会社にいる時は出さない(史実に無い倒産)
  if (/営業を停止|倒産|事務所が空っぽ|会社が潰れ|会社がつぶれ|シャッターが下り|鍵が替わ|差し押さえ|身売り/.test(tx) && !has(e, 'flag.real_co')) add(e, '!flag.real_co');
  // 2020〜21 年は即売会がほぼ開かれなかった
  if (/即売会/.test(tx) && e.years[0] <= 2021 && e.years[1] >= 2020) add(e, 'year!=2020'), add(e, 'year!=2021');
  // 昔の作品の話は、2 年以上前の作品がある時だけ(出したばかりの作品に「リマスター」が来ない)
  if (/\{work\}/.test(tx) && /リマスター|復刻|昔の|移植版|再販/.test(tx) && !e.tag?.includes('afterlife')) e.tag = [...(e.tag ?? []), 'afterlife'];
}

// ネタの型(第 13 回ペルソナ: 「電車で知らない人が自分のゲームを遊んでいる」が 3 人生で 5 回、など)。同じ型は 1 人生 1 回
const MOTIFS: [string, RegExp][] = [
  ['train', /(電車|新幹線|車両).*(自分の|あなたの|うちの)(ゲーム|作品|作った)|(自分の|あなたの)(ゲーム|作品).*(電車|新幹線)/],
  ['hospital', /入院|病室/],
  ['readable_code', /コードの方が読みやすい|自分より読みやすかった/],
  ['vr_sick', /(VR|ゴーグル).*(酔|座り込|壁を探|床で)/],
  ['hunt', /一狩り|狩りに|狩場|狩りをして/],
  ['sequel_out', /続編.*(呼ばれ|外さ|新聞で知|一覧に無)/],
  ['six_fingers', /指が 6 本/],
  ['insider', /インサイダー|株を買/],
  ['card_drawer', /名刺.*引き出し/],
  ['wallpaper', /待ち受けにした/],
  ['sales_graph', /売上(の)?グラフを毎朝|売上を毎朝/],
  ['bingo', /ビンゴ/],
  ['press_news', /地元の新聞|地元紙/],
  ['no_button_phone', /ボタンの無い電話/],
  ['partner_play', /パートナーが(後ろで|叫んだ|夜中)/],
  ['muscle_box', /箱絵.*(筋肉|マッチョ)|筋肉質/],
  ['zero_yen', /1 円も入らない/],
  ['cosplay', /コスプレ/],
  ['hidden_gem', /隠れた名作/],
  ['rta', /RTA|世界記録/],
  ['sega_exit', /(セガ|白い機械|ドリキャス|ドリームキャスト).*撤退|撤退.*(セガ|朝礼)/],
  ['no_home', /家に帰らなかった|鍵の形/],
  ['bug_trick', /バグ.*裏技|裏技.*バグ/],
  ['brain', /脳年齢|体力年齢|を鍛える/],
  ['shortage', /品薄|売り切れ続き|家電(店|量販店)に並|抽選に/],
  ['fc_end', /ファミコン.*(終わ|製造を終)/],
  ['hd_shift', /HD 化|ハイビジョン|テクスチャ 4 倍/],
  ['gacha_rate', /排出率|確率表記|確率表|小数点を 1 つ/], // 第 23 回: ガチャの確率ネタが 1 人生に 3 回
  ['gym', /ジムに入会|ジムの会員/],
  ['ai_ban', /生成 ?AI 禁止|AI の使用を禁止|AI 禁止の通達/], ['atami', /熱海/],   ['sleeping_bag', /寝袋/], ['floor_sleep', /床で寝ていたら|床で段ボール|段ボールを敷いて/], ['boss_lookalike', /昔の自分のボスにそっくり|自分の作ったボスにそっくり/], // 第 24 回: 寝袋・床で寝る・ボスにそっくりが何度も
  ['parent_save', /セーブデータ.*(名前|「)|「(とうちゃん|おかん)」/],
];
for (const e of EVENTS) { const tx = [e.text, ...(e.alt ?? [])].map((x) => x.ja).join(' '); const m = MOTIFS.find(([, re]) => re.test(tx)); if (m && !e.id.startsWith('ev_sys_')) e.motif = m[0]; else if (e.tag?.includes('crime') && e.choices) e.motif = 'crime'; if (e.tag?.includes('early_exit') && e.choices) e.motif = 'early_exit'; if (e.choices && !e.id.startsWith('ev_sys_') && !e.motif) { if (/AI/.test(tx) && e.years[1] >= 2022) e.motif = 'ai_choice'; else if (/ケータイ(の)?部署|ソシャゲ(に|へ)(行|移)/.test(tx + (e.choices ?? []).map((c) => c.label.ja).join(''))) e.motif = 'mobile_move'; } } // AI をどう使うか・ケータイへ移るかの選択は 1 人生 1 回 // 早くに去る選択は 1 人生 1 回 // 犯罪の入口(選択)は続けて遊ぶと出にくく
// 家族の危機の大きな選択(危篤・倒れた・最後の願い)は 1 人生 1 回、続けて遊んでも出にくく(第 19 回: 3 人生で 5 回)
for (const e of EVENTS) if (['ev_lv_big_grandpa', 'ev_lv_big_father', 'ev_lv_big_mother_last', 'ev_tn_big_care'].includes(e.id)) e.motif = 'family_crisis';
// 歴史の事件の「ケータイ部署を引き受けるか」も、ハードの選択と同じ型・同じ印に(第 20 回: 引き受けた後に「ソシャゲに行く?」と聞かれた)
for (const e of EVENTS) if (e.choices?.some((c) => c.effect?.flag?.hiv_social)) { e.motif = 'mobile_move'; for (const c of e.choices) c.effect = { ...(c.effect ?? {}), flag: { ...(c.effect?.flag ?? {}), ...(c.effect?.flag?.hiv_social ? { hw_dv_mobile: true } : { hw_dv_console: true }) } }; }
// もう海外にいる人に「海を渡るか」「初めての海外出張」を出さない(第 20 回: 海外で始めた人生の 1999 年に「海外のスタジオから誘い」)
for (const e of EVENTS) { const tx = [e.text, ...(e.alt ?? [])].map((x) => x.ja).join(' '); if ((e.choices?.some((c) => c.effect?.flag?.life_abroad || c.effect?.flag?.went_abroad) || e.effect?.flag?.went_abroad || /初めての海外|海外出張|海外のスタジオから/.test(tx)) && !has(e, 'company.size')) add(e, 'company.size!=abroad'); }
for (const e of EVENTS) if (e.tag?.includes('crime') && !has(e, 'career')) add(e, 'career>=2'); // 入って 1 年目に捕まって 22 歳で終わる人生にしない(第 22 回)
for (const e of EVENTS) if (['ev_era5_vr_team', 'ev_tn_big_vr', 'ev_hs_2016_psvr_client_lead'].includes(e.id)) e.motif = 'vr_move'; // VR 部署に行くかは 1 人生 1 回(第 22 回: 2017 年に断って 2018 年に行く)
for (const e of EVENTS) if (e.id.startsWith('ev_wk_restructure_')) e.motif = 'restructure'; // 希望退職かカスタマーセンターかは 1 人生 1 回(第 20 回: 2002 と 2009 に 2 回)
// 選択の後日談(later で来る話)には印を付ける(同じ人生で 2 回出さない)
for (const e of EVENTS) for (const c of e.choices ?? []) for (const l of c.later ?? []) { const t = EVENTS.find((x) => x.id === l.event); if (t && !t.tag?.includes('followup')) t.tag = [...(t.tag ?? []), 'followup']; }
// ハードの選択の後日談は、その選択がまだ生きている時だけ(後で別の陣営を選んだら、前の選択の後日談は出さない)
{
  const need = new Map<string, Set<string>>();
  for (const e of EVENTS) for (const c of e.choices ?? []) {
    const fl = Object.entries(c.effect.flag ?? {}).filter(([k, v]) => v && /^hw_/.test(k)).map(([k]) => k).sort().join(',');
    for (const l of c.later ?? []) { const s0 = need.get(l.event) ?? new Set(); s0.add(fl); need.set(l.event, s0); }
  }
  for (const [id, sets] of need) {
    if (sets.size !== 1) continue;
    const fl = [...sets][0]; const ev = EVENTS.find((x) => x.id === id);
    if (ev && fl) for (const f of fl.split(',')) if (!has(ev, `flag.${f}`)) add(ev, `flag.${f}`);
  }
}
// 業界を去る選択(do_end / do_switch)は、入って 5 年たってから(第 11 回ペルソナ: 22 歳のうちに玉の輿で退場、初めての人が「ゲームはどこ?」)
for (const e of EVENTS) {
  if (e.id.startsWith('ev_sys_') || has(e, 'career')) continue;
  const fl = [e.effect, ...(e.choices ?? []).map((c) => c.effect)].flatMap((x) => Object.keys(x?.flag ?? {}));
  if (fl.some((f) => f === 'do_end' || f === 'do_switch')) add(e, 'career>=5');
}
// てっぺんの話の「作品が」は作品名に(第 11 回ペルソナ: 「作品が 100 万本」がどの作品か分からない)
for (const e of EVENTS) if (e.id.startsWith('ev_tn_pk_')) for (const t of [e.text, ...(e.alt ?? [])]) { if (t.ja.startsWith('作品が')) { t.ja = t.ja.replace(/^作品が/, '{work}が'); t.en = t.en.replace(/^(Your game|The game)/, '{work}'); } }
// ハードの選択の印を足す(第 13 回ペルソナ: Switch を選んだのに PS5 で出る。Switch の選択が「コンシューマ」の印しか付けていなかった)
{
  const extra: Record<string, Record<string, boolean>> = { 'ev_hw_switch_or_phone/0': { hw_mk_nintendo: true }, 'ev_hw_ds_or_psp/0': { hw_fm_handheld: true }, 'ev_hw_ds_or_psp/1': { hw_fm_handheld: true }, 'ev_hw_handheld_war/1': { hw_fm_handheld: true } };
  for (const [k, f] of Object.entries(extra)) { const [id, i] = k.split('/'); const c = EVENTS.find((e) => e.id === id)?.choices?.[+i]; if (c) c.effect = { ...c.effect, flag: { ...(c.effect.flag ?? {}), ...f } }; }
}
// 企画の判断(題名・続編か新作か・延期か削るか・海外版・エンジン・チーム)は、QA と営業には来ない(第 19 回ペルソナ: 社員 8 人の会社の QA が続編を 10 本決めていた)
for (const e of EVENTS) if (e.tag?.includes('worklife') && e.choices && !e.jobs && !/restructure|promote/.test(e.id)) e.jobs = ['programmer', 'planner', 'artist', 'sound', 'director', 'producer'];
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
  } else if (!has(e, 'hits')) { add(e, 'hits>=1'); if (/ボーナス|ヒット記念|段ボール 3 箱/.test(t)) add(e, 'lastres=hit'); } // ボーナスは直近の作品がヒットの時(第 20 回: 爆死の翌年にヒットのボーナス)
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
