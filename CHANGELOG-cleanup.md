# HeyGrand — Code Cleanup & Security Hardening Changelog

This pass focused on removing duplication/dead code, centralizing auth, and adding
security guardrails. No product features were added. The DB schema
(`lib/db/src/schema/schema.ts`) was **not** changed.

---

## Part 1 — Duplication & dead code

### 1. ESP32 / IoT route duplication — RESOLVED
- `artifacts/api-server/src/routes/esp32.ts` and `routes/iot/index.ts` exposed nearly
  identical endpoints (`/register`, `/heartbeat`, `/sensor-data`, `/status/:deviceMac`).
- Verified `routes/iot/index.ts` is the live one — mounted at `/api/esp32` in `routes.ts`
  (as `esp32Router`). `routes/esp32.ts` was **not imported anywhere**.
- **Removed** `routes/esp32.ts`. The `esp32-speaker` *service* (`services/esp32-speaker.ts`)
  is unrelated and still in use.

### 2. Duplicate webhook routes — REVIEWED, NO DELETION (per user)
- **Stripe**: two routes, `/api/webhooks/stripe` and `/api/stripe/webhook`, both map to the
  same `handleStripeWebhook`. `index.ts` registers the managed webhook against
  `/api/webhooks/stripe`. User asked to **keep both** (unsure which is configured in the
  Stripe dashboard), so both were left in place.
- **ADT**: the routes named in the original prompt
  (`/api/safety/adt-webhook/:entityId/:userId`, `/api/webhook/adt`) **do not exist** in the
  codebase. ADT is handled by the unified `/api/v1/sensor-ingest` endpoint. Nothing to remove.

### 3. `.migration-backup/` — REMOVED
- Confirmed nothing under `artifacts/` or `lib/` imports from `.migration-backup/`.
- **Removed** the `.migration-backup/` directory (~2.7 MB) from the working tree. History is
  preserved in git.

### 4. Dead-code scan — CANDIDATES LISTED (not deleted)
Confirmed unused, awaiting your confirmation before removal:
- `artifacts/api-server/src/app.ts` — an alternate Express app builder. The real entry is
  `src/index.ts` (which constructs its own app). `app.ts` is imported nowhere.
- `artifacts/api-server/src/routes/index.ts` — only mounts `healthRouter`; imported nowhere.
  The server uses `registerRoutes()` from `src/routes.ts`.
> Not deleted per the "list candidates first" instruction. Both are safe to remove on your OK.

---

## Part 2 — Centralized auth & middleware

### 5. Shared JWT helper — DONE
- Added `artifacts/api-server/src/lib/jwt.ts` with `getSessionSecret()`, `extractBearerToken()`,
  `signJwt()`, and `verifyJwt<T>()`.
- Refactored the three JWT-based middlewares (`company-auth.ts`, `super-admin-auth.ts`,
  `mobile-auth.ts`) to sign/verify via the shared helper and to parse the `Bearer` header via
  `extractBearerToken()`. Role-specific authorization logic (entity scoping + subscription check,
  mandatory 2FA, DB-backed token revocation) was left untouched.
- `maintenance-auth.ts` uses HMAC request signing (not JWT) and `vpc-auth.ts` uses a static
  token + CIDR IP check; `tenant-resolver.ts` only resolves `entityId`. These are intentionally
  not JWT and were left as-is.

### 6. Route → middleware mapping
| Mount | Router file | Auth middleware |
| --- | --- | --- |
| `/api/super-admin` | `routes/super-admin/index.ts` | `superAdminAuthMiddleware` on all non-login routes (2FA-gated) |
| `/api/maintenance` | `routes/maintenance.ts` | `maintenance-auth` (HMAC signature) |
| `/api/esp32` | `routes/iot/index.ts` | none (device ingest) — see item 7 |
| `/api/v1/sensor-ingest` | `routes/iot/sensor-ingest.ts` | **none** — see item 8 (known risk) |
| `/api/devices` | `routes/devices.ts` | `DEVICE_HMAC_SECRET` signed config (required in prod) |
| `/api/company` | `routes/company/index.ts` | `requireCompanyAuth` / `requireCompanyAdmin` |
| `/api/mobile` | `routes/mobile/index.ts` | `mobileAuthMiddleware` (DB-backed, revocable) |
| `/api/auth` | `routes/auth.ts` | login is public; authed routes use company/mobile guards |
| `/api/service-providers` | `routes/service-providers.ts` | service-provider guards |
| `/api` (registration) | `routes/registration.ts` | public (register / verify-email) — now rate-limited |

