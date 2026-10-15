// 起動確認: dist をローカル配信 → ?auto=1 で開く → 60 秒(CI は 20 秒)コンソールエラーなし
// → スコアが増える → スクショ 3 枚を tools/out/ に保存。AI は結果だけ読む(トークン節約)。
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = 'dist';
const OUT = 'tools/out';
const SECONDS = Number(process.env.CHECK_SECONDS ?? (process.env.CI ? 20 : 60));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/index.html がありません。先に npm run build'); process.exit(2); }
await mkdir(OUT, { recursive: true });

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(DIST, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const url = `http://127.0.0.1:${port}/?auto=1`;

// 画面の大きさは VIEWPORT=960x540 のように変えられる(横長の作品向け)。
const [VW, VH] = (process.env.VIEWPORT ?? '540x720').split('x').map(Number);
// Playwright の版が合わずブラウザが見つからない環境(クラウド等)では、入っている Chromium を使う。
const FALLBACK = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM || (existsSync(FALLBACK) ? FALLBACK : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(url.replace('?auto=1', '?lang=en'), { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-title.png` });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/02-play.png` });
const s1 = await page.evaluate(() => window.__game?.score ?? 0);
// AI の口(core/probe.ts): 作品が使っていれば、状態が JSON で読め、知らない操作は理由つきで拒否されること
const probe = await page.evaluate(() => {
  const g = window.__game;
  if (!g?.state) return { used: false, ok: true };
  try { JSON.parse(g.state()); } catch { return { used: true, ok: false, why: 'state() is not JSON' }; }
  const r = g.act?.('__no_such_action__');
  return { used: true, ok: !!r && r.ok === false && !!r.reason, actions: g.actions?.() };
});
await page.waitForTimeout(Math.max(0, SECONDS * 1000 - 4500));
const s2 = await page.evaluate(() => window.__game?.score ?? 0);
const scene = await page.evaluate(() => window.__game?.scene);
await page.screenshot({ path: `${OUT}/03-late.png` });
await browser.close(); server.close();

const ok = errors.length === 0 && s2 > s1 && probe.ok;
console.log(JSON.stringify({ ok, seconds: SECONDS, scoreStart: s1, scoreEnd: s2, scene, probe, errors: errors.slice(0, 5) }, null, 2));
process.exit(ok ? 0 : 1);
