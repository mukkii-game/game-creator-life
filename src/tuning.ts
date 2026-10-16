// 調整つまみの一覧(唯一の置き場)。数値をコードに直書きせず、ここに名前・単位・狙いを付けて置く。
// ゲーム中に F2(スマホは画面左上を 3 回タップ)で調整パネルが開く。パネルの「コピー」で今の値が JSON で取れる。
// 読み方: import { tune } from './core/tuning'; tune('life.yearSec')
export type Knob =
  | { key: string; label: string; value: number; min: number; max: number; step: number; unit?: string; aim?: string }
  | { key: string; label: string; value: string; options: string[]; aim?: string }
  | { key: string; label: string; value: boolean; aim?: string };

export const KNOBS: Knob[] = [
  // 時間
  { key: 'life.yearSec', label: '1 年の長さ(1 倍速)', value: 10, min: 2, max: 20, step: 0.5, unit: '秒', aim: '1 倍速はゆっくり読む速さ(2026-10-16 Mukkii: もう数割遅く → 7.5 から 10)。速く見たい人は 2 倍・4 倍' },
  { key: 'life.eventsMin', label: '1 年のイベント数(最少)', value: 2, min: 1, max: 5, step: 1, unit: '本', aim: 'あるあるの連打。少ないと間延びする' },
  { key: 'life.eventsMax', label: '1 年のイベント数(最多)', value: 3, min: 1, max: 6, step: 1, unit: '本' },
  { key: 'life.choiceEvery', label: '選択イベントの出やすさ', value: 0.45, min: 0, max: 1, step: 0.05, unit: '1 年あたり', aim: '1 年に 1 回は多すぎる。2〜3 年に 1 回くらい悩む' },
  { key: 'life.finalYear', label: '人生の区切りの年', value: 2027, min: 2020, max: 2045, step: 1, unit: '年', aim: 'AI のパラダイムシフトで「どうする?」→「まだ始まっちゃいねえよ」で終わる(2026-10-16 Mukkii)' },
  { key: 'life.maxRepeat', label: '同じイベントは 1 人生で何回まで', value: 1, min: 1, max: 10, step: 1, unit: '回', aim: '2026-10-16 ペルソナ 4 人の通読で「同じ話が 1 人生に何度も出る」が最大の不満 → 2 から 1 に(反復させたい話は tag repeatable)' },
  { key: 'life.repeatGap', label: '同じイベントが再び出るまで', value: 6, min: 0, max: 20, step: 1, unit: '年', aim: '反復ネタは効くが、毎年は飽きる' },
  // 歴史の事件(src/data/hist/)
  { key: 'hist.second', label: '歴史の事件が 1 年に 2 本来る確率', value: 0.35, min: 0, max: 1, step: 0.05, aim: '毎年 1 本は業界の大事件が自分に降ってくる' },
  { key: 'hist.newBoost', label: 'まだ触れていない事件の出やすさ', value: 4, min: 1, max: 20, step: 0.5, unit: '倍', aim: '何周しても「また同じか」にならない' },
  { key: 'hist.callbackBoost', label: '前の選択を回収する事件の出やすさ', value: 12, min: 1, max: 50, step: 1, unit: '倍', aim: '選んだ陣営・全力・闇の誘いの結末を見逃さない' },
  { key: 'hist.newPosBoost', label: '触れた事件を別の立場で受ける出やすさ', value: 1.5, min: 0.5, max: 10, step: 0.5, unit: '倍', aim: '同じ事件でも立場が違えば別の話になる(適度に混ぜる)' },
  { key: 'choice.bigMin', label: '大きな選択の間隔(最短)', value: 3, min: 1, max: 10, step: 1, unit: '年', aim: '数年に一回、すごく悩む選択が来る' },
  { key: 'choice.bigMax', label: '大きな選択の間隔(最長)', value: 5, min: 1, max: 15, step: 1, unit: '年' },
  { key: 'others.chance', label: '他の人の人生が顔を出す確率', value: 0.18, min: 0, max: 1, step: 0.02, unit: '/年', aim: '名前を入れて遊んだ誰かが、先輩・同期・後輩・記事で時々出る' },
  { key: 'others.max', label: '他の人の人生が出る上限', value: 4, min: 0, max: 20, step: 1, unit: '回/人生' },
  { key: 'choice.hwMin', label: 'ハード選択の間隔(最短)', value: 4, min: 1, max: 15, step: 1, unit: '年', aim: 'セガか他か・据え置きか携帯か・ゲーセンか家庭用か・スマホかコンシューマか、を時々迷う' },
  { key: 'choice.wkMin', label: '仕事の選択の間隔(最短)', value: 3, min: 1, max: 15, step: 1, unit: '年', aim: 'タイトル・続編か新作か・チーム・延期かカットか・リストラ … を時々迷う' },
  { key: 'choice.wkMax', label: '仕事の選択の間隔(最長)', value: 5, min: 1, max: 20, step: 1, unit: '年' },
  { key: 'choice.hwMax', label: 'ハード選択の間隔(最長)', value: 6, min: 1, max: 20, step: 1, unit: '年' },
  // 業界入り
  { key: 'gacha.age18', label: '18 歳で入る割合(基本は 22 歳。2026-10-16 Mukkii)', value: 0.08, min: 0, max: 1, step: 0.05 },
  { key: 'gacha.age50', label: '50 すぎ(50〜57 歳)で入る割合', value: 0.06, min: 0, max: 0.5, step: 0.01, aim: 'ひいひい言いながらついていく人生' },
  { key: 'gacha.lateBloomer', label: '遅咲き(26〜35 歳)の割合', value: 0.12, min: 0, max: 1, step: 0.05 },
  // 毎年の変化
  { key: 'year.hp', label: '体力の上限の年ごとの下がり', value: 0.8, min: 0, max: 3, step: 0.1, unit: '点/年', aim: '40 歳からは 1.5 倍。70 歳で上限が 50 前後' },
  { key: 'year.hpRegen', label: '1 年で戻る体力', value: 0.08, min: 0, max: 1, step: 0.02, unit: '上限までの割合', aim: '徹夜 1 回は 1 年で半分くらい戻る。続くと倒れる' },
  { key: 'year.hpWork', label: '働いている年の体力の減り', value: 2, min: 0, max: 15, step: 1, unit: '点', aim: '45 歳から 1.5 倍。戻る分と釣り合って、徹夜が重なると倒れる' },
  { key: 'year.passion', label: '1 年の情熱の減り', value: 6, min: 0, max: 10, step: 1, unit: '点', aim: '何もしないと 70 歳まで続かない(idle の穴をふさぐ)' },
  { key: 'year.skillMin', label: '1 年の腕の伸び(最少)', value: 2, min: 0, max: 10, step: 1, unit: '点' },
  { key: 'year.skillMax', label: '1 年の腕の伸び(最多)', value: 6, min: 0, max: 15, step: 1, unit: '点' },
  { key: 'year.salary', label: '会社員の 1 年の貯金', value: 60, min: 0, max: 300, step: 10, unit: '万円', aim: '大手は 1.5 倍、下請けは 0.5 倍' },
  { key: 'year.indieCost', label: '独立中の 1 年の持ち出し', value: 90, min: 0, max: 500, step: 10, unit: '万円' },
  { key: 'year.leftCost', label: '無職の 1 年の持ち出し', value: 80, min: 0, max: 300, step: 10, unit: '万円' },
  // 職と転職
  { key: 'job.offer', label: '引き抜きの誘いの確率', value: 0.04, min: 0, max: 1, step: 0.01, unit: '1 年あたり', aim: '人脈で増える。一度来たら 6 年は来ない(2026-10-16 Mukkii: 年収 1.5 倍の誘いが多すぎる → 0.07 から)' },
  { key: 'job.promote', label: '昇進の確率(条件を満たした時)', value: 0.3, min: 0, max: 1, step: 0.05, unit: '1 年あたり' },
  { key: 'job.bankrupt', label: '会社が潰れる確率(中堅)', value: 0.03, min: 0, max: 0.3, step: 0.01, unit: '1 年あたり', aim: '下請け 2 倍、小さい会社 1.6 倍、大手 0.3 倍。史実の不況年は 2 倍' },
  { key: 'job.rehire', label: '再就職の基本の確率', value: 0.3, min: 0, max: 1, step: 0.05, aim: '腕と人脈で上がる。3 回落ちたら業界を去る' },
  { key: 'job.comeback', label: '心が折れた後に戻れる確率', value: 0.12, min: 0, max: 1, step: 0.01, unit: '1 年あたり', aim: '5 年以内に 1 回だけ誘いが来る。人脈で増える' },
  { key: 'job.debtLimit', label: '廃業する借金', value: -500, min: -3000, max: 0, step: 50, unit: '万円' },
  { key: 'ai.seat', label: 'AI に席を譲る確率(2027 年〜)', value: 0.04, min: 0, max: 0.5, step: 0.01, unit: '1 年あたり', aim: '2035 年に向けて 3 倍まで上がる' },
  // 作品
  { key: 'work.everyMin', label: '作品の間隔(最短)', value: 2, min: 1, max: 6, step: 1, unit: '年' },
  { key: 'work.everyMax', label: '作品の間隔(最長)', value: 4, min: 1, max: 8, step: 1, unit: '年' },
  { key: 'work.hit', label: 'ヒットの確率', value: 0.13, min: 0, max: 1, step: 0.01, aim: '腕・会社・役割でずらす' },
  { key: 'work.legend', label: '伝説の確率', value: 0.03, min: 0, max: 0.3, step: 0.01 },
  { key: 'work.flop', label: '爆死の確率', value: 0.35, min: 0, max: 1, step: 0.01 },
  { key: 'work.afterlife', label: '作品の後日談の出やすさ', value: 0.06, min: 0, max: 0.5, step: 0.01, unit: '1 作 1 年あたり', aim: '棚が勝手に生きている感じ。多すぎるとうるさい' },
  // 画面と音
  { key: 'ui.lineMin', label: '1 行を読む最短の時間(1 倍速)', value: 3.2, min: 0.5, max: 6, step: 0.1, unit: '秒', aim: '目が追いつく速さ(Mukkii 2026-10-15「もう少しだけ遅く」)。2026-10-16「もう数割遅く」で 2.4 → 3.2。2 倍速なら半分' },
  { key: 'ui.fast', label: '「一気に」の 1 年', value: 0.4, min: 0.05, max: 2, step: 0.05, unit: '秒' },
  { key: 'audio.sfx', label: '効果音の音量', value: 0.3, min: 0, max: 1, step: 0.05, unit: '倍', aim: '控えめから。AI は音を聴かずに大きめを選びがち(2026-10-16 Mukkii: BGM も SE も数割控えめに → 0.45 から 0.3)' },
  { key: 'audio.bgm', label: 'BGM の音量', value: 0.3, min: 0, max: 1, step: 0.05, unit: '倍' },
];
