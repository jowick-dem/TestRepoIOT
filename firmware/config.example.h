/**
 * config.example.h — Smart Home Rendang
 * 
 * ⚠ This is the TEMPLATE — safe to commit.
 *    Copy this file to config.h, fill in your real credentials,
 *    then use config.h in your sketch. config.h is gitignored.
 * 
 *    cp firmware/config.example.h firmware/config.h
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