### 7. Tenant isolation — AUDITED
- **Company routes**: `requireCompanyAuth` cross-checks the JWT `entityId` against the
  `:entityId` in the path and 403s on mismatch. Good.
- **Mobile routes**: `mobileAuthMiddleware` binds `entityId`/`residentId` from the DB token
  record (not client input). Good.
- **IoT ESP32 ingest**: `/api/v1/sensor-ingest` (ESP32 branch) resolves entity from the device
  MAC and rejects cross-entity mismatches (403). Good.
- **FLAGGED**: the **ADT branch** of `/api/v1/sensor-ingest` trusts a client-supplied
  `entityId`/`residentId` in the request body when no registered device matches. Because the
  endpoint is unauthenticated (item 8), a caller could write a motion event / activity log to an
  arbitrary tenant. Tightening this depends on the item-8 decision below.

---

## Part 3 — Security guardrails

### 8. Webhook signature verification
- **Stripe**: verified — `handleStripeWebhook` requires the `stripe-signature` header and
  validates it via `stripe-replit-sync`'s `processWebhook(rawBody, signature)`; unsigned requests
  are rejected before any DB work. No change needed.
- **ADT / sensor-ingest**: `/api/v1/sensor-ingest` does **not** verify any signature. An HMAC
  verifier already exists in `services/motion-service.ts` (`ADT_WEBHOOK_SECRET`) but the active
  ingest route does not call it. **Left open per your instruction** (declined adding a shared
  secret to avoid rejecting already-deployed devices). Tracked as a known risk below.

### 9. Input validation (zod) — PARTIAL
- The IoT ingest branches already validate with zod (`esp32IngestSchema`, `adtIngestSchema`).
- Many `POST/PATCH/PUT` handlers in `routes.ts` and the sub-routers still read `req.body`
  fields directly without a schema. Full coverage is a large, route-by-route effort; the
  recommended pattern is to validate with the shared `@workspace/api-zod` schemas at the top of
  each handler and return 400 on failure. Listed as remaining work in the final summary.

### 10. Rate limiting — DONE
- Added `middleware/rate-limit.ts` (`authLimiter`, `registerLimiter`) using the already-installed
  `express-rate-limit`.
- Applied in `index.ts` (before `registerRoutes`) to: `/api/auth/login`,
  `/api/company/auth/login`, `/api/mobile/login`, `/api/super-admin/auth/{login,verify-2fa,emergency-reset}`,
  and public `/api/register*` + `/api/verify-email`.
- Added `app.set("trust proxy", 1)` so client IPs resolve correctly behind the Replit proxy.

### 11. Secrets hygiene — DONE
- Grepped `artifacts/`, `lib/`, `.agents/`, `attached_assets/` for `sk_live`/`sk_test`, Google
  API keys, private-key blocks, and inline password/secret literals. **No hardcoded secrets found.**
- `DATABASE_URL`, Stripe keys, Gemini key, and JWT/session secrets are read only from `process.env`.
- Added `.env.example` documenting all required vars (no values).

### 12. Super-admin 2FA — VERIFIED
- Every mutating/reading super-admin route applies `superAdminAuthMiddleware`, which rejects any
  token that is `pending2FA` or not `twoFactorVerified` (403). Only the public login / verify-2fa /
  emergency-reset / bootstrap endpoints are exempt (by design). The refactor preserved this check
  exactly. No path allows a super-admin session to be used without completing 2FA.

