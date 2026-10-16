# DECISIONS.md

Durable design decisions. Append briefly; do not rewrite history.

## 2026-08-29 — Vite, TypeScript and npm are the web baseline

The template uses a framework-free Vite + TypeScript starter and a committed npm
lockfile. Product repositories can add a UI framework when the product needs one.

## 2026-08-29 — CI is delegated to a pinned reusable workflow

`.github/workflows/ci.yml` calls
`mukkii-game/ai-dev-infra/.github/workflows/verify-web.yml@v1`. The central
workflow owns type checking, unit tests, the production build, Chromium E2E and
the `web-build` artifact. The protected `v1` tag prevents silent CI drift.

## 2026-08-29 — Repository administration is a human boundary

The Merge Guard enables native auto-merge for ordinary same-repository pull
requests only. It fails closed for forks, incomplete API results and any change
that touches or renames `.github/**`. It never checks out or executes pull
request code.

## 2026-08-29 — Pages publishes the artifact CI verified

The Pages workflow downloads only the triggering CI run's `web-build` artifact
and never checks out, installs, rebuilds or executes repository code. It handles
both bot auto-merges and human merges, proves the artifact matches the current
`main`, and rechecks `main` immediately before deployment.

## 2026-08-29 — Vite output is portable across project-site paths

Vite `base` is `./`, so the same CI artifact works under
`https://mukkii-game.github.io/REPOSITORY_NAME/` without rebuilding.

## 2026-08-30 — Infrastructure v2 centralizes Guard and Pages

CI, Merge Guard and Pages are small callers of the protected `ai-dev-infra@v2`
workflows. The template test suite verifies their exact references, permissions
and concurrency settings because those caller-owned settings cannot be enforced
inside a reusable workflow.

## 2026-09-14 — Rebuilt as the Phaser 4 game template

Replaced the framework-free starter and its PR / merge-guard / central-CI
plumbing with a Phaser 4 game template: direct push to main, one Pages
workflow with a Playwright smoke check, one manual itch.io workflow, and a
small `src/core` layer (save, i18n, audio, input, demo, meta). Rationale in
mukkii-game/Perfect_Dev_Environment decisions of 2026-09-13.

## 2026-10-15 — 企画の決定(PLAN.md、Fable)

- タイトルの数は「世界でゲームを作る人の総数 1200 万人(趣味・学生込み)」。元ネタの「80 億 = 人類全員」と同じ数え方にし、趣味に戻る人も含める。出典 SlashData 2024-06(11.1M)。
- ひねりは「作品棚」(関わった作品が発売後も史実に連動して生き続ける)。他の 2 案は QUESTIONS.md。
- 本当の死・病気・自殺は入れない。終わりは「開発者としての死」だけ。
- 文章が主役なので Phaser を使わず DOM + CSS。`src/core/` は使う。
- イベントは時代ロック(`years`)必須。小道具の初出年を lint で検査する(日本版クローンが叩かれた整合性の崩れを避ける)。
- Astra(GPT-6)への独立セカンドオピニオンは行わない(BRIEF の 2026-10-15 変更)。

## 2026-10-15 — 実装の決定(司令塔 Opus)

- パートは別セッションでなく司令塔のサブエージェントで並列に作り、同じ作業フォルダの別ファイルを触らせた(作業ブランチは使わず、司令塔だけが main に commit)。
- 1 回の advance = 1 年。その年のイベントを列(queue)に積み、選択で止まったら choose で続きを進める。logic が自分で呼ぶイベントは `system.json`(`ev_sys_*`)、選択から logic を動かす命令は `do_*` フラグ。
- 同期 3 人は本人と同じ logic を別 seed・別ボット(think / dreamer / stable)で 1 年ずつ並走させる。
- 業界入りの年は古い時代を厚くした(データが 2040 年までのため。QUESTIONS)。
- 共有 URL は `?seed=` と、時代を選んだ時だけ `&era=`。

## 2026-10-15 — 歴史の事件と年表図鑑(Mukkii の注文)

- 業界入りは 1977 年(のちに世界的に有名になるデザイナーが任天堂に入った年。文化庁メディア芸術祭のプロフィールで確認)〜2000 年(PlayStation 2 発売)。1 年あたり同じ重み。
- 業界の大事件は `src/data/hist/*.json` に「事件 1 件 + 立場ごとの版(variants)」で持つ。上から最初に条件を満たした版が起きる。毎年 1〜2 件。
- 触れた事件は端末に保存(年表図鑑)。まだ触れていない事件 ×4、触れたが別の立場 ×1.5、全部触れた ×0.5 の重みで選ぶ(`hist.*` のつまみ)。
- そのため `?seed=` は「同じスタート」(年・年齢・入口・職種・会社)を再現し、中身は図鑑によって変わる。`?seed=` を URL に付けて開いた時は図鑑を使わない(誰が開いても同じ結果。CI と不具合の再現用)。

## 2026-10-15 — 実在の人物は実名で(Mukkii 決定)

- 実在のクリエイター・作品は実名で出す。ただし起きた事実(誰が・いつ・何をした)はいじらず、確かめた事実を歴史のニュースとしてそのまま書く。
- プレイヤーがそこに少し絡むのは「笑い話の if」(エレベーターで一緒、ペンを貸した …)にとどめ、本人の評判・事実を変えない。本人のせりふは穏やかな短い一言だけ。犯罪・不祥事・病気を本人に絡めない。
- 90 年代の「ゲーム業界残酷物語」(投稿集)は、暗くならないよう面白楽しく作り直して素材にする(丸写しせず、実在の会社・個人を特定しない)。

## 2026-10-15 — 実在の人物は「間接的な関わり」だけ(Mukkii 決定。前の決定を厳しくする)

- 実在の人物が、史実に無い行動をしたり、史実に無いせりふを言ったりする場面は書かない(エレベーターで一言、試作に助言、乾杯 … は不可)。
- プレイヤーとの関わりは、プレイヤー側の行動・気持ちだけ: その人の作品の外注の仕事をした、ライバル視した、同じ賞にノミネートされて光栄、講演を客席で聞いた、作品に影響を受けた、など。
- スプレッドシートの未登場の候補(久夛良木健・山内溥・糸井重里 …)も全員、この形で入れる。
- 2026-10-16 ハードの選択は大きな選択(big)と別枠で 4〜6 年に一度(`choice.hwMin/hwMax`)。好みは組(hw_mk メーカー / hw_fm 形 / hw_pl 場所 / hw_dv 端末)ごとに最後の選択だけ残し、作品の機種を 75% の確率でそちらに寄せる。選んでいない人生は乱数の使い方を変えない。開始年の指定は時代の指定と同じ文字列(`y1985`)で URL・replay・共有に流す。
