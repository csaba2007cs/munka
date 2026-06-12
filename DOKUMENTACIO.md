# Nanoportal — élményszoba vezérlő rendszer

Dokumentáció a helyi webszerveren futó, több képernyős és tablet-es sci-fi escape room (élményszoba) szoftvercsomaghoz. A cél: **egyetlen globális állapot** (`state.json`) valós idejű követése **lapfrissítés nélkül** (SPA + `fetch`).

---

## 1. Cél és architektúra

- **Vezérlő VM:** Ubuntu 24.04 LTS, Apache + PHP, opcionálisan Dockerben Node-RED (MQTT, ESP32, hang, WebSocket).
- **Adat:** első körben fájlalapú — `data/state.json`. Később cserélhető MariaDB-re ugyanazzal az API-felületi logikával.
- **Kliensek:** admin tablet, látogatói regisztráció (`/register/`), quiz érintőkijelző, nagy TV (`display`). Mindegyik ugyanazt az állapotot olvassa/írja a `/api/state.php` (és regisztráció: `/api/register.php`) végponton keresztül.
- ** igények vs. prototípus:** összevető backlog — [docs/roadmap-blaci.md](docs/roadmap-blaci.md).

---

## 2. Könyvtárstruktúra (telepítési cél: `/var/www/html/`)

| Útvonal | Tartalom |
|---------|----------|
| `api/state.php` | Globális állapot **GET** (teljes JSON) és **POST** (részleges egyesítés / merge). |
| `api/register.php` | Látogatói név rögzítése → `pending_registrations` bővítése (`GET` / `POST`). |
| `api/audio.php` | Hangfájlok listázása; utolsó lejátszás rögzítése az állapotban. |
| `api/upload.php` | Photobooth kép feltöltése (`multipart`, mezőnév: `photo`). |
| `api/photobooth-list.php` | Utolsó photobooth feltöltések listája (`GET`, `limit` opcionális, max 50). |
| `data/state.json` | Forrásigazságú állapot. |
| `data/` | Photobooth kimenetek (pl. `photobooth_*.jpg`). |
| `admin/` | Operátori felület + photobooth. |
| `register/` | Látogatói regisztrációs SPA (tablet). |
| `quiz/` | Kutatói terminál / kvíz UI. |
| `display/` | Fő TV: videó, hang, kamera „ablak”. |
| `shared/css/theme.css` | Közös sci-fi téma (CSS változók, gombok). |
| `shared/js/state-sync.js` | Polling + `patch` + `get` segédfüggvény. |
| `shared/assets/audio/` | `.mp3`, `.wav`, `.ogg`, `.m4a` hangok. |
| `shared/assets/video/` | Háttérvideók fájlnevei az állapotból. |
| `shared/assets/images/` | Pl. poszter placeholder. |

A böngészőben használt útvonalak **webgyökérhez** képest abszolútak (`/api/...`, `/shared/...`), ezért a projekt tartalmát a szerver dokumentumgyökerébe kell másolni.

---

## 3. Globális állapotgép (`state.json`)

### 3.1 `status` (játék fázis)

| Érték | Jelentés |
|--------|----------|
| `IDLE` | Nincs futó játék; a quiz zárolt. **MEGSZAKÍTÁS** (admin) ide állít: élmény megszakad, újraindítható. |
| `RUNNING` | Élmény fut; a quiz választhat és validálhat. |
| `PAUSED` | Szünet. |
| `COMPLETED` | Kör lezárva (**LEZÁRÁS** admin gomb). Új körhez RESET / újraindítás szükséges. |

### 3.2 `current_step`

Egész szám **1–4**: aktuális feladat-szakasz a UI-ban (lépésjelző, feliratok).

### 3.3 `players`

Tömb: `{ "id": 1, "name": "..." }`. Az admin névsor mezőjéből menthető.

### 3.3a `pending_registrations`

Látogatói regisztrációból (`POST /api/register.php`) ide kerülnek a nevek: `{ "id", "name", "at" }`. Az admin **Összes névsorba** gombbal `players`-hez fűzi és üríti a várólistát.

### 3.3b `players_confirmed`

Ha `true`, az operátor jelezte, hogy a névsor helyesírásilag rendben van. A **START** ilyenkor azonnal indul; `false` esetén megerősítő dialógus jelenik meg (vagy előbb nyomd meg: **Névsor rendben**).

