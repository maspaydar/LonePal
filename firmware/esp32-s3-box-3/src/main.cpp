// HeyGrand ESP32-S3-BOX-3 firmware entry point.
//
// Boot sequence:
//   1. Connect to Wi-Fi
//   2. Initialize HLK-LD2410 mmWave radar on UART1
//   3. Fetch + verify + apply device config (HTTPS + HMAC)
//   4. Open persistent WebSocket to the SaaS
//   5. Forever: poll radar, push SENSOR_DATA changes, heartbeat,
//      apply CONFIG_UPDATEs and DIAGNOSTIC_COMMANDs from the SaaS.
//
// All network endpoints + the HMAC secret live in `secrets.h`.

#include <Arduino.h>
#include <WiFi.h>
#include "secrets.h"
#include "HLK_LD2410.h"
#include "HeyGrandClient.h"

// LD2410 wiring (ESP32-S3-BOX-3 expansion header).
constexpr int LD2410_RX = 18;   // ESP32 RX  ← LD2410 TX (OUT2)
constexpr int LD2410_TX = 17;   // ESP32 TX  → LD2410 RX (IN2)

HLK_LD2410      radar;
HeyGrandClient  client;
DeviceConfig    activeConfig;

uint32_t lastSensorPush   = 0;
uint32_t lastHeartbeat    = 0;
bool     lastPresence     = false;

static String macForApi() {
  String mac = WiFi.macAddress();         // "AA:BB:CC:DD:EE:FF"
  mac.toLowerCase();
  mac.replace(":", "");                    // → "aabbccddeeff"
  return mac;
}

static bool inActiveHours() {
  // Naive HH:MM compare in device local time. For real deployments,
  // sync NTP via configTime() and respect the resident's timezone.
  time_t now = time(nullptr);
  if (now < 100000) return true;          // clock not yet set
  struct tm t;
  localtime_r(&now, &t);
  char buf[6];
  snprintf(buf, sizeof(buf), "%02d:%02d", t.tm_hour, t.tm_min);
  String nowStr(buf);
  return (nowStr >= activeConfig.activeHoursStart &&
          nowStr <= activeConfig.activeHoursEnd);
}

static String runDiagnostic(const String& action, JsonObjectConst args) {
  if (action == "reboot") {
    delay(200);
    ESP.restart();
    return "rebooting";
  }
  if (action == "wifi_info") {
    return String("rssi=") + WiFi.RSSI() + " ip=" + WiFi.localIP().toString();
  }
  if (action == "free_heap") {
    return String(ESP.getFreeHeap());
  }
  if (action == "refetch_config") {
    return client.fetchAndApplyConfig() ? "ok" : "failed";
  }
  return "unknown_action";
}

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("=== HeyGrand ESP32 firmware booting ===");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WiFi] connecting to %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(400);
  }
  Serial.printf("\n[WiFi] connected: %s  IP=%s\n",
                WiFi.macAddress().c_str(), WiFi.localIP().toString().c_str());

  // NTP for active-hours window.
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  radar.begin(LD2410_RX, LD2410_TX);

  client.onConfig([](const DeviceConfig& cfg) {
    activeConfig = cfg;
    radar.setSensitivity(cfg.sensitivity);
    radar.setMaxGate(cfg.detectionDistance);
  });
  client.onDiagnostic(runDiagnostic);
  client.begin(HEYGRAND_HOST, HEYGRAND_USE_TLS != 0,
               macForApi(), DEVICE_HMAC_SECRET);

  // Initial config fetch (HMAC-verified). Retried by every CONFIG_UPDATE.
  if (!client.fetchAndApplyConfig()) {
    Serial.println("[BOOT] config fetch failed — using defaults");
  }
}

void loop() {
  client.loop();
  radar.poll();

  uint32_t now = millis();

  // Push sensor reading on presence change OR every 5s steady-state.
  bool present = radar.present();
  if (inActiveHours() &&
      (present != lastPresence || now - lastSensorPush > 5000)) {
    client.sendSensorData(present, radar.isStationary(),
                          radar.distanceCm(),
                          radar.movementEnergy(),
                          radar.stationaryEnergy());
    lastSensorPush = now;
    lastPresence = present;
  }

  // Periodic heartbeat (every aiCheckInFrequency minutes, capped at 5min).
  uint32_t heartbeatIntervalMs =
      static_cast<uint32_t>(activeConfig.aiCheckInFrequency) * 60UL * 1000UL;
  if (heartbeatIntervalMs > 5UL * 60UL * 1000UL) {
    heartbeatIntervalMs = 5UL * 60UL * 1000UL;
  }
  if (now - lastHeartbeat > heartbeatIntervalMs) {
    client.sendDeviceStatus(WiFi.RSSI(), HEYGRAND_FW_VERSION);
    lastHeartbeat = now;
  }

  delay(10);
}
