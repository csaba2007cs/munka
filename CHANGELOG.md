# Változásnapló

## v2.0 (folyamatban)

### Hozzáadva

- Bigscreen videóátmeneti értesítések: lejátszási pozíció alapú `ending_soon`,
  automatikus `switched` átmenet, hibajelzés és következő videó kezelése
- `bigscreen/video/next` retained konfiguráció és
  `bigscreen/video/events` nem retained eseménytopic
- MQTT-központú **`/display/`** — feliratkozik a `bigscreen/video`, `bigscreen/layer`, `session/control` topicokra
- **`session/registrations`** MQTT-topic — minden `/api/register.php` POST után közzétéve
- Függő regisztrációk panelje az **`admin/index.html`** oldalon
- Tárolási megőrzés + **`GET /api/storage.php`**
- Állapot-pillanatképek a `data/snapshots/` könyvtárban az életciklus-átmenetekkor + **`GET /api/sessions.php`**
- Admin **Munkamenet-előzmények** — pillanatképek letöltése / visszaállítása

### Módosítva

- **`/quiz/`** → végleges átirányítás a **`/smallscreen/`** címre
- Látogatói admin-szinkronizálás MQTT-n, kizárólag a 4 másodperces HTTP-polling helyett

### Eltávolítva / áthelyezve

- **`admin/admin.js`** + **`admin/admin.css`** → **`legacy/`** (csak hivatkozási célra)

### Elavulási tájékoztató

- `legacy/admin.js` — v2.0-ban eltávolítva, használd az `admin/index.html` fájlt
- `quiz/` — v2.0-tól átirányít a `smallscreen/` címre
- `display/` polling — v2.0-ban MQTT-feliratkozás váltotta fel

## v1.x

- Kettős verem: HTTP-polling (`state-sync.js`) + korai MQTT-kioszkok
- Régi operátori felület az `admin/admin.js` fájlban