### 3.4 `quiz_state` (kvíz / terminál)

Fontosabb mezők:

| Mező | Szerep |
|------|--------|
| `hero_title`, `hero_subtitle` | Fejléc nagy cím és alcím. |
| `header_status` | Régi kompatibilitás; ha nincs `hero_subtitle`, ez esik vissza. |
| `task_label` | Pl. `1. FELADAT` (cián kis címke). |
| `question_text` | A nagy kérdés szövege. |
| `question_title` | Régi egybefűzött forma; ha nincs `question_text`, abból is lehet következtetni. |
| `options` | `[{ "id", "label" }, ...]` válaszlehetőségek. |
| `correct_option_id` | A helyes opció `id`-ja. |
| `selected_answer` | Játékos által kiválasztott `id` vagy `null`. |
| `validation` | `idle` \| `correct` \| `incorrect`. |
| `feedback_visible` | Helyes válasz utáni zöld visszajelző megjelenítése. |
| `feedback_instruction` | Extra szöveg a visszajelzőben (pl. UV utasítás). |
| `sidebar_title`, `sidebar_items` | Jobb oldali vizsgafolyamat lista (`done`: kész). |
| `hud_scan_percent` | 0–100, szkennelés sáv. |
| `hud_footer` | Pl. `NP-SYS // MISSION MODULE`. |
| `footer_left` | Lábléc idézet. |

**Választás zárolása:** ha `validation` = `correct` és `feedback_visible` = true, a kvíz felület nem enged új választ a **TOVÁBB** megnyomásáig (gombok tiltva). A `POST /api/state.php` merge után visszaállítja ezt a három mezőt a korábbi értékre, ha valaki csak a `quiz_state`-be küldene új választ — **kivéve**, ha ugyanabban a kérésben változik a `status` vagy a `current_step` (új feladat / lezárás / admin fázisváltás).

### 3.5 `display` (TV nézet)

- `background_audio`, `background_video`: fájlnév a `shared/assets/audio/` és `shared/assets/video/` alatt.
- `camera_feed_url`: MJPEG, WebRTC vagy más stream URL a „külső tér” videóhoz.

### 3.6 `audio`

- `last_triggered`: utolsó hang trigger (`clip`, `url`, `at`).
- `last_placeholder`: ElevenLabs / TTS helyőrző meta (admin gomb).
- `queue`: trigger történet (lista).

### 3.7 `hardware` (ESP32 / Node-RED)

- `last_sensor_event`: utolsó szenzorjel (`device`, `type`, `at`, opcionális `message`).
- `event_log`: legfeljebb **50** bejegyzés — a szerver automatikusan bővíti, ha egy patch tartalmaz érvényes `hardware.last_sensor_event` mezőt (duplikátum szűrés: azonos eszköz + típus + idő).
- `zones`: zóna meta (pl. `zone_a.label`, `zone_a.led` = `on` | `off` | `unknown`) — LED állapot patch-elhető az adminból; nem generál eseménynapló sort.

### 3.7a Mobilmozi v2 — `screens`, `visitors`, `group_contact`

