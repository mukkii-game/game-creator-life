// タイトル画面: 題名・一言・時代を選ぶ・「業界入りガチャを引く」・1200 万人の注記
import { t, toggleLang } from '../core/i18n';
import { toggleMuted, isMuted, sfx } from '../core/audio';
import type { Era } from '../game/types';
import { h, tf, setLook, FocusRing } from './util';
import { load, save } from '../core/save';
import { HIST } from '../game/data';
import { onTap, type Cmd } from './input';

export interface TitleScreen { onCmd: (c: Cmd) => void }

const ERAS: (Era | '')[] = ['', 'era1', 'era2', 'era3'];

export function showTitle(app: HTMLElement, era: Era | '', onStart: (era: Era | '') => void, onChronicle: () => void): TitleScreen {
  let cur: TitleScreen = render(app, era, onStart, onChronicle, (e) => { cur = showTitleInner(e); });
  const showTitleInner = (e: Era | ''): TitleScreen => render(app, e, onStart, onChronicle, (e2) => { cur = showTitleInner(e2); });
  return { onCmd: (c) => cur.onCmd(c) };
}

/** 図鑑で触れた事件の数(事件 id ごと。立場違いは 1 件に数える) */
export function chronicleCount(keys: string[]): number {
  const ids = new Set(HIST.map((x) => x.id));
  return new Set(keys.map((k) => k.split(':')[0]).filter((id) => ids.has(id))).size;
}

function render(app: HTMLElement, era: Era | '', onStart: (era: Era | '') => void, onChronicle: () => void, relang: (era: Era | '') => void): TitleScreen {
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

  // 名前(空 = おまかせ。save に残して次回も入っている)
  const nameBox = h('div', 'title-name');
  const nameIn = h('input', 'name-in');
  nameIn.type = 'text';
  nameIn.maxLength = 16;
  nameIn.placeholder = t('namePh');
  nameIn.value = load().name;
  nameIn.autocomplete = 'off';
  nameIn.enterKeyHint = 'go';
  nameIn.setAttribute('aria-label', t('nameLabel'));
  const keep = () => save({ name: nameIn.value.trim().slice(0, 16) });
  nameIn.addEventListener('change', keep);
  nameIn.addEventListener('blur', keep);
  // 入力欄の中のキーはゲームの操作に使わない(input.ts が INPUT を無視する)。Enter だけ「ガチャを引く」
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); nameIn.blur(); go.click(); } });
  const diceB = h('button', 'mini name-dice', t('nameRandom'));
  onTap(diceB, () => { nameIn.value = ''; keep(); sfx.ui(); });
  nameBox.append(h('label', 'title-label', t('nameLabel')), h('div', 'name-row'));
  nameBox.lastElementChild!.append(nameIn, diceB);

  const go = h('button', 'gacha', t('gacha'));
  onTap(go, () => { keep(); onStart(pick); });

  const chronB = h('button', 'chron-btn');
  chronB.append(h('span', 'chron-ic', '📜'), h('span', '', tf('chronBtn', { n: chronicleCount(load().chronicle), all: HIST.length })));
  onTap(chronB, () => { sfx.ui(); onChronicle(); });

  const tools = h('div', 'title-tools');
  const langB = h('button', 'mini', t('lang'));
  onTap(langB, () => { toggleLang(); relang(pick); });
  const muteB = h('button', 'mini', isMuted() ? t('unmute') : t('mute'));
  onTap(muteB, () => { toggleMuted(); muteB.textContent = isMuted() ? t('unmute') : t('mute'); });
  tools.append(langB, muteB);

  const help = h('p', 'title-help', t('controlsHelp'));
  const note = h('p', 'title-note', t('note12m'));
  wrap.append(logo, sub, line, nameBox, go, eraBox, chronB, tools, help, note);
  app.append(wrap);

  // フォーカス順: ガチャ → 時代 → 年表 → 言語・音
  const ring = new FocusRing([go, ...chipEls, chronB, nameIn, diceB, langB, muteB], 0);
  return {
    onCmd(c) {
      if (c.type === 'up' || c.type === 'left') ring.move(-1);
      else if (c.type === 'down' || c.type === 'right') ring.move(1);
      else if (c.type === 'ok') { if (ring.current === nameIn) nameIn.focus(); else ring.current?.click(); }
      else if (c.type === 'pick') { const b = chipEls[c.n - 1]; if (b) b.click(); }
    },
  };
}
