# docs/schema — つなぎ口の約束(イベントと状態のデータ形式)

パート担当が並列で作るための「形の約束」。変えたい時は QUESTIONS.md に理由を書き、自分のパートの中だけで仮対応する(司令塔が決める)。
機械で検査する形は `event.schema.json`(イベント・年表)と `state.schema.json`(状態・作品・終わり)。小さな例は `examples/`。

## 1. ファイルの置き場
- `src/data/timeline*.json` … 史実の年表(`TimelineEntry[]`)。1 件 1 行。`timeline_early.json`(〜2003)と `timeline_late.json`(2004〜)に分けてよい(全部まとめて読む)。
- `src/data/events/era1.json` … `era6.json` … イベント(`Event[]`)。時代ごとに分ける(era1=1972〜85、era2=86〜94、era3=95〜03、era4=04〜11、era5=12〜19、era6=20〜35)。
- `src/game/types.ts` … 下の型を TypeScript に写したもの(schema が正本)。
- `src/data/events/system.json` … logic が自分で呼ぶイベント(`ev_sys_*`。入社・引き抜き・倒産・定年・AI に席 …)。`common.json` は時代をまたぐ小ネタ。
- 命令フラグ(choice の `effect.flag` に入れると logic が実行する): `do_change_company`(転職)、`do_go_indie`(独立)、`do_return`(業界に戻る)、`do_end`(ここで終わる)。

## 2. ID と文字列の決まり
- ID は英小文字・数字・`_`。頭に種類を付ける: `ev_`(イベント)、`ch_`(選択)、`tl_`(年表)、`wk_`(作品の後日談)、`co_`(会社)、`end_`(終わり)。
- **役割語で付け、実名を ID に入れない**(`ev_era2_crunch_wedding`、`co_big_a`)。表示の文字列は ja / en の両方を JSON に直接持つ(`{ "ja": "…", "en": "…" }`)。en は仮訳でよいが空にしない。
- 文の中の差し込みは `{name}`(自分の名前)、`{company}`(今の会社)、`{work}`(直近の作品名)、`{age}`、`{year}`、`{peer}`(同期の名前)。それ以外は使わない。

## 3. Event(イベント)
| 項目 | 型 | 意味 |
|---|---|---|
| `id` | string | 一意。`ev_` 始まり |
| `years` | `[from, to]` | **時代ロック**(必須)。この西暦の範囲でしか出ない。lint が小道具の初出年とも照合する |
| `text` | `{ja, en}` | 本文。2 行まで(状況 → オチ) |
| `when` | `Condition[]` | 出る条件(全部満たす時だけ候補になる)。空なら常に候補 |
| `weight` | number | 抽選の重み(既定 1)。節目で必ず出すものは `100` |
| `once` | boolean | 1 人生で 1 回だけ(既定 false) |
| `effect` | `Effect` | すぐ出る効果 |
| `later` | `Later[]` | 後で出る効果(`{ after: 年数, event: "ev_xxx" }` で指定のイベントを予約) |
| `choices` | `Choice[]` | あれば選択イベント。2〜3 個 |
| `tag` | string[] | 絞り込み用(`"crunch"`, `"ai"`, `"family"`, `"milestone"` …) |

`Choice`: `{ id: "ch_…", label: {ja, en}, effect: Effect, later?: Later[], result?: {ja, en} }`(result は選んだ直後の 1 行)。
`Condition`(1 つの文字列): `"age>=30"`, `"stat.passion<30"`, `"job=programmer"`, `"company.size=big"`, `"flag.partner"`, `"!flag.partner"`, `"works>=3"`, `"era=era2"`, `"status=employed"`。比較は `= != < <= > >=`。左辺の語彙は `state.schema.json` の `conditionKeys` に列挙(それ以外は lint が落とす)。
`Effect`: `{ hp?, passion?, skill?, network?, money?, fame?, flag?: {名前: true|false}, job?: 職種, status?: 状態, work?: WorkEffect }`。数値は加算(hp/passion/skill/network/fame は -50〜+50、money は万円)。`work` は作品を棚に足す / 直近の作品の結果を変える(`{ add: {…} }` か `{ last: { result: "hit" } }`)。

