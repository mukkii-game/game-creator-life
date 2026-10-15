// 人生の画面(PLAN §7): 上 = 年表ティッカー / 中 = 社内チャット風のログ / 下 = 社員証カード + 作品棚 + 同期。
// 進め方: advance(state) で 1 年分の行が増える → それを 1 行ずつ間隔をあけて吹き出しで出す(1 年 ÷ その年の行数)。
// 選択(state.choice)が来たら止まってボタンを出す。終わったら(state.ending)死因を大きく出して onEnd。
import { init, advance, choose, JOB_TEXT } from '../game/logic';
import { BOTS } from '../game/bots';
import { positionOf } from '../game/select';
import { POS_TEXT } from '../game/names';
import { HIST_BY_ID } from '../game/data';
import { load } from '../core/save';
import type { State, LogLine, Work, Era, Choice } from '../game/types';
import { tune } from '../core/tuning';
import { t, lang } from '../core/i18n';
import { sfx } from '../core/audio';
import { expose } from '../core/demo';
import type { Recorder, Player } from '../core/replay';
import { h, tf, tx, lookOf, setLook, money, FocusRing } from './util';
import { onTap, type Cmd } from './input';

export type Speed = 1 | 2 | 4 | 'fast';
const SPEEDS: Speed[] = [1, 2, 4, 'fast'];

export interface PlayOptions {
  seed: number;
  era: Era | '';
  /** 年表図鑑(init に渡す。URL で決まる人生では undefined) */
  seen?: string[];
  /** 自分の名前(空・undefined = おまかせ) */
  name?: string;
  omakase: boolean;
  speed: Speed;
  recorder: Recorder;
  player: Player | null;
  /** 自動で進める時(?auto / ?demo / replay)は短めの間 */
  quick: boolean;
  onEnd: (s: State) => void;
}

export interface PlayScreen {
  onCmd: (c: Cmd) => void;
  state: State;
  info: () => Record<string, unknown>;
  choose: (id: string) => string | void;
  setSpeed: (n: unknown) => string | void;
  togglePause: () => void;
  setOmakase: (on: boolean) => void;
}

const JOB_ICON: Record<string, string> = { programmer: '💻', planner: '📝', artist: '🎨', sound: '🎵', qa: '🐛', sales: '📞', director: '🎬', producer: '💼', other: '🌾' };
const KIND_ICON: Record<string, string> = { event: '💬', work: '📦', peer: '👥', choice: '🙋', ask: '❓' };
const KIND_WHO: Record<string, string> = { event: 'fromEvent', work: 'fromWork', peer: 'fromPeer', choice: 'fromChoice', ask: 'fromAsk' };
/** 歴史の事件の見た目: テレビの速報風(tv)か新聞の号外風(paper) */
export const HIST_ICON: Record<string, string> = { hardware: '🎮', hit: '🏆', incident: '📰', work: '💼', ai: '🤖', future: '🚀' };
const HIST_STYLE: Record<string, 'tv' | 'paper'> = { hardware: 'tv', ai: 'tv', future: 'tv', hit: 'paper', incident: 'paper', work: 'paper' };

