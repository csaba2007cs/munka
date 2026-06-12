# ESP32 — Nanoportal állapot patch

Két minta: **közvetlen HTTP** a `state.php` felé, vagy **MQTT** publish (Node-RED flow fogadja).

Patch példák: [../state-patch-examples.json](../state-patch-examples.json).

## 1. Közvetlen HTTP — `state_patch_http.ino`

1. Arduino IDE vagy PlatformIO — ESP32 board support telepítve.
2. Szerkeszd a WiFi és `STATE_URL` konstansokat a `.ino` fájl tetején.
3. Feltöltés, soros monitor: sikeres válasz esetén HTTP 200 + JSON.

**STATE_URL példák:**

| Környezet | URL |
|-----------|-----|
| Apache VM | `http://192.168.x.x/api/state.php` |
| Node dev server | `http://192.168.x.x:8787/api/state.php` |

A kérés törzse például:

```json
{
  "hardware": {
    "last_sensor_event": {
      "device": "esp32-zone-a",
      "type": "motion",
      "at": "2026-05-17T12:00:00Z"
    }
  }
}
```

A szerver (`state.php`) az érvényes `last_sensor_event` patch után automatikusan bővíti a `hardware.event_log` tömböt (max. 50 sor). Az operátor az admin **Hardver** fülön látja az utolsó jelet és a naplót.

## 2. MQTT → Node-RED — `mqtt_publish.ino`

1. Állítsd be a WiFi-t, MQTT broker címet, topicot (`nanoportal/esp32/zone-a`).
2. Futtasd a [../node-red/mqtt-to-state.flow.json](../node-red/mqtt-to-state.flow.json) importált flow-t.
3. Az ESP32 JSON-t publishol; a Node-RED POST-olja a `state.php`-nak.

## Könyvtárak (Arduino IDE)

- **HTTP minta:** WiFi (beépített), HTTPClient (beépített), ArduinoJson (Library Manager: *ArduinoJson* by Benoit Blanchon, v6+)
- **MQTT minta:** WiFi, PubSubClient (Library Manager: *PubSubClient* by Nick O'Leary), ArduinoJson

## Biztonság

A `state.php` jelenleg **nem** védett jelszóval — csak megbízható LAN-on használd. Részletek: [DOKUMENTACIO.md](../../DOKUMENTACIO.md) biztonság fejezet.
