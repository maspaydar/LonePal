# Replit Agent Prompt — Lock Down ADT Sensor-Ingest Endpoint

Copy everything below into your Replit Agent chat.

---

Act as a Principal Backend Engineer fixing a specific, scoped security gap in `artifacts/api-server/src/routes/iot/sensor-ingest.ts`. Do not touch unrelated routes, the DB schema, or any other part of the codebase. After the change, run `pnpm run typecheck` and `pnpm run build` and fix anything that fails.

## The problem

`POST /api/v1/sensor-ingest` has two branches: an ESP32 branch and an ADT branch.

- The **ESP32 branch is safe**: it resolves `entityId` from the device's registered MAC address and rejects cross-entity mismatches with a 403.
- The **ADT branch is not safe**: when it can't match a registered device, it falls back to trusting `entityId`/`residentId` sent directly in the request body, with no signature or authentication check on the request at all. Any caller who finds this URL can:
  - Write a fake motion/activity event into any tenant's data by supplying an arbitrary `entityId`.
  - Set a resident's status to `"safe"` (`storage.updateResidentStatus(residentId, "safe", ...)`), which can suppress a real inactivity alert for that resident.

A signature verifier already exists — `ADT_WEBHOOK_SECRET` in `services/motion-service.ts` — but the live `sensor-ingest.ts` route never calls it.

## What to do

1. **Add signature/secret verification to the ADT branch only.** Reuse the existing `ADT_WEBHOOK_SECRET` verification logic from `services/motion-service.ts` rather than writing a new one — check how it's used elsewhere first so the verification method (header name, HMAC scheme, etc.) is consistent with whatever ADT-side devices are already sending. If `services/motion-service.ts`'s verifier expects a different shape of payload than what arrives at `sensor-ingest.ts`, adapt the call, don't rewrite the crypto.
2. **Reject unsigned or invalid requests with 401** before any `storage.*` call runs, the same pattern already used correctly on the Stripe webhook route (`handleStripeWebhook`) — verify signature first, touch the database second.
3. **Do not weaken the ESP32 branch.** Its device-MAC based entity resolution is fine; leave that logic untouched.
4. **Stop trusting client-supplied `entityId`/`residentId` as a fallback.** Once the ADT branch is authenticated via `ADT_WEBHOOK_SECRET`, the payload can still carry `entityId`/`residentId`, but only because the request is now provably from ADT and not because we blindly believe the field. Add a check that the resolved `residentId` (if present) actually belongs to the claimed `entityId` before writing anything, mirroring the ESP32 branch's cross-entity mismatch check. If `residentId` is present but doesn't belong to `entityId`, return 403 and log it, do not write.
5. **Handle already-deployed devices without an ADT_WEBHOOK_SECRET configured.** Before enforcing rejection in production, check whether `ADT_WEBHOOK_SECRET` is guaranteed to be set in the current deployment:
   - If it's already configured as an env var in production, enforce the check unconditionally.
   - If you can't confirm it's set, add the enforcement but make it fail loud and clear if the env var is missing at startup (throw on boot, the same pattern used for `PORT` in `index.ts`), rather than silently allowing unsigned requests through. Do not add a bypass flag that defaults to "allow" — if the secret isn't configured, the server should refuse to start rather than silently expose the endpoint.
   - Ask me to confirm the ADT devices' current request format (headers/body) before finalizing if you can't determine it from the codebase alone — don't guess at what ADT sends.
6. **Log rejected requests** (without logging the secret itself) so we can see in `central_log_entries` if legitimate ADT traffic is being blocked after this change ships, to make rollback fast if something's misconfigured.

## Verification

- Write or update a test (or manual curl example in your summary) showing: (a) a request without a valid signature is rejected with 401 and no DB write occurs, (b) a request with a valid signature but a `residentId` that doesn't belong to the claimed `entityId` is rejected with 403, (c) a correctly signed, correctly scoped request still succeeds exactly as before.
- Confirm the ESP32 branch's existing tests/behavior are unchanged.

## When finished

Summarize exactly what changed in `sensor-ingest.ts`, whether `ADT_WEBHOOK_SECRET` is confirmed set in production or still needs me to set it, and flag anything about ADT's actual request format you couldn't verify from the code and need me to confirm.
