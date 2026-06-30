---
name: service-provider authorization model
description: How privileged actions are gated on service_provider type+status, and why two different gate mechanisms exist.
---

# Service-provider authorization model

Privileged setup actions are gated on the entity-scoped `service_providers`
table (`type` ∈ integration_sp|agent_sp, `status` registered→in_training→
certified→approved). Only `certified` or `approved` may perform setup work
(`SETUP_ALLOWED_STATUSES`). Guards live in
`artifacts/api-server/src/services/provider-authorization.ts`; every denial logs
an `Unauthorized <action>: ...` warning via `log()`.

Two gate mechanisms, chosen by *who triggers the request*:

- **Identity-based** (`authorizeServiceProvider`) — for SP-driven routes. The
  acting provider identifies itself with the `x-service-provider-id` header
  (fallback `serviceProviderId` in body). Applied to facility-environment setup
  in super-admin routes (create/patch/push-config), pinned to
  `requiredType: 'integration_sp'`.
- **Capability-based** (`authorizeEntityProviderCapability`) — for
  senior-triggered flows that carry NO provider identity (mobile `/respond`
  onboarding intake). Passes only if the resident's entity has ≥1 provider of
  the required type (`agent_sp`) with an allowed status.

**Why:** facility/hardware setup is operator-driven so the operator can be named
on the request; onboarding intake is triggered by a resident chatting, who has
no SP identity — so it must be authorized by the *facility's* certified agent_sp
capability instead. Pinning facility routes to `integration_sp` prevents a
certified `agent_sp` from doing integration work (role bleed flagged in review).

**How to apply:** when adding a new SP-gated action, pick the mechanism by
trigger source; map the action to the right provider `type` per the schema's
role split (integration_sp = ADT/motion hardware + facility environments;
agent_sp = resident companion agents + onboarding). Note entity scope for
identity-based facility *create* is partly caller-asserted (no facility row yet),
but still requires a real certified provider in that entity.
