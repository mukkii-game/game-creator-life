// 作品棚(ひねり、PLAN §3)。作品を出す・結果を引く・発売後も史実に連動して勝手に生き続ける。
import { tune } from '../core/tuning';
import type { State, Work, Role, WorkResult, Text } from './types';
import { workName, platformFor } from './names';
import { CO_TRAITS } from './data';

// あなたのチームの作品の名前(PLAN §12 を 2026-10-15 Mukkii の指示で変更): 実在のヒット作は実名で史実に出し、
// 自分の作品は「その年のヒット作と雰囲気が似た、チームのオリジナルの造語タイトル」。表は src/data/titles.json。
interface TitleRow { id: string; years: [number, number]; platforms?: string[]; genre?: Text; coined?: Text[]; name?: Text; gag?: Text | Text[] }
const tMod = import.meta.glob('../data/titles.json', { eager: true, import: 'default' }) as Record<string, { titles: TitleRow[] }>;
const TITLES: TitleRow[] = Object.values(tMod)[0]?.titles ?? [];
/** 題名に機種名が入っていたら、その機種の時だけ使う(『〇〇DS』が PS3 で出ていた) */
function nameFits(name: string, platform: string): boolean {
  const tags: [RegExp, RegExp][] = [[/DS$|DS[^a-z]/, /^ニンテンドー DS$/], [/アドバンス/, /アドバンス/], [/ポータブル|ポケット/, /PSP|ゲームボーイ|DS|3DS|スマホ|ケータイ/], [/64/, /64/], [/3D$/, /3DS/]];
  return tags.every(([inName, okPf]) => !inName.test(name) || okPf.test(platform));
}
function pickTitle(s: State, platform: string): { name: Text; gag?: Text } | null {
  const used = new Set(s.works.map((w) => w.name.ja));
  const near = TITLES.filter((t) => t.years[0] <= s.year && s.year <= t.years[1]); // 発売前の年には出さない。一言に「同じ年」が多いので、終わりの年も延ばさない
  const fit = near.filter((t) => !t.platforms || t.platforms.some((p) => platform.includes(p) || p.includes(platform)));
  // 会社の作風(company_traits.json の genres)に合うタイトルを 7 割で優先する(シューティングの会社はシューティングを出しがち)
  const genres = CO_TRAITS[s.company.id]?.genres;
  const byGenre = genres?.length && s.rng.chance(0.7) ? [fit].map((p) => p.filter((t) => t.genre && genres.includes(t.genre.ja))) : [];
  // 機種の合わない題名は使わない(『おえかきペットDS』がケータイで出ていた)。合う物が無ければ作った名前
  for (const pool of [...byGenre.slice(0, 1), fit]) {
    const cands = pool.flatMap((t) => (t.coined ?? (t.name ? [t.name] : [])).filter((n) => !used.has(`『${n.ja}』`) && !used.has(n.ja) && nameFits(n.ja, platform) && !s.inner.recent?.includes(`title:${n.ja}`)).map((n) => ({ n, t })));
    if (!cands.length) continue;
    const { n, t } = s.rng.pick(cands);
    const gags = t.gag ? (Array.isArray(t.gag) ? t.gag : [t.gag]) : [];
    return { name: { ja: `『${n.ja}』`, en: `"${n.en}"` }, gag: gags.length ? s.rng.pick(gags) : undefined };
  }
  return null;
}

export const ROLE_TEXT: Record<Role, Text> = {
  junior: { ja: '末端', en: 'a junior' }, core: { ja: '中核', en: 'a core member' }, lead: { ja: 'リード', en: 'the lead' }, solo: { ja: 'ひとり', en: 'solo' },
};
export const RESULT_TEXT: Record<WorkResult, Text> = {
  flop: { ja: '爆死', en: 'Flop' }, ok: { ja: '普通', en: 'OK' }, hit: { ja: 'ヒット', en: 'Hit' }, legend: { ja: '伝説', en: 'Legend' },
};

function roleFor(s: State): Role {
  if (s.status === 'indie') return 'solo';
  if (s.job === 'director' || s.job === 'producer' || (s.stat.skill >= 75 && s.job !== 'qa' && s.job !== 'sales')) return 'lead';
  if (s.stat.skill >= 35) return 'core';
  return 'junior';
}
/** 役割の書き方: デバッガーと営業はリードにならない(ペルソナ通読: QA なのに毎回『リード』) */
function roleText(s: State, role: Role): Text {
  if (s.job === 'qa') return role === 'junior' ? { ja: 'テスト担当', en: 'a tester' } : { ja: 'テストのまとめ役', en: 'the test lead' };
  if (s.job === 'sales') return { ja: '営業担当', en: 'on sales' };
  return ROLE_TEXT[role];
}

