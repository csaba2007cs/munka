# Node-RED — Nanoportal MQTT → state.php

## Import

1. Nyisd meg a Node-RED szerkesztőt (helyi VM / Docker konténer).
2. Menü → **Import** → **select a file** → `mqtt-to-state.flow.json`.
3. Deploy.

Szükséges node-ok: **node-red-node-mqtt** (MQTT in), **http request** (beépített).

## Broker

A flow egy **mqtt-broker** config node-ot hoz létre: `127.0.0.1:1883`. Ha a Mosquitto más címen fut, szerkeszd a broker node-ot.

**MQTT képernyők és operátor:** teljes topic térkép és retain szabályok — [docs/mqtt-setup.md](../../docs/mqtt-setup.md). WebSocket a böngészőknek: **9001**.

A **60" nagy kijelző** (`/bigscreen/`) közvetlenül MQTT-t figyel — nem a `state.php`-n keresztül. Példa publish (retained réteg):

```bash
mosquitto_pub -h 127.0.0.1 -r -t bigscreen/layer -m photo
mosquitto_pub -h 127.0.0.1 -t bigscreen/photo -m "/data/photobooth_....jpg"
```

A **21" érintő kiosk** (`/smallscreen/`) szintén közvetlenül MQTT-t figyel (§6.4). Példa:

```bash
mosquitto_pub -h 127.0.0.1 -t smallscreen/quiz -m '[{"question":"Teszt?","answers":[{"text":"Igen","correct":true},{"text":"Nem","correct":false}]}]'
mosquitto_pub -h 127.0.0.1 -t smallscreen/layer -m quiz
mosquitto_pub -h 127.0.0.1 -t smallscreen/photo -m "/shared/assets/images/small-idle.svg"
mosquitto_pub -h 127.0.0.1 -t smallscreen/layer -m photo
```

**Operátor tablet** (`/admin/`) — MQTT publish; a `session/control` üzeneteket a Node-RED flow továbbítja `state.php`-ba (§6.2):

```bash
mosquitto_pub -h 127.0.0.1 -t session/control -m start
mosquitto_pub -h 127.0.0.1 -t session/group_contact -m '{"emails":["csoport@pelda.hu"],"phones":["+36123456789"]}'
mosquitto_pub -h 127.0.0.1 -t bigscreen/layer -m celebration
```

`session/control` → `state.php` (Node-RED `fn_session_control`):

| Payload | state.php patch |
|---------|-----------------|
| `start` | `{ "status": "RUNNING" }` |
| `pause` | `{ "status": "PAUSED" }` |
| `stop` | `{ "status": "IDLE", quiz_state reset }` |
| `complete` | `{ "status": "COMPLETED" }` |
| `reset` | `{ "status": "IDLE", "current_step": 1, quiz_state reset }` |

`session/group_contact` → `{ group_contact: { email, phone } }` (első e-mail / telefon).

Ellenőrzés: `mosquitto_pub … session/control start` után `GET /api/state.php` → `RUNNING`; a `/quiz/` oldal fogad válaszokat.

A kvíz befejezésekor a kiosk `smallscreen/quiz/result` topicra küldi az eredményt (`{"score":…,"total":…}`).

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
