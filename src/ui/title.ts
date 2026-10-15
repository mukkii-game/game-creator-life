// タイトル画面: 題名・一言・時代を選ぶ・「業界入りガチャを引く」・1200 万人の注記
import { t, toggleLang } from '../core/i18n';
import { toggleMuted, isMuted, sfx } from '../core/audio';
import type { Era } from '../game/types';
import { h, setLook, FocusRing } from './util';
import { onTap, type Cmd } from './input';

export interface TitleScreen { onCmd: (c: Cmd) => void }

const ERAS: (Era | '')[] = ['', 'era1', 'era2', 'era3', 'era4', 'era5', 'era6'];

export function showTitle(app: HTMLElement, era: Era | '', onStart: (era: Era | '') => void): TitleScreen {
  let cur: TitleScreen = render(app, era, onStart, (e) => { cur = showTitleInner(e); });
  const showTitleInner = (e: Era | ''): TitleScreen => render(app, e, onStart, (e2) => { cur = showTitleInner(e2); });
  return { onCmd: (c) => cur.onCmd(c) };
}

function render(app: HTMLElement, era: Era | '', onStart: (era: Era | '') => void, relang: (era: Era | '') => void): TitleScreen {
  app.innerHTML = '';
  setLook(app, 'dot');
  app.dataset.scene = 'title';
  let pick: Era | '' = era;
  const wrap = h('div', 'title');
  const logo = h('div', 'title-logo');
  logo.append(h('div', 'title-num', '12,000,000'), h('h1', 'title-main', t('title')));
  const sub = h('p', 'title-sub', t('titleSub'));
  const line = h('p', 'title-tag', t('tagline'));

  const eraBox = h('div', 'title-eras');
  eraBox.append(h('div', 'title-label', t('eraPick')));
  const chips = h('div', 'chips');
  const chipEls: HTMLButtonElement[] = [];
  for (const e of ERAS) {
    const b = h('button', 'chip', t(e || 'eraAny'));
    b.dataset.era = e;
    onTap(b, () => { pick = e; paintChips(); sfx.ui(); });
    chipEls.push(b);
    chips.append(b);
  }
  const paintChips = () => chipEls.forEach((b) => b.classList.toggle('on', b.dataset.era === pick));
  paintChips();
  eraBox.append(chips);

  const go = h('button', 'gacha', t('gacha'));
  onTap(go, () => onStart(pick));

  const tools = h('div', 'title-tools');
  const langB = h('button', 'mini', t('lang'));
  onTap(langB, () => { toggleLang(); relang(pick); });
  const muteB = h('button', 'mini', isMuted() ? t('unmute') : t('mute'));
  onTap(muteB, () => { toggleMuted(); muteB.textContent = isMuted() ? t('unmute') : t('mute'); });
  tools.append(langB, muteB);

  const help = h('p', 'title-help', t('controlsHelp'));
  const note = h('p', 'title-note', t('note12m'));
  wrap.append(logo, sub, line, go, eraBox, tools, help, note);
  app.append(wrap);

  // フォーカス順: ガチャ → 時代 → 言語・音
  const ring = new FocusRing([go, ...chipEls, langB, muteB], 0);
  return {
    onCmd(c) {
      if (c.type === 'up' || c.type === 'left') ring.move(-1);
      else if (c.type === 'down' || c.type === 'right') ring.move(1);
      else if (c.type === 'ok') ring.current?.click();
      else if (c.type === 'pick') { const b = chipEls[c.n - 1]; if (b) b.click(); }
    },
  };
}