/** 作品棚の形: カセット → CD → DL → アプリ(時代と機種で) */
export function shapeOf(w: Work): 'cart' | 'cd' | 'dl' | 'app' {
  const p = w.platform;
  if (/スマホ|ケータイ|ソシャゲ|iPhone|AI/.test(p)) return 'app';
  if (/Steam|itch|Flash/.test(p)) return 'dl';
  if (/PlayStation|PS[2-5]|サターン|ドリームキャスト|CD|Windows|Wii/.test(p)) return 'cd';
  return w.year < 1995 ? 'cart' : w.year < 2008 ? 'cd' : w.year < 2014 ? 'dl' : 'app';
}
const initial = (w: Work) => (tx(w.name).replace(/^[『「"“\s]+/, '').charAt(0) || '?');

export function startPlay(app: HTMLElement, o: PlayOptions): PlayScreen {
  const s = init(o.seed, { ...(o.era ? { era: o.era } : {}), ...(o.seen ? { seen: o.seen } : {}), ...(o.name ? { name: o.name } : {}) });
  // 「NEW」「別の立場で」の印は、この端末の図鑑と比べる(URL で決まる人生でも印は出す。中身は変えない)
  const known = new Set(load().chronicle);
  const knownHist = new Set([...known].map((k) => k.split(':')[0]));
  app.innerHTML = '';
  app.dataset.scene = 'play';
  expose('scene', 'Play');

  // ---- 骨組み ----
  const top = h('header', 'ticker');
  const yearEl = h('div', 'tk-year');
  const ageEl = h('div', 'tk-age');
  const tape = h('div', 'tk-tape');
  const tapeText = h('div', 'tk-text');
  tape.append(tapeText);
  const when = h('div', 'tk-when');
  when.append(yearEl, ageEl);
  top.append(when, tape);

  const bar = h('nav', 'toolbar');
  const pauseB = h('button', 'tb tb-pause', '⏸');
  pauseB.title = t('pause');
  const speedBs = SPEEDS.map((sp) => {
    const b = h('button', 'tb tb-speed', sp === 'fast' ? t('fast') : `×${sp}`);
    onTap(b, () => setSpeed(sp));
    return b;
  });
  const autoB = h('button', 'tb tb-auto', t('omakase'));
  onTap(pauseB, () => togglePause());
  onTap(autoB, () => setOmakase(!omakase));
  const pausedTag = h('span', 'paused-tag', t('paused'));
  bar.append(pauseB, ...speedBs, autoB);

  const chat = h('main', 'chat');
  const chatInner = h('div', 'chat-inner');
  chat.append(pausedTag, chatInner);
  // チャットの空いた所をタップ = Enter(次の行をすぐ出す)
  chat.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) return; skip(); });

  const foot = h('footer', 'desk');
  const card = h('section', 'card');
  const shelfBox = h('section', 'shelf');
  const peersBox = h('details', 'peers');
  foot.append(card, shelfBox, peersBox);
  app.append(top, bar, chat, foot);

  // ---- 進行の状態 ----
  let speed: Speed = o.speed;
  let omakase = o.omakase;
  let paused = false;
  let shown = 0;                 // s.log の何行目まで取り込んだか
  const queue: LogLine[] = [];
  let batchN = 1;                // 今の束(1 年分)の行数
  let timer = 0;
  let curYear = s.year, curAge = s.age;
  let tickerLines: string[] = [];
  let waitingChoice: { box: HTMLElement; buttons: HTMLButtonElement[]; choices: Choice[] } | null = null;
  let choiceFrame = 0;
  let ended = false;
  let modal: HTMLElement | null = null;
  const ring = new FocusRing();

  const yearMs = () => (speed === 'fast' ? tune('ui.fast') : tune('life.yearSec') / speed) * 1000;
  const lineMs = () => Math.max(60, yearMs() / Math.max(2, batchN));

  function paintBar() {
    speedBs.forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === speed));
    autoB.classList.toggle('on', omakase);
    pauseB.classList.toggle('on', paused);
    pauseB.textContent = paused ? '▶' : '⏸';
    app.classList.toggle('is-paused', paused);
  }

  function setTicker(year: number, age: number) {
    curYear = year; curAge = age;
    yearEl.textContent = lang() === 'ja' ? `${year}` : `${year}`;
    yearEl.dataset.unit = t('yearUnit');
    ageEl.textContent = `${age}${lang() === 'ja' ? ' 歳' : ' y/o'}`;
    setLook(app, lookOf(year));
    expose('score', age);
  }
  function setTape() {
    const text = tickerLines.length ? tickerLines.join('   ◆   ') : t('noNews');
    tapeText.textContent = text;
    tapeText.classList.remove('run');
    void tapeText.offsetWidth; // アニメをやり直す
    tapeText.style.animationDuration = `${Math.max(7, text.length * (lang() === 'ja' ? 0.32 : 0.14))}s`;
    tapeText.classList.add('run');
  }

  // ---- 社員証・棚・同期 ----
  function gauge(key: string, v: number) {
    const g = h('div', `gauge g-${key}`);
    const lab = h('span', 'g-lab', t(key));
    const track = h('span', 'g-track');
    const fill = h('span', 'g-fill');
    fill.style.width = `${Math.max(0, Math.min(100, v))}%`;
    track.append(fill);
    g.append(lab, track, h('span', 'g-num', String(Math.round(v))));
    if (v < 25) g.classList.add('low');
    return g;
  }
  function paintCard() {
    card.innerHTML = '';
    const head = h('div', 'card-head');
    head.append(h('span', 'card-badge', t('idCard')), h('span', 'card-pos', tx(POS_TEXT[positionOf(s)])), h('span', 'card-co', tx(s.company.name)));
    const body = h('div', 'card-body');
    const photo = h('div', 'card-photo', JOB_ICON[s.job] ?? '👤');
    const who = h('div', 'card-who');
    who.append(h('div', 'card-name', tx(s.name)), h('div', 'card-job', `${tx(JOB_TEXT[s.job])} · ${t(`st_${s.status}`)}`));
    const m = h('div', `card-money${s.stat.money < 0 ? ' neg' : ''}`);
    m.append(h('span', 'g-lab', t('money')), h('b', '', money(s.stat.money)));
    body.append(photo, who, m);
    const gs = h('div', 'gauges');
    for (const k of ['hp', 'passion', 'skill', 'network'] as const) gs.append(gauge(k, s.stat[k]));
    card.append(head, body, gs);
  }
  let shelfCount = -1;
  function paintShelf(force = false) {
    if (!force && shelfCount === s.works.length) return;
    shelfCount = s.works.length;
    shelfBox.innerHTML = '';
    shelfBox.append(h('div', 'shelf-lab', `${t('shelf')} ${s.works.length}`));
    const row = h('div', 'shelf-row');
    if (!s.works.length) row.append(h('span', 'shelf-empty', t('shelfEmpty')));
    s.works.forEach((w) => {
      const b = h('button', `work shape-${shapeOf(w)} r-${w.result}`);
      b.append(h('span', 'work-ch', initial(w)));
      b.title = `${tx(w.name)} (${w.year})`;
      if (w.history.length) b.classList.add('has-history');
      onTap(b, () => openWork(w));
      row.append(b);
    });
    shelfBox.append(row);
    row.scrollLeft = row.scrollWidth;
  }
  function paintPeers() {
    const open = peersBox.open;
    peersBox.innerHTML = '';
    const sum = h('summary', 'peers-sum');
    sum.append(h('span', 'peers-lab', t('peers')), h('span', 'peers-mini', s.peers.map((p, i) => peerName(i, p.name).split(' ')[0]).join(' / ')));
    peersBox.append(sum);
    const ul = h('ul', 'peers-list');
    s.peers.forEach((p, i) => {
      const li = h('li');
      li.append(h('b', '', peerName(i, p.name)), h('span', '', tx(p.summary)));
      ul.append(li);
    });
    peersBox.append(ul);
    peersBox.open = open;
  }
  // State.peers の name は日本語だけなので、英語の時は中身(inner.peerStates)の名前を借りる。logic への要望として報告済み
  function peerName(i: number, ja: string) {
    if (lang() === 'ja') return ja;
    return s.inner.peerStates[i]?.name.en ?? ja;
  }
  function paintAll() { paintCard(); paintShelf(); paintPeers(); }

  // ---- 作品の後日談(タップで開く) ----
  function openWork(w: Work) {
    closeModal();
    const m = h('div', 'modal');
    const box = h('div', `modal-box work-detail r-${w.result}`);
    const icon = h('div', `work big shape-${shapeOf(w)} r-${w.result}`);
    icon.append(h('span', 'work-ch', initial(w)));
    box.append(icon, h('h3', '', tx(w.name)), h('div', 'wd-meta', `${w.year} · ${w.platform} · ${t(`role_${w.role}`)} · ${t(`res_${w.result}`)}`));
    box.append(h('div', 'wd-lab', t('history')));
    const ul = h('ul', 'wd-hist');
    if (!w.history.length) ul.append(h('li', 'muted', t('noHistory')));
    for (const e of w.history) { const li = h('li'); li.append(h('b', '', String(e.year)), h('span', '', tx(e.text))); ul.append(li); }
    box.append(ul);
    const close = h('button', 'mini', t('close'));
    onTap(close, closeModal);
    box.append(close);
    m.append(box);
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
    app.append(m);
    modal = m;
  }
  function closeModal() { modal?.remove(); modal = null; }

  // ---- 吹き出し ----
  function bubble(kind: string, text: string, year: number): HTMLElement {
    const msg = h('div', `msg k-${kind}`);
    const who = h('div', 'who');
    who.append(h('span', 'who-ic', KIND_ICON[kind] ?? '💬'), h('span', 'who-nm', t(KIND_WHO[kind] ?? 'fromEvent')), h('span', 'who-yr', String(year)));
    msg.append(who, h('div', 'bubble', text));
    chatInner.append(msg);
    // 古い吹き出しは捨てる(DOM を軽く)
    while (chatInner.children.length > 90) chatInner.firstElementChild?.remove();
    requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    return msg;
  }

  /** 歴史の事件の吹き出し: 見出し(news)+ 本文。図鑑で初めてなら NEW、立場違いなら「別の立場で」 */
  function histBubble(l: LogLine, hs: string): HTMLElement | null {
    const hd = HIST_BY_ID.get(hs);
    if (!hd) return null;
    const style = HIST_STYLE[hd.kind] ?? 'paper';
    const key = s.chronicle.find((k) => k.startsWith(`${hs}:`)) ?? '';
    const mark = !knownHist.has(hs) ? 'new' : key && !known.has(key) ? 'pos' : '';
    const msg = h('div', `msg k-${l.kind} hist hist-${style} pop`);
    msg.dataset.hist = hs;
    const who = h('div', 'who');
    who.append(h('span', 'who-ic', HIST_ICON[hd.kind] ?? '📰'), h('span', 'who-nm', t(style === 'tv' ? 'histTv' : 'histPaper')), h('span', 'who-yr', hd.month ? tf('ym', { y: l.year, m: hd.month }) : String(l.year)));
    if (mark) who.append(h('span', `hist-mark m-${mark}`, t(mark === 'new' ? 'histNew' : 'histOtherPos')));
    const head = h('div', 'hist-head');
    head.append(h('span', 'hist-tag', t(style === 'tv' ? 'histTvTag' : 'histPaperTag')), h('span', 'hist-news', tx(hd.news)));
    const pos = h('div', 'hist-pos', tf('histAsPos', { pos: tx(POS_TEXT[positionOf(s)]) }));
    msg.append(who, head, h('div', 'bubble', tx(l.text)), pos);
    chatInner.append(msg);
    while (chatInner.children.length > 90) chatInner.firstElementChild?.remove();
    requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    tickerLines.push(`${t('histTvTag')} ${tx(hd.news)}`);
    setTape();
    sfx.score();
    return msg;
  }

  function showLine(l: LogLine) {
    if (l.year !== curYear || l.age !== curAge) {
      if (l.year !== curYear) { tickerLines = []; setTape(); }
      setTicker(l.year, l.age);
    }
    if (l.kind === 'timeline') {
      tickerLines.push(tx(l.text));
      setTape();
      return false; // 時間を使わない
    }
    const m = (l.hist && histBubble(l, l.hist)) || bubble(l.kind, tx(l.text), l.year);
    if (l.kind === 'work') {
      m.classList.add('pop');
      if (/発売|ships/.test(l.text.ja + l.text.en) && !(l.tag ?? []).includes('afterlife')) sfx.score();
    }
    if ((l.tag ?? []).includes('afterlife')) m.classList.add('afterlife');
    // テンションが上がった瞬間・有名人に会った瞬間は少し明るく(後味を良くする)
    if ((l.tag ?? []).includes('high')) m.classList.add('t-high');
    if ((l.tag ?? []).includes('celeb')) m.classList.add('t-celeb');
    paintAll();
    return true;
  }

  function pull() {
    const before = s.log.length;
    if (!s.ending && !s.choice) advance(s);
    for (; shown < s.log.length; shown++) queue.push(s.log[shown]);
    batchN = queue.filter((l) => l.kind !== 'timeline').length || 1;
    return s.log.length > before;
  }

  function schedule(ms: number) {
    clearTimeout(timer);
    if (paused || ended) return;
    timer = window.setTimeout(() => step(), ms);
  }

  function step(afterPull = false) {
    if (paused || ended || waitingChoice || modalBlocks()) { if (modalBlocks()) schedule(300); return; }
    // 年表だけの行は間を置かずに続けて出す(ティッカーへ)
    while (queue.length) {
      const l = queue.shift()!;
      if (showLine(l)) { schedule(lineMs()); return; }
    }
    if (s.ending) { finish(); return; }
    if (s.choice) { askChoice(); return; }
    // 吹き出しが 1 つも無い年は、ティッカーだけ見せて 1 年待つ
    if (afterPull) { schedule(yearMs()); return; }
    const grew = pull();
    if (!grew) { schedule(yearMs()); return; }
    step(true);
  }
  // 作品の詳細を開いている間は止める(人が読んでいる)。おまかせ・自動の時は止めない
  const modalBlocks = () => !!modal && !omakase;

  function skip() {
    if (ended || waitingChoice) return;
    clearTimeout(timer);
    const p = paused; paused = false;
    step();
    paused = p;
    if (p) clearTimeout(timer);
  }

  // ---- 選択 ----
  function askChoice() {
    const c = s.choice!;
    // logic は選択イベントの本文もログに出すので、直前の吹き出しが同じ文ならそこにボタンを付ける
    const last = chatInner.lastElementChild as HTMLElement | null;
    let msg: HTMLElement;
    if (last && last.querySelector('.bubble')?.textContent === tx(c.text)) {
      msg = last;
      msg.className = `${msg.className.replace(/\bk-\w+/g, '').replace(/\bpop\b/g, '').trim()} k-ask pop`;
      if (!msg.dataset.hist) {
        const nm = msg.querySelector('.who-nm'); if (nm) nm.textContent = t('fromAsk');
        const ic = msg.querySelector('.who-ic'); if (ic) ic.textContent = KIND_ICON.ask;
      }
    } else {
      msg = bubble('ask', tx(c.text), curYear);
      msg.classList.add('pop');
    }
    const opts = h('div', 'opts');
    const buttons = c.choices.map((ch, i) => {
      const b = h('button', 'opt');
      b.append(h('span', 'opt-n', String(i + 1)), h('span', 'opt-t', tx(ch.label)));
      onTap(b, () => doChoose(ch.id, 'tap'));
      opts.append(b);
      return b;
    });
    msg.append(opts);
    waitingChoice = { box: msg, buttons, choices: c.choices };
    ring.set(buttons, 0);
    const toEnd = () => { chat.scrollTop = chat.scrollHeight; };
    requestAnimationFrame(toEnd);
    setTimeout(toEnd, 350);
    sfx.ui();
    // replay → おまかせ の順で自動で選ぶ
    const fromReplay = o.player ? o.player.input(choiceFrame) : '';
    if (fromReplay && c.choices.some((x) => x.id === fromReplay)) {
      setTimeout(() => doChoose(fromReplay, 'replay'), Math.max(250, lineMs()));
    } else if (omakase) autoChoose();
  }
  let autoTimer = 0;
  function autoChoose() {
    clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => {
      if (!waitingChoice || !omakase || paused) return;
      doChoose(BOTS.think(s, waitingChoice.choices), 'auto');
    }, Math.max(o.quick ? 250 : 700, lineMs()));
  }
  function doChoose(id: string, _by: string): string | void {
    if (!waitingChoice || !s.choice) return 'no choice is open';
    if (!s.choice.choices.some((x) => x.id === id)) return `unknown choice id: ${id} (choices: ${s.choice.choices.map((x) => x.id).join(', ')})`;
    const w = waitingChoice;
    w.buttons.forEach((b, i) => { b.disabled = true; b.classList.toggle('picked', w.choices[i].id === id); });
    w.box.classList.add('answered');
    waitingChoice = null;
    ring.set([]);
    clearTimeout(autoTimer);
    o.recorder.push(choiceFrame, id);
    choiceFrame++;
    sfx.tap();
    choose(s, id);
    for (; shown < s.log.length; shown++) queue.push(s.log[shown]);
    batchN = queue.filter((l) => l.kind !== 'timeline').length || 1;
    paintAll();
    schedule(Math.min(400, lineMs()));
  }

  // ---- 終わり ----
  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    paintAll();
    const e = s.ending!;
    setTicker(e.year, e.age);
    sfx.over();
    const ov = h('div', 'ending');
    const box = h('div', 'ending-box');
    box.append(h('div', 'ending-head', t('endHead')), h('div', 'ending-when', tf('endAt', { year: e.year, age: e.age })), h('div', 'ending-cause', tx(e.cause)), h('div', 'ending-tap', t('toResult')));
    ov.append(box);
    app.append(ov);
    let done = false;
    const go = () => { if (done) return; done = true; o.onEnd(s); };
    endGo = go;
    setTimeout(() => onTap(ov, go), 600);
    setTimeout(go, o.quick || omakase ? 3200 : 9000);
  }
  let endGo: (() => void) | null = null;

  // ---- 速度・停止・おまかせ ----
  function setSpeed(n: unknown): string | void {
    const v = (n === 'fast' ? 'fast' : Number(n)) as Speed;
    if (!SPEEDS.includes(v)) return `speed must be one of 1, 2, 4, 'fast' (got ${String(n)})`;
    speed = v;
    paintBar();
    if (!waitingChoice && !paused && !ended) schedule(Math.min(lineMs(), 300));
  }
  function togglePause() {
    paused = !paused;
    paintBar();
    if (!paused) { schedule(200); if (waitingChoice && omakase) autoChoose(); } else clearTimeout(timer);
  }
  function setOmakase(on: boolean) {
    omakase = on;
    paintBar();
    if (on && waitingChoice) autoChoose();
  }

  function onCmd(c: Cmd) {
    if (ended) { if (c.type === 'ok' || c.type === 'pause') endGo?.(); return; }
    if (modal) { if (c.type === 'ok' || c.type === 'back' || c.type === 'speed') closeModal(); return; }
    if (waitingChoice) {
      if (c.type === 'pick') { const ch = waitingChoice.choices[c.n - 1]; if (ch) doChoose(ch.id, 'key'); return; }
      if (c.type === 'up' || c.type === 'left') { ring.move(-1); return; }
      if (c.type === 'down' || c.type === 'right') { ring.move(1); return; }
      if (c.type === 'ok') { const i = ring.i; const ch = waitingChoice.choices[i]; if (ch) doChoose(ch.id, 'key'); return; }
    }
    if (c.type === 'pause') togglePause();
    else if (c.type === 'speed') setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
    else if (c.type === 'ok') skip();
    else if (c.type === 'left' && !waitingChoice) setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]);
    else if (c.type === 'right' && !waitingChoice) setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]);
  }

  // ---- 開始 ----
  setTicker(s.year, s.age);
  setTape();
  paintAll();
  paintShelf(true);
  paintBar();
  schedule(400);

  return {
    onCmd,
    state: s,
    choose: (id) => doChoose(String(id), 'probe'),
    setSpeed,
    togglePause,
    setOmakase,
    info: () => ({
      year: curYear, age: curAge, job: s.job, status: s.status, company: tx(s.company.name),
      stat: { ...s.stat }, works: s.works.length, speed, paused, omakase,
      choice: waitingChoice ? { text: tx(s.choice?.text), options: waitingChoice.choices.map((c) => ({ id: c.id, label: tx(c.label) })) } : null,
      ending: s.ending ? tx(s.ending.cause) : null,
      queued: queue.length,
    }),
  };
}
