// docs/schema/ を TypeScript に写したもの(schema が正本)。画面(src/ui)と結果(src/share)はここの型だけ読む。
import type { Rng } from '../core/rng';

export interface Text { ja: string; en: string }
export type Job = 'programmer' | 'planner' | 'artist' | 'sound' | 'qa' | 'sales' | 'director' | 'producer' | 'teacher' | 'other';
export type Status = 'employed' | 'indie' | 'left' | 'retired' | 'ended';
export type Era = 'era1' | 'era2' | 'era3' | 'era4' | 'era5' | 'era6';
export type Role = 'junior' | 'core' | 'lead' | 'solo';
export type WorkResult = 'flop' | 'ok' | 'hit' | 'legend';
export type CompanySize = 'big' | 'mid' | 'small' | 'sub' | 'indie' | 'abroad' | 'school' | 'none';
export type StatKey = 'hp' | 'passion' | 'skill' | 'network' | 'money' | 'fame';

export interface WorkEffect {
  add?: { platform?: string; role?: Role };
  last?: { result?: WorkResult; history?: Text };
}
export interface Effect {
  hp?: number; passion?: number; skill?: number; network?: number; money?: number; fame?: number;
  flag?: Record<string, boolean>;
  job?: Job; status?: Status; work?: WorkEffect;
}
export interface Later { after: number; event: string }
export interface Choice { id: string; label: Text; effect: Effect; later?: Later[]; result?: Text; cause?: Text; memory?: Text }
export interface GameEvent {
  id: string; years: [number, number]; text: Text;
  when?: string[]; weight?: number; once?: boolean;
  effect?: Effect; later?: Later[]; choices?: Choice[]; tag?: string[]; allow?: string[];
  /** この効果で人生が終わる時(do_end / do_arrest)の死因の 1 行 */
  cause?: Text;
  /** 最後に思い出す時の短い 1 行(tag high / celeb の時。無ければ本文の 1 文目) */
  memory?: Text;
}
export type TimelineKind = 'hardware' | 'hit' | 'incident' | 'work' | 'ai' | 'future';
export interface TimelineEntry { id: string; year: number; month?: number; kind: TimelineKind; text: Text; use: string; src: string; unverified?: boolean }

/** 歴史の事件(src/data/hist/)。同じ事件でも立場(pos)で起きることが変わる。触れた事件は年表図鑑にたまる */
export interface Hist {
  id: string; year: number; month?: number; until?: number; kind: TimelineKind; weight?: number;
  title: Text; news: Text; src: string; unverified?: boolean;
  variants: Omit<GameEvent, 'years'>[];
}
/** 立場。歴史の事件の受け止め方が変わる */
export type Pos = 'client_lead' | 'client' | 'dev_lead' | 'dev' | 'sub' | 'qa' | 'indie' | 'abroad' | 'teacher' | 'prison' | 'outside';

export interface Stat { hp: number; passion: number; skill: number; network: number; money: number; fame: number }
export interface Work { id: string; name: Text; year: number; platform: string; role: Role; result: WorkResult; history: { year: number; text: Text }[] }
export interface Peer { name: string; bot: string; summary: Text }
export type EndingId = 'end_burnout' | 'end_body' | 'end_debt' | 'end_blacklist' | 'end_retire' | 'end_pen_down' | 'end_ai_seat' | 'end_arrest' | 'end_switch';
export interface Ending { id: EndingId; age: number; year: number; cause: Text; summary: Text; /** 最後の 1 行(一番テンションが上がった瞬間 +「いいゲーム人生だった」) */ epitaph: Text }
export type LogKind = 'event' | 'timeline' | 'choice' | 'work' | 'peer';
export interface LogLine { year: number; age: number; text: Text; kind: LogKind; tag?: string[]; hist?: string }
export interface Company { id: string; name: Text; size: CompanySize }

export interface State {
  seed: number;
  year: number; age: number; startAge: number; startYear: number;
  era: Era; job: Job; status: Status;
  name: Text; entry: Text; region: Text;
  company: Company;
  /** 勤めた会社の履歴(入社順。結果画面のスタッフロール用) */
  companies: { company: Company; year: number }[];
  /** init に渡した指定(?seed= で同じ人生にするには era も要る) */
  options: { era?: Era; year?: number; age?: number; seen?: string[] };
  stat: Stat;
  flags: Record<string, boolean>;
  works: Work[];
  peers: Peer[];
  log: LogLine[];
  /** この人生で触れた歴史の事件(`hs_id:ev_id`。年表図鑑に足す) */
  chronicle: string[];
  pending: { year: number; event: string }[];
  choice?: { eventId: string; choices: Choice[]; text: Text };
  ending?: Ending;
  /** logic の内側だけで使う(画面は読まない) */
  rng: Rng;
  inner: Inner;
}

export interface Inner {
  used: string[];            // once のイベントで出たもの
  seen: Record<string, number>; // イベント → 最後に出た年(同じ小ネタの連発を防ぐ)
  uses: Record<string, number>; // イベント → 1 人生で出た回数(life.maxRepeat で上限)
  queue: string[];           // その年に残っているイベント(選択で止まった続き)
  nextWorkYear: number;      // 次に作品が出る年
  companyYears: number;      // 今の会社にいる年数
  searchFails: number;       // 再就職の失敗回数
  leftYear: number;          // 心が折れた / 失職した年(0 = なし)
  otherJob: Text | null;     // 心が折れた先の仕事
  counts: Record<string, number>; // タグごとの回数(死因の文に使う: spec, crunch …)
  lastTag: string;           // 直近の悪いイベントのタグ
  choicesMade: number;       // 何番目の選択か(replay の frame)
  peerStates: State[];       // 同期 3 人の中身(peer 自身は空)
  isPeer: boolean;
  bot: string;               // peer の時: 動かすボット名
  workTarget: number;        // afterlife のイベントが指す作品の番号(-1 = 直近)
  startJob: Job;
  prevJob: Job;
  histDone: string[];
  pitAt: number; peakAt: number; pitDone: boolean; peakDone: boolean;
  bondAt: number; bondDone: boolean; // 人生に一度の大物との縁
  nextBig: number;
  prisonUntil: number;                 // 服役が明ける年(0 = なし)                     // 次の大きな選択が来る年
  highs: { year: number; age: number; text: Text; w: number; kind?: string }[]; // テンションが上がった瞬間(最後に思い出す)        // この人生で起きた歴史の事件(hs_id)
}

export interface InitOptions {
  /** 業界入りの年(未指定はガチャ) */
  year?: number;
  /** 業界入りの年齢(未指定はガチャ) */
  age?: number;
  /** 時代だけ指定(年はその中でガチャ) */
  era?: Era;
  /** 同期として作る時に内部で使う */
  peerOf?: { year: number; company: Company; bot: string };
  /** 自分の名前(空ならおまかせ = 架空の名前をガチャ) */
  name?: string;
  /** 年表図鑑で既に触れた事件(`hs_id:ev_id`)。まだ触れていない事件が出やすくなる */
  seen?: string[];
}
