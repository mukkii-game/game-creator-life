// 作品棚(ひねり、PLAN §3)。作品を出す・結果を引く・発売後も史実に連動して勝手に生き続ける。
import { tune } from '../core/tuning';
import type { State, Work, Role, WorkResult, Text } from './types';
import { workName, platformFor } from './names';
import { CO_TRAITS } from './data';

// あなたのチームの作品の名前(PLAN §12 を 2026-10-15 Mukkii の指示で変更): 実在のヒット作は実名で史実に出し、
// 自分の作品は「その年のヒット作と雰囲気が似た、チームのオリジナルの造語タイトル」。表は src/data/titles.json。
interface TitleRow { id: string; years: [number, number]; platforms?: string[]; genre?: Text; coined?: Text[]; name?: Text; gag?: Text | Text[] }
const tMod = import.meta.glob('../data/titles.json', { eager: true, import: 'default' }) as Record<string, { titles: TitleRow[] }>;
const TITLES: TitleRow[] = Object.values(tMod)[0]?.titles ?? [];
/** 題名に機種名が入っていたら、その機種の時だけ使う(『〇〇DS』が PS3 で出ていた) */
function nameFits(name: string, platform: string): boolean {
  const tags: [RegExp, RegExp][] = [[/DS$|DS[^a-z]/, /^ニンテンドー DS$/], [/アドバンス/, /アドバンス/], [/ポータブル|ポケット/, /PSP|ゲームボーイ|DS|3DS|スマホ|ケータイ/], [/64/, /64/], [/3D$/, /3DS/], [/脳を鍛える|でもいっしょ/, /DS|3DS|Wii|スマホ|Switch/], [/オンライン/, /^(?!アーケード|ゲームボーイ)/]]; // 業務用に「脳を鍛える」は付けない(第 20 回)
  return tags.every(([inName, okPf]) => !inName.test(name) || okPf.test(platform));
}
/** 題名の会議で選んだ型(worklife の ch_wk_tt_kanji / ch_wk_tt_ceo / ch_wk_tn_long)を、次の作品の名前にする */
const STYLED: Record<string, Text[]> = {
  tt_kanji: [{ ja: '『蒼穹戦記』', en: '"Azure Sky Chronicle"' }, { ja: '『鋼鉄要塞』', en: '"Iron Fortress"' }, { ja: '『幻影遊戯』', en: '"Phantom Games"' }, { ja: '『紅蓮剣舞』', en: '"Crimson Blade Dance"' }, { ja: '『星霜伝説』', en: '"Legend of Years"' }, { ja: '『雷鳴機甲』', en: '"Thunder Armor"' }],
  tt_ceo: [{ ja: '『ドラゴン大作戦』', en: '"Operation Dragon"' }, { ja: '『ハムスター大作戦』', en: '"Operation Hamster"' }, { ja: '『社員旅行大作戦』', en: '"Operation Company Trip"' }, { ja: '『ラーメン屋台大作戦』', en: '"Operation Ramen Stall"' }],
  tt_long: [{ ja: '『転生したら開発室の床で寝ていた件』', en: '"Reborn Asleep on the Dev Room Floor"' }, { ja: '『勇者をクビになったので村で道具屋を始めます』', en: '"Fired as the Hero, I Opened a Village Shop"' }, { ja: '『魔王城の締め切りが明日なので本気を出す』', en: '"The Demon Castle Deadline Is Tomorrow"' }],
};
function styledName(s: State): Text | null {
  for (const k of Object.keys(STYLED)) if (s.flags[k]) {
    delete s.flags[k];
    const used = new Set(s.works.map((w) => w.name.ja));
    const c = STYLED[k].filter((t) => !used.has(t.ja) && !s.inner.recent?.includes(`title:${t.ja.replace(/^『|』$/g, '')}`));
    return s.rng.pick(c.length ? c : STYLED[k]);
  }
  return null;
}
/** 作った題名も機種に合わせる(第 8 回ペルソナ: 『伝説の釣りDS』が PS3 で出ていた) */
function fitName(r: State["rng"], year: number, platform: string): Text {
  let n = workName(r, year);
  for (let i = 0; i < 6 && !nameFits(n.ja, platform); i++) n = workName(r, year);
  return n;
}
function pickTitle(s: State, platform: string): { name: Text; gag?: Text } | null {
  const used = new Set(s.works.map((w) => w.name.ja));
  const near = TITLES.filter((t) => t.years[0] <= s.year && s.year <= t.years[1]); // 発売前の年には出さない。一言に「同じ年」が多いので、終わりの年も延ばさない
  const fit = near.filter((t) => !t.platforms || t.platforms.some((p) => platform.includes(p) || p.includes(platform)));
  // 会社の作風(company_traits.json の genres)に合うタイトルを 7 割で優先する(シューティングの会社はシューティングを出しがち)
  const genres = CO_TRAITS[s.company.id]?.genres;
  const byGenre = genres?.length && s.rng.chance(0.7) ? [fit].map((p) => p.filter((t) => t.genre && genres.includes(t.genre.ja))) : [];
  // 機種の合わない題名は使わない(『おえかきペットDS』がケータイで出ていた)。合う物が無ければ作った名前
  for (const pool of [...byGenre.slice(0, 1), fit]) {
    const cands = pool.flatMap((t) => (t.coined ?? (t.name ? [t.name] : [])).filter((n) => !used.has(`『${n.ja}』`) && !used.has(n.ja) && nameFits(n.ja, platform) && !s.inner.recent?.includes(`title:${n.ja}`)).map((n) => ({ n, t })));
    if (!cands.length) continue;
    const { n, t } = s.rng.pick(cands);
    const gags = t.gag ? (Array.isArray(t.gag) ? t.gag : [t.gag]) : [];
    return { name: { ja: `『${n.ja}』`, en: `"${n.en}"` }, gag: gags.length ? s.rng.pick(gags) : undefined };
  }
  return null;
}

