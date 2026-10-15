// ゲームの中身(描画なし)。見本: ← → で動き、押すたびに加点、制限時間で終わる。
// 作品はこのファイルを丸ごと書き換える。決まりは 3 つだけ:
//  1. Phaser・DOM・Math.random を使わない(乱数は state.rng)。
//  2. 時間は TICK(1/60 秒)刻みの step でだけ進める。画面が 60Hz でも 120Hz でも同じ結果になる。
//  3. 入力は Input の形で受け取る。人もボットも記録の再生も、同じ入口を通る。
// こうしておくと tools/sim.mjs が描画なしで何百回も回し、ボットどうしを比べられる。
import { Rng } from '../core/rng';

export const TICK = 1 / 60; // 秒

export interface Config { speed: number; duration: number; scorePer: number; width: number }
export interface Input { dx: number; press: boolean } // dx: -1〜1 / press: その tick に押された
export interface State { x: number; score: number; timeLeft: number; tick: number; over: boolean; rng: Rng }

export const NO_INPUT: Input = { dx: 0, press: false };

export function init(cfg: Config, seed: number): State {
  return { x: cfg.width / 2, score: 0, timeLeft: cfg.duration, tick: 0, over: false, rng: new Rng(seed) };
}

/** 1 tick 進める。戻り値は、この tick に起きた出来事(描画側が音や演出に使う) */
export function step(s: State, input: Input, cfg: Config): string[] {
  if (s.over) return [];
  const events: string[] = [];
  const dx = Math.max(-1, Math.min(1, input.dx));
  s.x = Math.max(20, Math.min(cfg.width - 20, s.x + dx * cfg.speed * TICK));
  if (input.press) { s.score += cfg.scorePer; events.push('score'); }
  s.tick++;
  s.timeLeft = Math.max(0, cfg.duration - s.tick * TICK);
  if (s.timeLeft <= 0) { s.over = true; events.push('over'); }
  return events;
}

/** 入力を 1 文字ずつに直す(core/replay.ts の記録に使う) */
export function encodeInput(i: Input): string {
  return (i.dx < 0 ? 'L' : i.dx > 0 ? 'R' : '') + (i.press ? 'A' : '');
}
export function decodeInput(s: string): Input {
  return { dx: (s.includes('R') ? 1 : 0) - (s.includes('L') ? 1 : 0), press: s.includes('A') };
}
