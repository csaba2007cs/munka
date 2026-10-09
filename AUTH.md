# Nanoportal — Hitelesítési modell

Ez a dokumentum azt ismerteti, hogyan hitelesítik magukat az operátori, kioszk- és látogatói kliensek a közös helyi hálózaton működő Nanoportal-rendszerben.

## Rétegek

| Réteg | Mechanizmus | Védett elem |
|-------|-----------|----------|
| Operátori felület | HTTP Basic Auth (`admin/.htaccess` + `.htpasswd`) | `/admin/` HTML/JS-erőforrások |
| API-írások | Közös titkos fejléc | `POST` a `state.php`, `upload.php`, `audio.php` végpontokra |
| Teljes alaphelyzet | Admin fejléc + írási token | `_full_reset: true` a `state.php` végponton |
| MQTT | Felhasználónév/jelszó (Mosquitto) | WebSocket `:9001` és natív `:1883` |
| Regisztráció | Szándékosan nyitott | `POST /api/register.php` — látogatói önregisztráció |

## API-írási token

A repó gyökerében lévő `.env` fájlban állítsd be:

```env
NANOPORTAL_API_TOKEN=your-long-random-secret
```

Ha **üres vagy nincs beállítva**, az írási végpontok **nyitott LAN-módban** maradnak (a helyi fejlesztéssel való visszamenőleges kompatibilitás miatt).

Ha **be van állítva**, minden védett `POST` kérésnek tartalmaznia kell:

```http
X-Nanoportal-Token: <same value as NANOPORTAL_API_TOKEN>
```

A szerver a `hash_equals()` függvénnyel hasonlítja össze (időzítésbiztosan).

### Csak admin által végezhető műveletek

A `{ "_full_reset": true }` törzzsel küldött `POST /api/state.php` ezen felül megköveteli:

```http
X-Nanoportal-Admin: 1
```

A kvíz-, kijelző- és regisztrációs kliensek soha nem küldik ezt a fejlécet, ezért még az API-token esetleges megszerzésekor sem tudják törölni a játékállapotot.

### Klienskonfiguráció

**Operator (`/admin/`)**

1. Jelentkezz be HTTP Basic Auth-tal (böngészős hitelesítési ablakkal).
2. Kattints a **TOKEN?** gombra, és illeszd be a `NANOPORTAL_API_TOKEN` értékét (a rendszer a `nanoportal.api.token` `localStorage`-kulcsban tárolja).
3. Az admin által küldött patchek automatikusan elküldik az `X-Nanoportal-Admin: 1` fejlécet.

**Quiz / display kiosks**

Ha a `NANOPORTAL_API_TOKEN` be van állítva, minden megbízható kioszknak rendelkeznie kell a tokennel a `localStorage`-ban (`nanoportal.api.token`), mielőtt kvízválaszokat vagy kijelzőfrissítéseket küld. Megbízhatatlan látogatói eszközök (például a `/register/` oldalt megnyitó telefonok) **ne kapják meg** ezt a tokent.

**Node-RED bridge**

Add hozzá a HTTP Request node fejléceihez:

```json
{ "X-Nanoportal-Token": "<token>" }
```

Az `_full_reset` műveletet hívó munkamenet-visszaállítási folyamatokhoz add hozzá az `"X-Nanoportal-Admin": "1"` fejlécet is.

## MQTT-hitelesítő adatok

A Mosquittónak éles környezetben el kell utasítania a névtelen klienseket (`allow_anonymous false` — lásd: `hardware/mosquitto/mosquitto.conf.example`).

A böngészők az MQTT.js-en keresztül, a `localStorage`-ban tárolt felhasználónévvel és jelszóval csatlakoznak:

- `nanoportal.mqtt.user`
- `nanoportal.mqtt.password`

Az operátori panelen a **MQTT AUTH?** gombbal állítható be (a **BROKER?** gombbal azonos módon).

A bigscreen- és smallscreen-kioszkokon is előre be kell állítani ugyanezeket a hitelesítő adatokat, ha a broker hitelesítést kér.

## Fenyegetési modell (zárt LAN)

- **A Wi-Fi látogatói** továbbra is használhatják a `/register/` oldalt, és olvashatják a nyilvános állapotot a `GET /api/state.php` végponton.
- **Nem** küldhetnek tetszőleges állapotot, nem tölthetnek fel fájlokat, nem indíthatnak hangot, és nem hajthatnak végre teljes alaphelyzetet API-token nélkül.
- **Nem** nyithatják meg az `/admin/` oldalt Basic Auth hitelesítő adatok nélkül.
- **Nem** iratkozhatnak fel MQTT-topicokra és nem tehetnek közzé MQTT-üzeneteket broker-hitelesítés nélkül.

Egy eszköz elvesztése vagy egy munkamenet lezárása után cseréld le a `NANOPORTAL_API_TOKEN`, a `.htpasswd` és a Mosquitto jelszavait.

## Fejlesztői szerver

Az `scripts/dev-server.mjs` a `.env` fájlból olvassa a `NANOPORTAL_API_TOKEN` értékét, és ugyanezeket az ellenőrzéseket alkalmazza a tükrözött `/api/*.php` útvonalakon.
