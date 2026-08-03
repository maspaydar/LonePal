---
name: Security-provider webhook contract
description: Provider-neutral sensor ingestion model after the ESP32 removal (Aug 2026)
---

ESP32 companion hardware was fully removed (Aug 2026). The only sensor path is retrofit installation by professional security companies — provider-neutral, never ADT-exclusive.

**Contract:**
- Secret: `SENSOR_WEBHOOK_SECRET` (legacy `ADT_WEBHOOK_SECRET` still honored). Boot hard-fails in production if unset; in development the server boots but ingest endpoints 503/fail closed. `motionService.verifySignature` returns false when unset (no bypass).
- Signature header: `x-provider-signature` (legacy `x-adt-signature` accepted) = HMAC-SHA256 of raw body.
- Endpoints: `POST /api/v1/sensor-ingest` (payload: deviceId?, provider?, status alarm|stay, zone?, residentId?, entityId?) and `POST /api/webhook/security-provider` (payload: deviceId, eventType; legacy path `/api/webhook/adt` aliases it). Both signed.
- Schema: `hardware_type` enum has single value `security_provider`; units/sensors carry `securityProvider` text; sensors use `providerDeviceId` (renamed from adtDeviceId).
- `DEVICE_HMAC_SECRET` is no longer used for devices, but crypto.ts still falls back to it for AI-key encryption — do not delete the secret.

**Why:** product decision — no first-party hardware; providers push signed events, HeyGrand never talks to devices.
**How to apply:** any new sensor/provider feature must stay provider-neutral and go through these signed webhook paths; never reintroduce unsigned ingest or MAC-based device identity.
