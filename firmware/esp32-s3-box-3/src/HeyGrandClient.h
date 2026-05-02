// HeyGrandClient — HTTPS config fetch (with HMAC verify) + persistent
// WebSocket client for SENSOR_DATA / DEVICE_STATUS / CONFIG_UPDATE /
// DIAGNOSTIC_COMMAND messages.

#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <functional>

struct DeviceConfig {
  uint8_t  sensitivity = 50;
  uint16_t detectionDistance = 400;     // cm
  uint16_t aiCheckInFrequency = 60;     // minutes
  String   activeHoursStart = "07:00";
  String   activeHoursEnd   = "22:00";
};

class HeyGrandClient {
public:
  using ConfigHandler     = std::function<void(const DeviceConfig&)>;
  using DiagnosticHandler = std::function<String(const String& action, JsonObjectConst args)>;

  void begin(const String& host, bool useTLS,
             const String& macAddress, const String& hmacSecret);
  void loop();

  // Fetch /api/devices/:mac/config and verify the X-Signature HMAC.
  // Calls onConfig() if the signature matches.
  bool fetchAndApplyConfig();

  // Send a SENSOR_DATA frame over WS (no-op if not connected).
  void sendSensorData(bool present, bool stationary, uint16_t distanceCm,
                      uint8_t movementEnergy, uint8_t stationaryEnergy);

  // Periodic DEVICE_STATUS heartbeat.
  void sendDeviceStatus(int rssi, const String& fwVersion);

  void onConfig(ConfigHandler h)         { _onConfig = std::move(h); }
  void onDiagnostic(DiagnosticHandler h) { _onDiagnostic = std::move(h); }

  // Reject DIAGNOSTIC_COMMANDs whose `issuedAt` is older than this many
  // milliseconds (defends against replay attacks). 0 = no check (NOT
  // recommended for production).
  void setReplayWindowMs(uint32_t ms) { _replayWindowMs = ms; }

  bool connected() const { return _ws.isConnected(); }

private:
  void connectWS();
  void wsEvent(WStype_t type, uint8_t* payload, size_t length);
  void handleIncoming(const String& text);
  bool verifyHmac(const String& payload, const String& signatureHeader) const;

  String _host;
  bool   _tls = true;
  String _mac;
  String _hmacSecret;
  WebSocketsClient _ws;
  uint32_t _lastReconnectAttempt = 0;
  ConfigHandler     _onConfig;
  DiagnosticHandler _onDiagnostic;

  // Default ±5 minutes — wide enough for clock skew, narrow enough that a
  // replayed packet is useless.
  uint32_t _replayWindowMs = 5UL * 60UL * 1000UL;
};
