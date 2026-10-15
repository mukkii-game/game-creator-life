// BUILD ID を画面の隅に出し、dist/version.json と照合して違えば自動リロードする(起動時と 60 秒ごと)。
// AGENTS.md「直したのに直らない が 2 回続いたら キャッシュを疑え」の対策。version.json は vite.config.ts が出す。
import { META } from '../core/meta';

export function installBuildId() {
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
      // 同じ版へのリロードは 1 回だけ(CDN が古い時にループしない)
      const key = 'gcl-reloaded-for';
      try { if (sessionStorage.getItem(key) === v) return; sessionStorage.setItem(key, v); } catch { /* */ }
      location.reload();
    } catch { /* 開発中・オフライン */ }
  };
  if (!import.meta.env.DEV) {
    check();
    setInterval(check, 60_000);
  }
}
