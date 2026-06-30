// Minimal HLK-LD2410 mmWave radar driver (UART, 256 000 baud).
//
// Public methods:
//   begin(rxPin, txPin)         — initialize UART
//   poll()                      — pump the parser; call from loop()
//   present()                   — true if any presence detected
//   distanceCm() / energy*()    — last reported metrics
//   setSensitivity(0–100)       — sets motion + stationary sensitivity for
//                                 every gate (simplified mapping)
//   setMaxGate(distanceCm)      — sets max detection range (50–600 cm)

#pragma once
#include <Arduino.h>
#include <HardwareSerial.h>

class HLK_LD2410 {
public:
  void begin(int rxPin, int txPin, HardwareSerial& serial = Serial1);
  void poll();

  bool present() const { return _present; }
  bool isStationary() const { return _stationary; }
  uint16_t distanceCm() const { return _distance; }
  uint8_t movementEnergy() const { return _movementEnergy; }
  uint8_t stationaryEnergy() const { return _stationaryEnergy; }

  // Returns true if the radar acknowledged the command.
  bool setSensitivity(uint8_t value0to100);
  bool setMaxGate(uint16_t distanceCm);

private:
  HardwareSerial* _serial = nullptr;
  uint8_t _buf[64] = {0};
  size_t _len = 0;

  bool _present = false;
  bool _stationary = false;
  uint16_t _distance = 0;
  uint8_t _movementEnergy = 0;
  uint8_t _stationaryEnergy = 0;

  bool enterConfigMode();
  bool exitConfigMode();
  bool sendFrame(const uint8_t* payload, size_t payloadLen);
  bool readAck(uint16_t expectedCmd, uint32_t timeoutMs = 500);
  void parseDataFrame(const uint8_t* frame, size_t len);
};
