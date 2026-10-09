# Migrációs útmutató — v1 polling → v2 MQTT

## Operátori admin

**Korábban:** [`legacy/admin.js`](legacy/admin.js) + HTTP-polling a `state-sync.js` használatával

**Most:** csak a **`/admin/`** oldalt nyisd meg ([`admin/index.html`](admin/index.html)).

1. Állítsd be a fejlécben a **BROKER?**, **MQTT AUTH?** és **TOKEN?** értékét (a Mosquittóval azonos LAN-on).
2. A `/admin/` oldalt HTTP Basic Auth védi (lásd: [DEPLOYMENT.md](DEPLOYMENT.md)).
3. A függő látogatói nevek MQTT-n, a `session/registrations` topicban jelennek meg a **Függő regisztrációk** alatt.

A `legacy/` könyvtár fájljai csak hivatkozási célból maradnak meg — élesben ne töltsd be őket.

## Kvízterminál

**Korábban:** `/quiz/` HTTP-állapot-pollinggal

**Most:** a fizikai eszközöket a **`/smallscreen/`** címre irányítsd.

`/quiz/` automatikusan átirányít. Frissítsd a könyvjelzőket és a kioszk indítási URL-jeit.

## Elsődleges kijelző (`/display/`)

**Korábban:** a `GET /api/state.php` / SSE lekérdezése 500 ms-onként

**Most:**

- Egyetlen **`GET /api/state.php`** betöltéskor (kamera-URL + kezdeti média)
- Élő frissítések MQTT-n: `bigscreen/video`, `bigscreen/layer`, `session/control`

Gondoskodj róla, hogy a kijelző gépén be legyen állítva az MQTT-broker URL-je és hitelesítése (a `?broker=ws://…` lekérdezési paraméterrel vagy az operátori beállításon keresztüli localStorage-értékkel).

## Látogatói regisztráció

A látogatói tabletek esetén nincs változás — továbbra is **`/register/`** +
`POST /api/register.php`.

Az operátorok az új neveket körülbelül 2 másodpercen belül látják az MQTT-adminban. Ehhez szükséges:

- Hitelesítéssel futó Mosquitto (lásd: `hardware/mosquitto/mosquitto.conf.example`)
- Opcionálisan `mosquitto_pub` a PHP-gépen, vagy fejlesztői szerver helyi előnézethez

Environment (`.env`):

```env
MQTT_BROKER_HOST=127.0.0.1
MQTT_BROKER_PORT=1883
MQTT_BROKER_USER=admin
MQTT_BROKER_PASS=...
```

## Node-RED

A meglévő `mqtt-to-state.flow.json` továbbra is a szenzor-/MQTT-patcheket köti össze a `state.php` végponttal.

A regisztrációs MQTT-üzenetet a rendszer **közvetlenül a `register.php` fájlból** teszi közzé — nincs szükség Node-RED-módosításra. Szükség esetén hozzáadhatsz flow-t a `session/registrations` tükrözéséhez vagy naplózásához.

## Visszamenőleges kompatibilitási időszak

Az integrációk és tesztek számára ezek továbbra is elérhetők:

- `GET /api/state.php` (ETag / 304 használatával)
- `GET /api/events.php` (SSE)
- `POST /api/register.php`

A pollingalapú felületek elavultak, és egy későbbi kiadásban eltávolítjuk őket.
