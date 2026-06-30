# HeyGrand

An AI-powered senior care companion platform — daily check-ins, family alerts, and care facility management in one app.

## Run & Operate

- `pnpm --filter @workspace/heygrand run dev` — run the frontend (port assigned by workflow)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v3 + wouter (routing) + TanStack Query
- API: Express 5, HTTP server with WebSocket support
- DB: PostgreSQL + Drizzle ORM (schema at `lib/db/src/schema/schema.ts`)
- Auth: Custom JWT-based company auth, super-admin auth, mobile auth
- Real-time: WebSocket server (`ws` package), SSE streaming, speaker gateway
- Payments: Stripe via `stripe-replit-sync`
- AI: `@google/genai` for AI check-in generation
- Build: esbuild (CJS bundle for server)

## Where things live

- `artifacts/heygrand/` — React/Vite frontend (previewPath: `/`)
- `artifacts/api-server/` — Express server (previewPath: `/api`, port 8080)
- `lib/db/src/schema/schema.ts` — Drizzle ORM schema (source of truth for DB)
- `artifacts/api-server/src/routes.ts` — Main `registerRoutes()` function (WebSocket + all HTTP routes)
- `artifacts/api-server/src/routes/` — Route sub-modules (auth, company, mobile, super-admin, iot, etc.)
- `artifacts/api-server/src/middleware/` — Auth middleware (company, super-admin, tenant, VPC, maintenance)
- `artifacts/api-server/src/services/` — Business logic (AI engine, chat, email, emergency, speaker, Stripe)
- `artifacts/api-server/src/storage.ts` — Data access layer
- `artifacts/heygrand/src/App.tsx` — Frontend routing (wouter)
- `artifacts/heygrand/src/lib/queryClient.ts` — Custom React Query client

## Architecture decisions

- **No OpenAPI codegen**: Complex existing API kept as-is with original fetch layer. Frontend uses custom `queryClient.ts` rather than generated hooks.
- **registerRoutes pattern preserved**: The server's `registerRoutes(httpServer, app)` handles WebSocket setup, all route registration, and complex middleware chains — not refactored to Express Router pattern.
- **`logger-util.ts` breaks circular dep**: The `log()` utility was extracted from `index.ts` to `logger-util.ts` to allow route files to import it without circular dependencies.
- **DB owned by @workspace/db lib**: The schema lives in `lib/db/src/schema/`, shared as `@workspace/db`. Server's `db.ts` has its own pool but uses the same schema.
- **Tailwind v3 frontend**: Uses postcss + tailwindcss v3 (not @tailwindcss/vite plugin).

## Product

HeyGrand is a senior care platform with three user types:
- **Seniors**: Receive warm AI-powered daily check-ins via a companion device
- **Families**: Get daily summaries, instant alerts, and monitoring for their loved ones
- **Facilities**: Manage residents, units, sensors, emergency protocols, and billing

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `log` function imported via `logger-util.ts` (NOT `index.ts`) — avoids circular deps
- `zod/v4` subpath works with zod@3.25.x (compatibility layer)
- API server port is 8080 (not 5000 as noted in old template)
- Frontend previewPath is `/` — WouterRouter base uses `import.meta.env.BASE_URL.replace(/\/$/, "")`
- WebSocket path `/ws` — listed in routes, required for multi-tenant isolation
- `attached_assets/` is outside artifact root — `server.fs.strict: false` in vite config
- Super-admin 2FA is mandatory — see `.agents/memory/super-admin-2fa-enforcement.md`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
