// 入力の受け口(キー・ポインタ・パッド)。AGENTS.md「入力リスナーを window だけに付けるな」:
// window・document・root の全部に付け、同じイベントは 1 回だけ扱う(WeakSet で重複排除)。
// パッドは Gamepad API を毎フレーム読む(押した瞬間だけ)。?debug=1 で画面の隅に受信回数を出す。
import { unlock } from '../core/audio';
import { query } from '../core/meta';

export type Cmd =
  | { type: 'pick'; n: number }   // 1〜4 キー
  | { type: 'up' } | { type: 'down' } | { type: 'left' } | { type: 'right' }
  | { type: 'ok' }                // Enter / パッド A
  | { type: 'speed' }             // パッド B
  | { type: 'pause' }             // Space / Esc / P / START
  | { type: 'back' };             // Esc(モーダルを閉じる)

type Handler = (c: Cmd, from: 'key' | 'pad') => void;

const counts = { pointer: 0, key: 0, pad: 0 };
let handler: Handler = () => {};
let unlocked = false;
const seen = new WeakSet<Event>();
let debugEl: HTMLElement | null = null;

export function setHandler(h: Handler) { handler = h; }

function firstInput() {
  if (unlocked) return;
  unlocked = true;
  unlock();
}

function onKey(e: KeyboardEvent) {
  if (seen.has(e)) return;
  seen.add(e);
  counts.key++; showDebug();
  firstInput();
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return; // 調整パネルの入力欄
  let c: Cmd | null = null;
  switch (e.key) {
    case '1': case '2': case '3': case '4': c = { type: 'pick', n: Number(e.key) }; break;
    case 'ArrowUp': case 'w': case 'W': c = { type: 'up' }; break;
    case 'ArrowDown': case 's': case 'S': c = { type: 'down' }; break;
    case 'ArrowLeft': case 'a': case 'A': c = { type: 'left' }; break;
    case 'ArrowRight': case 'd': case 'D': c = { type: 'right' }; break;
    case 'Enter': c = { type: 'ok' }; break;
    case ' ': case 'p': case 'P': c = { type: 'pause' }; break;
    case 'Escape': c = { type: 'back' }; break;
  }
  if (!c) return;
  e.preventDefault();
  handler(c, 'key');
}

function onPointer(e: Event) {
  if (seen.has(e)) return;
  seen.add(e);
  counts.pointer++; showDebug();
  firstInput();
}

// ---- パッド(標準配置: 0=A 1=B 9=START 12〜15=十字) ----
const prev: Record<number, boolean[]> = {};
const PAD_MAP: [number, Cmd][] = [[0, { type: 'ok' }], [1, { type: 'speed' }], [9, { type: 'pause' }], [12, { type: 'up' }], [13, { type: 'down' }], [14, { type: 'left' }], [15, { type: 'right' }]];
let axisHeld: Record<number, string> = {};
function pollPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const was = prev[p.index] ?? [];
    const now = p.buttons.map((b) => b.pressed);
    for (const [i, c] of PAD_MAP) {
      if (now[i] && !was[i]) { counts.pad++; showDebug(); firstInput(); handler(c, 'pad'); }
    }
    // 左スティックも十字として扱う(倒した瞬間だけ)
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    const dir = ay < -0.6 ? 'up' : ay > 0.6 ? 'down' : ax < -0.6 ? 'left' : ax > 0.6 ? 'right' : '';
    if (dir && axisHeld[p.index] !== dir) { counts.pad++; showDebug(); handler({ type: dir } as Cmd, 'pad'); }
    axisHeld[p.index] = dir;
    prev[p.index] = now;
  }
  requestAnimationFrame(pollPads);
}

function showDebug() {
  if (!debugEl) return;
  debugEl.textContent = `ptr ${counts.pointer} / key ${counts.key} / pad ${counts.pad}`;
}

export function installInput(root: HTMLElement) {
  for (const t of [window, document, root] as EventTarget[]) {
    t.addEventListener('keydown', onKey as EventListener);
    t.addEventListener('pointerdown', onPointer);
    t.addEventListener('touchstart', onPointer, { passive: true });
  }
  requestAnimationFrame(pollPads);
  if (query.get('debug') === '1') {
    debugEl = document.createElement('div');
    debugEl.className = 'gcl-debug';
    document.body.append(debugEl);
    showDebug();
  }
}

/** ボタンに「押した」を付ける。click だけに頼らず pointerup も見る(埋め込みで click が来ない端末の保険)。二重発火は時間で弾く */
export function onTap(el: HTMLElement, fn: () => void) {
  let last = 0;
  const go = (e: Event) => {
    if (seen.has(e)) return;
    seen.add(e);
    const now = performance.now();
    if (now - last < 350) return;
    last = now;
    firstInput();
    fn();
    el.blur(); // Space / Enter が「フォーカス中のボタンを押す」にならないように
  };
  el.addEventListener('click', go);
  el.addEventListener('pointerup', (e) => { if ((e as PointerEvent).pointerType === 'touch') go(e); });
}
