// キー + ポインタ + ゲームパッドを 1 つの状態に統合する薄い層。既定の割り当ては docs/knowledge/controls.md。
// 移動の方式は 2 つ(作品が選ぶ。F2 のつまみ input.touch でも切り替えられる):
//  - 'stick'(既定): キー・十字/左スティック・スマホのバーチャルパッド。パッドは
//      floating = 画面の左半分のどこを触っても、そこが中心になる / fixed = 決まった場所に出す
//  - 'direct': マウスポインタの位置にそのまま動く。スマホはドラッグした指の位置にそのまま動く
// 決定は、画面の右半分のタップ・クリック(direct の時は 1 本目の指以外のタップ、マウスは右クリックか Space)。
import Phaser from 'phaser';
import { unlock } from './audio';

export type TouchMode = 'floating' | 'fixed' | 'direct';

export interface InputOptions {
  /** スマホ(とマウス)での移動の方式。既定 'floating' */
  touch?: TouchMode;
  /** fixed の時のパッドの中心(画面に対する割合 0〜1)。既定 左下 */
  fixedAt?: { x: number; y: number };
  /** パッドの半径(px)。この距離で最大 */
  radius?: number;
}

export interface InputState {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** 押した瞬間だけ true(1 フレーム) */
  action: boolean;
  /** 移動の量(-1..1)。キー・十字は ±1、スティックとバーチャルパッドは傾き */
  axisX: number;
  axisY: number;
  /** direct の時: 目指す位置(画面座標)。指・マウスが無い時は null */
  target: { x: number; y: number } | null;
  /** 一時停止を押した瞬間だけ true(Esc / P / コントローラの START) */
  pause: boolean;
}

const DEAD = 0.2; // スティック・パッドの遊び

export class UnifiedInput {
  state: InputState = { left: false, right: false, up: false, down: false, action: false, axisX: 0, axisY: 0, target: null, pause: false };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private actionQueued = false;
  private pauseQueued = false;
  private padPrev = { action: false, pause: false };
  private stick: { cx: number; cy: number; id: number } | null = null;
  private dragId: number | null = null;
  private mouseMoved = false;
  private gfx?: Phaser.GameObjects.Graphics;
  private opts: Required<InputOptions>;