export const ROLE_TEXT: Record<Role, Text> = {
  junior: { ja: '末端', en: 'a junior' }, core: { ja: '中核', en: 'a core member' }, lead: { ja: 'リード', en: 'the lead' }, solo: { ja: 'ひとり', en: 'solo' },
};
export const RESULT_TEXT: Record<WorkResult, Text> = {
  flop: { ja: '爆死', en: 'Flop' }, ok: { ja: '普通', en: 'OK' }, hit: { ja: 'ヒット', en: 'Hit' }, legend: { ja: '伝説', en: 'Legend' },
};

function roleFor(s: State): Role {
  if (s.status === 'indie') return 'solo';
  if (s.job === 'director' || s.job === 'producer' || (s.stat.skill >= 75 && s.job !== 'qa' && s.job !== 'sales')) return 'lead';
  if (s.stat.skill >= 35) return 'core';
  return 'junior';
}
/** 役割の書き方: デバッガーと営業はリードにならない(ペルソナ通読: QA なのに毎回『リード』) */
function roleText(s: State, role: Role): Text {
  if (s.job === 'qa') return role === 'junior' ? { ja: 'テスト担当', en: 'a tester' } : { ja: 'テストのまとめ役', en: 'the test lead' };
  if (s.job === 'sales') return { ja: '営業担当', en: 'on sales' };
  return ROLE_TEXT[role];
}

function roll(s: State, role: Role): WorkResult {
  const sizeBonus = { big: 0.05, mid: 0, small: -0.02, sub: -0.04, indie: -0.03, abroad: 0.03, school: 0, none: 0 }[s.company.size];
  const shift = (s.stat.skill - 60) / 600 + sizeBonus + (role === 'lead' ? 0.03 : 0) + s.stat.fame / 2500;
  const legend = Math.max(0.005, tune('work.legend') + shift / 5);
  const hit = Math.max(0.03, tune('work.hit') + shift);
  const flop = Math.max(0.1, tune('work.flop') - shift);
  const x = s.rng.next();
  if (x < legend) return 'legend';
  if (x < legend + hit) return 'hit';
  if (x < legend + hit + flop) return 'flop';
  return 'ok';
}

