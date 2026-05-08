/**
 * Smart Home Rendang — firmware/cam_module.ino
 * 
 * Hardware : AI Thinker ESP32-CAM
 * Purpose  : MJPEG stream server + broadcast its IP via MQTT
 * 
 * Board    : "AI Thinker ESP32-CAM" in Arduino IDE
 * Library  : ESP32 board package by Espressif (includes camera drivers)
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include "esp_http_server.h"
#include "config.h"

// AI Thinker camera pin definition
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

WiFiClient   espClient;
PubSubClient mqtt(espClient);

// ─────────────────────────────────────────────
// CAMERA INIT
// ─────────────────────────────────────────────
void initCamera() {
  camera_config_t config;
  config.ledc_channel  = LEDC_CHANNEL_0;
  config.ledc_timer    = LEDC_TIMER_0;
  config.pin_d0        = Y2_GPIO_NUM;
  config.pin_d1        = Y3_GPIO_NUM;
  config.pin_d2        = Y4_GPIO_NUM;
  config.pin_d3        = Y5_GPIO_NUM;
  config.pin_d4        = Y6_GPIO_NUM;
  config.pin_d5        = Y7_GPIO_NUM;
  config.pin_d6        = Y8_GPIO_NUM;
  config.pin_d7        = Y9_GPIO_NUM;
  config.pin_xclk      = XCLK_GPIO_NUM;
  config.pin_pclk      = PCLK_GPIO_NUM;
  config.pin_vsync     = VSYNC_GPIO_NUM;
  config.pin_href      = HREF_GPIO_NUM;
  config.pin_sscb_sda  = SIOD_GPIO_NUM;
  config.pin_sscb_scl  = SIOC_GPIO_NUM;
  config.pin_pwdn      = PWDN_GPIO_NUM;
  config.pin_reset     = RESET_GPIO_NUM;
  config.xclk_freq_hz  = 20000000;
  config.pixel_format  = PIXFORMAT_JPEG;
  config.frame_size    = FRAMESIZE_VGA;
  config.jpeg_quality  = 12;
  config.fb_count      = 2;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] Init failed: 0x%x\n", err);
    ESP.restart();
  }
  Serial.println("[CAM] Init OK");
}

// ─────────────────────────────────────────────
// MJPEG STREAM HANDLER
// ─────────────────────────────────────────────
#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE =
  "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART =
  "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

esp_err_t stream_handler(httpd_req_t* req) {
  httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  char part_buf[64];

  while (true) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) continue;

    httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    size_t hlen = snprintf(part_buf, sizeof(part_buf), _STREAM_PART, fb->len);
    httpd_resp_send_chunk(req, part_buf, hlen);
    httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
  }
  return ESP_OK;
}

void startStreamServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;
  httpd_handle_t server = NULL;

  if (httpd_start(&server, &config) == ESP_OK) {
    httpd_uri_t stream_uri = {
      .uri      = "/stream",
      .method   = HTTP_GET,
      .handler  = stream_handler,
      .user_ctx = NULL
    };
    httpd_register_uri_handler(server, &stream_uri);
    Serial.println("[CAM] Stream server started on port 81");
  }
}

// ─────────────────────────────────────────────
// MQTT — broadcast IP
// ─────────────────────────────────────────────
void broadcastIP() {
  String ip = WiFi.localIP().toString();
  mqtt.publish(TOPIC_IPCAM, ip.c_str(), true); // retained
  Serial.printf("[MQTT] IP broadcast: %s\n", ip.c_str());
}

// ─────────────────────────────────────────────
// SETUP & LOOP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  initCamera();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());

  startStreamServer();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  if (mqtt.connect("ESP32-CAM-Rendang")) {
    broadcastIP();
  }
}

void loop() {
  if (!mqtt.connected()) {
    if (mqtt.connect("ESP32-CAM-Rendang")) broadcastIP();
  }
  mqtt.loop();
  delay(100);
}
