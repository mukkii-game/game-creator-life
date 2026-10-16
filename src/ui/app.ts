// 画面の入口(パート D)。タイトル → 業界入りガチャの発表 → 人生(play.ts)→ 死因 → 結果(result.ts、パート E)。
// URL: ?seed= ?lang=en ?auto=1(おまかせ・×4 で最後まで) ?demo=1(固定 seed でおまかせ) ?replay= ?debug=1
// AI の口(core/probe): window.__game.state() / act('choose', id) / act('speed', n) / act('pause') / act('omakase', on) / act('start', era?)
import './style.css';
import { init, JOB_TEXT } from '../game/logic';
import type { State } from '../game/types';
import { startSeed } from '../core/rng';
import { query } from '../core/meta';
import { t } from '../core/i18n';
import { playSe, stopSe, playBgm } from '../core/audio';
import { expose } from '../core/demo';
import { describe, action } from '../core/probe';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { showResult } from './result';
import { installInput, setHandler, onTap, type Cmd } from './input';
import { installBuildId } from './build';
import { showTitle } from './title';
import { showChronicle } from './chronicle';
import { load, save, addChronicle, addRecent, recentIds } from '../core/save';
import { startPlay, type PlayScreen, type Speed } from './play';
import { h, tf, tx, setLook, lookOf, loadFonts } from './util';
import { installArt } from './art';
import { validPick, pickOpts, type StartPick } from './start';
import { prefetchOthers, othersNow, postLife } from '../core/others';
import { splitName, type OtherLife } from '../game/people';

const DEMO_SEED = 12000000;
const ERAS = ['era1', 'era2', 'era3', 'era4'];