  constructor(private scene: Phaser.Scene, options: InputOptions = {}) {
    this.opts = { touch: 'floating', fixedAt: { x: 0.18, y: 0.78 }, radius: 60, ...options };
    const kb = scene.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keys = kb.addKeys('W,A,S,D,SPACE,ENTER,Z,X,P') as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown', (e: KeyboardEvent) => {
        unlock();
        if (e.repeat) return;
        if (['Space', 'Enter', 'KeyZ', 'KeyX'].includes(e.code)) this.actionQueued = true;
        if (['Escape', 'KeyP'].includes(e.code)) this.pauseQueued = true;
      });
    }
    scene.input.addPointer(2);
    scene.input.mouse?.disableContextMenu();
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.mouseMoved = true; });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.stick && p.id === this.stick.id) this.stick = null;
      if (this.dragId === p.id) this.dragId = null;
    });
    if (this.opts.touch !== 'direct') {
      this.gfx = scene.add.graphics().setDepth(1000).setScrollFactor(0);
    }
  }

  private down(p: Phaser.Input.Pointer) {
    unlock();
    const { width, height } = this.scene.scale;
    if (this.opts.touch === 'direct') {
      // 1 本目の指(とマウスの左ボタン)は移動、それ以外(2 本目の指・右クリック)は決定
      if (p.wasTouch ? this.dragId === null : p.leftButtonDown()) this.dragId = p.id;
      else this.actionQueued = true;
      return;
    }
    if (!p.wasTouch) { this.actionQueued = true; return; } // マウスのクリックは決定
    if (p.x < width / 2 && !this.stick) {
      const c = this.opts.touch === 'fixed'
        ? { cx: this.opts.fixedAt.x * width, cy: this.opts.fixedAt.y * height }
        : { cx: p.x, cy: p.y };
      this.stick = { ...c, id: p.id };
    } else {
      this.actionQueued = true;
    }
  }

  /** scene.update() の先頭で呼ぶ */
  update() {
    const s = this.state;
    const c = this.cursors, k = this.keys;
    const pad = this.scene.input.gamepad?.getPad(0);

    // キー・十字・左スティック
    let ax = (c?.right.isDown || k?.D.isDown || pad?.right ? 1 : 0) - (c?.left.isDown || k?.A.isDown || pad?.left ? 1 : 0);
    let ay = (c?.down.isDown || k?.S.isDown || pad?.down ? 1 : 0) - (c?.up.isDown || k?.W.isDown || pad?.up ? 1 : 0);
    if (pad && Math.hypot(pad.leftStick.x, pad.leftStick.y) > DEAD) { ax = pad.leftStick.x; ay = pad.leftStick.y; }

    // バーチャルパッド
    this.gfx?.clear();
    const showFixed = this.opts.touch === 'fixed' && this.scene.sys.game.device.input.touch;
    if (this.stick) {
      const p = this.pointer(this.stick.id);
      if (p && p.isDown) {
        let vx = (p.x - this.stick.cx) / this.opts.radius, vy = (p.y - this.stick.cy) / this.opts.radius;
        const len = Math.hypot(vx, vy);
        if (len > 1) { vx /= len; vy /= len; }
        if (Math.hypot(vx, vy) > DEAD) { ax = vx; ay = vy; }
        this.drawStick(this.stick.cx, this.stick.cy, vx, vy);
      } else this.stick = null;
    } else if (showFixed) {
      const { width, height } = this.scene.scale;
      this.drawStick(this.opts.fixedAt.x * width, this.opts.fixedAt.y * height, 0, 0);
    }

    s.axisX = Phaser.Math.Clamp(ax, -1, 1);
    s.axisY = Phaser.Math.Clamp(ay, -1, 1);
    s.left = s.axisX < -0.4; s.right = s.axisX > 0.4; s.up = s.axisY < -0.4; s.down = s.axisY > 0.4;

    // direct: 指の位置・マウスの位置に向かう
    s.target = null;
    if (this.opts.touch === 'direct') {
      const p = this.dragId !== null ? this.pointer(this.dragId) : null;
      if (p && p.isDown) s.target = { x: p.x, y: p.y };
      else if (this.mouseMoved) { const m = this.scene.input.activePointer; if (!m.wasTouch) s.target = { x: m.x, y: m.y }; }
      if (ax !== 0 || ay !== 0) { s.target = null; this.mouseMoved = false; } // キー・スティックを触ったらそちらを優先
    }

    // コントローラは押した瞬間だけ拾う(押しっぱなしで毎フレーム「押した」にしない)
    const padAction = !!(pad && (pad.A || pad.B));
    const padPause = !!(pad && pad.buttons[9]?.pressed); // START(標準配置の 9 番)
    if (padAction && !this.padPrev.action) this.actionQueued = true;
    if (padPause && !this.padPrev.pause) this.pauseQueued = true;
    this.padPrev = { action: padAction, pause: padPause };

    s.action = this.actionQueued;
    this.actionQueued = false;
    s.pause = this.pauseQueued;
    this.pauseQueued = false;
  }

  private pointer(id: number) {
    return this.scene.input.manager.pointers.find((q) => q.id === id);
  }

  private drawStick(cx: number, cy: number, vx: number, vy: number) {
    const g = this.gfx!, r = this.opts.radius;
    g.lineStyle(2, 0xffffff, 0.35).strokeCircle(cx, cy, r);
    g.fillStyle(0xffffff, 0.35).fillCircle(cx + vx * r, cy + vy * r, r * 0.4);
  }
}