const RESULT_LINES: Record<WorkResult, Text[]> = {
  flop: [
    { ja: '発売日、店に見に行った。棚の同じ場所に、帰りも同じ本数が並んでいた。', en: 'Launch day, you went to the shop. On the way home, the same number of copies sat on the same shelf.' },
    { ja: '売れなかった。社長が「次がある」と言った。次の企画の予算は半分だった。', en: 'It didn\'t sell. The CEO said "there\'s always next time." The next budget was half.' },
    { ja: '発売初週、ワゴンに直行。店頭で 3 本 1000 円。', en: 'Week one: straight to the bargain bin. Three for 1,000 yen.' },
    { ja: '雑誌のレビューは「操作性 2 点」。打ち上げは中止になった。', en: 'Magazine review: "Controls: 2/10." The wrap party was cancelled.' },
    { ja: '在庫の山が倉庫を埋めた。社長が「これは文化だ」と言った。', en: 'Unsold stock fills the warehouse. The boss calls it "culture."' },
    { ja: '発売日の夜、母から電話。「どこにも売ってなかったよ」。売り切れではなく、入荷していなかった。', en: "Launch night, your mom called: \"I couldn't find it anywhere.\" Not sold out. Never stocked." },
    { ja: '打ち上げは会議室で、お茶とせんべい。せんべいは余った。', en: 'The wrap party: tea and rice crackers in a meeting room. There were crackers left over.' },
    { ja: '売れなかった。半年後、中古屋で自分の作品を見つけた。50 円だった。', en: "It didn't sell. Six months later you found it at a used shop. 50 yen." },
    { ja: '発売から 1 か月、問い合わせの電話は 2 本。どちらも別のゲームと間違えていた。', en: 'A month after launch: two customer calls. Both had the wrong game.' },
    { ja: '爆死の翌朝、社長が全員の机に缶コーヒーを置いていった。何も書いていなかった。それが一番こたえた。', en: 'The morning after, the CEO left a can of coffee on every desk. No note. That hit hardest.' },
    { ja: '売上の報告会。グラフの棒が 1 本だけ短すぎて、印刷でかすれて消えていた。', en: 'At the sales meeting, one bar on the chart was so short it vanished in the printout.' },
    { ja: '売れなかった。近所の子が 1 人だけ「面白かった」と言ってくれた。その子の名前は今も覚えている。', en: "It didn't sell. One kid in the neighborhood said it was fun. You still remember their name." },
    { ja: '返品の段ボールが会社に戻ってきた。箱に「おつかれさまでした」と書いた人がいた。', en: 'Boxes of returns came back to the office. Someone had written "Good work, everyone" on one.' },
  ],
  ok: [
    { ja: '可もなく不可もなく。打ち上げは居酒屋で 2 時間。', en: 'Neither good nor bad. The wrap party: two hours at an izakaya.' },
    { ja: '売上はちょうど損益分岐点。社長が電卓を 3 回叩き直して、うなずいた。', en: 'Sales hit break-even exactly. The CEO re-ran the calculator three times, then nodded.' },
    { ja: '雑誌の評価は「良作」。良作という言葉の温度が、いまいち分からなかった。', en: 'The magazine called it "a solid game." You never quite worked out how warm "solid" is.' },
    { ja: '発売から半年、店の棚の端にまだ 1 本だけ並んでいる。売れ残りではなく、定番だと思うことにした。', en: "Six months on, one copy still sits at the end of the shelf. You decide it's a staple, not leftover stock." },
    { ja: '打ち上げで社長が「次はもっと」と言った。乾杯の前に言うか後に言うか、少し迷っていた。', en: "At the wrap party the CEO said, \"Next time, more.\" He couldn't decide whether to say it before or after the toast." },
    { ja: '姪っ子が友達と遊んでいた。「ふつうに面白い」と言っていた。最高の褒め言葉だと思うことにした。', en: "Your niece played it with friends: \"It's fun, normal fun.\" You decide that's top praise." },
    { ja: '売上は少しだけ黒字。経理の人が、珍しく向こうから挨拶してくれた。', en: 'A small profit. For once, the accountant said hello first.' },
    { ja: '読者アンケートの順位は、ちょうど真ん中。上にも下にも、知り合いの作品があった。', en: "Reader poll: dead center. Friends' games above you and below you." },
    { ja: '店で手に取った人が、裏を読んで、棚に戻して、また手に取った。レジまで見届けた。', en: 'At the shop, someone picked it up, read the back, put it down, picked it up again. You watched all the way to the register.' },
    { ja: '可もなく不可もなく。ただ、ファンレターが 1 通だけ届いた。便箋 5 枚、全部ボス戦の話だった。', en: 'Neither good nor bad. But one fan letter came: five pages, all about the boss fight.' },
    { ja: '予定どおりの本数が売れて、次の企画も予定どおり通った。予定どおりの人生も、悪くない。', en: "It sold as forecast, and the next pitch passed as forecast. A life on forecast isn't so bad." },
    { ja: '雑誌の点数は 7 点が 4 つ。並んだ数字が、妙にきれいだった。', en: 'The magazine scores: four 7s. A strangely tidy row of numbers.' },
    { ja: '売上は予定どおり。誰も褒めないが、誰も怒らない。', en: 'Sales on target. Nobody praises you; nobody yells.' },
  ],
  hit: [
    { ja: 'ヒット! 店頭から在庫が消えた。自分の分を買い損ねて、親戚に譲ってもらった。', en: 'A hit! Shelves emptied. You missed your own copy and had to get one from a relative.' },
    { ja: 'ヒット! 電車の中で、知らない人が自分のゲームの話をしていた。降りる駅を過ぎても聞いていた。', en: 'A hit! On the train, strangers were talking about your game. You rode past your stop to keep listening.' },
    { ja: 'ヒット! 社長賞が出た。中身は金一封 5000 円。社員なので印税は 1 円も無い。', en: 'A hit! A company award: 5,000 yen. You\'re salaried, so royalties: zero.' },
    { ja: '増産が決まった。あなたの机には次の企画書が 3 冊積まれた。', en: 'More copies ordered. Three new proposals land on your desk.' },
    { ja: 'ヒット! 実家に帰ったら、近所の人が「テレビで見たよ」と赤飯を持ってきた。', en: 'A hit! Back home, a neighbor brought celebration rice: "Saw it on TV!"' },
    { ja: 'ヒット! 会社の電話が鳴りっぱなしになった。半分は攻略の質問だった。', en: 'A hit! The office phone never stopped ringing. Half the calls were asking for hints.' },
    { ja: 'ヒット! ボーナスが出た。封筒が、机の上で立った。', en: 'A hit! Bonus time. The envelope stood up on the desk by itself.' },
    { ja: 'ヒット! 学生時代の友達から 10 年ぶりに連絡が来た。用件は「サインくれ」だった。', en: 'A hit! A school friend got in touch for the first time in ten years. He wanted an autograph.' },
    { ja: 'ヒット! 打ち上げは焼肉。社長の「好きなだけ」を、本当に好きなだけ食べた。', en: 'A hit! Wrap party: yakiniku. The CEO said "order whatever you like," and you took him at his word.' },
    { ja: 'ヒット! 甥っ子に「これ作ったの?」と聞かれて、うなずいた。親戚の集まりで、席が上座になった。', en: 'A hit! Your nephew asked, "You made this?" You nodded. Since then, you get the good seat at family gatherings.' },
    { ja: 'ヒット! 増産の会議で、社長が「足りない」を 7 回言った。', en: 'A hit! At the reorder meeting, the CEO said "not enough" seven times.' },
    { ja: 'ヒット! 攻略本が出た。こっそり入れた隠し要素が、全部載っていた。少しさみしかった。', en: 'A hit! A strategy guide came out with every secret you hid. A little lonely, somehow.' },
    { ja: 'ヒット! 店の前に行列ができた。並んでいる人に「面白いですか」と聞かれて、「たぶん」と答えた。', en: 'A hit! A line formed outside the shop. Someone in it asked if the game was good. You said, "Probably."' },
  ],
  legend: [
    { ja: '伝説になった。テレビで特集。映ったのは社長だけだった。', en: 'It became legendary. A TV special aired. Only the CEO was on screen.' },
    { ja: '社会現象に。あなたの名前はスタッフロールで 0.3 秒だけ流れた。', en: 'A social phenomenon. Your name scrolled by in the credits for 0.3 seconds.' },
    { ja: '伝説になった。何年たっても、飲み会で「あれを作った人」と紹介される。名前より先に。', en: "It became legend. For years, you're introduced at parties as \"the one who made that\"—before your name." },
    { ja: '伝説になった。小学生が校庭で、あなたの作ったボスの真似をしていた。', en: 'Legendary. Kids in a schoolyard were acting out your boss fight.' },
    { ja: '伝説になった。会社のビルが建て替わった。誰も口にしないが、あの 1 本のおかげだ。', en: 'Legendary. The company rebuilt its offices. Nobody says it, but that one game paid for them.' },
    { ja: '伝説になった。親が初めて「何の仕事してるの」と聞かなくなった。', en: 'Legendary. For the first time, your parents stopped asking what you do for a living.' },
    { ja: '伝説になった。社長が講演で「全部、私のひらめきでした」と話していた。客席から拍手した。', en: 'Legendary. The CEO told a lecture hall it was all his idea. You clapped from the audience.' },
    { ja: '伝説になった。ゲームのセリフが、その年の流行語の候補に入った。書いたのは締め切りの朝 4 時だった。', en: "Legendary. A line from the game made that year's buzzword shortlist. You wrote it at 4 a.m. on deadline day." },
    { ja: '伝説になった。海外のファンから手紙が届いた。辞書を引きながら、何日もかけて読んだ。', en: 'Legendary. A letter arrived from an overseas fan. You spent days reading it with a dictionary.' },
    { ja: '伝説になった。社員食堂の定食に、作品の名前がついた。味はいつもと同じだった。', en: 'Legendary. The cafeteria named a set meal after it. It tasted the same as always.' },
    { ja: '伝説になった。何十年たっても、誰かがどこかで遊んでいる。それだけは、誰にも取られない。', en: 'Legendary. Decades later, someone somewhere is still playing it. Nobody can take that part from you.' },
    { ja: '伝説になった。続編の企画書が 30 冊届いた。全部、社外の人が頼まれもせずに書いたものだった。', en: 'Legendary. Thirty sequel proposals arrived, all written unasked by people outside the company.' },
    { ja: '伝説になった。母が近所に 1 本ずつ配って歩いていた。全部、母が自分で買ったものだった。', en: "Legendary. Your mom handed out copies around the neighborhood. She'd bought every one herself." },
  ],
};
// 店に並ばない作品(スマホ・ダウンロード)の結果の一言
const DIGITAL_LINES: Partial<Record<WorkResult, Text[]>> = {
  flop: [
    { ja: 'ストアの順位は 3 日で圏外。レビューは 2 件、どちらも身内だった。', en: 'Out of the store charts in three days. Two reviews, both from family.' },
    { ja: 'ダウンロード数のグラフが、最初の日からずっと横ばいだった。地平線みたいにきれいだった。', en: 'The download graph stayed flat from day one, as clean as a horizon.' },
    { ja: '配信から 1 週間、レビューは星 1 つが 1 件。「起動しない」。あなたの端末では起動した。', en: "One week after launch: a single one-star review. \"Won't start.\" It starts fine on yours." },
    { ja: 'ダウンロード版の売上グラフを毎朝見た。毎朝、昨日とまったく同じ形をしていた。', en: 'You checked the sales graph every morning. Every morning, the exact same shape as yesterday.' },
    { ja: '配信初日、ランキングに載らなかった。載っていないランキングを、1 日に 40 回更新した。', en: 'Day one: not in the charts. You refreshed the charts forty times anyway.' },
    { ja: 'ダウンロード数は 2 桁で止まった。うち 1 つは、テストのために入れ直した自分だった。', en: 'Downloads stalled in double digits. One of them was you, reinstalling to test.' },
    { ja: '配信を止める手続きの方が、配信を始める手続きより、ずっと簡単だった。', en: 'Taking it down was much easier than putting it up.' },
    { ja: '「新着」の欄に 1 日だけ載った。その 1 日の画面を、写真に撮って残した。', en: 'It sat in "New Releases" for exactly one day. You took a photo of the screen to remember it.' },
  ],
  hit: [
    { ja: 'ストアのランキングで 1 位になった。スクリーンショットを撮って、待ち受けにした。', en: 'It hit No. 1 in the store charts. You screenshotted it and made it your wallpaper.' },
    { ja: '配信開始の夜、ダウンロード数のグラフが画面の上にはみ出した。目盛りを直したら、またはみ出した。', en: 'Launch night, the download graph ran off the top of the screen. You rescaled it. It ran off again.' },
    { ja: 'ヒット! サーバーが落ちた。うれしい悲鳴というものを、生まれて初めて本当に上げた。', en: 'A hit! The servers went down. For the first time in your life, you actually screamed with joy.' },
    { ja: 'ヒット! レビューが 1 日で 1000 件を超えた。全部読もうとして、3 日目にあきらめた。', en: 'A hit! Over a thousand reviews in a day. You tried to read them all and gave up on day three.' },
    { ja: '歯医者の待合室で、子どもがあなたのゲームを遊んでいた。名前を呼ばれても、やめなかった。', en: "In a dentist's waiting room, a kid was playing your game. Their name was called. They kept playing." },
    { ja: 'ヒット! 毎朝見ていた売上のグラフが、毎朝ちがう形になった。それだけで目が覚めた。', en: 'A hit! The sales graph you checked every morning looked different every morning. That alone woke you up.' },
    { ja: 'ヒット! 運営のチームが 3 人から 20 人になった。まだ半分の顔と名前が一致しない。', en: "A hit! The live team grew from three people to twenty. You still can't match half the faces to names." },
    { ja: 'ヒット! 発売元からの「おめでとうございます」と追加の仕事の相談が、同じ文に入っていた。', en: "A hit! The publisher's congratulations and a request for more work arrived in the same sentence." },
    { ja: 'ヒット! 開発室に、知らない国の言葉で書かれた感想が毎朝届くようになった。翻訳係ができた。', en: 'A hit! Every morning, fan messages in languages you cannot read. Someone became the official translator.' },
  ],
  ok: [
    { ja: 'ストアの評価は星 3.8。「普通に遊べる」というレビューが、いちばん多かった。', en: 'Store rating: 3.8 stars. The most common review: "Perfectly playable."' },
    { ja: '評価は星 3 つと 4 つの間を、半年ずっと行ったり来たりした。', en: 'The rating wobbled between three and four stars for six months straight.' },
    { ja: 'ダウンロード数は予定どおり。グラフは定規で引いたような右肩上がり。角度はゆるかった。', en: 'Downloads on target. The graph climbed in a ruler-straight line. A gentle angle.' },
    { ja: 'レビュー欄に「暇つぶしにちょうどいい」が並んだ。暇つぶしになれるのも才能だと思う。', en: 'The reviews kept saying "good for killing time." Being good company for spare minutes is a talent too.' },
    { ja: '配信 1 か月で開発費を回収。それからずっと、ランキングの真ん中あたりに居座っている。', en: "Costs recouped in a month. It's been camped in the middle of the charts ever since." },
    { ja: 'ダウンロード版の売上を毎朝見るのが日課になった。増えも減りもしないので、だんだん占いみたいになった。', en: 'Checking sales every morning became a ritual. Never up, never down—it turned into a kind of horoscope.' },
    { ja: '更新を出すたびに、同じ人が「ありがとう」とレビューを書いてくれる。会ったことはない。', en: "Every update, the same player leaves a review that says \"thank you.\" You've never met." },
    { ja: '星 4 つのレビューが 1 件、星 2 つが 1 件。どちらも同じ所を褒めて、同じ所を怒っていた。', en: 'One four-star review, one two-star. Both praised the same thing and complained about the same thing.' },
  ],
};
const SOLO_LINES: Partial<Record<WorkResult, Text>> = {
  flop: { ja: '売れたのは 12 本。うち 3 本は親戚。', en: 'Sold 12 copies. Three to relatives.' },
  hit: { ja: '売れた! 初めて自分の口座に印税が入った。手が震えた。', en: 'It sold! Royalties hit your own account for the first time. Your hands shook.' },
  legend: { ja: '世界中で売れた。会社員時代の上司から「うちで出さないか」とメール。', en: 'It sold worldwide. Your old boss emails: "Want to publish with us?"' },
};

