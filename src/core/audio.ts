// 音: BGM(HTMLAudioElement でループ、切り替えはクロスフェード)+ 効果音(ファイルを WebAudio で鳴らす)。
// 素材は public/audio/ の魔王魂(https://maou.audio/ 、CREDITS.md)。ファイルが読めない時だけ合成音(beep)で代わりに鳴らす。
// 音量は効果音と BGM で別のつまみ(src/tuning.ts の audio.*)。既定は控えめ(AI が決める音量は大きめになりがち)。
// スマホの自動再生の制限: 最初のタップ / キー(ui/input.ts → unlock())までは鳴らさず、「何を鳴らしたいか」だけ覚えておく。
// iOS は audio.volume が効かないので、BGM の要素は WebAudio の GainNode につないで音量を掛ける(つなげない時は volume)。
// ?auto=1(CI・宣伝動画)は鳴らさない。BGM の要素の src だけは切り替える(Playwright で場面の切り替えを確かめるため)。
import { load, save } from './save';
import { tune } from './tuning';
import { query } from './meta';
import { expose } from './demo';

let ctx: AudioContext | null = null;
let muted = load().muted;
let unlocked = false;
const silent = query.auto; // CI・宣伝動画は無音

function ensure(): AudioContext | null {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

const BASE = `${import.meta.env.BASE_URL ?? './'}audio/`;

// ---------------- BGM ----------------
/** 場面ごとの曲(曲を選んだ理由は CREDITS.md) */
export const BGM = {
  title: 'maoudamashii_bgm_8bit01_loop.mp3',     // 8bit01「たびだちのむら」タイトル・オープニング
  reveal: 'maoudamashii_bgm_8bit03_loop.mp3',    // 8bit03「くじけぬもの」演出・オープニング
  era1: 'maoudamashii_bgm_8bit02_loop.mp3',      // 〜1985 8bit02「こうだいなせかい」
  era2: 'maoudamashii_game_town01.mp3',          // 1986〜94 旧ゲーム音楽 街01(MIDI 音源 = 16 ビット機の頃の音)
  era3: 'maoudamashii_bgm_cyber01_loop.mp3',     // 1995〜2006 サイバー01(ノリノリ・レース = ポリゴン期)
  era4: 'maoudamashii_bgm_piano25_loop.mp3',     // 2007〜2021 ピアノ25「Cookie Cookie」明るい・軽快
  era5: 'maoudamashii_bgm_cyber36_loop.mp3',     // 2022〜 サイバー36「Consciousness is high type」未来・都会的
  roll: 'maoudamashii_bgm_acoustic39_loop.mp3',  // スタッフロール アコースティック39(楽しかった一日が終わる)
} as const;
export type BgmId = keyof typeof BGM;

/** 年 → プレイ中の曲(〜1985 8 ビット / 〜1994 16 ビット / 〜2006 ポリゴン / 〜2021 現代 / 2022〜 未来) */
export function bgmOfYear(year: number): BgmId {
  return year <= 1985 ? 'era1' : year <= 1994 ? 'era2' : year <= 2006 ? 'era3' : year <= 2021 ? 'era4' : 'era5';
}

interface Deck { el: HTMLAudioElement; gain: GainNode | null; id: BgmId | null; level: number }
const decks: Deck[] = [];
let front = 0;            // 今鳴っている方
let want: BgmId | null = null;
let duck = 1;             // 選択で止まっている間は少し下げる
let fadeTimer = 0;
const FADE_MS = 900;

function makeDeck(i: number): Deck {
  const el = document.createElement('audio');
  el.id = `bgm-${i}`;
  el.className = 'bgm';
  el.loop = true;
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  el.style.display = 'none';
  document.body.append(el);
  return { el, gain: null, id: null, level: 0 };
}
function deckList(): Deck[] {
  if (!decks.length) decks.push(makeDeck(0), makeDeck(1));
  return decks;
}
/** unlock の後で GainNode につなぐ(iOS で音量を効かせるため) */
function wire(d: Deck) {
  if (d.gain || !ctx) return;
  try {
    const src = ctx.createMediaElementSource(d.el);
    d.gain = ctx.createGain();
    src.connect(d.gain).connect(ctx.destination);
  } catch { d.gain = null; }
}
function apply(d: Deck) {
  const v = muted || silent ? 0 : Math.max(0, Math.min(1, d.level * duck * bgmVolume()));
  if (d.gain) { d.gain.gain.value = v; d.el.volume = 1; } else d.el.volume = v;
}
function tryPlay(d: Deck) {
  if (silent || !unlocked || muted || document.hidden) return;
  if (d.el.paused) d.el.play().catch(() => {});
}

/** 曲を切り替える(同じ曲なら何もしない)。null で止める。最初の操作の前は覚えておくだけ */
export function playBgm(id: BgmId | null, fadeMs = FADE_MS) {
  want = id;
  expose('bgm', id);
  const ds = deckList();
  const cur = ds[front];
  if (cur.id === id && id) { if (!cur.el.paused || !unlocked) return; tryPlay(cur); return; }
  // 新しい曲は裏の要素で鳴らし始めて、表と入れ替える
  const next = ds[1 - front];
  if (id) {
    if (next.id !== id) { next.el.src = BASE + BGM[id]; next.id = id; next.el.currentTime = 0; }
    next.el.dataset.bgm = id;
    tryPlay(next);
  } else { next.id = null; next.el.pause(); }
  cur.el.dataset.bgm = cur.id ?? '';
  front = 1 - front;
  crossfade(fadeMs);
}
function crossfade(ms: number) {
  clearInterval(fadeTimer);
  const ds = deckList();
  const a = ds[front], b = ds[1 - front];
  const t0 = performance.now(), la = a.level, lb = b.level;
  const tick = () => {
    const k = ms <= 0 ? 1 : Math.min(1, (performance.now() - t0) / ms);
    a.level = a.id ? la + (1 - la) * k : la * (1 - k);
    b.level = lb * (1 - k);
    apply(a); apply(b);
    if (k >= 1) {
      clearInterval(fadeTimer);
      b.el.pause();
      if (!a.id) a.el.pause();
    }
  };
  tick();
  fadeTimer = window.setInterval(tick, 50);
}
/** 選択で止まっている間など、BGM を少し下げる */
export function duckBgm(on: boolean) {
  duck = on ? 0.55 : 1;
  for (const d of decks) apply(d);
}
export function stopBgm(fadeMs = FADE_MS) { playBgm(null, fadeMs); }
export function currentBgm() { return want; }

// 裏に回ったら止める(スマホで電池と通信を食わない)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const d = decks[front];
    if (!d) return;
    if (document.hidden) { for (const x of decks) x.el.pause(); } else if (d.id) tryPlay(d);
  });
}

