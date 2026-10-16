// 終わり = 開発者としての死(PLAN §4)。死因の 1 行(共有文の 1 行目)と、結果画面の要約を作る。
import type { State, EndingId, Ending, Text } from './types';
import { JOB_TEXT } from './names';
import { LASTWORDS } from './data';
import { test } from './select';

function causeOf(s: State, id: EndingId): Text {
  const a = s.age, c = s.inner.counts;
  const other = s.inner.otherJob ?? { ja: '別の仕事', en: 'another job' };
  switch (id) {
    case 'end_burnout': {
      if ((c.spec ?? 0) >= 2) return { ja: `${a} 歳、${c.spec} 度目の仕様変更で心が折れ、${other.ja}へ`, en: `At ${a}, the spec change #${c.spec} broke you. Off to the ${other.en}` };
      if ((c.crunch ?? 0) >= 4) return { ja: `${a} 歳、${c.crunch} 回目の泊まり込みで心が折れ、${other.ja}へ`, en: `At ${a}, all-nighter #${c.crunch} broke you. Off to the ${other.en}` };
      return { ja: `${a} 歳、気づけば心が折れていて、${other.ja}へ`, en: `At ${a}, your heart quietly broke. Off to the ${other.en}` };
    }
    case 'end_body': return { ja: `${a} 歳、${Math.max(2, c.crunch ?? 0)} 度目の徹夜明けに倒れ、医者にドクターストップをかけられる`, en: `At ${a}, you collapsed after all-nighter #${Math.max(2, c.crunch ?? 0)}. Doctor's orders: stop` };
    case 'end_debt': return { ja: `${a} 歳、自作ゲームの借金 ${-s.stat.money} 万円で廃業`, en: `At ${a}, closed shop with ${(-s.stat.money * 10000).toLocaleString('en-US')} yen of indie-game debt` };
    case 'end_blacklist': return { ja: `${a} 歳、面接に 3 回落ち、業界から静かに姿を消す`, en: `At ${a}, three failed interviews later, you quietly vanished from the industry` };
    case 'end_retire': return s.job === 'teacher'
      ? { ja: `${a} 歳、最後の講義。教え子の 1 人が、こっそり自分のゲームのタイトル画面を黒板に描いていた`, en: `At ${a}, your last lecture. A student had secretly drawn your game's title screen on the blackboard` }
      : s.age >= 63 && (s.flags.rehired || s.flags.parttime)
      ? { ja: `${a} 歳、嘱託で粘り切って勝ち逃げ。送別会は 2 回目なのでケーキが小さかった`, en: `At ${a}, you outlasted them all on contract. Second farewell party, so a smaller cake` }
      : s.age >= 60
      ? { ja: `${a} 歳、定年。送別会のケーキに自分のドット絵`, en: `Retired at ${a}. Your pixel art was on the farewell cake` }
      : { ja: `${a} 歳、業界を卒業`, en: `Graduated from the industry at ${a}` };
    case 'end_pen_down': return { ja: `${a} 歳、筆を置く。開発者として大往生`, en: `At ${a}, you put down the pen. A full developer's life` };
    case 'end_arrest': return { ja: `${a} 歳、魔が差して逮捕。取り調べで「好きなゲームは?」と聞かれ、3 時間しゃべった`, en: `At ${a}, a moment of weakness and an arrest. Asked about your favorite game in custody, you talked for three hours` };
    case 'end_switch': return { ja: `${a} 歳、ゲームの外の仕事へ転身`, en: `At ${a}, you moved on to work outside games` };
    case 'end_restart':
      if (s.flags.in_prison) return { ja: `${a} 歳、塀の中で AI の時代のニュースを聞き、出たら何を作るか考え始める`, en: `At ${a}, hearing about the AI age from behind bars, you start planning what to make when you get out` };
      if (s.flags.shift_partner) return { ja: `${a} 歳、AI を相棒に、もう 1 本作り始める`, en: `At ${a}, you start one more game, with AI as your partner` };
      if (s.flags.shift_play) return { ja: `${a} 歳、遊ぶ側に回る。それでも、作る側の目で遊んでいる`, en: `At ${a}, you switch to playing — still with a maker's eye` };
      return { ja: `${a} 歳、自分の手で、AI に作れないものを作り始める`, en: `At ${a}, you start making, by hand, what AI can't` };
    case 'end_ai_seat': return { ja: `${a} 歳、AI に席を譲った。引き継ぎ資料も AI が書いた`, en: `At ${a}, you gave your seat to an AI. The AI wrote the handover doc too` };
  }
}

