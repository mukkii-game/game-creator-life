// 「動くサンプル」の描画側。ゲームの中身は src/game/logic.ts にあり、ここは入力を集めて見せるだけ。
// 作品は logic.ts と、このシーンの見た目を置き換える。core の使い方の見本として残す。
import Phaser from 'phaser';
import { UnifiedInput, TouchMode } from '../core/input';
import { DemoDriver, expose } from '../core/demo';
import { sfx } from '../core/audio';
import { t } from '../core/i18n';
import { save, load } from '../core/save';
import { tune } from '../core/tuning';
import { describe, action, clearActions } from '../core/probe';
import { FixedStep } from '../core/fixedstep';
import { startSeed } from '../core/rng';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { TICK, Config, Input, State, init, step, encodeInput, decodeInput } from '../game/logic';
import { BOTS, Bot } from '../game/bots';

export class Play extends Phaser.Scene {
  private input2!: UnifiedInput;
  private player!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private cfg!: Config;
  private state!: State;
  private clock = new FixedStep(TICK);
  private rec!: Recorder;
  private replay: Player | null = null;
  private bot: Bot | null = null;
  private pressed = false; // 次の tick に渡す「押された」
  private targetX: number | null = null;

  constructor() { super('Play'); }

  create() {
    expose('scene', 'Play');
    const { width, height } = this.scale;
    this.cfg = { speed: tune('player.speed'), duration: tune('game.duration'), scorePer: tune('score.per'), width };
    const recorded = replayFromUrl();
    const seed = recorded?.seed ?? startSeed();
    this.state = init(this.cfg, seed);
    this.rec = new Recorder(seed);
    this.replay = recorded ? new Player(recorded) : null;
    this.clock.reset();
    this.pressed = false;
    this.targetX = null;
    expose('replay', () => this.rec.toString()); // 今のプレイの記録。?replay=<これ> で同じプレイになる

    this.cameras.main.setBackgroundColor('#0f2027');
    this.input2 = new UnifiedInput(this, { touch: tune<string>('input.touch') as TouchMode });
    this.player = this.add.rectangle(this.state.x, height * 0.7, 40, 40, 0x4ecdc4);
    this.scoreText = this.add.text(12, 12, '', { fontSize: '20px', color: '#fff', fontFamily: 'sans-serif' });
    this.timeText = this.add.text(width - 12, 12, '', { fontSize: '20px', color: '#fff', fontFamily: 'sans-serif' }).setOrigin(1, 0);

    // 自動プレイ(?auto=1)は、sim と同じボットを同じ入口で動かす
    this.bot = DemoDriver.enabled ? BOTS.think(seed) : null;

    // AI の目と手(core/probe.ts)。作品ごとに「状態」と「意味単位の操作」を書き換える
    clearActions();
    describe(() => ({ scene: 'Play', score: this.state.score, timeLeft: +this.state.timeLeft.toFixed(1), x: +(this.state.x / width).toFixed(2) }));
    action('moveTo', (x: number) => {
      if (typeof x !== 'number' || x < 0 || x > 1) return 'moveTo(x): x は 0〜1(画面の左端〜右端)';
      this.targetX = x * width;
    });
    action('score', () => { if (this.state.over) return 'time is up'; this.pressed = true; });
    this.events.once('shutdown', clearActions);
    this.updateHud();
  }

  /** 人の入力を、ゲームの中身が受け取る形に直す */
  private humanInput(): Input {
    const s = this.input2.state;
    let dx = s.axisX; // キー・十字・スティック・バーチャルパッドがまとまった量
    if (s.target) this.targetX = s.target.x; // direct: 指・マウスの位置へ
    if (dx !== 0) this.targetX = null; // キー・スティックが優先
    else if (this.targetX !== null) {
      const d = this.targetX - this.state.x;
      if (Math.abs(d) < 4) this.targetX = null; else dx = Math.sign(d);
    }
    return { dx, press: this.pressed };
  }

  update(_time: number, deltaMs: number) {
    this.input2.update();
    if (this.input2.state.action) this.pressed = true; // 押した瞬間を、次の tick まで覚えておく

    this.clock.advance(deltaMs, () => {
      const input = this.replay ? decodeInput(this.replay.input(this.state.tick))
        : this.bot ? this.bot(this.state, this.cfg)
        : this.humanInput();
      this.pressed = false;
      this.rec.push(this.state.tick, encodeInput(input));
      for (const e of step(this.state, input, this.cfg)) this.onEvent(e);
    });

    this.player.x = this.state.x;
    this.updateHud();
  }

  private onEvent(e: string) {
    if (e === 'score') {
      sfx.score(); expose('score', this.state.score);
      this.tweens.add({ targets: this.player, scale: tune('juice.pop'), yoyo: true, duration: 80 });
    } else if (e === 'over') {
      const best = Math.max(load().best, this.state.score);
      save({ best, played: load().played + 1 });
      sfx.over();
      this.scene.start('Result', { score: this.state.score, best });
    }
  }

  private updateHud() {
    this.scoreText.setText(`${t('score')}: ${this.state.score}`);
    this.timeText.setText(`${Math.ceil(this.state.timeLeft)}`);
  }
}
