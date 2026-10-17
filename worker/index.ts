// 公開サーバー(Cloudflare Workers)。/api/* だけここで受け、それ以外は dist の静的ファイル。
// POST /api/life  : 遊び終わった人生を 1 件記録(名前・経歴だけ。IP は保存しない。端末ごとの乱数 ID で連投を止める)
// GET  /api/lives : 他の人の人生(名前を自分で入れたものだけ)をランダムに返す。?exclude=<端末 ID>&n=
// 記録先: D1「game-creator-life-lives」(テーブル lives)。消す・隠すは D1 の hidden=1。
interface Env { DB?: any; AI?: any; ASSETS: { fetch: (r: Request) => Promise<Response> } }

const NG = [
  // 差別・卑猥・暴力など、他の人のプレイに出したくない語(パイロットなので最小限。見つけたら足す)
  // LDNOOBW の日本語の一覧(CC BY 4.0)から、普通の名前に当たりにくい語だけ選んだ(2026-10-17)
  'アナル', 'イラマチオ', 'オナニー', 'クリトリス', 'クンニ', 'スカトロ', 'ディルド', 'フェラチオ', 'ふたなり', 'ペニス', 'ポルノ', 'マスターベーション', '淫乱', '陰毛', '巨根', '強姦', '近親相姦', '獣姦', '射精', '手コキ', '精液', '中出し', '潮吹き', '乳首', '売春', '輪姦', '肛門', '膣', '糞',
  'ちんこ', 'ちんぽ', 'まんこ', 'おまんこ', 'ちんちん', 'きんたま', 'おっぱい', 'やりまん', 'やりちん', 'ぱいぱん', 'ふぇら', 'ぶっかけ', 'なかだし', 'どうてい', 'しょじょ', 'ばいた', 'ばいしゅん', 'ころすぞ', 'ぶっころ', 'じさつ', 'くたばれ', 'かたわ', 'めくら', 'つんぼ', 'びっこ', 'ちょうせんじん', 'ぶらく', 'しなじん', 'じっぷ', 'おかま',  'セックス', 'せっくす', 'レイプ', 'れいぷ', 'ファック', '死ね', '殺す', 'ころす', 'ガイジ', 'がいじ', 'キチガイ', 'きちがい', 'チョン', 'シナ人', 'ニガー', 'うんこ', 'ウンコ', '天皇', 'ヒトラー', 'オウム',
  'fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'porn', 'dick', 'penis', 'pussy', 'whore',
];
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
// 表記ゆれをそろえてから NG 語と照らす(全角英数 → 半角、カタカナ → ひらがな、記号・空白を除く)。ひらがなの NG 語も、カタカナで書いた名前に当たる
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・_\-.,!?！？ー〜~*＊]/g, '');
const NG_N = NG.map(norm);
const okName = (s: string) => {
  const low = s.toLowerCase().replace(/\s/g, '');
  if (NG_N.some((w) => norm(s).includes(w))) return false;
  if (/https?:|www\.|\.com|@|\d{3,}/.test(low)) return false;
  return !NG.some((w) => low.includes(w));
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function save(req: Request, env: Env) {
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, why: 'json' }, 400); }
  const client = clean(b.client, 40);
  const family = clean(b.family, 10), given = clean(b.given, 12);
  const named = b.named ? 1 : 0;
  const sy = int(b.startYear, 1977, 2010), ey = int(b.endYear, 1977, 2045), sa = int(b.startAge, 15, 70), ea = int(b.endAge, 15, 90);
  const job = clean(b.job, 20), company = clean(b.company, 30), work = clean(b.work, 40), ending = clean(b.ending, 60);
  if (!/^[a-z0-9-]{8,40}$/.test(client) || (!family && !given) || sy === null || ey === null || sa === null || ea === null || ey < sy) return json({ ok: false, why: 'bad' }, 400);
  if (![family, given, company, work, ending].every(okName)) return json({ ok: false, why: 'ng' }, 400);
  // 名前を自分で入れた人生(他の人のプレイに出る)は、Cloudflare の AI(Llama Guard)にも見せる。危ないと言われたら記録はするが hidden=1 で出さない。AI が使えない・遅い時は通す(言葉の一覧で止めているので)
  let hidden = 0;
  if (named && env.AI) {
    try {
      const res = await Promise.race([
        env.AI.run('@cf/meta/llama-guard-3-8b', { messages: [{ role: 'user', content: `A player typed this as their character's name, which other players will see: "${family} ${given}"` }] }),
        new Promise((r) => setTimeout(() => r(null), 2500)),
      ]);
      const out = res ? JSON.stringify((res as any).response ?? res) : '';
      if (/unsafe|"safe":\s*false/i.test(out)) hidden = 1;
    } catch { /* 通す */ }
  }
  const now = Date.now();
  // 連投止め: 同じ端末は 20 秒に 1 件・1 日 60 件まで
  const r = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(created) AS last FROM lives WHERE client = ? AND created > ?').bind(client, now - 86400000).first();
  if (r && (r.n >= 60 || (r.last && now - r.last < 20000))) return json({ ok: false, why: 'rate' }, 429);
  await env.DB.prepare('INSERT INTO lives (created, family, given, start_year, end_year, start_age, end_age, job, company, work, ending, client, named, hidden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(now, family, given, sy, ey, sa, ea, job, company, work, ending, client, named, hidden).run();
  return json({ ok: true });
}

async function list(url: URL, env: Env) {
  const ex = clean(url.searchParams.get('exclude'), 40);
  const n = int(url.searchParams.get('n'), 1, 40) ?? 20;
  const rows = await env.DB.prepare('SELECT family, given, start_year AS startYear, end_year AS endYear, start_age AS startAge, end_age AS endAge, job, company, work, ending, MAX(created) AS latest FROM lives WHERE named = 1 AND hidden = 0 AND client != ? GROUP BY family, given ORDER BY RANDOM() LIMIT ?' /* 同じ名前は最新の 1 件だけ(2026-10-17 Mukkii。SQLite は MAX と一緒に選んだ列をその行から返す) */)
    .bind(ex, n).all();
  return json({ ok: true, lives: rows.results ?? [] });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.DB) return json({ ok: false, why: 'no db' }, 503);
      try {
        if (url.pathname === '/api/life' && req.method === 'POST') return await save(req, env);
        if (url.pathname === '/api/lives' && req.method === 'GET') return await list(url, env);
      } catch (e) { return json({ ok: false, why: String(e).slice(0, 200) }, 500); }
      return json({ ok: false, why: 'not found' }, 404);
    }
    return env.ASSETS.fetch(req);
  },
};
