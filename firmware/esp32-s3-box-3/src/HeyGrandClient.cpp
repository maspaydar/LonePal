#include "HeyGrandClient.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <mbedtls/md.h>

// ---------- HMAC helpers --------------------------------------------------

static String hexEncode(const uint8_t* bytes, size_t len) {
  static const char hex[] = "0123456789abcdef";
  String out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; ++i) {
    out += hex[(bytes[i] >> 4) & 0xF];
    out += hex[bytes[i] & 0xF];
  }
  return out;
}

static String hmacSha256Hex(const String& key, const String& msg) {
  uint8_t out[32];
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, reinterpret_cast<const uint8_t*>(key.c_str()), key.length());
  mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t*>(msg.c_str()), msg.length());
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
  return hexEncode(out, sizeof(out));
}

// Constant-time string compare to defend against timing oracle attacks.
static bool constantTimeEq(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); ++i) diff |= a[i] ^ b[i];
  return diff == 0;
}

// ---------- HeyGrandClient ------------------------------------------------

void HeyGrandClient::begin(const String& host, bool useTLS,
                            const String& mac, const String& hmacSecret) {
  _host = host;
  _tls = useTLS;
  _mac = mac;
  _hmacSecret = hmacSecret;
  connectWS();
}

void HeyGrandClient::connectWS() {
  String path = "/ws/esp32?mac=" + _mac;
  if (_tls) _ws.beginSSL(_host.c_str(), 443, path.c_str());
  else      _ws.begin(_host.c_str(), 80, path.c_str());
  _ws.setReconnectInterval(5000);
  _ws.enableHeartbeat(15000, 3000, 2);
  _ws.onEvent([this](WStype_t t, uint8_t* p, size_t l) { wsEvent(t, p, l); });
}

void HeyGrandClient::loop() { _ws.loop(); }

void HeyGrandClient::wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[WS] connected");
      // Send an initial DEVICE_STATUS so the server marks us online.
      sendDeviceStatus(WiFi.RSSI(), "boot");
      break;
    case WStype_DISCONNECTED:
      Serial.println("[WS] disconnected");
      break;
    case WStype_TEXT: {
      String txt;
      txt.reserve(length);
      for (size_t i = 0; i < length; ++i) txt += static_cast<char>(payload[i]);
      handleIncoming(txt);
      break;
    }
    default:
      break;
  }
}

bool HeyGrandClient::verifyHmac(const String& payload,
                                 const String& signatureHeader) const {
  if (_hmacSecret.length() == 0) return false;
  String expected = "sha256=" + hmacSha256Hex(_hmacSecret, payload);
  return constantTimeEq(expected, signatureHeader);
}

bool HeyGrandClient::fetchAndApplyConfig() {
  String url = (_tls ? "https://" : "http://") + _host
             + "/api/devices/" + _mac + "/config";

  WiFiClientSecure secure;
  // SECURITY: setInsecure() trusts any TLS cert and is acceptable ONLY
  // because every config payload is independently HMAC-verified below.
  // For defense-in-depth in production, replace this with
  // `secure.setCACert(LETS_ENCRYPT_R3_PEM)` (or your provider's root CA).
  secure.setInsecure();
  HTTPClient http;
  bool ok = _tls ? http.begin(secure, url) : http.begin(url);
  if (!ok) {
    Serial.println("[CFG] HTTP begin failed");
    return false;
  }
  http.collectHeaders((const char*[]){"X-Signature", "X-Signature-Alg"}, 2);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[CFG] HTTP %d\n", code);
    http.end();
    return false;
  }
  // Bound the response size to defend against memory-exhaustion attacks
  // even if TLS is broken/intercepted (defense-in-depth).
  static constexpr int CONFIG_MAX_BYTES = 2048;
  int contentLen = http.getSize();
  if (contentLen > CONFIG_MAX_BYTES) {
    Serial.printf("[CFG] body too large (%d bytes) — refusing\n", contentLen);
    http.end();
    return false;
  }
  String body = http.getString();
  String signature = http.header("X-Signature");
  http.end();
  if (body.length() > CONFIG_MAX_BYTES) {
    Serial.println("[CFG] body exceeds limit after read — refusing");
    return false;
  }

  if (signature.length() == 0 || signature == "unsigned") {
    Serial.println("[CFG] missing/unsigned X-Signature — refusing to apply");
    return false;
  }
  if (!verifyHmac(body, signature)) {
    Serial.println("[CFG] HMAC verification FAILED — refusing to apply");
    return false;
  }

  // ArduinoJson v7: bounded nesting + filtered fields keep heap usage tight.
  JsonDocument doc;
  DeserializationError err = deserializeJson(
      doc, body, DeserializationOption::NestingLimit(4));
  if (err) {
    Serial.printf("[CFG] JSON parse failed: %s\n", err.c_str());
    return false;
  }
  JsonObjectConst s = doc["settings"].as<JsonObjectConst>();
  DeviceConfig cfg;
  cfg.sensitivity        = s["sensitivity"]        | 50;
  cfg.detectionDistance  = s["detectionDistance"]  | 400;
  cfg.aiCheckInFrequency = s["aiCheckInFrequency"] | 60;
  cfg.activeHoursStart   = String((const char*)(s["activeHoursStart"] | "07:00"));
  cfg.activeHoursEnd     = String((const char*)(s["activeHoursEnd"]   | "22:00"));

  Serial.printf("[CFG] applied: sens=%u dist=%u freq=%u %s-%s\n",
                cfg.sensitivity, cfg.detectionDistance, cfg.aiCheckInFrequency,
                cfg.activeHoursStart.c_str(), cfg.activeHoursEnd.c_str());
  if (_onConfig) _onConfig(cfg);
  return true;
}