// ---------------- 効果音 ----------------
/** 効果音(ファイル名と音量の掛け目。選んだ理由は CREDITS.md) */
export const SE = {
  ui: ['maoudamashii_se_system36.mp3', 0.8],        // システム36 メニュー音
  tap: ['maoudamashii_se_system45.mp3', 0.8],       // システム45 決定音
  pi: ['maoudamashii_se_8bit02.mp3', 0.6],          // レトロ02「ピッ」(発表の 1 行ずつ)
  drum: ['maoudamashii_se_inst_drumroll.mp3', 0.8], // ドラムロール(業界入りガチャの発表)
  gacha: ['maoudamashii_se_jingle06.mp3', 1],       // ジングル06「当たり」(行き先の発表)
  ok: ['maoudamashii_se_onepoint15.mp3', 0.8],      // ワンポイント15「正解」(発売: そこそこ)
  hit: ['maoudamashii_se_jingle05.mp3', 1],         // ジングル05「当たり」(発売: ヒット)
  legend: ['maoudamashii_game_jingle04.mp3', 0.9],  // 旧ゲーム音楽 ジングル04「レアアイテムゲット」(発売: 伝説)
  flop: ['maoudamashii_se_onepoint06.mp3', 0.8],    // ワンポイント06「ガーン」(発売: 爆死)
  after: ['maoudamashii_se_onepoint12.mp3', 0.7],   // ワンポイント12「おしゃれ」(作品の後日談)
  tv: ['maoudamashii_se_chime13.mp3', 0.8],         // チャイム13「ピンポーン」(テレビの速報)
  paper: ['maoudamashii_se_onepoint03.mp3', 0.8],   // ワンポイント03「ジャーン」(新聞の号外)
  high: ['maoudamashii_se_onepoint20.mp3', 0.8],    // ワンポイント20「ぴろりろ」(テンションが上がる話)
  celeb: ['maoudamashii_se_onepoint08.mp3', 0.8],   // ワンポイント08「発見」(有名人に会う)
  pit: ['maoudamashii_se_onepoint29.mp3', 0.8],     // ワンポイント29「あちゃー」(大挫折)
  ask: ['maoudamashii_se_onepoint27.mp3', 0.7],     // ワンポイント27「ハテナ?」(選択が来た)
  over: ['maoudamashii_game_jingle07.mp3', 0.9],    // 旧ゲーム音楽 ジングル07「全滅か宿屋」(開発者としての死)
  clap: ['maoudamashii_se_sound_applause01.mp3', 0.7], // 拍手01(結果画面)
} as const satisfies Record<string, readonly [string, number]>;
export type SeId = keyof typeof SE;

