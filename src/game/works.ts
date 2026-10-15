// 作品棚(ひねり、PLAN §3)。作品を出す・結果を引く・発売後も史実に連動して勝手に生き続ける。
import { tune } from '../core/tuning';
import type { State, Work, Role, WorkResult, Text } from './types';
import { workName, platformFor } from './names';

export const ROLE_TEXT: Record<Role, Text> = {
  junior: { ja: '末端', en: 'a junior' }, core: { ja: '中核', en: 'a core member' }, lead: { ja: 'リード', en: 'the lead' }, solo: { ja: 'ひとり', en: 'solo' },
};
export const RESULT_TEXT: Record<WorkResult, Text> = {
  flop: { ja: '爆死', en: 'Flop' }, ok: { ja: '普通', en: 'OK' }, hit: { ja: 'ヒット', en: 'Hit' }, legend: { ja: '伝説', en: 'Legend' },
};

function roleFor(s: State): Role {
  if (s.status === 'indie') return 'solo';
  if (s.job === 'director' || s.job === 'producer' || s.stat.skill >= 75) return 'lead';
  if (s.stat.skill >= 35) return 'core';
  return 'junior';
}

function roll(s: State, role: Role): WorkResult {
  const sizeBonus = { big: 0.05, mid: 0, small: -0.02, sub: -0.04, indie: -0.03, abroad: 0.03, none: 0 }[s.company.size];
  const shift = (s.stat.skill - 60) / 600 + sizeBonus + (role === 'lead' ? 0.03 : 0) + s.stat.fame / 2500;
  const legend = Math.max(0.005, tune('work.legend') + shift / 5);
  const hit = Math.max(0.03, tune('work.hit') + shift);
  const flop = Math.max(0.1, tune('work.flop') - shift);
  const x = s.rng.next();
  if (x < legend) return 'legend';
  if (x < legend + hit) return 'hit';
  if (x < legend + hit + flop) return 'flop';
  return 'ok';
}

const RESULT_LINES: Record<WorkResult, Text[]> = {
  flop: [
    { ja: '発売初週、ワゴンに直行。店頭で 3 本 1000 円。', en: 'Week one: straight to the bargain bin. Three for 1,000 yen.' },
    { ja: '雑誌のレビューは「操作性 2 点」。打ち上げは中止になった。', en: 'Magazine review: "Controls: 2/10." The wrap party was cancelled.' },
    { ja: '在庫の山が倉庫を埋めた。社長が「これは文化だ」と言った。', en: 'Unsold stock fills the warehouse. The boss calls it "culture."' },
  ],
  ok: [
    { ja: '可もなく不可もなく。打ち上げは居酒屋で 2 時間。', en: 'Neither good nor bad. The wrap party: two hours at an izakaya.' },
    { ja: '売上は予定どおり。誰も褒めないが、誰も怒らない。', en: 'Sales on target. Nobody praises you; nobody yells.' },
  ],
  hit: [
    { ja: 'ヒット! 社長賞が出た。中身は金一封 5000 円。社員なので印税は 1 円も無い。', en: 'A hit! A company award: 5,000 yen. You\'re salaried, so royalties: zero.' },
    { ja: '増産が決まった。あなたの机には次の企画書が 3 冊積まれた。', en: 'More copies ordered. Three new proposals land on your desk.' },
  ],
  legend: [
    { ja: '伝説になった。テレビで特集。映ったのは社長だけだった。', en: 'It became legendary. A TV special aired. Only the CEO was on screen.' },
    { ja: '社会現象に。あなたの名前はスタッフロールで 0.3 秒だけ流れた。', en: 'A social phenomenon. Your name scrolled by in the credits for 0.3 seconds.' },
  ],
};
const SOLO_LINES: Partial<Record<WorkResult, Text>> = {
  flop: { ja: '売れたのは 12 本。うち 3 本は親戚。', en: 'Sold 12 copies. Three to relatives.' },
  hit: { ja: '売れた! 初めて自分の口座に印税が入った。手が震えた。', en: 'It sold! Royalties hit your own account for the first time. Your hands shook.' },
  legend: { ja: '世界中で売れた。会社員時代の上司から「うちで出さないか」とメール。', en: 'It sold worldwide. Your old boss emails: "Want to publish with us?"' },
};

