# Node-RED — Nanoportal MQTT → state.php

## Import

1. Nyisd meg a Node-RED szerkesztőt (helyi VM / Docker konténer).
2. Menü → **Import** → **select a file** → `mqtt-to-state.flow.json`.
3. Deploy.

Szükséges node-ok: **node-red-node-mqtt** (MQTT in), **http request** (beépített).

## Broker

A flow egy **mqtt-broker** config node-ot hoz létre: `127.0.0.1:1883`. Ha a Mosquitto más címen fut, szerkeszd a broker node-ot.

A **60" nagy kijelző** (`/bigscreen/`) közvetlenül MQTT-t figyel — nem a `state.php`-n keresztül. WebSocket a böngészőnek: **9001** (lásd [DOKUMENTACIO.md](../../DOKUMENTACIO.md) §6.3). Példa publish:

```bash
mosquitto_pub -h 127.0.0.1 -t bigscreen/layer -m photo
mosquitto_pub -h 127.0.0.1 -t bigscreen/photo -m "/data/photobooth_....jpg"
```

**Topic:** `nanoportal/esp32/#` (MQTT In node).

Példa ESP32 üzenet (JSON):

```json
{ "device": "esp32-zone-a", "type": "motion" }
```

A function node ebből `hardware.last_sensor_event` patch-et épít, lásd [../state-patch-examples.json](../state-patch-examples.json). A napló (`event_log`) a szerveren automatikusan készül — az admin **Hardver** fülön ellenőrizhető.

## STATE_URL

A **Build patch + HTTP opts** function node az `STATE_URL` környezeti változót használja (Node-RED Settings → `functionGlobalContext` / flow env, vagy `settings.js`):

- Alapértelmezés: `http://127.0.0.1/api/state.php`
- Dev szerver (Node): `http://127.0.0.1:8787/api/state.php`
- Apache helyszínen: `http://<vm-ip>/api/state.php`

## Kézi teszt

1. Nyomd meg az **Inject** node-ot („Teszt: motion patch”).
2. A **debug** panelen meg kell jelennie a `state.php` válaszának (`status`, `updated_at`, …).

## curl ekvivalens

```bash
curl -s -X POST "http://127.0.0.1/api/state.php" \
  -H "Content-Type: application/json" \
  -d '{"hardware":{"last_sensor_event":{"device":"curl","type":"test","at":"2026-05-17T12:00:00Z"}}}'
```

Ne írj közvetlenül a `data/state.json` fájlba — használd mindig a PHP API-t.
