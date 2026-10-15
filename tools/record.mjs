// ?auto=1 のプレイを録画して tools/out/play.webm に保存(宣伝動画の素材)。
// 使い方: npm run build && node tools/record.mjs [秒数]
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, rename, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const SECONDS = Number(process.argv[2] ?? 30);
const OUT = 'tools/out';
await mkdir(OUT, { recursive: true });
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(join('dist', p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
// 画面の大きさは VIEWPORT=960x540 のように変えられる(横長の作品向け)。
const [VW, VH] = (process.env.VIEWPORT ?? '540x720').split('x').map(Number);
// Playwright の版が合わずブラウザが見つからない環境(クラウド等)では、入っている Chromium を使う。
const { existsSync } = await import('node:fs');
const FALLBACK = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM || (existsSync(FALLBACK) ? FALLBACK : undefined);
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, recordVideo: { dir: OUT, size: { width: VW, height: VH } } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/?auto=1`);
await page.waitForTimeout(SECONDS * 1000);
await ctx.close(); await browser.close(); server.close();
const files = (await readdir(OUT)).filter(f => f.endsWith('.webm') && f !== 'play.webm');
if (files[0]) await rename(join(OUT, files[0]), join(OUT, 'play.webm'));
console.log(`saved ${OUT}/play.webm (${SECONDS}s)`);