/** 作品を 1 本出す。ログの文と効果を返す */
export function release(s: State): { work: Work; line: Text } {
  const r = s.rng;
  const role = roleFor(s);
  const result = roll(s, role);
  const platform = platformFor(r, s.year, role, s.flags, s.status === 'employed' ? s.company.id : undefined);
  const styled = styledName(s);
  const titled = styled ? { name: styled } : role === 'solo' || !r.chance(0.8) ? null : pickTitle(s, platform);
  const work: Work = { id: `wk_${s.works.length + 1}`, name: titled?.name ?? fitName(r, s.year, platform), year: s.year, platform, role, result, history: [], res0: result };
  s.works.push(work);
  // 結果の一言は、この人生でまだ使っていないものから(ペルソナ通読: 社長賞 5000 円が 3 回)
  const said = (s.inner.saidLines ??= []);
  const digital = /スマホ|ケータイ|ソシャゲ|Steam|itch|AI クラウド/.test(platform);
  const lines = digital && DIGITAL_LINES[result] ? DIGITAL_LINES[result]! : RESULT_LINES[result];
  // 一人で作った作品・独立中は、会社の人が出てくる一言を出さない(第 7 回ペルソナ: 自室で 1 人なのに「社長が電卓を」)
  const alone = role === 'solo' || s.status === 'indie';
  const fresh0 = lines.filter((t) => !said.includes(t.ja) && (!alone || !/社長|上司|部長|課長|営業|チーム|ボーナス|打ち上げ|同僚|社内/.test(t.ja)));
  const fresh1 = fresh0.filter((t) => !s.inner.recent?.includes(`line:${t.ja}`));
  const fresh = fresh1.length ? fresh1 : fresh0;
  const pickLine = fresh.length ? r.pick(fresh) : { ja: '', en: '' };
  const solo = role === 'solo' && SOLO_LINES[result] && !said.includes(SOLO_LINES[result]!.ja) && !s.inner.recent?.includes(`line:${SOLO_LINES[result]!.ja}`) ? SOLO_LINES[result]! : null;
  const gagOk = titled?.gag && !said.includes(titled.gag.ja) && !s.inner.recent?.includes(`line:${titled.gag.ja}`); // 題名の小ネタも直近の人生と被らせない
  const gag = solo ?? (gagOk && r.chance(0.5) ? titled!.gag! : pickLine);
  if (gag.ja) said.push(gag.ja);
  const line: Text = {
    ja: `${work.name.ja}(${work.platform})発売。あなたは${roleText(s, role).ja}。結果は${RESULT_TEXT[result].ja}。${gag.ja.replace(/^(大?ヒット|伝説(になった)?|爆死|普通)[!!。]\s*/, '')}`, // 「結果はヒット。ヒット!」と 2 回言わない(第 20 回)
    en: `${work.name.en} (${work.platform}) ships. You were ${roleText(s, role).en}. Result: ${RESULT_TEXT[result].en}. ${gag.en.replace(/^(A (big )?hit|A legend|Legend|A flop|Flop)[!.]\s*/i, '')}`,
  };
  const fx = { flop: { passion: -12, fame: 0 }, ok: { passion: 4, fame: 1 }, hit: { passion: 20, fame: 8 }, legend: { passion: 30, fame: 20 } }[result];
  const roleFame = { junior: 0.3, core: 0.7, lead: 1, solo: 1 }[role];
  s.stat.passion = clamp(s.stat.passion + fx.passion);
  s.stat.fame = clamp(s.stat.fame + Math.round(fx.fame * roleFame));
  s.stat.network = clamp(s.stat.network + 3);
  if (role === 'solo') s.stat.money += { flop: -80, ok: 50, hit: 600, legend: 3000 }[result];
  return { work, line };
}