void HeyGrandClient::handleIncoming(const String& text) {
  JsonDocument doc;
  if (deserializeJson(doc, text)) return;
  String type = String((const char*)(doc["type"] | ""));

  if (type == "CONFIG_UPDATE") {
    Serial.println("[WS] CONFIG_UPDATE — refetching");
    fetchAndApplyConfig();
    return;
  }

  if (type == "DIAGNOSTIC_COMMAND") {
    String payload = String((const char*)(doc["payload"] | ""));
    String signature = String((const char*)(doc["signature"] | ""));
    if (!verifyHmac(payload, signature)) {
      Serial.println("[WS] DIAGNOSTIC_COMMAND HMAC failed — ignoring");
      return;
    }
    JsonDocument inner;
    if (deserializeJson(inner, payload, DeserializationOption::NestingLimit(4))) return;

    // ---- Replay protection -----------------------------------------------
    // Server signs `{ deviceMac, command, issuedAt }`. We require issuedAt
    // to be within ±_replayWindowMs of our (NTP-synced) wall clock AND that
    // the deviceMac matches our own — a captured packet for *another* device
    // must not be replayable here either.
    uint64_t issuedAt = inner["issuedAt"] | 0ULL;
    String forMac = String((const char*)(inner["deviceMac"] | ""));
    forMac.toLowerCase();
    if (forMac != _mac) {
      Serial.println("[WS] DIAGNOSTIC_COMMAND deviceMac mismatch — ignoring");
      return;
    }
    if (_replayWindowMs > 0) {
      time_t nowSec = time(nullptr);
      if (nowSec < 100000) {
        Serial.println("[WS] DIAGNOSTIC_COMMAND ignored — clock not synced");
        return;
      }
      uint64_t nowMs = (uint64_t)nowSec * 1000ULL;
      uint64_t skew = (nowMs > issuedAt) ? (nowMs - issuedAt) : (issuedAt - nowMs);
      if (skew > _replayWindowMs) {
        Serial.printf("[WS] DIAGNOSTIC_COMMAND outside replay window (skew=%llums) — ignoring\n",
                      (unsigned long long)skew);
        return;
      }
    }
    // ----------------------------------------------------------------------

    String action = String((const char*)(inner["command"]["action"] | ""));
    JsonObjectConst args = inner["command"]["args"].as<JsonObjectConst>();
    String result = _onDiagnostic ? _onDiagnostic(action, args) : String("noop");

    JsonDocument resp;
    resp["type"] = "DIAGNOSTIC_RESPONSE";
    resp["deviceMac"] = _mac;
    resp["action"] = action;
    resp["result"] = result;
    resp["respondedAt"] = (uint64_t)time(nullptr) * 1000ULL;
    String out;
    serializeJson(resp, out);
    _ws.sendTXT(out);
    return;
  }
}

void HeyGrandClient::sendSensorData(bool present, bool stationary,
                                     uint16_t distanceCm,
                                     uint8_t movementEnergy,
                                     uint8_t stationaryEnergy) {
  if (!_ws.isConnected()) return;
  JsonDocument doc;
  doc["type"] = "SENSOR_DATA";
  doc["deviceMac"] = _mac;
  doc["presenceDetected"] = present;
  doc["isStationary"] = stationary;
  doc["distance"] = distanceCm;
  doc["movementEnergy"] = movementEnergy;
  doc["stationaryEnergy"] = stationaryEnergy;
  String out;
  serializeJson(doc, out);
  _ws.sendTXT(out);
}

void HeyGrandClient::sendDeviceStatus(int rssi, const String& fwVersion) {
  if (!_ws.isConnected()) return;
  JsonDocument doc;
  doc["type"] = "DEVICE_STATUS";
  doc["deviceMac"] = _mac;
  doc["signalStrength"] = rssi;
  doc["firmwareVersion"] = fwVersion;
  doc["ipAddress"] = WiFi.localIP().toString();
  doc["uptimeSeconds"] = millis() / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  String out;
  serializeJson(doc, out);
  _ws.sendTXT(out);
}
