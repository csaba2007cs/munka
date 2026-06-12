/*
 * Nanoportal — ESP32 HTTP PATCH minta
 * POST részleges JSON → /api/state.php (merge, mint az admin fetch)
 *
 * Könyvtár: ArduinoJson 6.x (Library Manager)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// —— Konfiguráció (szerkeszd) ——
const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* STATE_URL = "http://192.168.1.10/api/state.php";
const char* DEVICE_ID = "esp32-zone-a";

const unsigned long PATCH_INTERVAL_MS = 30000;

void sendStatePatch(const char* eventType) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi nincs csatlakozva");
    return;
  }

  StaticJsonDocument<384> doc;
  JsonObject hw = doc.createNestedObject("hardware");
  JsonObject ev = hw.createNestedObject("last_sensor_event");
  ev["device"] = DEVICE_ID;
  ev["type"] = eventType;

  char iso[28];
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    ev["at"] = iso;
  } else {
    ev["at"] = "unknown";
  }

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("POST %s → HTTP %d\n", STATE_URL, code);
  if (response.length() > 0) {
    Serial.println(response);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Nanoportal ESP32 HTTP patch");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi csatlakozás");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    configTime(0, 0, "pool.ntp.org");
    delay(1500);
    sendStatePatch("boot");
  } else {
    Serial.println("WiFi sikertelen");
  }
}

void loop() {
  static unsigned long last = 0;
  unsigned long now = millis();
  if (now - last >= PATCH_INTERVAL_MS) {
    last = now;
    sendStatePatch("heartbeat");
  }
  delay(50);
}
