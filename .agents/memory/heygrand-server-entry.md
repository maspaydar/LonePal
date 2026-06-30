---
name: HeyGrand server entry pattern
description: Key architectural decisions for the HeyGrand server migration — registerRoutes pattern, log utility, and no OpenAPI codegen.
---

## The rule
The server uses `registerRoutes(httpServer, app)` (not Express Router sub-app pattern). Do not refactor to a Router-based approach — the function handles WebSocket setup, SSE streaming, and multi-layer middleware that depends on the HTTP server instance.

**Why:** The original app had 1920-line routes.ts that couples WebSocket server creation with route registration. Refactoring to Express Router would break WS auth, SSE streaming, and tenant isolation middleware that needs access to the raw HTTP server.

**How to apply:**
- `artifacts/api-server/src/index.ts` creates `httpServer = createServer(app)` then calls `registerRoutes(httpServer, app)` async
- `artifacts/api-server/src/routes.ts` is the main entry (NOT `routes/index.ts` which is unused)
- Route sub-modules in `routes/` are imported by `routes.ts`, not the Router

## Log utility
`logger-util.ts` exports the `log()` function. Never import `{ log }` from `./index` or `../index` or `../../index` — that causes circular dependency. The esbuild build will warn "import will always be undefined."

**Why:** Original code had `export function log()` in `server/index.ts`, which was circular when route files imported from it. Extracted to `logger-util.ts`.

## No OpenAPI codegen
The frontend uses the original fetch layer (`lib/queryClient.ts`). Do not generate OpenAPI hooks or replace fetch calls with `@workspace/api-client-react` hooks — the original app has 50+ endpoints that would all need spec coverage.

**Why:** App is too large and complex for spec-first migration; the original fetch layer is type-safe enough.
