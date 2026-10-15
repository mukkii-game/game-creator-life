// 描画のフレームと、ゲームの中身の刻み(TICK)を切り離す。
// 画面が 60Hz でも 120Hz でも、中身は同じ回数だけ進む(速さも記録の再生も同じになる)。
// 使い方: update(_, deltaMs) { this.clock.advance(deltaMs, () => step(...)); }
export class FixedStep {
  private acc = 0;
  /** tick: 1 回の刻み(秒)。maxSteps: 重い時に追いつこうとして固まるのを防ぐ上限 */
  constructor(readonly tick: number, readonly maxSteps = 5) {}
  advance(deltaMs: number, fn: () => void): number {
    this.acc += Math.min(deltaMs / 1000, this.tick * this.maxSteps);
    let n = 0;
    while (this.acc >= this.tick) { this.acc -= this.tick; fn(); n++; }
    return n;
  }
  reset() { this.acc = 0; }
}
