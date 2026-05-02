# HeyGrand ESP32-S3-BOX-3 Firmware

Reference C++ firmware for the ESP32-S3-BOX-3 + HLK-LD2410 mmWave radar
that powers a HeyGrand resident's safety sensor.

This source is **not** built by the SaaS — flash it onto the device using
PlatformIO (recommended) or the Arduino IDE.

## What it does

1. Connects to Wi-Fi using credentials from `secrets.h`.
2. On startup (and on every WS `CONFIG_UPDATE`) calls
   `GET https://<host>/api/devices/<MAC>/config`, **verifies the
   `X-Signature` HMAC-SHA256 header**, then dynamically applies:
   - `sensitivity` → LD2410 sensitivity register (0–100)
   - `detectionDistance` → LD2410 max-gate distance (cm)
   - `aiCheckInFrequency` → ms between status pings
   - `activeHoursStart` / `activeHoursEnd` → quiet-mode window
3. Opens a persistent WebSocket to `wss://<host>/ws/esp32?mac=<MAC>` and
   sends `SENSOR_DATA` and `DEVICE_STATUS` events.
4. Receives:
   - `CONFIG_UPDATE` → re-fetches `/api/devices/<MAC>/config` and re-applies
   - `DIAGNOSTIC_COMMAND` → verifies HMAC signature, then executes the
     remote diagnostic action (reboot, dump regs, set log level, …) and
     replies with `DIAGNOSTIC_RESPONSE`.

## Configure

Copy `src/secrets.h.example` → `src/secrets.h` and fill in:

```c
#define WIFI_SSID         "your-wifi"
#define WIFI_PASSWORD     "your-password"
#define HEYGRAND_HOST     "your-app.replit.app"   // no scheme, no slashes
#define HEYGRAND_USE_TLS  1                        // 1 = wss/https, 0 = ws/http
#define DEVICE_HMAC_SECRET "must-match-server-DEVICE_HMAC_SECRET"
```

## Build & flash

```bash
cd firmware/esp32-s3-box-3
pio run -t upload
pio device monitor
```

## Wiring (HLK-LD2410 → ESP32-S3-BOX-3)

| LD2410 pin | ESP32-S3 pin |
|------------|--------------|
| 5V         | 5V           |
| GND        | GND          |
| TX (OUT2)  | GPIO 18 (RX) |
| RX (IN2)   | GPIO 17 (TX) |

UART1 @ 256 000 baud (LD2410 default).

## Notes

- The MAC address is read from `WiFi.macAddress()` and used as the device
  identity — no per-device flashing of MACs needed.
- If the SaaS responds without the `X-Signature` header (i.e. the server
  has no `DEVICE_HMAC_SECRET` configured), the firmware refuses to apply
  the config and logs a warning.
- For OTA updates, integrate `ArduinoOTA` or use Replit's deployment
  artifact pipeline (out of scope for this reference).
