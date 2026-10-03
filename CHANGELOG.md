# Changelog

## v2.0 (in progress)

### Added

- MQTT-first **`/display/`** — subscribes to `bigscreen/video`, `bigscreen/layer`, `session/control`
- **`session/registrations`** MQTT topic — pushed after each `/api/register.php` POST
- Pending registrations panel in **`admin/index.html`**
- Storage retention + **`GET /api/storage.php`**
- State snapshots in **`data/snapshots/`** on lifecycle transitions + **`GET /api/sessions.php`**
- Admin **Munkamenet-előzmények** — download / restore snapshots

### Changed

- **`/quiz/`** → permanent redirect to **`/smallscreen/`**
- Visitor admin sync via MQTT instead of 4 s HTTP poll only

### Removed / relocated

- **`admin/admin.js`** + **`admin/admin.css`** → **`legacy/`** (reference only)

### Deprecation Notice

- `legacy/admin.js` — removed in v2.0, use `admin/index.html`
- `quiz/` — redirect to `smallscreen/` as of v2.0
- `display/` polling — replaced with MQTT subscription in v2.0

## v1.x

- Dual stack: HTTP polling (`state-sync.js`) + early MQTT kiosks
- Legacy operator UI in `admin/admin.js`
