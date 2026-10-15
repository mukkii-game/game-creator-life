// SNS のアプリ内ブラウザ(LINE・Instagram・Facebook・X・TikTok・Threads…)で開かれた時に、
// 外部ブラウザへ移るボタンを画面の上に出す。アプリ内ブラウザは音・全画面・横向き・保存が効かないことが多い。
//  - LINE: URL に openExternalBrowser=1 を付けると LINE が外部ブラウザで開き直す(公式の仕様)。自動で行う
//  - Android: intent:// で Chrome(無ければ既定のブラウザ)を開く
//  - iPhone: x-safari-https:// で Safari を開く(iOS 17 以降の報告あり。効かない機種もあるので、URL のコピーと手順も出す)
// ?inapp=1 で強制表示(PC で見た目を確かめる)。?inapp=0 で出さない。× で閉じるとそのタブでは出さない。
// 他のファイルに依存しない(雛形でない作品にも、このファイルだけ写せば使える)。
const query = new URLSearchParams(location.search);
const lang = (): 'ja' | 'en' => (query.get('lang') === 'en' || (query.get('lang') !== 'ja' && !navigator.language.startsWith('ja')) ? 'en' : 'ja');

const APPS: [string, RegExp][] = [
  ['LINE', /\bLine\//i],
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['Threads', /Barcelona/i],
  ['X', /Twitter/i],
  ['TikTok', /BytedanceWebview|musical_ly|TikTok/i],
  ['Discord', /Discord/i],
  ['WeChat', /MicroMessenger/i],
];

/** アプリ内ブラウザなら、そのアプリの名前。違えば null */
export function inAppName(ua = navigator.userAgent): string | null {
  for (const [name, re] of APPS) if (re.test(ua)) return name;
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return 'WebView';
  return null;
}

const TEXT = {
  ja: { msg: (a: string) => `${a} の中で開いています。ブラウザで開くと音や全画面が使えます`, open: 'ブラウザで開く', copy: 'URL をコピー', copied: 'コピーしました。Safari / Chrome に貼り付けてください', ios: '開かない時は 右上の … か 共有 から「ブラウザで開く」' },
  en: { msg: (a: string) => `Opened inside ${a}. Open in your browser for sound and fullscreen`, open: 'Open in browser', copy: 'Copy URL', copied: 'Copied. Paste it into Safari / Chrome', ios: "If nothing happens, use the … or Share menu → 'Open in browser'" },
};

function pageUrl(): string {
  // itch.io などの埋め込み(iframe)では、外側のページを開きたい
  try { if (window.top && window.top !== window && window.top.location.href) return window.top.location.href; } catch { /* 別ドメイン */ }
  if (window.top !== window && document.referrer) return document.referrer;
  return location.href;
}

function externalUrl(url: string, ua: string): string {
  const u = new URL(url);
  if (/Android/i.test(ua)) {
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(':', '')};S.browser_fallback_url=${encodeURIComponent(url)};end`;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return url.replace(/^https?:\/\//, (m) => (m.startsWith('https') ? 'x-safari-https://' : 'x-safari-http://'));
  return url;
}

export function installInAppBanner() {
  const ua = navigator.userAgent;
  if (query.get('inapp') === '0') return;
  const app = query.get('inapp') === '1' ? (inAppName(ua) ?? 'SNS') : inAppName(ua);
  if (!app) return;
  try { if (sessionStorage.getItem('inapp-closed')) return; } catch { /* 使えない環境 */ }

  // LINE は公式のパラメータで自動的に外部ブラウザへ(1 回だけ)
  if (app === 'LINE' && query.get('inapp') !== '1' && !/openExternalBrowser=1/.test(location.search)) {
    const u = new URL(location.href);
    u.searchParams.set('openExternalBrowser', '1');
    location.replace(u.toString());
    return;
  }

  const tx = TEXT[lang()];
  const url = pageUrl();
  const bar = document.createElement('div');
  bar.id = 'inapp-banner';
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;background:rgba(20,20,28,.94);color:#fff;font:14px/1.4 sans-serif;display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center';
  const msg = document.createElement('div');
  msg.textContent = tx.msg(app);
  msg.style.cssText = 'flex:1 1 100%';
  const btn = (label: string, primary: boolean) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #fff;${primary ? 'background:#fff;color:#111;font-weight:bold' : 'background:transparent;color:#fff'}`;
    return b;
  };
  const open = btn(tx.open, true);
  open.onclick = () => { location.href = externalUrl(url, ua); };
  const copy = btn(tx.copy, false);
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* 諦める */ } ta.remove();
    }
    msg.textContent = tx.copied;
  };
  const close = btn('×', false);
  close.style.marginLeft = 'auto';
  close.onclick = () => { bar.remove(); try { sessionStorage.setItem('inapp-closed', '1'); } catch { /* */ } };
  bar.append(msg, open, copy, close);
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const hint = document.createElement('div');
    hint.textContent = tx.ios;
    hint.style.cssText = 'flex:1 1 100%;font-size:12px;opacity:.75';
    bar.append(hint);
  }
  document.body.appendChild(bar);
}
