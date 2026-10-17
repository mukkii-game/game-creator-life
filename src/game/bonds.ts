// 下の「同期」の欄に足す、先輩(メンター)・後輩(メンティー)の近況。話に一度出たら載り、話が進むと書き換わる(2026-10-17 Mukkii)
// 同期のように人生は進めず、最後に出た場面の要約を 1 行で出す。
import type { State, Text } from './types';

const T = (ja: string, en: string): Text => ({ ja, en });
const MENTOR_STEP: Text[] = [T('直属の先輩。教育係', 'Your direct senior and trainer'), T('いろいろ教わっている', 'Teaching you the ropes'), T('何度も助けられた', 'Has bailed you out more than once')];
const MENTEE_STEP: Text[] = [T('直属の後輩。教育係をしている', 'Your direct junior; you train them'), T('面倒を見ている', 'You look after them'), T('頼もしくなってきた', 'Getting reliable')];
const NOTE: Record<string, Text> = {
  ev_mt_4a: T('会社を辞めた。「次はお前が教えろ」', 'Left the company. "Your turn to teach."'), ev_mt_4b: T('独立して小さなスタジオを作った', 'Went independent with a small studio'), ev_mt_4c: T('別の部署の部長になった', 'Became head of another department'),
  ev_mt_4d: T('異動になった', 'Transferred away'), ev_mt_4e: T('海外へ行った', 'Moved overseas'), ev_mt_4f: T('体を壊して休職中', 'On leave for health'),
  ev_mt_5a: T('白髪が増えた。あなたのゲームを孫と遊んだ', 'Grayer now. Played your game with a grandkid'), ev_mt_5b: T('口癖が、あなたにうつっている', 'Their sayings live on in you'), ev_mt_5c: T('業界を引退した', 'Retired from the industry'),
  ev_mt_5d: T('若手に囲まれている。「こいつが一番手がかかった」', 'Surrounded by juniors. "This one was the most work."'), ev_mt_5e: T('あなたのゲームをクリアした。「難しい」', 'Beat your game. "Hard."'), ev_mt_5f: T('みんなの口癖の元になっている', 'Everyone still quotes them'),
  ev_me_3a: T('初めてチーフになった', 'Led a project for the first time'), ev_me_3b: T('仕様の話で、あなたを言い負かした', 'Out-argued you on a spec'), ev_me_3c: T('辞めたいと相談に来たが、持ち直した', 'Wanted to quit; bounced back'),
  ev_me_3d: T('あなたのやり方を変えさせた', 'Changed how you work'), ev_me_3e: T('始末書を一緒に書いた', 'Co-wrote an apology report with you'), ev_me_3f: T('自分の企画を自分で描き直した', 'Redrew their own pitch'),
  ev_me_4a: T('独立してスタジオを作った', 'Started their own studio'), ev_me_4b: T('インタビューで、名前を出さずにあなたの話をした', 'Mentioned you, nameless, in an interview'), ev_me_4c: T('あなたの上司になった', 'Became your boss'),
  ev_me_4d: T('異動した', 'Transferred away'), ev_me_4e: T('海外のスタジオに移った', 'Moved to a studio overseas'), ev_me_4f: T('作品が賞を取った', 'Their game won an award'),
  ev_me_5a: T('自分の後輩用に 14 か条を書いた', 'Wrote 14 rules for their own juniors'), ev_me_5b: T('その後輩が、あなたの口癖を真似している', 'Their juniors copy your sayings'), ev_me_5c: T('結婚した。スピーチはバグの話', 'Got married. Your speech was about bugs'),
  ev_me_5d: T('子どもができた', 'Has a kid now'), ev_me_5e: T('講演で「尊敬する先輩」の話をした', 'Called you a role model in a talk'), ev_me_5f: T('昔のコードの「ここはいい」を返してきた', 'Returned your old "this part is good"'),
};

export interface Bond { label: Text; name: Text; note: Text }
export function bondsOf(s: State): Bond[] {
  const out: Bond[] = [];
  for (const [arc, label, steps] of [[s.inner.mentor, T('先輩', 'Senior'), MENTOR_STEP], [s.inner.mentee, T('後輩', 'Junior'), MENTEE_STEP]] as const) {
    if (!arc || !arc.used.length) continue;
    const last = arc.used[arc.used.length - 1];
    const stepNote = [...arc.used].reverse().map((id) => NOTE[id]).find(Boolean); // 具体的な近況(独立・異動 …)があれば、それを残す
    out.push({ label, name: arc.name, note: stepNote ?? steps[Math.min(steps.length - 1, Number(/_(\d)[a-z]$/.exec(last)?.[1] ?? 1) - 1)] });
  }
  return out;
}