/** 作品を 1 本出す。ログの文と効果を返す */
export function release(s: State): { work: Work; line: Text } {
  const r = s.rng;
  const role = roleFor(s);
  const result = roll(s, role);
  const work: Work = { id: `wk_${s.works.length + 1}`, name: workName(r, s.year), year: s.year, platform: platformFor(r, s.year, role), role, result, history: [] };
  s.works.push(work);
  const gag = role === 'solo' && SOLO_LINES[result] ? SOLO_LINES[result]! : r.pick(RESULT_LINES[result]);
  const line: Text = {
    ja: `${work.name.ja}(${work.platform})発売。あなたは${ROLE_TEXT[role].ja}。結果は${RESULT_TEXT[result].ja}。${gag.ja}`,
    en: `${work.name.en} (${work.platform}) ships. You were ${ROLE_TEXT[role].en}. Result: ${RESULT_TEXT[result].en}. ${gag.en}`,
  };
  const fx = { flop: { passion: -12, fame: 0 }, ok: { passion: 4, fame: 1 }, hit: { passion: 20, fame: 8 }, legend: { passion: 30, fame: 20 } }[result];
  const roleFame = { junior: 0.3, core: 0.7, lead: 1, solo: 1 }[role];
  s.stat.passion = clamp(s.stat.passion + fx.passion);
  s.stat.fame = clamp(s.stat.fame + Math.round(fx.fame * roleFame));
  s.stat.network = clamp(s.stat.network + 3);
  if (role === 'solo') s.stat.money += { flop: -80, ok: 50, hit: 600, legend: 3000 }[result];
  return { work, line };
}

export function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

// 発売後に勝手に起きること(データのイベントとは別の、機種と年で決まる運命)
type Fate = { test: (w: Work, year: number) => boolean; chance: number; text: Text; result?: WorkResult; fame?: number };
const FATES: Fate[] = [
  { test: (w, y) => ['ケータイ', 'ソシャゲ', 'スマホ'].includes(w.platform) && y - w.year >= 3 && !done(w, 'eos'), chance: 0.35,
    text: { ja: 'サービス終了。最後の日、ログインしていたのは 41 人だった。', en: 'End of service. On the last day, 41 players were online.' } },
  { test: (w, y) => y >= 2006 && y - w.year >= 15 && w.year < 2000, chance: 0.05,
    text: { ja: 'ダウンロード版で復刻。800 円。あなたに 1 円も入らない。', en: 'Re-released digitally for 800 yen. You get zero.' } },
  { test: (w, y) => y >= 2016 && y - w.year >= 20 && w.result === 'flop', chance: 0.04, result: 'ok', fame: 4,
    text: { ja: '海外のコレクターの間で「隠れた名作」扱いに。中古価格が 40 倍。', en: 'Overseas collectors call it a "hidden gem." Used prices up 40x.' } },
  { test: (w, y) => y >= 2024 && y - w.year >= 10, chance: 0.03,
    text: { ja: 'AI リメイクが出た。キャラの指が 6 本ある。あなたに 1 円も入らない。', en: 'An AI remake came out. Characters have six fingers. You get zero.' } },
  { test: (w, y) => y >= 2012 && y - w.year >= 8 && (w.result === 'hit' || w.result === 'legend'), chance: 0.05,
    text: { ja: 'RTA の定番になった。世界記録は 4 分 12 秒。あなたは 40 時間かけて作った面だ。', en: 'It became a speedrun staple. World record: 4:12. That stage took you 40 hours.' } },
  { test: (w, y) => y - w.year >= 1 && y - w.year <= 3 && w.result === 'hit' && w.role !== 'solo', chance: 0.25,
    text: { ja: '続編が決まった。あなたの名前は企画会議に呼ばれる人の一覧に無かった。', en: 'A sequel was greenlit. Your name wasn\'t on the meeting invite.' } },
];
function done(w: Work, key: string) { return w.history.some((h) => (h as { key?: string }).key === key); }

/** 1 年に 1 回呼ぶ。起きた後日談の文(ログ用)を返す */
export function tickWorks(s: State): { work: Work; text: Text }[] {
  const out: { work: Work; text: Text }[] = [];
  const base = tune('work.afterlife');
  const n = s.works.length, off = n ? s.rng.int(0, n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const w = s.works[(i + off) % n];
    for (const f of FATES) {
      if (!f.test(w, s.year)) continue;
      if (!s.rng.chance(f.chance * base / 0.06)) continue;
      const h = { year: s.year, text: f.text } as { year: number; text: Text; key?: string };
      if (f === FATES[0]) h.key = 'eos';
      w.history.push(h);
      if (f.result) w.result = f.result;
      if (f.fame) s.stat.fame = clamp(s.stat.fame + f.fame);
      out.push({ work: w, text: { ja: `${w.name.ja}: ${f.text.ja}`, en: `${w.name.en}: ${f.text.en}` } });
      break;
    }
    if (out.length >= 1) break; // 1 年に 1 つまで(うるさくしない)
  }
  return out;
}
