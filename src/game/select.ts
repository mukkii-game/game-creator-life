// 条件 → 重み → 抽選(docs/schema §3)。描画なし・Math.random なし。
import type { GameEvent, State } from './types';
import type { Rng } from '../core/rng';

/** 条件の左辺の値 */
function value(s: State, key: string): string | number | boolean | undefined {
  if (key.startsWith('stat.')) return s.stat[key.slice(5) as keyof State['stat']];
  if (key.startsWith('flag.')) return !!s.flags[key.slice(5)];
  switch (key) {
    case 'age': return s.age;
    case 'year': return s.year;
    case 'era': return s.era;
    case 'job': return s.job;
    case 'status': return s.status;
    case 'works': return s.works.length;
    case 'company.size': return s.company.size;
  }
  return undefined;
}

const RE = /^(!?)([a-z_.]+)(?:\s*(=|!=|<=|>=|<|>)\s*([a-z0-9_-]+))?$/;

export function test(s: State, cond: string): boolean {
  const m = RE.exec(cond.trim());
  if (!m) return false;
  const [, not, key, op, rhs] = m;
  const v = value(s, key);
  let ok: boolean;
  if (!op) ok = !!v;
  else {
    const num = Number(rhs);
    const lhs = typeof v === 'number' ? v : String(v);
    const r = typeof v === 'number' && Number.isFinite(num) ? num : rhs;
    switch (op) {
      case '=': ok = lhs === r; break;
      case '!=': ok = lhs !== r; break;
      case '<': ok = (lhs as number) < (r as number); break;
      case '<=': ok = (lhs as number) <= (r as number); break;
      case '>': ok = (lhs as number) > (r as number); break;
      default: ok = (lhs as number) >= (r as number);
    }
  }
  return not ? !ok : ok;
}

export function eligible(s: State, ev: GameEvent, gap = 0, maxRepeat = 99): boolean {
  if (s.year < ev.years[0] || s.year > ev.years[1]) return false;
  if (ev.once && s.inner.used.includes(ev.id)) return false;
  // 同じ小ネタは 1 人生で maxRepeat 回まで(反復ネタは 2 回目で効き、3 回目から飽きる)
  if ((s.inner.uses[ev.id] ?? 0) >= maxRepeat && !ev.tag?.includes('repeatable')) return false;
  const last = s.inner.seen[ev.id];
  if (last !== undefined && s.year - last < gap) return false;
  return (ev.when ?? []).every((c) => test(s, c));
}

/** 重みつきで n 本を重複なしに引く。weight >= 100 は必ず入る */
export function draw(r: Rng, pool: GameEvent[], n: number): GameEvent[] {
  const out: GameEvent[] = [];
  const rest = [...pool];
  for (const ev of pool) if ((ev.weight ?? 1) >= 100) { out.push(ev); rest.splice(rest.indexOf(ev), 1); }
  while (out.length < n && rest.length) {
    const total = rest.reduce((a, e) => a + (e.weight ?? 1), 0);
    let x = r.next() * total;
    let i = 0;
    for (; i < rest.length - 1; i++) { x -= rest[i].weight ?? 1; if (x < 0) break; }
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}
