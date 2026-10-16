// 条件 → 重み → 抽選(docs/schema §3)。描画なし・Math.random なし。
import type { GameEvent, State, Pos } from './types';

/** 立場(歴史の事件の受け止め方が変わる) */
export function positionOf(s: State): Pos {
  if (s.flags.in_prison) return 'prison';
  if (s.job === 'teacher') return 'teacher';
  if (s.status === 'left' || s.status === 'retired' || s.status === 'ended') return 'outside';
  if (s.status === 'indie') return 'indie';
  if (s.company.size === 'abroad') return 'abroad';
  if (s.job === 'qa') return 'qa';
  const lead = s.job === 'director' || s.job === 'producer';
  if (s.company.size === 'big') return lead ? 'client_lead' : 'client';
  if (s.company.size === 'sub') return 'sub';
  return lead ? 'dev_lead' : 'dev';
}
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
    case 'hits': return s.works.filter((w) => w.result === 'hit' || w.result === 'legend').length;
    case 'cos': return s.companies.length; // 勤めた会社の数(転職・再就職で増える)
    case 'career': return s.year - s.startYear; // 業界に入って何年目(0 = 入った年)
    case 'company.size': return s.company.size;
    case 'pos': return positionOf(s);
  }
  return undefined;
}

const RE = /^(!?)([a-z0-9_.]+)(?:\s*(=|!=|<=|>=|<|>)\s*([a-z0-9_-]+))?$/;

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
  if (ev.jobs && !ev.jobs.includes(s.job)) return false; // 本文がほかの職種の作業(絵を描く・コードを書く …)
  // 同じ小ネタは 1 人生で maxRepeat 回まで(反復ネタは 2 回目で効き、3 回目から飽きる)
  if ((s.inner.uses[ev.id] ?? 0) >= maxRepeat && !ev.tag?.includes('repeatable')) return false;
  const last = s.inner.seen[ev.id];
  if (last !== undefined && s.year - last < gap) return false;
  return (ev.when ?? []).every((c) => test(s, c));
}

/** 重みつきで n 本を重複なしに引く。weight >= 100 は必ず入る */
export function draw(r: Rng, pool: GameEvent[], n: number, wf: (e: GameEvent) => number = (e) => e.weight ?? 1): GameEvent[] {
  const out: GameEvent[] = [];
  const rest = [...pool];
  for (const ev of pool) if ((ev.weight ?? 1) >= 100) { out.push(ev); rest.splice(rest.indexOf(ev), 1); }
  while (out.length < n && rest.length) {
    const total = rest.reduce((a, e) => a + wf(e), 0);
    let x = r.next() * total;
    let i = 0;
    for (; i < rest.length - 1; i++) { x -= wf(rest[i]); if (x < 0) break; }
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}
