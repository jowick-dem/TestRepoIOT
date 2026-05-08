/**
 * Smart Home Rendang — firmware/main.ino
 * 
 * Hardware: ESP32 (+ ESP32-CAM for CCTV)
 * Features: Temp sensor, 4x PWM light channels, gate servo, MQTT
 * 
 * Dependencies (install via Arduino Library Manager):
 *   - PubSubClient by Nick O'Leary
 *   - DHT sensor library by Adafruit
 *   - ESP32Servo
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ESP32Servo.h>
// Copy config.example.h → config.h and fill in your credentials before compiling
#include "config.h"

// ── PIN MAP ──────────────────────────────────
#define PIN_DHT       4
#define PIN_LAMP_TERAS  16
#define PIN_LAMP_TAMU   17
#define PIN_LAMP_TIDUR  18
#define PIN_LAMP_DAPUR  19
#define PIN_GATE_SERVO  23

// ── PWM CHANNELS ─────────────────────────────
#define CH_TERAS  0
#define CH_TAMU   1
#define CH_TIDUR  2
#define CH_DAPUR  3
#define PWM_FREQ  5000
#define PWM_RES   8  // 8-bit → 0–255

// ── OBJECTS ──────────────────────────────────
DHT     dht(PIN_DHT, DHT22);
Servo   gateServo;
WiFiClient   espClient;
PubSubClient mqtt(espClient);

// ── STATE ────────────────────────────────────
unsigned long lastTempPublish = 0;
const unsigned long TEMP_INTERVAL = 5000; // ms

// ─────────────────────────────────────────────
// WIFI
// ─────────────────────────────────────────────
void connectWifi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("[WiFi] Connected. IP: ");
  Serial.println(WiFi.localIP());
}

// ─────────────────────────────────────────────
// MQTT
// ─────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int len) {
  String t = String(topic);
  String msg = "";
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];

  Serial.printf("[MQTT] %s → %s\n", topic, msg.c_str());

  // Lamp channels
  auto setLamp = [](int ch, int val) {
    val = constrain(val, 0, 255);
    ledcWrite(ch, val);
  };

  if      (t == TOPIC_LAMP_TERAS)  setLamp(CH_TERAS,  msg.toInt());
  else if (t == TOPIC_LAMP_TAMU)   setLamp(CH_TAMU,   msg.toInt());
  else if (t == TOPIC_LAMP_TIDUR)  setLamp(CH_TIDUR,  msg.toInt());
  else if (t == TOPIC_LAMP_DAPUR)  setLamp(CH_DAPUR,  msg.toInt());

  // Gate control
  else if (t == TOPIC_GERBANG) {
    if (msg == "BUKA")  { gateServo.write(90);  delay(500); }
    if (msg == "TUTUP") { gateServo.write(0);   delay(500); }
  }
}

void mqttReconnect() {
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Connecting...");
    if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
      Serial.println(" connected");
      mqtt.subscribe(TOPIC_LAMP_TERAS);
      mqtt.subscribe(TOPIC_LAMP_TAMU);
      mqtt.subscribe(TOPIC_LAMP_TIDUR);
      mqtt.subscribe(TOPIC_LAMP_DAPUR);
      mqtt.subscribe(TOPIC_GERBANG);
    } else {
      Serial.printf(" failed (rc=%d), retry in 5s\n", mqtt.state());
      delay(5000);
    }
  }
}

// ─────────────────────────────────────────────
// SETUP & LOOP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // PWM setup for lamps
  ledcSetup(CH_TERAS,  PWM_FREQ, PWM_RES); ledcAttachPin(PIN_LAMP_TERAS,  CH_TERAS);
  ledcSetup(CH_TAMU,   PWM_FREQ, PWM_RES); ledcAttachPin(PIN_LAMP_TAMU,   CH_TAMU);
  ledcSetup(CH_TIDUR,  PWM_FREQ, PWM_RES); ledcAttachPin(PIN_LAMP_TIDUR,  CH_TIDUR);
  ledcSetup(CH_DAPUR,  PWM_FREQ, PWM_RES); ledcAttachPin(PIN_LAMP_DAPUR,  CH_DAPUR);

  // Servo
  gateServo.attach(PIN_GATE_SERVO, 500, 2400);
  gateServo.write(0); // start closed

  // DHT
  dht.begin();

  // Network
  connectWifi();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
}

void loop() {
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();

  // Publish temperature every TEMP_INTERVAL
  unsigned long now = millis();
  if (now - lastTempPublish >= TEMP_INTERVAL) {
    lastTempPublish = now;
    float temp = dht.readTemperature();
    if (!isnan(temp)) {
      String payload = String(temp, 1);
      mqtt.publish(TOPIC_SUHU, payload.c_str(), true);
      Serial.printf("[Temp] %s°C\n", payload.c_str());
    }
  }
}