/** 最後の 1 行。一番テンションが上がった瞬間を思い出して「いいゲーム人生だった」 */
// 最後の 1 行(Mukkii: 成功しても失敗しても、最後は必ず「いいゲーム人生だった」と言って引退する余韻)
// = 一番の思い出 + その時の気持ち(思い出の種類で変える) + 終わり方ごとのひとこと + 「いいゲーム人生だった。」
const FEELING: Record<string, Text[]> = {
  peak: [{ ja: 'あれは人生のてっぺんだった', en: 'that was the top of the mountain' }, { ja: 'あの日のことは、今でも細かく思い出せる', en: 'I can still recall every detail of that day' }, { ja: 'あの年の手帳は、今も捨てられない', en: "I still can't throw away that year's planner" }, { ja: '何度思い出しても、少し背筋が伸びる', en: 'every time I remember it, I sit up a little straighter' }],
  celeb: [{ ja: 'あれは一生の自慢になった', en: "I've bragged about it ever since" }, { ja: 'あの話をすると、若い人が少しだけ身を乗り出す', en: 'when I tell that story, the young ones lean in a little' }, { ja: '孫の代まで語り継ぐつもりだ', en: "I plan to tell it to my grandkids' grandkids" }],
  warm: [{ ja: '思い出すと、今でも少し泣ける', en: 'it still gets me a little, thinking back' }, { ja: 'あの時の顔を、今も時々思い出す', en: 'I still think of the faces from that day' }, { ja: 'あれがあったから続けられた', en: "that's what kept me going" }],
  work: [{ ja: 'あの時はテンションが上がった', en: 'what a rush that was' }, { ja: 'あの数字は、今でも暗記している', en: 'I still know those numbers by heart' }, { ja: 'あの日の打ち上げの味は、今でも覚えている', en: 'I still remember how the wrap party tasted that night' }, { ja: '売上表を、こっそり手帳に挟んでいる', en: 'I still keep the sales sheet tucked in my planner' }],
  high: [{ ja: 'あの時はテンションが上がった', en: 'what a rush that was' }, { ja: '思い出すたびに、にやけてしまう', en: 'I still grin every time I remember it' }, { ja: '小さな話だが、自分には大事件だった', en: 'a small thing, but a big deal to me' }, { ja: 'あれだけで 1 年がんばれた', en: 'that alone kept me going for a year' }],
};
const AFTER: Partial<Record<EndingId, Text[]>> = {
  end_debt: [{ ja: '借金は 10 年かけて返した。最後の振り込みの日、少しだけ自作を遊んだ。', en: 'It took ten years to pay off the debt. On the last payment day, I played my own game a little.' }, { ja: '借金の返済表は、今見るとハイスコア表に見える。', en: 'The repayment schedule looks like a high-score table now.' }],
  end_burnout: [{ ja: '今でも新作が出ると、店の棚の前で少し立ち止まる。', en: 'When a new game comes out, I still stop in front of the shelf for a while.' }, { ja: '今の仕事の休憩中、つい画面の当たり判定を考えてしまう。', en: 'On breaks at my new job, I still catch myself thinking about hitboxes.' }],
  end_body: [{ ja: '医者に止められたのは作る方だけで、遊ぶ方は止められなかった。', en: 'The doctor only stopped me making games. Nobody stopped me playing them.' }],
  end_blacklist: [{ ja: '業界には戻らなかったが、甥っ子には一生分自慢した。', en: "I never went back to the industry, but I bragged to my nephew for a lifetime." }],
  end_arrest: [{ ja: '出てきてからは、ゲームは全部ちゃんと買って遊んでいる。', en: "Since I got out, I've bought every game I play. Properly." }],
  end_switch: [{ ja: '名刺の肩書きは変わっても、机の引き出しには今もコントローラが入っている。', en: 'The title on my card changed, but there is still a controller in my desk drawer.' }],
  end_ai_seat: [{ ja: '引き継ぎ資料の最後に、AI が「ありがとうございました」と書いていた。', en: 'At the end of the handover doc, the AI had written "Thank you."' }],
  end_retire: [{ ja: '送別会の帰り道、コンビニでゲーム雑誌を買った。', en: 'On the way home from the farewell party, I bought a game magazine.' }, { ja: '退職の日、机の寝袋を初めて持ち帰った。', en: 'On my last day, I finally took the sleeping bag home.' }],
  end_restart: [{ ja: '翌朝、新しい企画書のファイルを作った。名前は「新規ドキュメント(2)」。', en: 'Next morning I made a new proposal file. Its name: "New Document (2)".' }, { ja: 'エンディングの後には、2 周目がある。ゲームの作り手なら、みんな知っている。', en: 'After the ending comes New Game+. Every game maker knows that.' }],
  end_pen_down: [{ ja: '70 年分のセーブデータは、全部ちゃんと残っている。', en: 'Seventy years of save data, all still there.' }],
};
/** 結果画面の締めの言葉: 直近の人生で使っていないものから(第 8 回ペルソナ: 締めの文が 3 回とも同じ) */
function freshPick(s: State, texts: Text[]): Text {
  const said = (s.inner.saidLines ??= []);
  const fresh = texts.filter((t) => !s.inner.recent?.includes(`line:${t.ja}`));
  const t = s.rng.pick(fresh.length ? fresh : texts);
  said.push(t.ja);
  return t;
}
function epitaphOf(s: State, id: EndingId): Text {
  const r = s.rng;
  const restartAfter: Text | null = id !== 'end_restart' ? null
    : s.flags.shift_partner ? freshPick(s, [{ ja: 'AI との打ち合わせは、今日も夜中まで長引いている。', en: 'Meetings with the AI still run past midnight.' }, { ja: '相棒の AI は、締め切りを一度も破らない。こっちは破る。', en: 'My AI partner has never missed a deadline. I have.' }])
    : s.flags.shift_play ? freshPick(s, [{ ja: '遊ぶ側に回っても、ついクリア後のスタッフロールを最後まで見てしまう。', en: 'Even as a player, I still watch every credits roll to the very end.' }, { ja: '遊ぶ側に回っても、バグを見つけると、つい再現手順をメモしてしまう。', en: 'Even as a player, when I find a bug I still write down the repro steps.' }])
    : null;
  const prisonAfter: Text | null = s.flags.ex_prison || s.flags.in_prison ? { ja: '塀の中で方眼紙に描いた迷宮は、今も引き出しの奥にある。', en: 'The maze I drew on graph paper behind bars is still at the back of my drawer.' } : null;
  const after = prisonAfter ?? restartAfter ?? (AFTER[id] ? freshPick(s, AFTER[id]!) : { ja: '', en: '' });
  const hs = s.inner.highs;
  if (!hs.length) return { ja: `大きな事件は何も無かった。${after.ja}それでも、いいゲーム人生だった。`, en: `Nothing big ever happened. ${after.en} Still, it was a good game life.`.replace(/  +/g, ' ') };
  const best = hs.reduce((a, b) => (b.w >= a.w ? b : a));
  const f = freshPick(s, FEELING[best.kind ?? 'high'] ?? FEELING.high);
  return {
    ja: `${best.year} 年、${best.age} 歳。${best.text.ja}。${f.ja}。${after.ja}いいゲーム人生だった。`,
    en: `${best.year}, age ${best.age}: ${best.text.en.replace(/\.$/, '')}. ${f.en[0].toUpperCase() + f.en.slice(1)}. ${after.en} It was a good game life.`.replace(/  +/g, ' '),
  };
}

