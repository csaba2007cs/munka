# Nanoportal — Data storage

File-backed persistence (no SQL). All paths relative to repo root unless noted.

## Primary state: `data/state.json`

Single source of truth for session, quiz, display, hardware, and visitor metadata.

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `IDLE`, `RUNNING`, `PAUSED`, or `COMPLETED` |
| `current_step` | int | Quiz step index (1-based) |
| `players` | array | `{ id, name }` objects confirmed for the session |
| `pending_registrations` | array | Queue from `/register/` before operator import |
| `quiz_state` | object | Question text, options, validation, sidebar HUD |
| `display` | object | Legacy display media + camera URL |
| `audio` | object | TTS queue and last triggered clip |
| `hardware` | object | ESP32 / sensor last event + event log |
| `screens` | object | Mobilmozi big/small screen layers |
| `visitors` | array | Visitor photos and names for bigscreen |
| `group_contact` | object | Email / phone for the group |
| `updated_at` | string | ISO 8601 UTC, set on every write |
| `_rev` | int | Optimistic concurrency counter (required on POST patches when sent) |

Writes go through `POST /api/state.php` with flock + atomic rename. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Snapshots: `data/snapshots/`

Automatic JSON backups of full state at lifecycle transitions.

### Naming

```
state_{LABEL}_{Ymd_His}.json
```

| Label | When |
|-------|------|
| `IDLE` | Status transitions **to** IDLE |
| `RUNNING` | Status transitions **to** RUNNING |
| `COMPLETED` | Status transitions **to** COMPLETED |
| `PRERESET` | Immediately **before** `_full_reset` wipes state |

Example: `state_COMPLETED_20260629_153012.json`

### Retention

- Default: **30 days** (`SNAPSHOT_RETENTION_DAYS` in `.env`)
- Pruned automatically after each new snapshot save
- Directory is gitignored (runtime data)

### Session history API

`GET /api/sessions.php` (requires `X-Nanoportal-Admin: 1`) returns up to **10** most recent `COMPLETED` snapshots:

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

**Duration:** minutes between this `COMPLETED` file timestamp and the nearest earlier `RUNNING` snapshot in the same directory. Null if no matching `RUNNING` file exists.

**Download:** `GET /api/sessions.php?file=state_COMPLETED_....json`

**Restore:** Admin loads snapshot JSON and `POST /api/state.php` with `{ ...snapshot, _rev, _restore_state: true }` (admin header + write token when configured).

## Other `data/` files

| Pattern | Source |
|---------|--------|
| `photobooth_*.jpg` | Operator camera uploads |
| `visitor_*.jpg` | Visitor tablet photos |
| `window_*.jpg` | Window capture for bigscreen |
| `tts_*.mp3` | ElevenLabs generated speech |

Retention limits: `MAX_PHOTOBOOTH_FILES`, `MAX_VISITOR_FILES`, etc. — see `.env.example` and `GET /api/storage.php`.

## Future: MariaDB

The API merge shape is designed so `state.json` can be replaced by a DB row without changing kiosk clients. Snapshots would become export rows or object-storage keys.
