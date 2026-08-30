# Verify: 本地发布流程 · spec 0004 · updated 2026-08-30

_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands

- [ ] `DRY_RUN=true pnpm release` → prints plan (6 steps), exits 0, no filesystem changes → AC-7
- [ ] `DRY_RUN=true git status` → clean working tree (no accidental commits) → AC-7
- [ ] `DRY_RUN=true pnpm release` → step list includes: Generate changelog, Bump version, Prisma generate, Build, Deploy, Git commit & tag → AC-7
- [ ] `DRY_RUN=true pnpm release` → each step name printed, no mutating commands run → AC-6, AC-7

## Acceptance-criteria coverage

- AC-1 (version bump) → after full release, `package.json` version increments by patch (e.g. 0.1.0 → 0.1.1)
- AC-2 (changelog) → after full release, `CHANGELOG.md` exists with entries grouped by fix and feat
- AC-3 (build with production env) → after full release, `.next` directory exists and is non empty
- AC-4 (vercel deploy) → `vercel --prod` exits 0 and prints deployment URL
- AC-5 (git commit & tag) → after full release, `git log --oneline -1` shows "chore(release): vX.Y.Z" and `git tag` lists `vX.Y.Z`
- AC-6 (error handling) → simulate a failing step (e.g. `pnpm build` fails) → script prints step name and exits non-zero
- AC-7 (DRY_RUN) → covered by commands above
- AC-8 (stats summary) → after full release, summary table shows start time, each step duration, total duration, memory delta, output size