// 最後の台詞は、どの終わり方でも全部キッズ・リターン(2026-10-16 Mukkii: 有名台詞のパロディは冷める人もいるので、ラストではなく人生の途中で)
export const KIDS_RETURN: Text = { ja: 'バカヤロー、まだ始まっちゃいねえよ', en: "Idiot. We haven't even started yet." };
function lastWordOf(s: State, _id: EndingId): Text | undefined { return s.inner.kr ?? KIDS_RETURN; }
// 前の版(lastwords.json から選ぶ)。今は使わない
export function famousLastWordOf(s: State, id: EndingId): Text | undefined {
  const ok = LASTWORDS.filter((l) => l.endings.includes(id) && (l.when ?? []).every((c) => test(s, c)));
  // 条件つき(元セガ・名声 …)の台詞を優先
  const special = ok.filter((l) => l.when?.length);
  const pool = special.length && s.rng.chance(0.7) ? special : ok;
  return pool.length ? s.rng.pick(pool).text : undefined;
}

export function makeEnding(s: State, id: EndingId, custom?: Text): Ending {
  const cause = custom ? { ja: `${s.age} 歳、${custom.ja}`, en: `At ${s.age}, ${custom.en}` } : causeOf(s, id);
  const w = s.works;
  const hit = w.filter((x) => x.result === 'hit' || x.result === 'legend').length;
  const flop = w.filter((x) => x.result === 'flop').length;
  const fates = w.filter((x) => x.history.length > 0).length;
  const job0 = JOB_TEXT[s.inner.startJob];
  const ja = `${s.startYear} 年、${s.startAge} 歳で${s.entry.ja}の${job0.ja}として業界入り。` +
    (w.length ? `${w.length} 本に関わり、ヒット ${hit} 本・爆死 ${flop} 本。` : '作品は 1 本も世に出なかった。') +
    (fates ? `${fates} 本は発売後も勝手に生き続けた。` : '') + `${cause.ja}。`;
  const en = `Entered the industry in ${s.startYear} at ${s.startAge} as a ${job0.en} (${s.entry.en}). ` +
    (w.length ? `Worked on ${w.length} games: ${hit} hits, ${flop} flops. ` : 'Not a single game shipped. ') +
    (fates ? `${fates} of them kept living on after release. ` : '') + `${cause.en}.`;
  return { id, age: s.age, year: s.year, cause, summary: { ja, en }, epitaph: epitaphOf(s, id), lastWord: lastWordOf(s, id) };
}
