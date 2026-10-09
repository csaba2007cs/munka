# Nanoportal — Adattárolás

Fájlalapú perzisztencia (nincs SQL). Eltérő jelzés hiányában minden útvonal a repó gyökeréhez képest értendő.

## Elsődleges állapot: `data/state.json`

A munkamenet, a kvíz, a kijelző, a hardver és a látogatói metaadatok egyetlen forrása.

| Mező | Típus | Leírás |
|-------|------|-------------|
| `status` | string | `IDLE`, `RUNNING`, `PAUSED` vagy `COMPLETED` |
| `current_step` | int | Kvízlépés indexe (1-től számozva) |
| `players` | array | A munkamenethez megerősített `{ id, name }` objektumok |
| `pending_registrations` | array | A `/register/` várólistája az operátori import előtt |
| `quiz_state` | object | Kérdésszöveg, lehetőségek, ellenőrzés, oldalsáv-HUD |
| `display` | object | Régi kijelző médiaadatai + kamera-URL |
| `audio` | object | TTS-várólista és az utoljára aktivált hangklip |
| `hardware` | object | ESP32-/szenzoresemény és eseménynapló |
| `screens` | object | A Mobilmozi nagy-/kis képernyőrétegei |
| `visitors` | array | A bigscreenhez tartozó látogatói fotók és nevek |
| `group_contact` | object | A csoport e-mail-címe / telefonszáma |
| `updated_at` | string | Írásonként beállított ISO 8601 UTC-időbélyeg |
| `_rev` | int | Optimista konkurenciakezelési számláló (küldéskor kötelező a POST-patchekben) |

Az írások a `POST /api/state.php` végponton, flock és atomi átnevezés használatával történnek. Lásd: [ARCHITECTURE.md](ARCHITECTURE.md).

## Pillanatképek: `data/snapshots/`

A teljes állapot automatikus JSON-mentései az életciklus-átmenetekkor.

### Elnevezés

```
state_{LABEL}_{Ymd_His}.json
```

| Címke | Mikor |
|-------|------|
| `IDLE` | Az állapot **IDLE** értékre vált |
| `RUNNING` | Az állapot **RUNNING** értékre vált |
| `COMPLETED` | Az állapot **COMPLETED** értékre vált |
| `PRERESET` | Közvetlenül az `_full_reset` állapottörlése **előtt** |

Példa: `state_COMPLETED_20260629_153012.json`

### Megőrzés

- Alapértelmezés: **30 nap** (`SNAPSHOT_RETENTION_DAYS` a `.env` fájlban)
- Minden új pillanatkép mentése után automatikus ritkítás
- A könyvtár gitignore-olt (futásidejű adatok)

### Munkamenet-előzmények API-ja

`GET /api/sessions.php` (requires `X-Nanoportal-Admin: 1`) legfeljebb a **10** legutóbbi `COMPLETED` pillanatképet adja vissza:

```json
{
  "sessions": [
    {
      "filename": "state_COMPLETED_20260629_153012.json",
      "completed_at": "2026-06-29T15:30:12Z",
      "players": ["Anna", "Béla"],
      "steps_completed": 4,
      "duration_minutes": 47
    }
  ]
}
```

**Időtartam:** az adott `COMPLETED` fájl időbélyege és ugyanabban a könyvtárban található legközelebbi korábbi `RUNNING` pillanatkép közötti percek száma. Ha nincs megfelelő `RUNNING` fájl, az érték null.

**Letöltés:** `GET /api/sessions.php?file=state_COMPLETED_....json`

**Visszaállítás:** az admin betölti a pillanatkép JSON-ját, majd `POST /api/state.php` kérést küld `{ ...snapshot, _rev, _restore_state: true }` törzzsel (admin fejléc + írási token, ha be van állítva).

## Egyéb `data/` fájlok

| Minta | Forrás |
|---------|--------|
| `photobooth_*.jpg` | Operator camera uploads |
| `visitor_*.jpg` | Visitor tablet photos |
| `window_*.jpg` | Window capture for bigscreen |
| `tts_*.mp3` | ElevenLabs generated speech |

Megőrzési korlátok: `MAX_PHOTOBOOTH_FILES`, `MAX_VISITOR_FILES` stb. — lásd a `.env.example` fájlt és a `GET /api/storage.php` végpontot.

## Jövőbeli MariaDB

Az API merge-sémája úgy készült, hogy a `state.json` a kioszkkliensek módosítása nélkül lecserélhető legyen egy adatbázissorra. A pillanatképek exportált sorokká vagy objektumtárolási kulcsokká válhatnának.
