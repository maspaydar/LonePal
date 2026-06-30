/**
 * Canonical device MAC / pairing-code handling.
 *
 * The ESP32 firmware identifies itself everywhere (WebSocket handshake,
 * /api/devices/:mac/config, heartbeats) using its MAC formatted as lowercase
 * hex with no separators — e.g. "aabbccddeeff" (see firmware main.cpp
 * `macForApi()`). To match reliably regardless of how a value was entered or
 * stored historically (colons, hyphens, uppercase, spaces), normalize to that
 * same canonical form before comparing.
 */

/** Strip separators + lowercase. Returns null unless the result is 12 hex chars (a real MAC). */
export function normalizeMac(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  return hex.length === 12 ? hex : null;
}
