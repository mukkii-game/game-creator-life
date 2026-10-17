// 名前空間つき localStorage。DEFAULTS とマージ、版番号、try/catch。
const NS = 'game-creator-life'; // 作品ごとに変える(package.json の name と同じに)
const VERSION = 1;

export interface SaveData {
  v: number;
  best: number;
  lang: 'ja' | 'en';
  muted: boolean;
  played: number;
  /** 年表図鑑: 触れた歴史の事件(`hs_id:ev_id`。重複なし) */
  chronicle: string[];
  /** 直近 3 人生で出た話の id(新しい順。同じ小ネタが続けて遊んだ時に被らないように) */
  recent: string[][];
  recentNow?: string[];
  /** タイトルで入れた自分の名前(空 = おまかせ) */
  name: string;
}

const DEFAULTS: SaveData = { v: VERSION, best: 0, lang: 'ja', muted: false, played: 0, chronicle: [], name: '', recent: [] };

function key() { return `${NS}:save`; }

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<SaveData>;
    // 版が古い時の移行はここに書く
    const chronicle = Array.isArray(data.chronicle) ? data.chronicle.filter((k) => typeof k === 'string') : [];
    const recent = Array.isArray(data.recent) ? data.recent.filter((x) => Array.isArray(x)).slice(0, 3) : [];
    return { ...DEFAULTS, ...data, chronicle, recent, v: VERSION };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(patch: Partial<SaveData>): SaveData {
  const next = { ...load(), ...patch, v: VERSION };
  try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* private mode 等 */ }
  return next;
}

export function reset() {
  try { localStorage.removeItem(key()); } catch { /* ignore */ }
}

/** 年表図鑑に足す(重複なし)。足した後の全体と、今回はじめて入ったキーを返す */
export function addChronicle(keys: string[]): { all: string[]; added: string[] } {
  const cur = load().chronicle;
  const set = new Set(cur);
  const added: string[] = [];
  for (const k of keys) if (!set.has(k)) { set.add(k); added.push(k); }
  const all = [...set];
  if (added.length) save({ chronicle: all });
  return { all, added };
}

/** この人生で出た話を「最近見た話」に足す(直近 3 人生分だけ残す) */
export function addRecent(ids: string[]): void {
  save({ recent: [ids, ...load().recent].slice(0, 3), recentNow: [] });
}
/** 遊んでいる途中の人生の分。最後まで遊ばずに次を始めたら、その時に recent へ繰り入れる */
export function setRecentNow(ids: string[]): void { save({ recentNow: ids }); }
export function recentIds(): string[] {
  const d = load();
  if (d.recentNow?.length) { save({ recent: [d.recentNow, ...d.recent].slice(0, 3), recentNow: [] }); return recentIds(); }
  return d.recent.flat();
}
