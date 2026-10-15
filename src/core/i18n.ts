// key → {ja, en}。?lang= が最優先、次にセーブ、次にブラウザ言語。
import { load, save } from './save';
import { query } from './meta';

export type Lang = 'ja' | 'en';

const TABLE: Record<string, { ja: string; en: string }> = {
  title: { ja: '1200万人のゲームクリエイター人生', en: 'Life as One of 12 Million Game Creators' },
  titleSub: { ja: 'ゲーム業界に入って、作って、ぶっ倒れるまで。', en: 'Join the game industry. Make games. Collapse.' },
  tagline: { ja: '18〜70 歳。史実の業界あるあるを浴びながら、開発者として死ぬまで。', en: 'Age 18 to 70. Survive real game-industry history until your career dies.' },
  gacha: { ja: '業界入りガチャを引く', en: 'Pull the Industry Gacha' },
  eraPick: { ja: '業界入りの時代', en: 'Your debut era' },
  eraAny: { ja: 'おまかせ', en: 'Random' },
  era1: { ja: '1978–85 黎明', en: '1978–85 Dawn' },
  era2: { ja: '1986–94 ファミコン', en: '1986–94 8/16-bit' },
  era3: { ja: '1995–03 ポリゴン', en: '1995–03 Polygons' },
  era4: { ja: '2004–11 ケータイ', en: '2004–11 Feature phones' },
  era5: { ja: '2012–19 ソシャゲ', en: '2012–19 Gacha games' },
  era6: { ja: '2020–35 AI', en: '2020–35 AI' },
  note12m: { ja: '1200 万人 = 世界でゲームを作っている人の推計(SlashData 2024 の 1110 万人から推定。趣味・学生を含む)', en: '12 million = estimated number of people making games worldwide (extrapolated from SlashData 2024: 11.1M, incl. hobbyists and students)' },
  controlsHelp: { ja: 'タップ / 1〜3 で選ぶ・Enter で進む・Space で一時停止 / パッド: 十字・A 決定・B 速度・START 停止', en: 'Tap / 1–3 to choose, Enter to skip, Space to pause / Pad: D-pad, A select, B speed, START pause' },
  revealYear: { ja: '{v} 年', en: '{v}' },
  revealAge: { ja: '{v} 歳', en: 'age {v}' },
  revealGo: { ja: 'タップで人生スタート', en: 'Tap to begin your life' },
  yearUnit: { ja: '年', en: '' },
  ageUnit: { ja: '歳', en: 'yrs' },
  noNews: { ja: '今年の業界ニュース: 特になし(平和)', en: 'Industry news this year: nothing (peaceful)' },
  pause: { ja: '一時停止', en: 'Pause' },
  paused: { ja: '一時停止中', en: 'Paused' },
  fast: { ja: '一気に', en: 'Skip' },
  omakase: { ja: 'おまかせ', en: 'Auto' },
  fromEvent: { ja: '社内', en: '#general' },
  fromWork: { ja: '作品棚', en: '#shelf' },
  fromPeer: { ja: '同期', en: 'Peers' },
  fromChoice: { ja: 'あなた', en: 'You' },
  fromAsk: { ja: '決断', en: 'Decision' },
  idCard: { ja: '社員証', en: 'Staff ID' },
  hp: { ja: '体力', en: 'HP' },
  passion: { ja: '情熱', en: 'Passion' },
  skill: { ja: '腕', en: 'Skill' },
  network: { ja: '人脈', en: 'Network' },
  money: { ja: '貯金', en: 'Savings' },
  moneyFmt: { ja: '{v} 万円', en: '¥{v}' },
  shelf: { ja: '作品棚', en: 'Shelf' },
  shelfEmpty: { ja: 'まだ何も無い', en: 'Nothing yet' },
  peers: { ja: '同期 3 人', en: '3 peers' },
  st_employed: { ja: '在籍', en: 'Employed' },
  st_indie: { ja: '独立', en: 'Indie' },
  st_left: { ja: '離職中', en: 'Out of work' },
  st_retired: { ja: '引退', en: 'Retired' },
  st_ended: { ja: '終了', en: 'Ended' },
  role_junior: { ja: '下っ端', en: 'junior' },
  role_core: { ja: '主力', en: 'core staff' },
  role_lead: { ja: 'リーダー', en: 'lead' },
  role_solo: { ja: 'ひとり', en: 'solo' },
  res_flop: { ja: '爆死', en: 'Flop' },
  res_ok: { ja: '普通', en: 'OK' },
  res_hit: { ja: 'ヒット', en: 'Hit' },
  res_legend: { ja: '伝説', en: 'Legend' },
  history: { ja: '後日談', en: 'Afterlife' },
  noHistory: { ja: '(まだ何も起きていない)', en: '(nothing has happened yet)' },
  close: { ja: '閉じる', en: 'Close' },
  endHead: { ja: '開発者として死亡', en: 'Career over' },
  endAt: { ja: '{year} 年 / {age} 歳', en: '{year} / age {age}' },
  toResult: { ja: 'タップで結果へ', en: 'Tap for results' },
  // 雛形のもの(他のパートが使うかもしれないので残す)
  tapToStart: { ja: 'タップ / キーでスタート', en: 'Tap or press any key' },
  score: { ja: 'スコア', en: 'Score' },
  best: { ja: 'ベスト', en: 'Best' },
  result: { ja: 'けっか', en: 'Result' },
  retry: { ja: 'もういちど', en: 'Retry' },
  toTitle: { ja: 'タイトルへ', en: 'Title' },
  lang: { ja: 'EN', en: '日本語' },
  mute: { ja: '音: ON', en: 'Sound: ON' },
  unmute: { ja: '音: OFF', en: 'Sound: OFF' },
};

let current: Lang = detect();

function detect(): Lang {
  const q = query.lang;
  if (q === 'ja' || q === 'en') return q;
  const s = load().lang;
  if (s) return s;
  return navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function lang(): Lang { return current; }

export function setLang(l: Lang) {
  current = l;
  save({ lang: l });
}

export function toggleLang(): Lang {
  setLang(current === 'ja' ? 'en' : 'ja');
  return current;
}

/** t('score') → 現在言語の文字列。未登録キーはそのまま返す */
export function t(key: string): string {
  const e = TABLE[key];
  return e ? e[current] : key;
}

/** 作品側で文字列を足す */
export function addStrings(extra: Record<string, { ja: string; en: string }>) {
  Object.assign(TABLE, extra);
}
