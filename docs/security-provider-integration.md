# HeyGrand — Security Provider Integration Guide

Audience: professional security / monitoring companies (ADT, Xfinity, Vivint, or any provider) retrofitting sensors into a resident's home. Retrofit via signed provider webhooks is the **only** supported sensor path — there is no direct device/firmware ingest.

## 1. Overview

Your monitoring platform pushes sensor events to HeyGrand over HTTPS as JSON webhooks. Every request must be signed with HMAC-SHA256 using a shared secret. Unsigned or badly signed requests are rejected with `401` — there is no unauthenticated fallback.

Two endpoints are available:

| Endpoint | Use for |
|---|---|
| `POST /api/v1/sensor-ingest` | **Preferred.** Provider-neutral event ingest with entity/resident resolution, inactivity flagging, and activity logging. |
| `POST /api/webhook/security-provider` | Simpler event feed for sensors already registered with HeyGrand by `deviceId`. |

All URLs are relative to the HeyGrand facility's base URL (shown in the facility's Settings page in the app).

## 2. Secret exchange

- HeyGrand operators configure a shared secret in the environment variable `SENSOR_WEBHOOK_SECRET` on the HeyGrand server.
- The same secret value is configured on your (the provider's) side and used to sign every webhook body.
- Exchange the secret out-of-band through a secure channel (password manager share, encrypted email, etc.). Never send it in a webhook body or URL.
- On rotation: HeyGrand updates `SENSOR_WEBHOOK_SECRET` and restarts; requests signed with the old secret are rejected with `401` immediately, so coordinate the switch-over.
- If the secret is not configured on the HeyGrand side, `POST /api/v1/sensor-ingest` responds `503` (development) or the server refuses to start (production). The endpoint never accepts unsigned traffic.

## 3. Signing requests

Send the signature in the `x-provider-signature` header (legacy header `x-adt-signature` is still accepted):

```
x-provider-signature: <hex HMAC-SHA256 of the raw request body>
```

- Algorithm: HMAC-SHA256, key = shared secret, message = the **raw request body bytes exactly as sent** (do not re-serialize or pretty-print).
- Encoding: lowercase hex digest. An optional `sha256=` prefix is accepted (`sha256=<hex>`).
- Comparison is timing-safe on the HeyGrand side.

Example (Node.js):

```js
const crypto = require("crypto");
const body = JSON.stringify(payload);
const signature = crypto
  .createHmac("sha256", process.env.SHARED_WEBHOOK_SECRET)
  .update(body)
  .digest("hex");

await fetch("https://<heygrand-host>/api/v1/sensor-ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-provider-signature": signature,
  },
  body, // send the exact string that was signed
});
```

Example (curl + openssl):

```sh
BODY='{"deviceId":"adt-123","status":"alarm","zone":"kitchen"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -X POST "https://<heygrand-host>/api/v1/sensor-ingest" \
  -H "Content-Type: application/json" \
  -H "x-provider-signature: $SIG" \
  -d "$BODY"
```

## 4. `POST /api/v1/sensor-ingest` (preferred)

### Payload

```json
{
  "deviceId": "adt-123",          // optional string — your device identifier, registered with HeyGrand
  "provider": "adt",              // optional string — provider name for logging
  "status": "alarm",              // required: "alarm" (sensor triggered / motion) or "stay" (armed, no motion)
  "zone": "kitchen",              // optional string — sensor zone/location
  "residentId": 42,               // optional integer — HeyGrand resident id
  "entityId": 7,                  // optional integer — HeyGrand facility/entity id
  "timestamp": "2026-08-03T10:15:00Z" // optional ISO-8601 event time
}
```

Resolution rules:

- If `deviceId` matches a sensor registered in HeyGrand, that registration is **authoritative** for the entity. A conflicting `entityId` in the body is rejected with `403`.
- If no registered device matches, `entityId` must be provided in the body.
- If a `residentId` resolves, it must belong to the resolved entity, or the request is rejected with `403`.

Semantics: `"alarm"` counts as motion/activity and marks the resident safe; `"stay"` means no active motion — if the resident has been inactive past the threshold, HeyGrand raises an inactivity alert on the Facility Dashboard.

### Success response — `200`

```json
{ "received": true, "status": "alarm", "residentId": 42 }
```

### Error responses

| Status | Meaning |
|---|---|
| `400` | Invalid payload (schema errors returned in `details`), or entity could not be resolved. |
| `401` | Invalid or missing `x-provider-signature`. |
| `403` | Device registered to a different entity, or resident does not belong to the claimed entity. |
| `404` | `residentId` not found. |
| `503` | `SENSOR_WEBHOOK_SECRET` not configured on the HeyGrand server. |
| `500` | Unexpected processing failure — safe to retry. |

## 5. `POST /api/webhook/security-provider`

Simpler feed for devices already registered with HeyGrand. Same signature requirements as above. (Legacy path `POST /api/webhook/adt` behaves identically.)

### Payload

```json
{
  "deviceId": "adt-123",   // required — must match a sensor registered in HeyGrand
  "eventType": "motion",   // required — free-form event type string
  "timestamp": "2026-08-03T10:15:00Z"  // optional; extra fields are stored as raw payload
}
```

The entity, location, and resident are resolved from the registered sensor (via its unit if needed). A motion event is recorded, the resident is marked safe, and dashboards update in real time.

### Responses

- `200` — `{ "received": true, "eventId": 123 }`
- `400` — missing `deviceId` or `eventType`
- `401` — invalid or missing signature
- `404` — `deviceId` not registered with HeyGrand
- `500` — processing failure, safe to retry

## 6. Integration checklist

1. Exchange the shared secret with the HeyGrand facility operator (`SENSOR_WEBHOOK_SECRET`).
2. Register your device IDs with HeyGrand (facility admin does this in the app), or include `entityId` in each `/api/v1/sensor-ingest` payload.
3. Sign every request body with HMAC-SHA256 and send it in `x-provider-signature`.
4. Send a test event and confirm a `200 { "received": true }` response and that the event appears on the Facility Dashboard.
5. Handle `401`/`403` as configuration errors (do not retry blindly); retry `5xx` with backoff.
