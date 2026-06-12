/*
 * Nanoportal — ESP32 MQTT publish minta
 * Üzenet → Mosquitto → Node-RED (mqtt-to-state.flow.json) → state.php
 *
 * Könyvtárak: PubSubClient, ArduinoJson 6.x
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* MQTT_HOST = "192.168.1.10";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_TOPIC = "nanoportal/esp32/zone-a";
const char* DEVICE_ID = "esp32-zone-a";

const unsigned long PUBLISH_INTERVAL_MS = 30000;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

void publishEvent(const char* eventType) {
  if (!mqtt.connected()) {
    Serial.println("MQTT nincs csatlakozva");
    return;
  }

  StaticJsonDocument<192> doc;
  doc["device"] = DEVICE_ID;
  doc["type"] = eventType;

  char payload[128];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  if (mqtt.publish(MQTT_TOPIC, payload, n, false)) {
    Serial.printf("MQTT publish %s: %s\n", MQTT_TOPIC, payload);
  } else {
    Serial.println("MQTT publish sikertelen");
  }
}

void mqttReconnect() {
  while (!mqtt.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("MQTT csatlakozás…");
    String clientId = String("nanoportal-") + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(clientId.c_str())) {
      Serial.println(" OK");
      publishEvent("connected");
    } else {
      Serial.printf(" hiba %d, újra 3s\n", mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println(WiFi.localIP());

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
}

void loop() {
  if (!mqtt.connected()) {
    mqttReconnect();
  }
  mqtt.loop();

  static unsigned long last = 0;
  if (millis() - last >= PUBLISH_INTERVAL_MS) {
    last = millis();
    publishEvent("heartbeat");
  }
}