export function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

// 発売後に勝手に起きること(データのイベントとは別の、機種と年で決まる運命)
type Fate = { key: string; test: (w: Work, year: number) => boolean; chance: number; text: Text; more?: Text[]; result?: WorkResult; fame?: number };
const FATES: Fate[] = [
  { key: 'eos', test: (w, y) => ['ケータイ', 'ソシャゲ', 'スマホ'].includes(w.platform) && y - w.year >= 3, chance: 0.35,
    text: { ja: 'サービス終了。最後の日、ログインしていたのは 41 人だった。', en: 'End of service. On the last day, 41 players were online.' },
    more: [
      { ja: 'サービス終了。最後のお知らせを書いたのは、最初のお知らせを書いたのと同じ人だった。', en: 'End of service. The final notice was written by the same person who wrote the first one.' },
      { ja: 'サービス終了。最後の夜、運営の 3 人が、残ったプレイヤーと一緒にボスを倒した。', en: 'End of service. On the final night, the three-person team beat the boss together with the players who were left.' },
      { ja: 'サービス終了。お知らせを出した日が、ここ数年でいちばんログインが多い日になった。', en: 'End of service. The day the notice went up was the busiest login day in years.' },
      { ja: 'サービス終了。最終日、ずっと 1 位だったプレイヤーから「ありがとう」と 1 行だけ届いた。', en: 'End of service. On the last day, the long-time top player sent a single line: "Thank you."' },
      { ja: 'サービス終了。止まる 1 分前まで、レベル上げをしている人がいた。', en: 'End of service. Someone was still grinding levels one minute before the shutdown.' },
    ] },
  { key: 'rerelease', test: (w, y) => y >= 2006 && y - w.year >= 15 && w.year < 2000, chance: 0.05,
    text: { ja: 'ダウンロード版で復刻。800 円。あなたに 1 円も入らない。', en: 'Re-released digitally for 800 yen. You get zero.' },
    more: [
      { ja: '昔の作品が復刻された。店で自分のゲームを定価で買った。売上のうち、あなたの分は 0。', en: 'Your old game got a re-release. You bought it at full price. Your share of the sales: nothing.' },
      { ja: '復刻された。公式の紹介文に、あなたが入れた隠しコマンドが載っていた。名前は載っていなかった。', en: 'Re-released. The official blurb mentioned the secret code you hid. Not your name.' },
      { ja: '復刻版が出た。当時のバグもそのまま入っていて、「味がある」と褒められていた。', en: 'A re-release came out, original bugs and all. People called them "charming."' },
      { ja: '復刻版のおまけの冊子に、当時のあなたの落書きが使われていた。断りは無かった。', en: 'The re-release booklet used a doodle you made back then. Nobody asked.' },
    ] },
  { key: 'gem', test: (w, y) => y >= 2016 && y - w.year >= 20 && w.result === 'flop', chance: 0.04, result: 'ok', fame: 4,
    text: { ja: '海外のコレクターの間で「隠れた名作」扱いに。中古価格が 40 倍。', en: 'Overseas collectors call it a "hidden gem." Used prices up 40x.' },
    more: [
      { ja: '海外の動画で「知られざる傑作」と紹介された。翌週、中古屋の値札が書き換わった。', en: 'An overseas video called it an "unknown masterpiece." The next week, used-shop price tags were rewritten.' },
      { ja: '海外のファンが、あなたの作品の英訳を勝手に作った。訳の方が、元の文より面白かった。', en: 'Overseas fans made an unofficial translation. It was funnier than the original.' },
      { ja: '売れなかったあの作品に、海外のファンクラブができた。会員は 200 人。あなたより詳しい。', en: 'Your old flop now has an overseas fan club. 200 members. They know it better than you do.' },
    ] },
  { key: 'airemake', test: (w, y) => y >= 2024 && y - w.year >= 10, chance: 0.03,
    text: { ja: 'AI リメイクが出た。キャラの指が 6 本ある。あなたに 1 円も入らない。', en: 'An AI remake came out. Characters have six fingers. You get zero.' },
    more: [
      { ja: 'AI リメイクが出回った。ボスの顔が場面ごとに変わる。あなたへの連絡は無い。', en: 'An AI remake is going around. The boss has a different face in every scene. Nobody contacted you.' },
      { ja: 'AI リメイクが出た。紹介文に「原作の魂を受け継ぐ」とある。原作を作った人には、誰も聞いていない。', en: 'An AI remake came out, "carrying the soul of the original." Nobody asked the people who made the original.' },
      { ja: 'AI リメイクが出た。曲だけは、あなたの昔の曲がなぜかそのまま入っていた。', en: 'An AI remake came out. Your old music was in it, untouched, for some reason.' },
    ] },
  { key: 'rta', test: (w, y) => y >= 2012 && y - w.year >= 8 && (w.result === 'hit' || w.result === 'legend'), chance: 0.05,
    text: { ja: 'RTA の定番になった。世界記録は 4 分 12 秒。あなたは 40 時間かけて作った面だ。', en: 'It became a speedrun staple. World record: 4:12. That stage took you 40 hours.' },
    more: [
      { ja: 'RTA の大会で走られた。あなたが 1 か月かけた会話の場面は、0.5 秒で読み飛ばされた。', en: 'It was run at a speedrun marathon. The dialogue scene you spent a month on was skipped in half a second.' },
      { ja: 'RTA の走者が、あなたも知らない抜け道を見つけた。開発中に 1 回だけ見た気がするバグだった。', en: "A speedrunner found a shortcut even you didn't know. A bug you think you saw once during development." },
      { ja: 'RTA の中継を見た。「ここは開発者のミスです」と解説されていた。合っていた。', en: 'You watched a speedrun broadcast. "This is a developer mistake," said the commentator. Correct.' },
    ] },
  { key: 'sequel', test: (w, y) => y - w.year >= 1 && y - w.year <= 3 && w.result === 'hit' && w.role !== 'solo', chance: 0.25,
    text: { ja: '続編が決まった。あなたの名前は企画会議に呼ばれる人の一覧に無かった。', en: 'A sequel was greenlit. Your name wasn\'t on the meeting invite.' },
    more: [
      { ja: '続編が出ることになった。あなたは新聞で知った。', en: 'A sequel was announced. You found out from the newspaper.' },
      { ja: '続編の制作が始まった。あなたの書いた設定資料が、知らない人の机の上にあった。', en: "Work on the sequel began. Your setting notes were sitting on a stranger's desk." },
      { ja: '続編が決まった。会議室の前を通ったら、自分の考えたキャラの名前が聞こえた。ドアは閉まったままだった。', en: "A sequel was greenlit. Walking past the meeting room, you heard your character's name. The door stayed shut." },
    ] },
];
function done(w: Work, key: string) { return w.history.some((h) => (h as { key?: string }).key === key); }

