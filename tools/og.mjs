// OG 画像(public/og.png 1200×630)と公開キット用の 1 枚絵(kit/assets/)を書き出す。
// 使い方: node tools/og.mjs            … seed を探して書き出す(探す範囲は OG_FROM / OG_N)
//         OG_SEED=1234 node tools/og.mjs … seed を決めて書き出す
// 中身: vite の開発サーバーで src/share/dev.html を開き、src/share/card.ts で描いた canvas を PNG で保存する。
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}/src/share/dev.html`;

const FALLBACK = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM || (existsSync(FALLBACK) ? FALLBACK : undefined);
// フォント(Google Fonts)をプロキシ越しに読む環境向け
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ executablePath, ...(proxyUrl ? { proxy: { server: proxyUrl, bypass: '127.0.0.1,localhost' } } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 540, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${base}?og=1&seed=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
// フォントが届くまで待つ(届かなければ代わりの字で描く)
const font = await page.waitForFunction(() => document.fonts.check('32px "DotGothic16"', '人生'), null, { timeout: 20000 }).then(() => true, () => false);
if (!font) console.warn('DotGothic16 が読めなかった(代わりの字で描く)');

let seed = Number(process.env.OG_SEED);
if (!seed) {
  const from = Number(process.env.OG_FROM ?? 1000), n = Number(process.env.OG_N ?? 400);
  const best = await page.evaluate(([f, k]) => window.__dev.find(f, k), [from, n]);
  seed = best.seed;
  console.log(`seed を探した: ${from}〜${from + n - 1} → ${seed}(点 ${best.sc})`);
}
const info = await page.evaluate((s) => window.__dev.life(s), seed);
console.log(`seed ${seed}: ${info.start} 年入り、作品 ${info.works} 本、${info.cause.ja}`);
console.log(`共有文: ${info.text}`);

const save = async (kind, l, path) => {
  const url = await page.evaluate(([s, k, ll]) => window.__dev.card(s, k, ll), [seed, kind, l]);
  await writeFile(path, Buffer.from(url.split(',')[1], 'base64'));
  console.log('書き出し:', path);
};
await mkdir('public', { recursive: true });
await mkdir('kit/assets', { recursive: true });
await save('og', 'ja', 'public/og.png');
await save('portrait', 'ja', 'kit/assets/share-card-ja.png');
await save('portrait', 'en', 'kit/assets/share-card-en.png');
await save('og', 'en', 'kit/assets/og-en.png');
await browser.close();
await server.close();
