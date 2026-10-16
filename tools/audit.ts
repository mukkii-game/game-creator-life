// 自動の点検(ペルソナの読み手が毎回見つけていた「機械で分かる矛盾・繰り返し」を、AI を使わずに数える)
// 使い方: node tools/.dbg.mjs tools/audit.ts   (K=続けて遊ぶ組の数 既定 40、SHOW=例の数 既定 2)
// 3 人生を続けて遊ぶ組を K 組作り、その年その時の状態と本文を照らして、規則ごとに件数と例を出す。
import { init, advance, choose } from '../src/game/logic';
import { BOTS } from '../src/game/bots';
import type { State } from '../src/game/types';

type Row = { y: number; t: string; kind: string; st0?: Row['st']; st: { promoted: boolean; ceo: boolean; status: string; job: string; co: string; size: string; abroad: boolean; child: boolean; kid: number; career: number; works: number; hits: number; prison: boolean; callcenter: boolean } };
const K = Number(process.env.K ?? 40), SHOW = Number(process.env.SHOW ?? 2);
const hits: Record<string, string[]> = {};
const hit = (rule: string, ex: string) => { (hits[rule] ??= []).push(ex); };

function snap(s: State): Row['st'] {
  return {
    promoted: !!s.flags.promoted || ['director', 'producer'].includes(s.job), ceo: !!s.flags.sub_ceo || !!s.flags.own_co, status: s.status, job: s.job, co: s.company.id, size: s.company.size, abroad: s.company.size === 'abroad' || !!s.flags.life_abroad,
    child: !!s.flags.child, kid: s.inner.childYear ? s.year - s.inner.childYear : -1, career: s.year - s.startYear,
    works: s.works.length, hits: s.works.filter((w) => w.result === 'hit' || w.result === 'legend').length, prison: !!s.flags.in_prison, callcenter: !!s.flags.callcenter,
  };
}

function play(seed: number, year: number, age: number, recent: string[]) {
  const s = init(seed, { year, age, ...(recent.length ? { recent } : {}) });
  const rows: Row[] = [];
  let seen = 0;
  for (let y = 0; y < 200 && !s.ending; y++) {
    const st0 = snap(s);
    advance(s);
    while (s.choice) { const c = s.choice; choose(s, (BOTS as any)[seed % 2 ? 'think' : 'random'](s, c.choices)); }
    const st = snap(s);
    for (; seen < s.log.length; seen++) { const l = s.log[seen]; rows.push({ y: l.year, t: l.text.ja, kind: l.kind, st, st0 }); }
  }
  const mem = [...s.companies.map((c) => `co:${c.company.id}`), `job:${s.inner.startJob}`, `given:${s.name.ja.split(' ')[1] ?? ''}`, ...s.inner.peerStates.map((x) => `fam:${x.name.ja.split(' ')[0]}`), `fam:${s.name.ja.split(' ')[0]}`, `start:${s.startYear}`, `theme:${s.inner.theme ?? ''}`, ...s.inner.peerStates.flatMap((x) => x.works.map((w) => `title:${w.name.ja.replace(/^『|』$/g, '')}`)), ...Object.keys(s.inner.seen), ...(s.inner.saidLines ?? []).map((t) => `line:${t}`), ...s.works.map((w) => `title:${w.name.ja.replace(/^『|』$/g, '')}`)];
  return { s, rows, mem };
}

const sentences = (t: string) => t.split(/(?<=。)/).map((x) => x.trim()).filter((x) => x.length >= 14 && !/^\d{4} 年、\d+ 歳/.test(x));
// 本文に出る言葉と、出してはいけない状態
const RULES: [string, RegExp, (r: Row) => boolean][] = [
  ['独立中に会社の話', /出社|送別会|定年|社員証|隣の部署|うちの部長|課長|休日出勤|会社の備品|朝礼|人事に呼ばれ/, (r) => r.st.status === 'indie'],
  ['失業中・窓口で開発の話', /マスターアップ|隣の席|会議室|企画会議|締め切り/, (r) => r.st.status === 'left' || r.st.callcenter],
  ['海外で国内の話', /新幹線|帰省|朝礼|社内報|忘年会|居酒屋|判子|コミケ/, (r) => r.st.abroad],
  ['子どもがいないのに自分の子の話', /うちの子|自分の子ども|息子|娘が|娘に|娘は|子どもが生まれ(た|て)(?!ら)|子どもの運動会|子どもの学校/, (r) => !r.st.child],
  ['しゃべる幼児(5 歳未満)', /子ども(が|に|は).{0,30}「/, (r) => r.st.child && r.st.kid >= 0 && r.st.kid < 5],
  ['大人の子に子どもの話(17 歳以上)', /^(?!.*(親戚|孫|近所)).*(運動会|徒競走|ランドセル|宿題|布団に入る|夏休みの)/, (r) => r.st.child && r.st.kid > 16],
  ['サウンド・営業・QA が絵やコード', /自分の描いた|あなたの描いた|あなたのドット絵|描き直した|自分のコード|コードを書いた/, (r) => ['sound', 'sales', 'qa'].includes(r.st.job)],
  ['作品が無いのに自分の作品', /自分の(作品|ゲーム)|あなたのゲーム|うちの作品/, (r) => r.st.works === 0 && r.kind !== 'timeline'],
  ['ヒットが無いのにヒットの話', /ヒットのボーナス|ミリオン記念|大ヒットのお祝い/, (r) => r.st.hits === 0],
  ['昇進済みなのに「次は自分」', /次は自分/, (r) => r.st.promoted],
  ['社長・自分の会社なのに昇進', /^昇進(した|の辞令)/, (r) => r.st.ceo],
  ['子の就職が早い(18 歳未満)', /子ども(が|は).{0,10}(就職|ゲーム会社に入)/, (r) => r.st.kid >= 0 && r.st.kid < 18],
  ['塀の中で外の話', /出社|会議|発売日に並|マスターアップ/, (r) => r.st.prison && r.kind !== 'timeline'],
];

