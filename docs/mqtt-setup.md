# Nanoportal — MQTT beállítás

A **admin**, **bigscreen** és **smallscreen** oldalak közös MQTT réteget használnak: [`shared/js/mqtt-client.js`](../shared/js/mqtt-client.js) (`NanoportalMqtt`).

## Broker

- **Helyi fejlesztés:** Mosquitto WebSocket `ws://127.0.0.1:9001`
- **Helyszín:** `ws://<vm-hostname>:9001` (ugyanaz a host, ahol Apache fut)
- **Felülírás:** `?broker=ws://192.168.x.x:9001` (mentés: `localStorage` `nanoportal.mqtt.broker`)

Példa Mosquitto konfig: [`hardware/mosquitto/mosquitto.conf.example`](../hardware/mosquitto/mosquitto.conf.example)

```bash
# Minden üzenet figyelése
mosquitto_sub -h 127.0.0.1 -t '#' -v
```

## Könyvtár

Minden oldalon (sorrendben):

```html
<script src="https://unpkg.com/mqtt@5.10.4/dist/mqtt.min.js"></script>
<script src="/shared/js/mqtt-client.js"></script>
```

`NanoportalMqtt.connect({ topics, onMessage, onStatus })` — csatlakozás betöltéskor, `clean: true`, `reconnectPeriod: 3000`.

`NanoportalMqtt.publish(client, topic, payload)` — állapot topicoknál automatikus **`retain: true`**.

## Topic térkép

| Topic | Payload | Ki küldi | Retain |
|-------|---------|----------|--------|
| `session/control` | `start` \| `pause` \| `reset` | admin | nem |
| `session/group_contact` | `{"emails":[],"phones":[]}` | admin | nem |
| `bigscreen/layer` | `photo` \| `video` \| `celebration` | admin | **igen** |
| `bigscreen/photo` | URL vagy base64 | admin | **igen** |
| `bigscreen/video` | videó URL vagy fájlnév | admin | **igen** |
| `bigscreen/video/play` | (üres) | opcionális | nem |
| `bigscreen/video/pause` | (üres) | opcionális | nem |
| `bigscreen/video/reset` | (üres) | opcionális | nem |
| `bigscreen/players` | `[{"photo":"…","name":"…"}, …]` | admin | **igen** |
| `bigscreen/celebration/background` | `crowd_europe` \| `crowd_nyc` | opcionális | **igen** |
| `bigscreen/celebration/cheer` | hang URL | opcionális | **igen** |
| `smallscreen/layer` | `photo` \| `video` \| `quiz` | admin | **igen** |
| `smallscreen/photo` | URL vagy base64 | admin | **igen** |
| `smallscreen/video` | videó URL | admin | **igen** |
| `smallscreen/quiz` | JSON kérdésbank | admin | **igen** |
| `smallscreen/quiz/result` | `{"score":3,"total":4}` | smallscreen | nem |

### Kvíz JSON (`smallscreen/quiz`)

```json
[
  {
    "question": "Melyik a helyes?",
    "answers": [
      { "text": "A válasz", "correct": true },
      { "text": "B válasz", "correct": false }
    ]
  }
]
```

## Oldalanként

| Oldal | Feliratkozás | Küldés |
|-------|--------------|--------|
| [`admin/index.html`](../admin/index.html) | `smallscreen/quiz/result` | session, bigscreen/*, smallscreen/* (lásd fent) |
| [`bigscreen/index.html`](../bigscreen/index.html) | összes `bigscreen/*` topic | — |
| [`smallscreen/index.html`](../smallscreen/index.html) | `smallscreen/layer`, `photo`, `video`, `quiz` | `smallscreen/quiz/result` |

Későn csatlakozó kiosk: a **retained** üzenetek automatikusan megérkeznek feliratkozáskor.

## Példa publish (CLI)

```bash
# Réteg retained módban
mosquitto_pub -h 127.0.0.1 -r -t bigscreen/layer -m photo
mosquitto_pub -h 127.0.0.1 -r -t bigscreen/photo -m "/shared/assets/images/poster_placeholder.svg"

# Parancs (nem retained)
mosquitto_pub -h 127.0.0.1 -t session/control -m start

# Látogatók + kvíz
mosquitto_pub -h 127.0.0.1 -r -t bigscreen/players -m '[{"photo":"/data/a.jpg","name":"ANNA"}]'
mosquitto_pub -h 127.0.0.1 -r -t smallscreen/quiz -m '[{"question":"Teszt?","answers":[{"text":"Igen","correct":true},{"text":"Nem","correct":false}]}]'
mosquitto_pub -h 127.0.0.1 -r -t smallscreen/layer -m quiz
```
