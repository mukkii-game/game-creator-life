// BUILD ID を画面の隅に出し、dist/version.json と照合して違えば自動リロードする(起動時と 60 秒ごと)。
// 遊んでいる途中では読み直さない(2026-10-17 Mukkii: プレイ中に突然タイトルへ戻る)。新しい版はタイトル画面に戻った時に入れる。
// AGENTS.md「直したのに直らない が 2 回続いたら キャッシュを疑え」の対策。version.json は vite.config.ts が出す。
import { META } from '../core/meta';

export function installBuildId(canReload: () => boolean = () => true): () => void {
  let pending = '';
  const reload = () => {
    if (!pending || !canReload()) return;
    // 同じ版へのリロードは 1 回だけ(CDN が古い時にループしない)
    const key = 'gcl-reloaded-for';
    try { if (sessionStorage.getItem(key) === pending) return; sessionStorage.setItem(key, pending); } catch { /* */ }
    location.reload();
  };
  const el = document.createElement('div');
  el.className = 'gcl-build';
  el.textContent = `build ${META.version}`;
  el.title = META.buildTime;
  document.body.append(el);
  const check = async () => {
    try {
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json())?.version;
      if (!v || v === META.version) return;
      pending = v;
      reload();
    } catch { /* 開発中・オフライン */ }
  };
  if (!import.meta.env.DEV) {
    check();
    setInterval(check, 60_000);
  }
  return reload;
}