function roll(s: State, role: Role): WorkResult {
  const sizeBonus = { big: 0.05, mid: 0, small: -0.02, sub: -0.04, indie: -0.03, abroad: 0.03, school: 0, none: 0 }[s.company.size];
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
    { ja: '発売日、店に見に行った。棚の同じ場所に、帰りも同じ本数が並んでいた。', en: 'Launch day, you went to the shop. On the way home, the same number of copies sat on the same shelf.' },
    { ja: '売れなかった。社長が「次がある」と言った。次の企画の予算は半分だった。', en: 'It didn\'t sell. The CEO said "there\'s always next time." The next budget was half.' },
    { ja: '発売初週、ワゴンに直行。店頭で 3 本 1000 円。', en: 'Week one: straight to the bargain bin. Three for 1,000 yen.' },
    { ja: '雑誌のレビューは「操作性 2 点」。打ち上げは中止になった。', en: 'Magazine review: "Controls: 2/10." The wrap party was cancelled.' },
    { ja: '在庫の山が倉庫を埋めた。社長が「これは文化だ」と言った。', en: 'Unsold stock fills the warehouse. The boss calls it "culture."' },
  ],
  ok: [
    { ja: '可もなく不可もなく。打ち上げは居酒屋で 2 時間。', en: 'Neither good nor bad. The wrap party: two hours at an izakaya.' },
    { ja: '売上はちょうど損益分岐点。社長が電卓を 3 回叩き直して、うなずいた。', en: 'Sales hit break-even exactly. The CEO re-ran the calculator three times, then nodded.' },
    { ja: '雑誌の評価は「良作」。良作という言葉の温度が、いまいち分からなかった。', en: 'The magazine called it "a solid game." You never quite worked out how warm "solid" is.' },
    { ja: '売上は予定どおり。誰も褒めないが、誰も怒らない。', en: 'Sales on target. Nobody praises you; nobody yells.' },
  ],
  hit: [
    { ja: 'ヒット! 店頭から在庫が消えた。自分の分を買い損ねて、親戚に譲ってもらった。', en: 'A hit! Shelves emptied. You missed your own copy and had to get one from a relative.' },
    { ja: 'ヒット! 電車の中で、知らない人が自分のゲームの話をしていた。降りる駅を過ぎても聞いていた。', en: 'A hit! On the train, strangers were talking about your game. You rode past your stop to keep listening.' },
    { ja: 'ヒット! 社長賞が出た。中身は金一封 5000 円。社員なので印税は 1 円も無い。', en: 'A hit! A company award: 5,000 yen. You\'re salaried, so royalties: zero.' },
    { ja: '増産が決まった。あなたの机には次の企画書が 3 冊積まれた。', en: 'More copies ordered. Three new proposals land on your desk.' },
  ],
  legend: [
    { ja: '伝説になった。テレビで特集。映ったのは社長だけだった。', en: 'It became legendary. A TV special aired. Only the CEO was on screen.' },
    { ja: '社会現象に。あなたの名前はスタッフロールで 0.3 秒だけ流れた。', en: 'A social phenomenon. Your name scrolled by in the credits for 0.3 seconds.' },
  ],
};
// 店に並ばない作品(スマホ・ダウンロード)の結果の一言
const DIGITAL_LINES: Partial<Record<WorkResult, Text[]>> = {
  flop: [
    { ja: 'ストアの順位は 3 日で圏外。レビューは 2 件、どちらも身内だった。', en: 'Out of the store charts in three days. Two reviews, both from family.' },
    { ja: 'ダウンロード数のグラフが、最初の日からずっと横ばいだった。地平線みたいにきれいだった。', en: 'The download graph stayed flat from day one, as clean as a horizon.' },
  ],
  hit: [
    { ja: 'ストアのランキングで 1 位になった。スクリーンショットを撮って、待ち受けにした。', en: 'It hit No. 1 in the store charts. You screenshotted it and made it your wallpaper.' },
    { ja: 'ヒット! 社長賞が出た。中身は金一封 5000 円。社員なので印税は 1 円も無い。', en: "A hit! A company award: 5,000 yen. You're salaried, so royalties: zero." },
  ],
  ok: [
    { ja: 'ストアの評価は星 3.8。「普通に遊べる」というレビューが、いちばん多かった。', en: 'Store rating: 3.8 stars. The most common review: "Perfectly playable."' },
    { ja: '売上は予定どおり。誰も褒めないが、誰も怒らない。', en: 'Sales on target. Nobody praises you; nobody yells.' },
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
  const platform = platformFor(r, s.year, role, s.flags);
  const titled = role === 'solo' || !r.chance(0.8) ? null : pickTitle(s, platform);
  const work: Work = { id: `wk_${s.works.length + 1}`, name: titled?.name ?? workName(r, s.year), year: s.year, platform, role, result, history: [] };
  s.works.push(work);
  // 結果の一言は、この人生でまだ使っていないものから(ペルソナ通読: 社長賞 5000 円が 3 回)
  const said = (s.inner.saidLines ??= []);
  const digital = /スマホ|ケータイ|ソシャゲ|Steam|itch|AI クラウド/.test(platform);
  const lines = digital && DIGITAL_LINES[result] ? DIGITAL_LINES[result]! : RESULT_LINES[result];
  const fresh0 = lines.filter((t) => !said.includes(t.ja));
  const fresh1 = fresh0.filter((t) => !s.inner.recent?.includes(`line:${t.ja}`));
  const fresh = fresh1.length ? fresh1 : fresh0;
  const pickLine = fresh.length ? r.pick(fresh) : { ja: '', en: '' };
  const solo = role === 'solo' && SOLO_LINES[result] && !said.includes(SOLO_LINES[result]!.ja) ? SOLO_LINES[result]! : null;
  const gag = solo ?? (titled?.gag && r.chance(0.5) ? titled.gag : pickLine);
  if (gag.ja) said.push(gag.ja);
  const line: Text = {
    ja: `${work.name.ja}(${work.platform})発売。あなたは${roleText(s, role).ja}。結果は${RESULT_TEXT[result].ja}。${gag.ja}`,
    en: `${work.name.en} (${work.platform}) ships. You were ${roleText(s, role).en}. Result: ${RESULT_TEXT[result].en}. ${gag.en}`,
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
type Fate = { key: string; test: (w: Work, year: number) => boolean; chance: number; text: Text; more?: Text[]; result?: WorkResult; fame?: number };
const FATES: Fate[] = [
  { key: 'eos', test: (w, y) => ['ケータイ', 'ソシャゲ', 'スマホ'].includes(w.platform) && y - w.year >= 3, chance: 0.35,
    text: { ja: 'サービス終了。最後の日、ログインしていたのは 41 人だった。', en: 'End of service. On the last day, 41 players were online.' },
    more: [{ ja: 'サービス終了。最後のお知らせを書いたのは、最初のお知らせを書いたのと同じ人だった。', en: 'End of service. The final notice was written by the same person who wrote the first one.' }] },
  { key: 'rerelease', test: (w, y) => y >= 2006 && y - w.year >= 15 && w.year < 2000, chance: 0.05,
    text: { ja: 'ダウンロード版で復刻。800 円。あなたに 1 円も入らない。', en: 'Re-released digitally for 800 yen. You get zero.' } },
  { key: 'gem', test: (w, y) => y >= 2016 && y - w.year >= 20 && w.result === 'flop', chance: 0.04, result: 'ok', fame: 4,
    text: { ja: '海外のコレクターの間で「隠れた名作」扱いに。中古価格が 40 倍。', en: 'Overseas collectors call it a "hidden gem." Used prices up 40x.' } },
  { key: 'airemake', test: (w, y) => y >= 2024 && y - w.year >= 10, chance: 0.03,
    text: { ja: 'AI リメイクが出た。キャラの指が 6 本ある。あなたに 1 円も入らない。', en: 'An AI remake came out. Characters have six fingers. You get zero.' } },
  { key: 'rta', test: (w, y) => y >= 2012 && y - w.year >= 8 && (w.result === 'hit' || w.result === 'legend'), chance: 0.05,
    text: { ja: 'RTA の定番になった。世界記録は 4 分 12 秒。あなたは 40 時間かけて作った面だ。', en: 'It became a speedrun staple. World record: 4:12. That stage took you 40 hours.' } },
  { key: 'sequel', test: (w, y) => y - w.year >= 1 && y - w.year <= 3 && w.result === 'hit' && w.role !== 'solo', chance: 0.25,
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
      if (done(w, f.key) || !f.test(w, s.year)) continue;
      // 同じ運命は 1 人生で言い回しの数まで(ペルソナ通読: 「ログイン 41 人」が 5 回)
      const fc = (s.inner.fateCount ??= {});
      const texts = [f.text, ...(f.more ?? [])];
      if ((fc[f.key] ?? 0) >= texts.length) continue;
      if (!s.rng.chance(f.chance * base / 0.06)) continue;
      // 言い回しは、この人生と直近の人生で使っていないものから(第 7 回ペルソナ: 「41 人」が 3 回続けて出た)
      const said = (s.inner.saidLines ??= []);
      const unsaid = texts.filter((t) => !said.includes(t.ja));
      const fresh = unsaid.filter((t) => !s.inner.recent?.includes(`line:${t.ja}`));
      const ft = s.rng.pick(fresh.length ? fresh : unsaid.length ? unsaid : texts);
      said.push(ft.ja);
      fc[f.key] = (fc[f.key] ?? 0) + 1;
      const h = { year: s.year, text: ft, key: f.key } as { year: number; text: Text; key?: string };
      w.history.push(h);
      if (f.result) w.result = f.result;
      if (f.fame) s.stat.fame = clamp(s.stat.fame + f.fame);
      out.push({ work: w, text: { ja: `${w.name.ja}: ${ft.ja}`, en: `${w.name.en}: ${ft.en}` } });
      break;
    }
    if (out.length >= 1) break; // 1 年に 1 つまで(うるさくしない)
  }
  return out;
}
