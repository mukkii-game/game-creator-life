// AI の「目と手」。bot やエージェントが画面を見ずに遊べるようにする口。
//  - 目: describe() に「今の状態を文字で返す関数」を渡す → window.__game.state()
//  - 手: action() に「意味単位の操作」を登録する → window.__game.act('名前', ...引数)
//    例: act('moveTo', 0.2)「左の方へ行く」。キー 1 つずつより安く、確実に遊べる。
//  - 禁止はプロンプトではなくここで拒否する: 操作が文字列を返したら「拒否の理由」として返す。
// 参考: AI に『トルネコ』を 134 回遊ばせた記録(会議室 knowledge/process-patterns.md の 6)。

export type ActResult = { ok: true } | { ok: false; reason: string };
type Action = (...args: any[]) => void | string;

const actions = new Map<string, Action>();
let describer: () => unknown = () => ({});

function root() {
  const w = window as any;
  w.__game = w.__game || {};
  return w.__game;
}

/** 状態を返す関数を登録する(シーンごとに上書きしてよい)。数値は丸めて、短く。 */
export function describe(fn: () => unknown) {
  describer = fn;
  root().state = () => JSON.stringify(describer());
}

/** 意味単位の操作を登録する。できない時は理由の文字列を返す(黙って何もしない、をしない)。 */
export function action(name: string, fn: Action) {
  actions.set(name, fn);
  const g = root();
  g.actions = () => [...actions.keys()];
  g.act = (n: string, ...args: unknown[]): ActResult => {
    const a = actions.get(n);
    if (!a) return { ok: false, reason: `unknown action: ${n} (actions: ${[...actions.keys()].join(', ')})` };
    const r = a(...args);
    return typeof r === 'string' ? { ok: false, reason: r } : { ok: true };
  };
}

/** シーンを抜ける時に操作を消す(前のシーンの操作が残らないように) */
export function clearActions() { actions.clear(); }
