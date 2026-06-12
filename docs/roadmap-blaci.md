# BLACi levél — igény vs. jelen prototípus

Összefoglaló a megrendelői e-mail (élményszoba, VM + konténerek, operátori tablet, TV-k, ESP32, stb.) és a repo jelenlegi állapota között. Cél: egyértelmű **hatókör** és **ütemezhető** következő lépések.

| Terület | Állapot | Megjegyzés |
|--------|---------|------------|
| JSON állapot (`state.json`), lapfrissítés nélküli sync | **Kész** | `shared/js/state-sync.js`, polling + POST merge |
| Apache + PHP API helyszínen | **Kész** (repo) | Telepítés: dokumentáció szerinti másolás `/var/www/html/` |
| Ubuntu 24 VM + konténeres futtatás | **Ops / üzem** | A kód nem függ tőle; a VM a helyszínen áll |
| Node-RED konténer | **Kész** (repo) | Import: [hardware/node-red/mqtt-to-state.flow.json](../hardware/node-red/mqtt-to-state.flow.json) |
| ESP32 / LED / szenzor | **Kész** (repo) | [hardware/esp32/](../hardware/esp32/), Node-RED flow; admin **Hardver** fül: napló + teszt patch |
| Atlas design / pixel-perfect UI | **Részben** | Token skála: `theme.css`, `components.css`, [docs/design-tokens.md](design-tokens.md); referencia kép TBD |
| „Asztali app” érzet, nincs oldalújratöltős POST | **Részben** | SPA-szerű `fetch`; teljes routing/UX polish opcionális |
| Admin: élmény indítás, szünet, folytatás, leállítás, reset | **Részben** | `admin/` — STOP → IDLE, LEZÁRÁS → COMPLETED, hang trigger; részletek: fő dokumentáció |
| Előre rögzített hangok lejátszása | **Kész** | `api/audio.php` + `shared/assets/audio/` |
| ElevenLabs / egyedi szinkronhang | **Későbbi kör** | A levél szerint 2. kör; `audio.last_placeholder` helyőrző |
| Regisztráció + névsor + operátori névjavítás | **Kész** | `register/`, `pending_registrations`, `players`, `players_confirmed` |
| Kvíz / terminál UX (zárolás, COMPLETED) | **Kész** | `quiz/quiz.js` + `api/state.php` `apply_quiz_answer_lock`; önellenőrzés: `scripts/self-test.mjs` |
| Photobooth (önkéntes fotó, jóváhagyás) | **Kész** | Előnézet, újrafotó, confirm feltöltés, `api/photobooth-list.php` |
| Tablet kamera → nagy TV „ablak” | **Részben** | `display.camera_feed_url` állapotmező + display oldal; stream típus helyszínfüggő |
| MariaDB / MySQL | **Nincs** | Opcionális később; most fájlalapú állapot |
| Oklevél / merchandise | **Nincs** | Hardver/nyomtatás a projekt másik ága |

## Következő sprintek (javasolt priorizálás)

1. ~~**Kvíz / terminál UX**~~ — **Kész** (helyes válasz zárolás, COMPLETED, szerver merge lock).
2. ~~**Photobooth**~~ — **Kész** (előnézet, újrafotó, lista).
3. ~~**Atlas UI**~~ — **Részben kész** (token + komponensek; kvíz CSS teljes tokenesítés később).
4. ~~**Node-RED**~~ — **Kész** (`hardware/node-red/`).
5. ~~**ESP32**~~ — **Kész** (`hardware/esp32/`).

A fő technikai dokumentáció: [DOKUMENTACIO.md](../DOKUMENTACIO.md).
