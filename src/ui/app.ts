// 仮の骨組み(Step 0)。パート D が本物の画面に置き換える。
import { init, advance, choose } from '../game/logic';
import { BOTS } from '../game/bots';
import { startSeed } from '../core/rng';
import { lang } from '../core/i18n';
import { expose } from '../core/demo';

export function startApp(root: HTMLElement) {
  const s = init(startSeed());
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#ddd;white-space:pre-wrap;font:14px sans-serif;max-width:540px;height:100%;overflow:auto;margin:0;padding:12px;box-sizing:border-box';
  root.append(pre);
  expose('scene', 'Play');
  let shown = 0;
  const tick = () => {
    if (s.ending) return;
    advance(s);
    while (s.choice) choose(s, BOTS.think(s, s.choice.choices));
    for (; shown < s.log.length; shown++) pre.textContent += `${s.log[shown].year} (${s.log[shown].age}) ${s.log[shown].text[lang()]}\n`;
    pre.scrollTop = pre.scrollHeight;
    expose('score', s.age);
    setTimeout(tick, 300);
  };
  tick();
}