### 13. CORS & security headers — DONE
- Added `helmet()`.
- Locked CORS in production to an allow-list built from `REPLIT_DOMAINS` + `APP_URL` (no origin
  header still allowed for same-origin / webhook callers). Development keeps reflect-any-origin.

### 14. Error handling — HARDENED
- The centralized error handler in `index.ts` now returns a generic `"Internal Server Error"` for
  5xx responses in production, so internal messages / stack traces / SQL are never sent to clients.
  Full error detail is still logged server-side.

### 15. Dependency audit — REPORTED (no upgrades applied)
- `pnpm audit`: **1 advisory, LOW severity (CVSS 2.5)** — `esbuild@0.27.3`
  (GHSA-g7r4-m6w7-qqqr), a Windows-only dev-server path traversal. It is a **build-time
  devDependency**, not shipped, and does not affect the Linux runtime. Recommended (optional):
  bump to `esbuild@0.28.1`. Not auto-upgraded. No high/critical vulnerabilities.

### 16. Logging PII/tokens — HARDENED
- Found the request logger in `index.ts` logged full JSON response bodies for every `/api` route,
  which for login endpoints included the issued **JWT in plaintext**.
- Added `redactSensitive()` to scrub `token`/`password`/`secret`/`authorization`/etc. keys from
  logged responses.
- Note: `services/log-streamer.ts` writes to `central_log_entries` with metadata that is limited to
  internal IDs (entityId, residentId, scenarioId) — not tokens. Alert `title`/`message` strings can
  contain resident names (PII); redacting those is a larger, behavior-affecting change and is left
  as a recommendation.

---

## Code-review follow-ups (applied)
A post-implementation architect review of this pass surfaced two correctness gaps in the new code,
both now fixed:
- **Log redaction was exact-match only** and would have missed `pendingToken` (the short-lived token
  returned during the super-admin 2FA flow). Switched `redactSensitive()` to pattern matching
  (`/token|secret|password|authorization|apikey|otp|totp|credential|cookie/i`) so token variants are
  all scrubbed.
- **CORS `APP_URL` was added verbatim.** A trailing slash or path would fail to match the browser
  `Origin` header (origin-only) and reject legitimate requests in production. Now normalized via
  `new URL(APP_URL).origin`.

---

## Pre-existing issue surfaced (not caused by this pass)
- A **clean** `pnpm --filter @workspace/api-server run typecheck` reports **~158 pre-existing type
  errors** — the repository has never passed `tsc`. (Earlier incremental runs under-reported them
  because TypeScript's `.tsbuildinfo` cache only rechecks changed files; a full run surfaces all.)
- They are spread across the codebase, mostly in files untouched by this work:
  `routes.ts` (55), `routes/super-admin/index.ts` (39), `routes/mobile/index.ts` (12),
  `routes/company/index.ts` (12), plus maintenance/registration/devices/auth/iot and others.
- The dominant class is **`TS7030` "not all code paths return a value"** — a repo-wide pattern
  where Express handlers `return res.json()` in guard branches but fall through to a bare `next()`
  or `res.json()`. There are also `TS18046` (`data` is `unknown`), `TS2698` (spread of non-object),
  and a few enum/null mismatches.
- **`pnpm build` uses esbuild, which does not type-check**, so the build stays green and the app
  runs normally despite these errors.
- **This pass introduced zero new type errors.** The handful reported in edited files
  (`company-auth.ts`, `mobile-auth.ts`, `super-admin-auth.ts`, `index.ts:57`) are pre-existing:
  the original files at HEAD contain the identical control-flow / library-type issues, verified by
  diffing against `git HEAD`.
- **Recommendation:** a dedicated TypeScript-strictness pass (mostly mechanical `return` additions
  for the `TS7030` handlers, plus typing a few `unknown` results). It's low-risk but large and
  touches many unrelated files, so it's kept out of this security/cleanup scope pending your OK.
