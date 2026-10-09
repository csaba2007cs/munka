# Nanoportal — Architektúra (v2)

## Futtatási felületek

| URL | Szerep | Átvitel |
|-----|------|-----------|
| `/admin/` | Operátori tablet | MQTT WebSocket + HTTP-feltöltések |
| `/bigscreen/` | TV-/projektorrétegek | MQTT WebSocket |
| `/smallscreen/` | Kvíz + oldalsó kijelző | MQTT WebSocket |
| `/register/` | Látogatói névregisztráció | Csak HTTP POST |
| `/display/` | Régi elsődleges kijelző | **MQTT** (v2) — egyszeri `GET /api/state.php` induló betöltés |
| `/quiz/` | Régi kvíz-URL | **Átirányítás → `/smallscreen/`** |

## Állapot

- **`data/state.json`** — fájlalapú forrásigazság (PHP flock + `_rev` optimista konkurenciakezelés)
- **MQTT retained topicok** — élő felület a kioszkoknak (`bigscreen/*`, `smallscreen/*`)
- **Node-RED** (opcionális) — MQTT ↔ `POST /api/state.php` híd hardverhez / Mobilmozihoz

## Regisztrációs folyamat

1. Látogatói tablet: `POST /api/register.php` → hozzáfűzi a nevet a `state.json` `pending_registrations[]` tömbjéhez.
2. A szerver retained MQTT **`session/registrations`** üzenetben közzéteszi a teljes várólistát.
3. Az admin felület feliratkozik → a lista 2 másodpercen belül frissül (30 másodpercenkénti HTTP-polling tartalékmegoldással).

## Elavulási tájékoztató

- **`legacy/admin.js`** — v2.0-tól kikerült az éles rendszerből; használd az önálló MQTT-felületet, az **`admin/index.html`** fájlt.
- **`/quiz/`** — v2.0-tól a **`/smallscreen/`** címre irányít át.
- **`display/` polling** — v2.0-tól MQTT-feliratkozás váltotta fel (csak induló GET).

A régi HTTP-polling végpontok (`GET /api/state.php`, SSE `/api/events.php`) a visszamenőleges kompatibilitási időszakban továbbra is elérhetők az eszközök és az integrációs tesztek számára.

## Biztonsági mentések és előzmények

- **`data/snapshots/`** — automatikus JSON az `IDLE` / `RUNNING` / `COMPLETED` átmenetekkor és az `_full_reset` előtt (`PRERESET`).
- **`GET /api/sessions.php`** — az utolsó 10 lezárt munkamenet (admin fejléc).
- Az admin **Munkamenet-előzmények** panelje — böngészés, letöltés, visszaállítás.

Lásd: [DATABASE.md](DATABASE.md).

Lásd még: [MIGRATION.md](MIGRATION.md) és [CHANGELOG.md](CHANGELOG.md).