**`screens.big`** (60" Firefox kiosk, `/bigscreen/`):

- `layer`: `window` | `media` | `celebration`
- `window_image`: feltöltött ablakfotó URL (`/data/...`)
- `media`: `{ "video", "audio" }` — fájlnevek a `shared/assets/video/` és `audio/` mappákból
- `celebration`: `{ "template", "duration_sec", "cheer_audio" }` — sablonok: [shared/celebration-templates.json](shared/celebration-templates.json)

**`screens.small`** (21" érintő, `/smallscreen/`):

- `layer`: `idle` | `media` | `quiz`
- `idle_image`: statikus várakozó kép URL
- `media`: ugyanaz a séma, mint a nagy kijelzőn
- `touch_enabled`: kvíz rétegnél a kliens engedélyezi az érintést

**`visitors`**: 2–6 elemű tömb — `{ "id", "nickname", "photo_path" }` (gratulációs carousel).

**`group_contact`**: `{ "email", "phone" }` — opcionális csoport elérhetőség.

A `screens` és `group_contact` kulcsok **rekurzívan** egyesülnek patch-nél (mint a `display`).

MQTT → Node-RED → `state.php` példa topicok:

| Topic | Példa payload |
|-------|----------------|
| `mobilmozi/screen/big/layer` | `{ "screens": { "big": { "layer": "celebration" } } }` |
| `mobilmozi/screen/small/layer` | `{ "screens": { "small": { "layer": "quiz" } } }` |
| `mobilmozi/show/command` | `{ "status": "RUNNING" }` |

### 3.8 `updated_at`

ISO időbélyeg — minden sikeres `state.php` mentéskor frissül.

---

## 4. HTTP API részletek

### 4.1 `GET /api/state.php`

Visszaadja a teljes egyesített állapot JSON-ként. Gyorsítótár tiltva.

### 4.2 `POST /api/state.php`

Törzs: **JSON objektum**, csak a változó mezők. A szerver **egyesíti** a meglévő állapottal:

- A `quiz_state`, `display`, `audio`, `hardware`, `screens`, `group_contact` kulcsok alatt **rekurzív** egyesítés történik (`array_replace_recursive` jellegű).
- Ha a patch érvényes `hardware.last_sensor_event` objektumot küld, a szerver frissíti az utolsó eseményt és **hozzáfűzi** az `event_log` elejéhez (max. 50).
- A többi kulcs **felülíródik** a küldött értékkel.
- Ha a korábbi állapotban a kvíz **helyes válasza már megjelent** (`quiz_state.feedback_visible` + `validation: "correct"`), a szerver a merge után **megőrzi** a `selected_answer` / `validation` / `feedback_visible` hármasát, hacsak ugyanabban a kérésben nem változik a `status` vagy a `current_step` (normál TOVÁBB / lezárás / admin).

Példa: játék indítása

```json
{ "status": "RUNNING" }
```

**Teljes alaphelyzet (`_full_reset`):** ha a törzs tartalmazza a `"_full_reset": true` mezőt, a szerver **nem** egyesít a meglévő fájllal: betölti a `default_state()` értékeit, elmenti, és a válaszban visszaadja az új állapotot. A `_full_reset` kulcs **nem** kerül bele a `state.json`-ba. Az admin **Alaphelyzet** gombja ezt használja, hogy a mély merge miatt máskülönben megmaradó régi `quiz_state` / `display` / `audio` mezők is törlődjenek.

### 4.3 `GET /api/audio.php`

Visszaadja a `clips` tömböt (`file`, `url`) és egy rövid `placeholder` szöveget, ha üres a mappa.

### 4.4 `POST /api/audio.php`

JSON: `{ "clip": "fájlnév.mp3" }`. Ellenőrzi, hogy a fájl létezik-e a `shared/assets/audio/` mappában; frissíti `audio.last_triggered` és bővíti a `queue`-t; elmenti az állapotot.

### 4.5 `POST /api/upload.php`

- `Content-Type: multipart/form-data`
- Mezőnév: **`photo`**
- Opcionális mező: **`kind`** = `photobooth` | `visitor` | `window` (fájlnév előtag)
- Elfogadott MIME: JPEG, PNG, WebP.
- Válasz: `{ "ok": true, "path": "/data/...", "filename": "..." }`

### 4.6 `GET` / `POST` `/api/register.php`

- **POST** törzs: `{ "name": "..." }` (nem üres, max 120 karakter UTF-8). Hozzáfűzi a `pending_registrations` tömbhöz, elmenti az állapotot. Válasz: `{ "ok": true, "entry": {...}, "pending_registrations": [...] }`.
- **GET**: `{ "pending_registrations": [...] }` — csak a várólista (gyors ellenőrzéshez).

---

## 5. Frontenden: `shared/js/state-sync.js`

- **`createStateSync({ onState, onError, intervalMs, getUrl, postUrl })`**
- **`startPolling()` / `stopPolling()`**: alapértelmezett **500 ms**-os `GET` a `state.php`-ra; minden válasznál `onState(json)`.
- **`get()`**: egyszeri állapot lekérés.
- **`patch(obj)`**: `POST` + JSON törzs; visszaadja az új teljes állapotot; a válasz alapján azonnal meghívódik az `onState` (nem kell várni a következő pollra).

**Lapfrissítés:** nincs űrlap-POST és nincs navigáció — csak `fetch`.

### Node-RED / ESP32 / külső automaták

1. A **`state.php` maradjon a perzisztencia központja** — Node-RED (HTTP Request, MQTT bridge, stb.) tipikusan ide küld **részleges JSON patch**-et ugyanazzal a szerződéssel, mint az admin.
2. Példa törzsek: [hardware/state-patch-examples.json](hardware/state-patch-examples.json) — háttérváltás, `camera_feed_url`, `hardware.last_sensor_event` (napló append automatikus).
3. A kliensek továbbra is **pollolnak**; később opcionális **WebSocket** broadcast ugyanazzal a JSON-nal, ha kell az alacsony késleltetés.

Részletes összefoglaló: [docs/node-red-example.md](docs/node-red-example.md).

- **Importálható flow:** [hardware/node-red/mqtt-to-state.flow.json](hardware/node-red/mqtt-to-state.flow.json) — [README](hardware/node-red/README.md).
- **ESP32 minták:** [hardware/esp32/](hardware/esp32/) (HTTP patch + MQTT publish).
- **Design tokenek:** [docs/design-tokens.md](docs/design-tokens.md), [shared/css/components.css](shared/css/components.css).

---

## 6. Felületek röviden

### 6.1 Quiz (`/quiz/`)

- A `quiz_state` és `status` alapján rajzol: fejléc, lépésjelző, kérdés, gombok, visszajelző, jobb oldali sáv, HUD hullám + szkennelés.
- Helytelen válasz: vizuális visszajelzés; helyes után `TOVÁBB` engedélyezve `RUNNING` mellett.
- A választógombok DOM-ja csak akkor épül újra, ha az állapot **aláírása** változik (kevesebb villanás, jobb érintés).

### 6.2 Admin (`/admin/`) — operátori felület

- **Fejléc:** nagy **állapot sáv** (magyar: Várakozás / Élmény fut / Szünet / Lezárva), lépés és névsor jelzés; fülek: **Irányítás** | **Photobooth** | **Látogatók** | **Képernyők** | **Hardver** (`role="tablist"`).
- **Élmény vezérlése:** Indítás, Szünet, Folytatás — gombok állapot szerint tiltva (pl. Folytatás csak szünetnél). Indítás előtt névsor megerősítés (vagy megerősítő párbeszéd).
- **Névsor:** soronként egy név → `players` mentés; **Névsor rendben** → `players_confirmed: true`.
- **Tablet regisztrációk:** `pending_registrations` lista; **Összes névsorba** / **Várólista törlése** (megerősítéssel).
- **Hangok:** `GET` / `POST` `audio.php`.
- **Haladó** (összecsukható): kamera URL (`display.camera_feed_url`), ElevenLabs helyőrző.
- **Veszélyes műveletek** (külön blokk, megerősítéssel): Megszakítás → `IDLE`, Lezárás → `COMPLETED`, Teljes reset → `POST { "_full_reset": true }`.
- **Visszajelzés:** alsó **toast** siker/hiba (nem `alert()`); kritikus műveletek `confirm()`.
- **Photobooth:** 1. Kamera → 2. Ellenőrzés (előnézet) → 3. Feltöltés; lista: `GET /api/photobooth-list.php`.
- **Hardver:** kapcsolat jelzés (aktív, ha 2 percen belül volt esemény), utolsó esemény, zóna LED badge-ek, görgethető eseménynapló, teszt gombok (mozgás / ajtó / LED), napló törlése.
- **Stílus:** [`admin/admin.css`](admin/admin.css) operátori mód (Rajdhani, nagy érintési célok) — lásd [docs/design-tokens.md](docs/design-tokens.md).

### 6.3 Bigscreen (`/bigscreen/`) — Mobilmozi v2

- Három fullscreen réteg: **ablakfotó**, **videó+hang**, **gratuláció** (látogatói carousel, sablon pozíciók).
- Nincs érintés (`pointer-events: none`). Állapot: `screens.big.layer` (500 ms poll).

### 6.4 Smallscreen (`/smallscreen/`) — Mobilmozi v2

- Rétegek: **idle** (statikus kép), **media**, **quiz** (megosztott [shared/js/quiz-panel.js](shared/js/quiz-panel.js)).
- Érintés csak kvíz rétegen. A régi `/quiz/` párhuzamosan fut.

### 6.5 Display (`/display/`)

- Háttérvideó / hang: `display.background_*` fájlnevek.
- `audio.last_triggered` változásakor **egyszeri** lejátszás (`Audio()`).
- Kamera URL: `display.camera_feed_url`.

### 6.6 Regisztráció (`/register/`)

- Látogatói tablet: név beküldése `POST /api/register.php`-nak; az operátor az admin felületen emeli át a névsorba.

---

## 7. Telepítés és jogosultságok (Apache)

1. Másold a projekt mappáit a webszerver gyökerébe (`/var/www/html/`).
2. A **`data/`** könyvtárnak írhatónak kell lennie a webszerver felhasználója számára (`www-data`), mert ide ír a PHP (`state.json`, fotók).
3. A **`shared/assets/audio/`** és **`video/`** mappákba tegyél tényleges médiafájlokat; a `state.json`-ban szereplő fájlneveknek egyezniük kell.
4. Győződj meg róla, hogy a webszerver **kiszolgálja** a `/data/` alatti képeket is (ha publikus URL kell a feltöltött fotóhoz).

---

## 8. Biztonság (helyi hálózat)

A jelenlegi PHP végpontok **nem** tartalmaznak bejelentkezést: lokális, zárt Wi-Fi-re tervezve. Ha a hálózat kitágul, érdemes:

- Apache auth / VPN / reverse proxy JWT,
- feltöltés méret- és típuskorlát,
- `state.php` írási jogosultság csak megbízható klienseknek (pl. belső IP + token).

---

## 9. Hibakeresés

| Jelenség | Ellenőrizd |
|----------|------------|
| Üres állapot / 500 | `data/` létezik-e, írható-e; `state.json` JSON érvényes-e. |
| Hang nem szól | Fájl a `shared/assets/audio/` alatt van-e; `POST` válasz `playUrl`. |
| Fotó nem tölt fel | `photo` mezőnév; HTTPS vegyes tartalom; böngésző kamera engedély. |
| Quiz nem reagál | `status` legyen `RUNNING`; operátor indította-e a játékot. |

---

## 10. Fájlok és felelősségek (összefoglaló táblázat)

| Fájl | Szerep |
|------|--------|
| `api/state.php` | Állapot olvasás/írás, merge logika. |
| `api/register.php` | Látogatói név → `pending_registrations`. |
| `api/audio.php` | Hanglista + trigger naplózás. |
| `api/upload.php` | Photobooth kép mentés. |
| `api/photobooth-list.php` | Utolsó photobooth fájlok listája (`GET`). |
| `shared/js/state-sync.js` | Közös szinkron kliens. |
| `quiz/quiz.js` | Quiz logika és hullám canvas. |
| `quiz/quiz.css` | Quiz megjelenés, animációk. |
| `admin/admin.js` | Admin + photobooth események. |
| `register/register.js` | Regisztrációs űrlap. |
| `display/display.js` | TV média és egy lövéses hang. |

---

## 11. Önellenőrzés (fejlesztői gép)

A projekt gyökeréből:

```bash
node scripts/self-test.mjs
```

Ellenőrzi a `data/state.json` vázát (kötelező kulcsok), az `api/*.php` fájlok létezését, a `node --check`-et a fő kliens JS fájlokon, és ha a `php` parancs elérhető, a `php -l` szintaxist az API fájlokon. Sikertelen esetén nem nulla kilépési kód.

### 11.1 Helyi előnézet PHP nélkül (Node)

Ha a gépen nincs Apache/PHP (pl. Windows fejlesztői laptop), futtatható egy **Node** fejlesztői szerver, amely kiszolgálja a statikus fájlokat és ugyanazokat az útvonalakat kezeli: `GET`/`POST` `/api/state.php`, `GET`/`POST` `/api/register.php`, `GET`/`POST` `/api/audio.php`, `POST` `/api/upload.php` (a logika a PHP-vel megegyező célú; élesben maradjon az Apache + PHP).

```bash
node scripts/dev-server.mjs
```

Alapértelmezett cím: `http://127.0.0.1:8787/` (átirányít `/admin/`-ra). Más port: `PORT=9000 node scripts/dev-server.mjs` (PowerShell: `$env:PORT=9000; node scripts/dev-server.mjs`).

---

*Utolsó frissítés: a tárolt kódbázis szerint; a `state.json` mezőit az üzemeltető igény szerint bővítheted — a `state.php` merge logikája a beágyazott objektumoknál rekurzív.*
