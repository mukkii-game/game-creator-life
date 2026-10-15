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
