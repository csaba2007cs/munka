# Migration guide — v1 polling → v2 MQTT

## Operator admin

**Before:** [`legacy/admin.js`](legacy/admin.js) + HTTP polling via `state-sync.js`

**Now:** Open **`/admin/`** only ([`admin/index.html`](admin/index.html))

1. Configure **BROKER?**, **MQTT AUTH?**, and **TOKEN?** in the header (same LAN as Mosquitto).
2. HTTP Basic Auth on `/admin/` (see [DEPLOYMENT.md](DEPLOYMENT.md)).
3. Pending visitor names appear under **Függő regisztrációk** via MQTT `session/registrations`.

The files in `legacy/` are kept for reference — do not load them in production.

## Quiz terminal

**Before:** `/quiz/` with HTTP state polling

**Now:** Point physical devices to **`/smallscreen/`**

`/quiz/` redirects automatically. Update bookmarks and kiosk startup URLs.

## Primary display (`/display/`)

**Before:** Polled `GET /api/state.php` / SSE every 500 ms

**Now:**

- One **`GET /api/state.php`** on load (camera URL + initial media)
- Live updates via MQTT: `bigscreen/video`, `bigscreen/layer`, `session/control`

Ensure the display machine has MQTT broker URL/credentials (query param `?broker=ws://…` or localStorage via operator setup).

## Visitor registration

No change for visitor tablets — still **`/register/`** + `POST /api/register.php`.

Operators see new names on the MQTT admin within ~2 seconds. Requires:

- Mosquitto running with auth (see `hardware/mosquitto/mosquitto.conf.example`)
- Optional: `mosquitto_pub` on the PHP host, or dev-server for local preview

Environment (`.env`):

```env
MQTT_BROKER_HOST=127.0.0.1
MQTT_BROKER_PORT=1883
MQTT_BROKER_USER=admin
MQTT_BROKER_PASS=...
```

## Node-RED

Existing `mqtt-to-state.flow.json` still bridges sensor/MQTT patches to `state.php`.

Registration MQTT is published **directly from `register.php`** — no Node-RED change required. You may add a flow to mirror or log `session/registrations` if needed.

## Backward compatibility window

These remain available for integrations and tests:

- `GET /api/state.php` (with ETag / 304)
- `GET /api/events.php` (SSE)
- `POST /api/register.php`

Polling-based UIs are deprecated and will be removed in a future release.
