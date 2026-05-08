/**
 * config.h — Smart Home Rendang
 * 
 * ⚠ Copy this to config.h and fill in your credentials.
 *    Do NOT commit the filled config.h to version control.
 */

#pragma once

// ── WiFi ──────────────────────────────────────
#define WIFI_SSID  "YOUR_WIFI_SSID"
#define WIFI_PASS  "YOUR_WIFI_PASSWORD"

// ── MQTT ─────────────────────────────────────
// Using a PRIVATE broker is strongly recommended.
// Default below is the public EMQX broker (no auth = not secure).
#define MQTT_BROKER    "broker.emqx.io"
#define MQTT_PORT      1883
#define MQTT_CLIENT_ID "ESP32-Rendang-001"
#define MQTT_USER      ""   // leave empty for public broker
#define MQTT_PASS      ""   // leave empty for public broker

// ── MQTT Topics ──────────────────────────────
#define TOPIC_SUHU        "proyekiot/sensor/suhu"
#define TOPIC_IPCAM       "proyekiot/ipcam"
#define TOPIC_GERBANG     "proyekiot/gerbang"
#define TOPIC_LAMP_TERAS  "proyekiot/lampu/teras"
#define TOPIC_LAMP_TAMU   "proyekiot/lampu/tamu"
#define TOPIC_LAMP_TIDUR  "proyekiot/lampu/tidur"
#define TOPIC_LAMP_DAPUR  "proyekiot/lampu/dapur"
