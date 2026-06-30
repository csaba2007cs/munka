# Nanoportal — Authentication model

This document describes how operator, kiosk, and visitor clients authenticate against the Nanoportal stack on a shared LAN.

## Layers

| Layer | Mechanism | Protects |
|-------|-----------|----------|
| Operator UI | HTTP Basic Auth (`admin/.htaccess` + `.htpasswd`) | `/admin/` HTML/JS assets |
| API writes | Shared secret header | `POST` to `state.php`, `upload.php`, `audio.php` |
| Full reset | Admin header + write token | `_full_reset: true` on `state.php` |
| MQTT | Username/password (Mosquitto) | WebSocket `:9001` and native `:1883` |
| Registration | Open (by design) | `POST /api/register.php` — visitor self-signup |

## API write token

Set in repo-root `.env`:

```env
NANOPORTAL_API_TOKEN=your-long-random-secret
```

When **empty or unset**, write endpoints stay in **open LAN mode** (backward compatible for local dev).

When **set**, every protected `POST` must include:

```http
X-Nanoportal-Token: <same value as NANOPORTAL_API_TOKEN>
```

The server compares with `hash_equals()` (timing-safe).

### Admin-only operations

`POST /api/state.php` with `{ "_full_reset": true }` additionally requires:

```http
X-Nanoportal-Admin: 1
```

Quiz, display, and register clients never send this header, so they cannot wipe game state even if they somehow obtain the API token.

### Client configuration

**Operator (`/admin/`)**

1. Log in via HTTP Basic Auth (browser challenge).
2. Click **TOKEN?** and paste the same value as `NANOPORTAL_API_TOKEN` (stored in `localStorage` key `nanoportal.api.token`).
3. Admin patches automatically send `X-Nanoportal-Admin: 1`.

**Quiz / display kiosks**

If `NANOPORTAL_API_TOKEN` is configured, each trusted kiosk must have the token in `localStorage` (`nanoportal.api.token`) before posting quiz answers or display updates. Untrusted visitor devices (e.g. phones on `/register/`) should **not** receive this token.

**Node-RED bridge**

Add to the HTTP Request node headers:

```json
{ "X-Nanoportal-Token": "<token>" }
```

For session reset flows that call `_full_reset`, also add `"X-Nanoportal-Admin": "1"`.

## MQTT credentials

Mosquitto must reject anonymous clients in production (`allow_anonymous false` — see `hardware/mosquitto/mosquitto.conf.example`).

Browsers connect via MQTT.js with username/password from `localStorage`:

- `nanoportal.mqtt.user`
- `nanoportal.mqtt.password`

Configure on the operator panel with **MQTT AUTH?** (same pattern as **BROKER?**).

Bigscreen/smallscreen kiosks need the same credentials pre-provisioned on each device if the broker requires auth.

## Threat model (closed LAN)

- **Visitors on Wi-Fi** can still use `/register/` and read public state via `GET /api/state.php`.
- They **cannot** post arbitrary state, upload files, trigger audio, or full-reset without the API token.
- They **cannot** open `/admin/` without Basic Auth credentials.
- They **cannot** subscribe/publish MQTT without broker credentials.

Rotate `NANOPORTAL_API_TOKEN`, `.htpasswd`, and Mosquitto passwords if a device is lost or a session ends.

## Dev server

`scripts/dev-server.mjs` reads `NANOPORTAL_API_TOKEN` from `.env` and applies the same checks on mirrored `/api/*.php` routes.
