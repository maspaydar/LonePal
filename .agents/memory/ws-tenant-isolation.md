---
name: WebSocket multi-tenant isolation
description: How staff-dashboard real-time events are isolated per facility over the single global /ws channel.
---

The `/ws` dashboard WebSocket is a single global broadcast channel — every staff
browser across every facility connects to the same `WebSocketServer`. There is no
per-tenant channel.

**Rule:** tenant isolation for real-time events is enforced SERVER-SIDE only.
- Each socket is tagged with its `entityId` at handshake: the client appends
  `?token=<company JWT>` to the `/ws` URL; the connection handler verifies it with
  `verifyCompanyToken` and calls `tagClientEntity(ws, entityId)`.
- `broadcastToClients(data)` delivers an event to a socket only when
  `data.entityId === socket.__entityId`. Events with **no** `entityId` go to all
  sockets (backwards-compat / truly global events).
- Therefore **every entity-specific broadcast payload MUST include `entityId`** or
  it leaks to all tenants. This applies to all `broadcastToClients` callsites.

**Why:** an earlier version relied on client-side `entityId` filtering in
`App.tsx`. That is NOT a security boundary — sensitive payloads (resident names,
alert summaries / PHI-like safety data) still travelled over the wire to every
facility's browser. Architect review failed the change until isolation was moved
server-side. The client-side filter is kept only as defense-in-depth.

**How to apply:** when adding any new staff-dashboard WS event, include
`entityId` in the broadcast object. Untagged sockets (missing/invalid/expired
token) silently never receive entity-scoped events.

**Known residual:** WS auth is checked only at connect time; sockets are not
revalidated on token expiry/revocation (typical for JWT WS). Harden with an
`exp`-based close or periodic re-auth only if strict session invalidation is needed.