## 4. TimelineEntry(年表)
`{ id: "tl_…", year, month?, kind: "hardware"|"hit"|"incident"|"work"|"ai"|"future", text: {ja, en}, use: string, src: string, unverified?: boolean }`。
`src` は Wikipedia 日本語版の項目名(無ければ URL)。`unverified: true` は画面に出さない。`kind: "future"` は架空(2027 年以降)。

## 5. State(状態。logic が持ち、画面と結果が読む)
`seed, year, age, startAge, era, job, status("employed"|"indie"|"left"|"retired"|"ended"), company{id, name, size}, stat{hp, passion, skill, network, money, fame}, flags{…}, works: Work[], peers: Peer[3], log: LogLine[], pending: Later[], ending?: Ending, choice?: {eventId, choices}`。
`Work`: `{ id, name:{ja,en}, year, platform, role("junior"|"core"|"lead"|"solo"), result("flop"|"ok"|"hit"|"legend"), history: {year, text}[] }`。
`Ending`: `{ id: "end_…", age, year, cause: {ja, en}, summary: {ja, en} }`。cause が共有文の 1 行目。
`LogLine`: `{ year, age, text: {ja,en}, kind: "event"|"timeline"|"choice"|"work"|"peer" }`。

## 6. logic の口(D と E が呼ぶのはこれだけ)
- `init(seed, options) → State`(options: 時代・年齢・おまかせの指定。未指定はガチャ)
- `advance(state) → string[]`(1 年進める。選択が出たら `state.choice` が埋まり、戻り値に `"choice"` が入る。終われば `"ended"`)
- `choose(state, choiceId) → string[]`(選択を適用して続きを進める)
- 乱数は `state.rng` だけ。Phaser・DOM・Math.random を使わない。

## 7. lint(`tools/lint-events.mjs`)が落とすもの
ID 重複 / `years` 無し / ja か en が空 / effect が範囲外 / Condition の語彙外 / 小道具の初出年より前に出る語(辞書は lint 内: ファミコン 1983、CD-ROM 1988、ケータイ 1999、スマホ 2008、Steam 2010(日本語)、ソシャゲ 2009、SNS 2008、配信者 2010、AI(生成)2022 など。例外は `"allow": ["語"]` で明示)/ timeline の `src` 無し。

## 8. Hist(歴史の事件。`src/data/hist/*.json`。2026-10-15 追加)
ゲーム業界の大事件(ハード発売・ハード戦争・社会問題・合併・規制 …)が、**その時の自分の立場で**人生に降ってくる。触れた事件は端末に保存され「年表図鑑」にたまる(何周しても埋まりきらない。まだ触れていない事件・立場ほど出やすい)。
`{ id: "hs_…", year, month?, until?(year〜year+5。この間のどこかで起きうる), kind, weight?(1〜3。有名さ), title: {ja,en}(図鑑の見出し。事実), news: {ja,en}(ニュースの 1 行。事実), src(Wikipedia 日本語版の項目名か URL), unverified?, variants: Event[](years は書かない) }`
- variants は **3 個以上、when が 3 種類以上**。上から順に見て、最初に条件を満たした版が起きる(具体的な立場を先に、誰にでも起きる版 = when 無しを最後に)。
- 立場の条件 `pos=`: `client_lead`(大手=発注元のディレクター/プロデューサー)/ `client`(大手の社員)/ `dev_lead`(開発会社の責任者)/ `dev`(開発会社)/ `sub`(下請け)/ `qa`(デバッガー)/ `indie`(独立)/ `abroad`(海外)/ `outside`(業界の外にいる時)。他の条件(job・flag.partner・age …)と組み合わせてよい。
- 文は「事件そのもの」ではなく「事件で自分の人生がどうなったか」(例: 『177』が国会で問題に → デバッグを手伝っていたのが彼女にばれて破局)。実在の人物は出さない(「のちに世界的に有名になるデザイナー」まで)。事件の被害者や災害を笑わない。笑うのは自分の身の回り。
