---
name: TypeScript typecheck baseline
description: The api-server has never passed tsc; build uses esbuild (no typecheck); incremental cache under-reports errors.
---

# api-server typecheck baseline

`pnpm --filter @workspace/api-server run typecheck` reports **~158 pre-existing type
errors** — the package has never passed a clean `tsc --noEmit`. The dominant class is
`TS7030` "not all code paths return a value" (a repo-wide Express-handler pattern: guard
branches `return res.json()` but the success path falls through to a bare `next()` /
`res.json()`), plus some `TS18046` (`data` is `unknown`), `TS2698` (spread of non-object),
and a few enum/null mismatches. `routes.ts` alone has ~55.

**Why this matters:**
- `pnpm build` runs esbuild (`build.mjs`), which **transpiles without type-checking**, so
  the build stays green and the app runs fine despite the type errors. Do not assume a green
  build means a green typecheck here.
- Because of this baseline, "run typecheck and fix what fails" cannot mean zero errors
  without a large dedicated strictness pass. When editing, verify you add **no new** errors
  rather than expecting an all-green result.

**How to get a true baseline:**
- The incremental cache (`.tsbuildinfo`) makes `tsc` only recheck changed files, so a first
  run after edits **under-reports** — it showed ~26 when the real count was ~158. For an
  accurate count, delete `artifacts/api-server/.tsbuildinfo` (and run `pnpm run typecheck:libs`
  first to build composite libs) before the per-package typecheck.
