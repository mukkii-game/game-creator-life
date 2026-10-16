// 他の人の人生をサーバーとやりとりする(worker/index.ts の /api/*)。失敗しても黙ってゲームは続く。
import type { OtherLife } from '../game/people';

const KEY = 'gcl-client';
/** 端末ごとの乱数 ID(連投止めと、自分の人生を自分に出さないため。個人は特定しない) */
export function clientId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`; localStorage.setItem(KEY, id); }
    return id;
  } catch { return 'c-anonymous0'; }
}

const api = (path: string) => new URL(`api/${path}`, location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')).toString();

let cache: OtherLife[] = [];
let loading: Promise<void> | null = null;
/** タイトルを開いた時に先読み(1.5 秒で諦める) */
export function prefetchOthers(): Promise<void> {
  if (loading) return loading;
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 1500);
  loading = fetch(api(`lives?n=30&exclude=${encodeURIComponent(clientId())}`), { signal: ctl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j?.ok && Array.isArray(j.lives)) cache = j.lives; })
    .catch(() => {})
    .finally(() => { clearTimeout(tm); loading = null; });
  return loading;
}
export const othersNow = (): OtherLife[] => cache;

export interface LifeRecord { family: string; given: string; named: boolean; startYear: number; endYear: number; startAge: number; endAge: number; job: string; company: string; work: string; ending: string }
export function postLife(rec: LifeRecord): void {
  try {
    void fetch(api('life'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...rec, client: clientId() }), keepalive: true }).catch(() => {});
  } catch { /* 記録できなくてもゲームは続く */ }
}
