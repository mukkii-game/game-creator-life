// 比べるためのボット。tools/sim.mjs が全部を同じ seed で回し、結果を並べる。
// 作品ごとに書き換える。最低限そろえる 3 種:
//  - idle: 何もしない。これで勝てたら「何もしないで勝てる」穴(knowledge: game-design §5)
//  - random: でたらめに押す。考えるボットとの差が小さいなら、考える意味が無い
//  - think: 考えて動く。lagged はその指の遅れ版(反射神経だけで決まっていないかを見る)
import { Input, State, Config, NO_INPUT, TICK } from './logic';
import { Rng } from '../core/rng';

export type Bot = (s: State, cfg: Config) => Input;

/** 見本の「考えるボット」: 左右に動きながら、間隔をあけて押す(人の連打は 1 秒に 8 回くらいまで) */
function presser(intervalSec: number): Bot {
  const every = Math.max(1, Math.round(intervalSec / TICK));
  return (s) => ({ dx: Math.sin(s.tick / 40) > 0 ? 1 : -1, press: s.tick % every === 0 });
}

/** 指の遅れ: lagSec 前の状態を見て決めたことを、今やる */
function lagged(bot: Bot, lagSec: number): Bot {
  const n = Math.max(1, Math.round(lagSec / TICK));
  const queue: Input[] = [];
  return (s, cfg) => {
    queue.push(bot(s, cfg));
    return queue.length > n ? queue.shift()! : NO_INPUT;
  };
}

// ボットの乱数はゲームの乱数(state.rng)と分ける。混ぜると、ボットを替えただけで面の中身が変わる。
export const BOTS: Record<string, (seed: number) => Bot> = {
  idle: () => () => NO_INPUT,
  random: (seed) => { const r = new Rng(seed ^ 0x9e3779b9); return () => ({ dx: r.int(-1, 1), press: r.chance(0.05) }); },
  think: () => presser(0.125),
  'think+0.6s遅れ': () => lagged(presser(0.125), 0.6),
};
