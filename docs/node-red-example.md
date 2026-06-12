# Node-RED és külső eszközök

A `state.php` a **kanonikus állapot** forrása. A Node-RED (vagy más lokális szolgáltatás) tipikusan **HTTP Request** node-dal küld `POST`-ot ugyanarra az URL-re, mint az admin böngésző:

- URL: `http://<szerver>/api/state.php`
- Fejléc: `Content-Type: application/json`
- Törzs: tetszőleges **részleges** JSON, ugyanazzal a merge szabállyal, mint a [DOKUMENTACIO.md](../DOKUMENTACIO.md) 4.2 fejezetben.

Példa törzsek fájlban: [../hardware/state-patch-examples.json](../hardware/state-patch-examples.json).

## Importálható flow (repo)

**Fájl:** [../hardware/node-red/mqtt-to-state.flow.json](../hardware/node-red/mqtt-to-state.flow.json)

Telepítés és `STATE_URL`: [../hardware/node-red/README.md](../hardware/node-red/README.md).

Rövid lánc: **MQTT in** (`nanoportal/esp32/#`) → **Function** (patch + HTTP fejlécek) → **HTTP request** (`POST` → `state.php`) → **debug**.

## Egyéni flow (vázlat)

1. **Inject** vagy **MQTT in** (ESP32 üzenet) → **Function** (építs JSON patch-et) → **HTTP Request** (method POST, URL a fenti).
2. Opcionális: **http in** + **http response** ha a VM felől szeretnél belső webhookot; a kliensek továbbra is pollolnak, vagy később WebSocket broadcast.

## Megjegyzések

- Ne írj közvetlenül a `state.json`-ba konkurens folyamatok mellett — használd a PHP API-t, hogy a merge és az `updated_at` konzisztens maradjon.
- Rate limit és auth helyi hálózaton kívül: lásd DOKUMENTACIO „Biztonság” fejezet.
