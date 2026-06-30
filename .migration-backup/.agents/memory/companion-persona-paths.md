---
name: Companion persona prompt has two builders
description: The companion's system instructions are built in two separate places; persona changes must touch both.
---

# Two companion persona prompt builders

The resident-facing AI companion's system instructions are assembled in **two independent
functions**, fed by different call paths. A change to the companion's persona (e.g. pulling in
a new source field) must be applied to **both** or one path silently diverges.

- `buildPersonaPrompt` in `server/ai-engine.ts` (via `getCachedPersonaPrompt`, 10-min TTL cache)
  — used by the mobile daily-chat path: `generateCompanionReply`, `streamCompanionResponse`,
  proactive check-ins.
- `buildSystemPrompt` in `server/services/persona-service.ts` (via `personaService.generateSystemPrompt`)
  — used by `chat-service` and `emergency-service`.

**Why:** They were built at different times from different data sources (ai-engine reads
`digitalTwinPersona`/`intakeInterviewData`/`onboardingProfile`; persona-service reads a
`DigitalTwinBiography` file/`digitalTwinPersona`). Easy to update one and assume the companion
is consistent everywhere — it is not.

**How to apply:** When the companion should reflect new resident data, edit both builders. Also
remember `getCachedPersonaPrompt` caches per-resident for 10 min — call `invalidatePersonaCache(residentId)`
after any write that should take effect immediately (e.g. onboarding completion).