for (let k = 0; k < K; k++) {
  const recent: string[][] = [];
  const lives: ReturnType<typeof play>[] = [];
  for (let i = 0; i < 3; i++) {
    const seed = 91000 + k * 7919 + i * 131;
    const year = 1980 + ((seed * 13) % 30), age = 19 + ((seed * 7) % 11);
    const L = play(seed, year, age, recent.flat());
    recent.unshift(L.mem); if (recent.length > 3) recent.pop();
    lives.push(L);
    const tag = `組${k + 1}-人生${i + 1}`;
    // 1 人生の中: 同じ文・似た書き出し、1 年の行数、同じ年の転職、昇進の間隔
    const cnt = new Map<string, number>(), heads = new Map<string, number>();
    const perYear = new Map<number, number>();
    for (const r of L.rows) {
      if (r.kind === 'timeline') continue;
      perYear.set(r.y, (perYear.get(r.y) ?? 0) + 1);
      for (const x of sentences(r.t)) cnt.set(x, (cnt.get(x) ?? 0) + 1);
      const h = r.t.replace(/[『「].*?[』」]/g, '').slice(0, 12); if (h.length >= 12) heads.set(h, (heads.get(h) ?? 0) + 1);
      for (const [name, re, bad] of RULES) if (re.test(r.t) && bad(r) && (!r.st0 || bad({ ...r, st: r.st0 }))) /* 年の初めと終わりの両方で合わない時だけ(年の途中で立場が変わった行は数えない) */ hit(name, `${tag} ${r.y}: ${r.t.slice(0, 60)}`);
    }
    for (const [x, n] of cnt) if (n >= 2) hit('1 人生で同じ文', `${tag}: ${x.slice(0, 50)} ×${n}`);
    for (const [h, n] of heads) if (n >= 3) hit('1 人生で同じ書き出し 3 回以上', `${tag}: 「${h}…」×${n}`);
    for (const [y, n] of perYear) if (n >= 10) hit('1 年に 10 行以上', `${tag} ${y}: ${n} 行`);
    const coYears = L.s.companies.map((c) => c.year); for (const y of new Set(coYears)) if (coYears.filter((x) => x === y).length >= 2) hit('同じ年に 2 社', `${tag} ${y}`);
    const promos = Object.entries(L.s.inner.seen).filter(([id]) => /^ev_(sys_promote|wk_promote_ask)/.test(id)).map(([, y]) => y).sort();
    for (let j = 1; j < promos.length; j++) if (promos[j] - promos[j - 1] < 4) hit('昇進の間隔 4 年未満', `${tag} ${promos[j - 1]}→${promos[j]}`);
  }
  // 人生をまたいで: 一字一句同じ文(年表・決まった締めは除く)
  const seenS = new Map<string, number>();
  lives.forEach((L, i) => { for (const r of L.rows) if (r.kind !== 'timeline') for (const x of new Set(sentences(r.t))) { if (/いいゲーム人生だった|名刺の職種は|に入社。$/.test(x)) continue; const p = seenS.get(x); if (p !== undefined && p !== i) hit('人生をまたいで同じ文', `組${k + 1} 人生${p + 1}→${i + 1}: ${x.slice(0, 50)}`); if (p === undefined) seenS.set(x, i); } });
}

const order = Object.entries(hits).sort((a, b) => b[1].length - a[1].length);
console.log(`自動点検: ${K} 組 × 3 人生`);
for (const [rule, xs] of order) { console.log(`\n■ ${rule}: ${xs.length} 件(1 組あたり ${(xs.length / K).toFixed(2)})`); for (const x of xs.slice(0, SHOW)) console.log(`  ・${x}`); }
if (!order.length) console.log('引っかかった規則なし');
