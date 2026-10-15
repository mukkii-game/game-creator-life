# HANDOFF(引き継ぎ)

<!-- セッション終了時に AI が更新。別の AI が読んで続きを始められる内容にする。 -->

## 現状
- 2026-10-15 企画の 1 手目が完了(Fable)。**PLAN.md**(全体像・ひねり・人生の流れ・選択の型・年表 48 本・画面・進め方・各パートへの依頼文)、**docs/schema/**(イベント・年表・状態の形と例 4 件)、QUESTIONS.md(仮決め 13 件)を main に置いた。
- コードは雛形のまま(Play シーンは見本)。実装はまだ始めていない。
- Astra(GPT-6)への依頼文は作らない(BRIEF の 2026-10-15 変更)。

## 次の一手(司令塔のセッションがやること。PLAN §9 Step 0)
1. `git pull` → docs/schema の型を `src/game/types.ts` に写す → `src/data/` に仮イベント 10 本と年表 10 行 → `tools/lint-events.mjs`(時代ロック・ja/en・効果の範囲・ID 重複・小道具の初出年)→ `src/game/logic.ts` と `src/ui/` の空の骨組みで `npm run build` が通る main を作る。
2. PLAN §10 の依頼文を A〜E の 5 セッションに配る(作業ブランチ `part/<名前>`。main に push するのは司令塔だけ)。
3. A + D が戻ったら merge して仮データで最後まで動く版を作り、B・C を merge、E と調整(`npm run sim -- 400`、lint、手で 5 周)→ publish.json・og.png → 公開。

## 既知の問題
- `tools/check.mjs` は `window.__game.score` の増加を見る。DOM 版では「年齢」を score に出す(PLAN §9 D)。
- `tools/sim.mjs` は雛形の logic(speed/duration)を前提にしている。パート A が本作用に書き換える。
- ローカルで Playwright のブラウザ版が合わない時は `PW_CHROMIUM=/path/to/chrome node tools/check.mjs`。
- Phaser が 1.6MB あり Vite が警告を出す。DOM 版にすれば依存から外せる(パート D の判断)。

## 全体に共有したい気づき
<!-- 他の作品でも踏みそうな罠・効いた手だけ。この作品だけの話は「既知の問題」へ。
     1 件ずつ 5 項目で: 症状 → 原因 → 修正 → どう確かめたか → 未確認な点。日付を付ける。
     会議室が毎日回収し、雛形の docs/knowledge/ に取り込む。取り込まれたものは消さなくてよい。 -->
- 会議室: knowledge/start-from-reference.md / 役立った(「芯を 3〜5 個の仕組みに分けてから、ひねりは足さず合体」をそのまま PLAN §2・§3 の骨にした)(2026-10-15)
- 会議室: knowledge/game-design.md / 役立った(§8 原理の一覧。ひねりの狙いを「選択の重み・落差・余韻」と書けた。§6 の「bot 400 回」「選択に意味があるかを bot で測る」も進め方に入れた)
- 会議室: knowledge/process-patterns.md §1・§6・§10 / 役立った(§1 の「3 案出して理由で絞る」、§6 の bot 設計、§10 の「つなぎ口を先に決める・デモ固定ルート・ID は役割語・ハリボテ表示」を PLAN §8・§9 に)
- 会議室: knowledge/genres/README.md / 役立った(層の考え方)。**genres/<人生シミュ・テキスト系>.md は無かった** → tables/genres.csv の「生活・育成」「ビジュアルノベル」「テキストアドベンチャー」行で代用
- 会議室: knowledge/tables/pieces.csv / 一部役立った(ALL-052 点数に名前を付ける → 「開発者としての死因」、STO-009 演技として選ぶ、MNG-011 会話の型、THK-023 次の周回へ持ち込む)。**人生シミュ・ランダムイベント系のピースが薄い**(「後で効く選択」「時代ロック」の型が無い)
- 会議室: knowledge/tables/refs.csv / 無かった(人生シミュ・ランダムイベント型の参考コードが無い。ink / inkjs は分岐の部品として候補になった)
- 会議室: knowledge/tables/assets.csv / 役立った(PixelMplus・効果音ラボ・Google Fonts を候補に)
- 会議室: topics/14-other-ai-routes.md / 読んだが使わず(Astra 取りやめ)
- 2026-10-15 クラウドのセッションから AUTOMATON の記事本文が読めない。症状: WebFetch は DNS 不可、read_web は JS 描画で本文が空、curl はプロキシが拒否。原因: 許可ホスト外 + JS 描画。修正: 同じ記事の転載(headtopics)・はてブのコメント・note・個人ブログ・Yahoo の要約で代替し、公式サイト(1in8b.life、1in120m)は read_web で読めた。確かめ方: 3 経路を試した。未確認: 環境のネットワーク設定でホストを許可すれば直るか。
- 2026-10-15 「日本版クローン」が叩かれた中身は「丸写し」より**整合性の崩れ**(昭和初期に青春 18 きっぷ、兄弟が同名、子が生まれる前に孫)。原因: 時代と無関係にイベントを引いている。修正: イベントに時代ロック(`years`)を必須にし、小道具の初出年の辞書で lint する(docs/schema §7)。確かめ方: 記事の指摘から。未確認: 自作でどれだけ防げるか(公開後に見る)。
- 2026-10-15 元ネタの「並走する 4 人」は、雛形の bots.ts をそのまま流用すると安く作れる(同じ logic を別 seed・別 bot で回すだけ)。他の「見守る系」作品でも同じ手が使える。
