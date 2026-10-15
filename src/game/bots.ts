// 比べるためのボット(PLAN §8)。tools/sim.mjs が全部を同じ seed で回し、死因・寿命・作品を並べる。
// 同期 3 人もこのボットで並走する。画面の「おまかせ」= think。
//  - idle: いつも 1 番目。これで 70 歳まで生きたら「何もしなくても生きる」穴
//  - random: でたらめ。think との差が小さいなら、選択に意味が無い
//  - think: 低いゲージを守る(体力・情熱・貯金のバランス)
//  - stable: 安定志向(体力と貯金、独立しない) / dreamer: 夢追い(情熱と名声、独立する)
import { Rng } from '../core/rng';
import type { State, Choice, Effect } from './types';

export type Bot = (s: State, choices: Choice[]) => string;

type W = { hp: number; passion: number; skill: number; network: number; money: number; fame: number; indie: number; end: number };
function scorer(w: (s: State) => W): Bot {
  return (s, choices) => {
    const k = w(s);
    let best = choices[0], bestV = -Infinity;
    for (const c of choices) {
      const e: Effect = c.effect ?? {};
      let v = (e.hp ?? 0) * k.hp + (e.passion ?? 0) * k.passion + (e.skill ?? 0) * k.skill + (e.network ?? 0) * k.network
        + (e.money ?? 0) / 10 * k.money + (e.fame ?? 0) * k.fame;
      if (e.flag?.do_go_indie) v += k.indie;
      if (e.flag?.do_end) v += k.end;
      if (e.flag?.do_return) v += 10;
      if (v > bestV) { bestV = v; best = c; }
    }
    return best.id;
  };
}
/** 低いほど大事(0〜100 → 3〜0.5 倍) */
const need = (v: number) => 0.5 + 2.5 * Math.max(0, (60 - v) / 60);

const rngs = new WeakMap<State, Rng>();

export const BOTS: Record<string, Bot> = {
  idle: (_s, c) => c[0].id,
  random: (s, c) => {
    let r = rngs.get(s);
    if (!r) { r = new Rng((s.seed ^ 0x9e3779b9) >>> 0); rngs.set(s, r); }
    return r.pick(c).id;
  },
  think: scorer((s) => ({ hp: need(s.stat.hp), passion: need(s.stat.passion) * 1.2, skill: 0.4, network: 0.5, money: s.stat.money < 100 ? 1.5 : 0.3, fame: 0.3, indie: s.stat.money > 400 && s.stat.network > 40 ? 5 : -15, end: s.age >= 65 ? 5 : -60 })),
  stable: scorer((s) => ({ hp: need(s.stat.hp) * 1.5, passion: need(s.stat.passion), skill: 0.2, network: 0.3, money: 1.2, fame: 0.1, indie: -30, end: s.age >= 60 ? 30 : -60 })),
  dreamer: scorer((s) => ({ hp: need(s.stat.hp) * 0.6, passion: need(s.stat.passion) * 1.5, skill: 0.6, network: 0.3, money: 0.2, fame: 1, indie: 20, end: -60 })),
};
