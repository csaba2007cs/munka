# Nanoportal — Architecture (v2)

## Runtime surfaces

| URL | Role | Transport |
|-----|------|-----------|
| `/admin/` | Operator tablet | MQTT WebSocket + HTTP uploads |
| `/bigscreen/` | TV / projector layers | MQTT WebSocket |
| `/smallscreen/` | Quiz + side display | MQTT WebSocket |
| `/register/` | Visitor name signup | HTTP POST only |
| `/display/` | Legacy primary display | **MQTT** (v2) — one-shot `GET /api/state.php` bootstrap |
| `/quiz/` | Legacy quiz URL | **Redirect → `/smallscreen/`** |

## State

- **`data/state.json`** — file-backed source of truth (PHP flock + `_rev` optimistic concurrency)
- **MQTT retained topics** — live UI for kiosks (`bigscreen/*`, `smallscreen/*`)
- **Node-RED** (optional) — bridges MQTT ↔ `POST /api/state.php` for hardware / Mobilmozi

## Registration flow

1. Visitor tablet: `POST /api/register.php` → appends `pending_registrations[]` in `state.json`
2. Server publishes retained MQTT **`session/registrations`** with full pending list
3. Operator admin subscribes → list updates in < 2 s (HTTP poll fallback every 30 s)

## Deprecation Notice

- **`legacy/admin.js`** — removed from production in v2.0; use **`admin/index.html`** (self-contained MQTT UI)
- **`/quiz/`** — redirects to **`/smallscreen/`** as of v2.0
- **`display/` polling** — replaced with MQTT subscription in v2.0 (bootstrap GET only)

Legacy HTTP polling endpoints (`GET /api/state.php`, SSE `/api/events.php`) remain during the backward-compat window for tooling and integration tests.

## Backups & history

- **`data/snapshots/`** — automatic JSON on `IDLE` / `RUNNING` / `COMPLETED` transitions and before `_full_reset` (`PRERESET`)
- **`GET /api/sessions.php`** — last 10 completed sessions (admin header)
- Admin **Munkamenet-előzmények** panel — browse, download, restore

See [DATABASE.md](DATABASE.md).

See [MIGRATION.md](MIGRATION.md) and [CHANGELOG.md](CHANGELOG.md).