/** 1 年に 1 回呼ぶ。起きた後日談の文(ログ用)を返す */
export function tickWorks(s: State): { work: Work; text: Text }[] {
  const out: { work: Work; text: Text }[] = [];
  const base = tune('work.afterlife');
  const n = s.works.length, off = n ? s.rng.int(0, n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const w = s.works[(i + off) % n];
    for (const f of FATES) {
      if (done(w, f.key) || !f.test(w, s.year)) continue;
      // 同じ運命は 1 人生で言い回しの数まで(ペルソナ通読: 「ログイン 41 人」が 5 回)
      const fc = (s.inner.fateCount ??= {});
      const texts = [f.text, ...(f.more ?? [])];
      if ((fc[f.key] ?? 0) >= 1) continue; // 第 20 回ペルソナ: 「続編から外される」「RTA」「サービス終了」が 1 人生に 2 回 → 1 回まで // 1 人生に同じ運命は 2 回まで(第 8 回ペルソナ: 「続編が自分抜きで決まる」が 4 回)
      if (!s.rng.chance(f.chance * base / 0.06)) continue;
      // 言い回しは、この人生と直近の人生で使っていないものから(第 7 回ペルソナ: 「41 人」が 3 回続けて出た)
      const said = (s.inner.saidLines ??= []);
      const unsaid = texts.filter((t) => !said.includes(t.ja));
      const fresh = unsaid.filter((t) => !s.inner.recent?.includes(`line:${t.ja}`));
      if (!fresh.length && s.rng.chance(0.7)) continue; // 直近の人生で全部の言い回しを見ていたら、たいてい今回は起こさない
      const ft = s.rng.pick(fresh.length ? fresh : unsaid.length ? unsaid : texts);
      said.push(ft.ja);
      fc[f.key] = (fc[f.key] ?? 0) + 1;
      const h = { year: s.year, text: ft, key: f.key } as { year: number; text: Text; key?: string };
      w.history.push(h);
      if (f.result) w.result = f.result;
      if (f.fame) s.stat.fame = clamp(s.stat.fame + f.fame);
      out.push({ work: w, text: { ja: `${w.name.ja}: ${ft.ja}`, en: `${w.name.en}: ${ft.en}` } });
      break;
    }
    if (out.length >= 1) break; // 1 年に 1 つまで(うるさくしない)
  }
  return out;
}