export function startApp(container: HTMLElement) {
  loadFonts();
  const app = h('div', 'gcl');
  container.append(app);
  installArt(app);
  installInput(container);
  installBuildId();

  const demo = query.get('demo') === '1';
  const rec0 = replayFromUrl();
  const auto = query.auto || demo;
  let scene: 'Title' | 'Reveal' | 'Play' | 'Ending' | 'Result' = 'Title';
  let onCmd: (c: Cmd) => void = () => {};
  let play: PlayScreen | null = null;
  let recorder = new Recorder(0);
  let firstSeed = true;
  // ?era= で時代の指定(共有 URL の ?seed= と組で同じ人生になる)
  let lastEra: StartPick = validPick(query.get('era')) ? (query.get('era') as StartPick) : '';

  setHandler((c) => onCmd(c));
  expose('replay', () => recorder.toString());
  expose('score', 0);

  // 年表図鑑(seen)を渡すと「まだ触れていない事件」が出やすくなる = 端末ごとに人生が変わる。
  // URL で決まる人生(?seed= の seed・?replay=・?demo=1・?auto=1)には渡さない(同じ URL で誰でも同じ人生にするため)
  const urlSeed = query.has('seed') ? startSeed() : -1;
  const fixedLife = (seed: number, player: Player | null) => auto || !!player || seed === urlSeed;
  const seenFor = (seed: number, player: Player | null): string[] | undefined => (fixedLife(seed, player) ? undefined : load().chronicle);

  // 名前(タイトルで入れたもの)。自動・replay の時は渡さない。共有 URL にも入れない
  const nameFor = (player: Player | null): string | undefined => {
    if (auto || player) return undefined;
    const n = load().name.trim();
    return n ? n.slice(0, 16) : undefined;
  };

  const newSeed = (): number => {
    if (firstSeed) { firstSeed = false; return demo && !query.has('seed') ? DEMO_SEED : startSeed(); }
    return ((Date.now() ^ (performance.now() * 1000)) % 2147483647) >>> 0 || 1;
  };
  const setScene = (n: typeof scene) => { scene = n; expose('scene', n === 'Reveal' ? 'Title' : n === 'Ending' ? 'Play' : n); };

  // ---- タイトル ----
  function title() {
    setScene('Title');
    play = null;
    expose('score', 0);
    playBgm('title');
    void prefetchOthers(); // 他の人の人生を先読み(届かなくても遊べる)
    const scr = showTitle(app, lastEra, (era) => begin(newSeed(), era), () => chronicle());
    onCmd = scr.onCmd;
  }

  // ---- 年表図鑑 ----
  function chronicle() {
    setScene('Title');
    const scr = showChronicle(app, load().chronicle, () => title());
    onCmd = scr.onCmd;
  }

  // ---- 業界入りガチャの発表(笑いどころ)→ 人生 ----
  function begin(seed: number, era: StartPick, player: Player | null = null) {
    lastEra = era;
    setScene('Reveal');
    // 発表に出す中身は、同じ seed・時代で作った state から読む(play でも同じ seed で init するので同じ人生になる)
    const seen = seenFor(seed, player);
    const name = nameFor(player);
    const others = fixedLife(seed, player) ? undefined : othersNow();
    const recent = fixedLife(seed, player) ? undefined : recentIds();
    const peek: State = init(seed, { ...pickOpts(era), ...(others?.length ? { others } : {}), ...(recent?.length ? { recent } : {}), ...(seen ? { seen } : {}), ...(name ? { name } : {}) });
    recorder = new Recorder(seed);
    if (era) recorder.push(-1, `era:${era}`);
    app.innerHTML = '';
    setLook(app, lookOf(peek.year));
    const ov = h('div', 'reveal');
    const lines = [
      tx(peek.name),
      tf('revealYear', { v: peek.year }),
      tf('revealAge', { v: peek.age }),
      tx(peek.entry),
      tx(JOB_TEXT[peek.job]),
    ];
    const box = h('div', 'reveal-box');
    lines.forEach((txt, i) => {
      const d = h('div', `reveal-line rl-${i}`, txt + (i < lines.length - 1 ? (t('yearUnit') ? '、' : ',') : (t('yearUnit') ? '。' : '.')));
      d.style.animationDelay = `${(auto ? 0.15 : 0.5) * i}s`;
      box.append(d);
    });
    const who = h('div', 'reveal-name', tx(peek.company.name));
    who.style.animationDelay = `${(auto ? 0.15 : 0.5) * lines.length}s`;
    const tap = h('div', 'reveal-tap', t('revealGo'));
    tap.style.animationDelay = `${(auto ? 0.15 : 0.5) * lines.length + 0.4}s`;
    box.append(who, tap);
    ov.append(box);
    app.append(ov);
    // 音: 発表の曲 + ドラムロール → 1 行ずつ「ピッ」→ 会社名で「当たり」のジングル
    playBgm('reveal', 400);
    const step = auto ? 150 : 500;
    let started = false;
    playSe('drum');
    lines.forEach((_, i) => setTimeout(() => { if (!started) playSe('pi'); }, step * i));
    setTimeout(() => { stopSe('drum'); if (!started) playSe('gacha'); }, step * lines.length);
    const go = () => {
      if (started) return;
      started = true;
      clearTimeout(tm);
      stopSe('drum');
      run(seed, era, player, seen, name, others, recent);
    };
    const tm = setTimeout(go, auto || player ? 1400 : 6000);
    setTimeout(() => onTap(ov, go), 300);
    onCmd = (c) => { if (c.type === 'ok' || c.type === 'pause') go(); };
  }

  function run(seed: number, era: StartPick, player: Player | null, seen: string[] | undefined, name: string | undefined, others?: OtherLife[], recent?: string[]) {
    setScene('Play');
    const speed: Speed = query.auto ? 4 : demo ? 2 : player ? 4 : 1;
    play = startPlay(app, {
      seed, era, seen, name, others, recent, omakase: auto, speed, recorder, player,
      quick: auto || !!player,
      onEnd: (s) => { record(s, seed, player, name); result(s, era); },
    });
    onCmd = play.onCmd;
  }

  // 遊び終わった人生をサーバーに記録(自動・replay・URL で決まる人生は記録しない)。名前を自分で入れた人生だけ他の人のプレイに出る
  function record(s: State, seed: number, player: Player | null, name: string | undefined) {
    if (fixedLife(seed, player) || !s.ending) return;
    // この人生で出た話(歴史の事件と system は除く)を「最近見た話」に
    addRecent([...s.companies.map((c) => `co:${c.company.id}`), `job:${s.inner.startJob}`, `given:${s.name.ja.split(' ')[1] ?? ''}`, ...s.inner.peerStates.map((x) => `fam:${x.name.ja.split(' ')[0]}`), `fam:${s.name.ja.split(' ')[0]}`, ...s.inner.peerStates.flatMap((x) => x.works.map((w) => `title:${w.name.ja.replace(/^『|』$/g, '')}`)), ...Object.keys(s.inner.seen), ...(s.inner.saidLines ?? []).map((t) => `line:${t}`), ...s.works.map((w) => `title:${w.name.ja.replace(/^『|』$/g, '')}`)]);
    const typed = name ? splitName(name) : null;
    const parts = typed ?? splitName(s.name.ja);
    const best = [...s.works].sort((a, b) => rank(b.result) - rank(a.result))[0];
    const co = s.companies.find((c) => c.company.size === 'big')?.company ?? s.companies[0]?.company ?? s.company;
    postLife({
      family: parts.family, given: parts.given, named: !!typed,
      startYear: s.startYear, endYear: s.ending.year, startAge: s.startAge, endAge: s.ending.age,
      job: JOB_TEXT[s.inner.startJob]?.ja ?? '', company: co.size === 'indie' ? '' : co.name.ja, work: best?.name.ja ?? '',
      ending: s.ending.cause.ja.replace(/^\d+ 歳、/, ''),
    });
  }
  const rank = (r: string) => ({ legend: 4, hit: 3, ok: 2, flop: 1 } as Record<string, number>)[r] ?? 0;

  function result(s: State, era: StartPick) {
    setScene('Result');
    play = null;
    onCmd = () => {};
    setLook(app, lookOf(s.ending?.year ?? s.year));
    app.dataset.scene = 'result';
    playBgm('roll', 1200); // スタッフロール: しみじみ、でも前向き
    // 年表図鑑に足す(どの遊び方でも、触れた事件は図鑑に残す)
    const before = load().chronicle;
    const { all, added } = addChronicle(s.chronicle);
    save({ played: load().played + 1 });
    showResult(app, s, {
      chronicle: { before, after: all, added },
      retry: () => title(),
      again: () => begin(s.seed, era),
    });
  }

  // ---- AI の口 ----
  describe(() => {
    if (play && scene === 'Play') return { scene, ...play.info() };
    return { scene, eras: ['', ...ERAS], hint: scene === 'Title' ? "act('start', era?) で始める" : '' };
  });
  action('start', (era?: string) => {
    if (scene !== 'Title') return `start は Title でだけ使える(今は ${scene})`;
    if (era && !validPick(era)) return `era は ${ERAS.join(' / ')} か y1977〜y2000(年の指定)`;
    begin(newSeed(), era ?? '');
  });
  action('choose', (id: string) => (play && scene === 'Play' ? play.choose(id) : `今は選択できない(scene: ${scene})`));
  action('speed', (n: unknown) => (play && scene === 'Play' ? play.setSpeed(n) : `今は速度を変えられない(scene: ${scene})`));
  action('pause', () => { if (!play || scene !== 'Play') return `今は一時停止できない(scene: ${scene})`; play.togglePause(); });
  action('omakase', (on: unknown) => { if (!play) return '人生が始まっていない'; play.setOmakase(on !== false && on !== 0 && on !== 'off'); });

  // ---- 起動 ----
  if (rec0) {
    let era: StartPick = '';
    const player = new Player(rec0);
    const head = player.input(-1);
    if (head.startsWith('era:') && validPick(head.slice(4))) era = head.slice(4);
    firstSeed = false;
    begin(rec0.seed, era, player);
  } else if (auto) {
    begin(newSeed(), lastEra);
  } else title();
}