const buffers = new Map<SeId, AudioBuffer | null>();
const loading = new Map<SeId, Promise<void>>();
const lastAt = new Map<SeId, number>();
const playing = new Map<SeId, { src: AudioBufferSourceNode; g: GainNode }>();

function loadSe(id: SeId): Promise<void> {
  const c = ctx;
  if (!c) return Promise.resolve();
  let p = loading.get(id);
  if (p) return p;
  p = fetch(BASE + SE[id][0])
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((ab) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((b) => { buffers.set(id, b); })
    .catch(() => { buffers.set(id, null); });
  loading.set(id, p);
  return p;
}

/** 効果音を 1 回鳴らす。同じ音は minGap 秒あけないと鳴らさない(連打・「一気に」で積み重ならない) */
export function playSe(id: SeId, opts: { vol?: number; minGap?: number } = {}) {
  if (muted || silent || !unlocked) return;
  const c = ensure();
  if (!c) return;
  const now = performance.now();
  if (now - (lastAt.get(id) ?? -1e9) < (opts.minGap ?? 0.08) * 1000) return;
  lastAt.set(id, now);
  const go = () => {
    const b = buffers.get(id);
    if (!b) { if (b === null) beep(660, 0.05, 'sine'); return; }
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = b;
    g.gain.value = Math.max(0, SE[id][1] * (opts.vol ?? 1) * sfxVolume());
    src.connect(g).connect(c.destination);
    src.start();
    playing.set(id, { src, g });
    src.onended = () => { if (playing.get(id)?.src === src) playing.delete(id); };
  };
  if (buffers.has(id)) go(); else loadSe(id).then(() => { if (performance.now() - now < 600) go(); });
}
/** 鳴っている効果音を短くフェードして止める(ドラムロールを発表で切る等) */
export function stopSe(id: SeId, fade = 0.15) {
  const p = playing.get(id);
  if (!p || !ctx) return;
  try {
    p.g.gain.setValueAtTime(p.g.gain.value, ctx.currentTime);
    p.g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    p.src.stop(ctx.currentTime + fade + 0.02);
  } catch { /* 止まっている */ }
  playing.delete(id);
}

// ---------------- 共通 ----------------
/** 最初のタップ / キーで呼ぶ。以後音が鳴るようになり、覚えておいた BGM を鳴らし始める */
export function unlock() {
  const c = ensure();
  if (unlocked) return;
  unlocked = true;
  if (silent) return;
  for (const d of deckList()) wire(d);
  // iOS は「操作の中で一度 play() した要素」しか後から鳴らせないので、裏の要素もここで一度鳴らして止める
  const back = decks[1 - front];
  if (!back.id) {
    back.el.src = BASE + BGM[want ?? 'title'];
    back.el.muted = true;
    back.el.play().then(() => { if (!back.id) back.el.pause(); back.el.muted = false; }).catch(() => { back.el.muted = false; });
  }
  // 調整パネル(F2)で音量を動かしたら、鳴っている BGM にも効かせる
  window.setInterval(() => { for (const d of decks) apply(d); }, 1000);
  // よく使う効果音は先に読んでおく(最初の 1 回が遅れないように)
  if (c) (['ui', 'tap', 'pi', 'drum', 'gacha', 'ask', 'tv', 'paper', 'ok', 'hit', 'flop'] as SeId[]).forEach((id) => loadSe(id));
  const d = decks[front];
  for (const x of decks) apply(x);
  if (d?.id) tryPlay(d);
  else if (want) playBgm(want, 0);
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  save({ muted: m });
  for (const d of decks) apply(d);
  const d = decks[front];
  if (m) for (const x of decks) x.el.pause();
  else if (d?.id) tryPlay(d);
}
export function toggleMuted() { setMuted(!muted); return muted; }
/** 効果音・BGM の全体音量(0〜1) */
export function sfxVolume() { return tune('audio.sfx'); }
export function bgmVolume() { return tune('audio.bgm'); }
/** 調整パネル(F2)で audio.bgm を動かした時に呼ぶと、鳴っている BGM の音量に反映する */
export function refreshVolume() { for (const d of decks) apply(d); }

/** 短い合成音(ファイルが読めない時の代わり)。freq Hz、dur 秒、type 波形 */
export function beep(freq = 440, dur = 0.08, type: OscillatorType = 'square', gain = 0.08) {
  if (muted || silent) return;
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(Math.max(0.0001, gain * sfxVolume()), c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

/** 昔からある名前(中身はファイルの効果音)。score = よいこと、over = 人生の終わり */
export const sfx = {
  tap: () => playSe('tap'),
  score: () => playSe('ok'),
  over: () => playSe('over'),
  ui: () => playSe('ui'),
};
