// 終わり = 開発者としての死(PLAN §4)。死因の 1 行(共有文の 1 行目)と、結果画面の要約を作る。
import type { State, EndingId, Ending, Text } from './types';
import { JOB_TEXT } from './names';

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
    case 'end_retire': return s.age >= 60
      ? { ja: `${a} 歳、定年。送別会のケーキに自分のドット絵`, en: `Retired at ${a}. Your pixel art was on the farewell cake` }
      : { ja: `${a} 歳、業界を卒業`, en: `Graduated from the industry at ${a}` };
    case 'end_pen_down': return { ja: `${a} 歳、筆を置く。開発者として大往生`, en: `At ${a}, you put down the pen. A full developer's life` };
    case 'end_ai_seat': return { ja: `${a} 歳、AI に席を譲った。引き継ぎ資料も AI が書いた`, en: `At ${a}, you gave your seat to an AI. The AI wrote the handover doc too` };
  }
}

export function makeEnding(s: State, id: EndingId): Ending {
  const cause = causeOf(s, id);
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
  return { id, age: s.age, year: s.year, cause, summary: { ja, en } };
}
