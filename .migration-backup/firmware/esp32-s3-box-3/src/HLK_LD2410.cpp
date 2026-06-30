#include "HLK_LD2410.h"

// LD2410 frame markers (see HLK-LD2410 datasheet).
static const uint8_t CFG_HDR[]  = {0xFD, 0xFC, 0xFB, 0xFA};
static const uint8_t CFG_TAIL[] = {0x04, 0x03, 0x02, 0x01};
static const uint8_t DATA_HDR[]  = {0xF4, 0xF3, 0xF2, 0xF1};
static const uint8_t DATA_TAIL[] = {0xF8, 0xF7, 0xF6, 0xF5};

void HLK_LD2410::begin(int rxPin, int txPin, HardwareSerial& serial) {
  _serial = &serial;
  _serial->begin(256000, SERIAL_8N1, rxPin, txPin);
}

bool HLK_LD2410::sendFrame(const uint8_t* payload, size_t payloadLen) {
  if (!_serial) return false;
  _serial->write(CFG_HDR, sizeof(CFG_HDR));
  uint16_t len = static_cast<uint16_t>(payloadLen);
  _serial->write(reinterpret_cast<uint8_t*>(&len), 2);
  _serial->write(payload, payloadLen);
  _serial->write(CFG_TAIL, sizeof(CFG_TAIL));
  _serial->flush();
  return true;
}

bool HLK_LD2410::readAck(uint16_t expectedCmd, uint32_t timeoutMs) {
  uint32_t deadline = millis() + timeoutMs;
  uint8_t buf[32];
  size_t idx = 0;
  while (millis() < deadline) {
    while (_serial && _serial->available()) {
      uint8_t b = _serial->read();
      if (idx < sizeof(buf)) buf[idx++] = b;
      if (idx >= 8 && memcmp(buf + idx - 4, CFG_TAIL, 4) == 0) {
        // Command word in the ACK is at offset 6..7 (little-endian).
        if (idx >= 8) {
          uint16_t cmd = static_cast<uint16_t>(buf[6]) | (static_cast<uint16_t>(buf[7]) << 8);
          return (cmd == (expectedCmd | 0x0100));
        }
        return false;
      }
    }
    delay(2);
  }
  return false;
}

bool HLK_LD2410::enterConfigMode() {
  uint8_t p[] = {0xFF, 0x00, 0x01, 0x00};
  if (!sendFrame(p, sizeof(p))) return false;
  return readAck(0x00FF);
}

bool HLK_LD2410::exitConfigMode() {
  uint8_t p[] = {0xFE, 0x00};
  if (!sendFrame(p, sizeof(p))) return false;
  return readAck(0x00FE);
}

bool HLK_LD2410::setSensitivity(uint8_t value0to100) {
  if (!enterConfigMode()) return false;
  // Set per-gate sensitivity for all 9 gates (motion + stationary).
  bool ok = true;
  for (uint8_t gate = 0; gate < 9 && ok; ++gate) {
    uint8_t p[] = {
      0x64, 0x00,
      0x00, 0x00, gate, 0x00, 0x00, 0x00,        // gate index
      0x01, 0x00, value0to100, 0x00, 0x00, 0x00, // motion sensitivity
      0x02, 0x00, value0to100, 0x00, 0x00, 0x00, // stationary sensitivity
    };
    sendFrame(p, sizeof(p));
    ok = readAck(0x0064);
  }
  exitConfigMode();
  return ok;
}

bool HLK_LD2410::setMaxGate(uint16_t distanceCm) {
  // LD2410 has 9 gates × 0.75m = 6.75m max. Convert cm → gate index.
  uint8_t maxGate = static_cast<uint8_t>(distanceCm / 75);
  if (maxGate < 2) maxGate = 2;
  if (maxGate > 8) maxGate = 8;
  if (!enterConfigMode()) return false;
  uint8_t p[] = {
    0x60, 0x00,
    0x00, 0x00, maxGate, 0x00, 0x00, 0x00,  // motion gate
    0x01, 0x00, maxGate, 0x00, 0x00, 0x00,  // stationary gate
    0x02, 0x00, 0x05, 0x00, 0x00, 0x00,     // unmanned-clear delay (s)
  };
  sendFrame(p, sizeof(p));
  bool ok = readAck(0x0060);
  exitConfigMode();
  return ok;
}

void HLK_LD2410::parseDataFrame(const uint8_t* frame, size_t len) {
  // Standard data frame layout (after header), LD2410 "engineering=off":
  // [type(1)][head(1)][state(1)][movDist(2)][movEn(1)][staDist(2)][staEn(1)][detectDist(2)]
  if (len < 12) return;
  uint8_t state = frame[8];          // 0=no target, 1=motion, 2=stationary, 3=both
  uint16_t movDist = frame[9] | (frame[10] << 8);
  uint8_t movEnergy = frame[11];
  uint16_t staDist = frame[12] | (frame[13] << 8);
  uint8_t staEnergy = frame[14];

  _present = (state != 0);
  _stationary = (state == 2);
  _movementEnergy = movEnergy;
  _stationaryEnergy = staEnergy;
  _distance = (movDist > 0) ? movDist : staDist;
}

void HLK_LD2410::poll() {
  if (!_serial) return;
  while (_serial->available()) {
    uint8_t b = _serial->read();
    if (_len < sizeof(_buf)) _buf[_len++] = b;
    else { memmove(_buf, _buf + 1, sizeof(_buf) - 1); _buf[sizeof(_buf) - 1] = b; }

    if (_len >= 8 && memcmp(_buf + _len - 4, DATA_TAIL, 4) == 0) {
      // Find header
      for (size_t i = 0; i + 8 <= _len; ++i) {
        if (memcmp(_buf + i, DATA_HDR, 4) == 0) {
          parseDataFrame(_buf + i + 6, _len - i - 6 - 4);
          break;
        }
      }
      _len = 0;
    }
  }
}
