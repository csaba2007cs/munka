# Nanoportal — Deployment checklist

Production deploy on Apache + PHP + Mosquitto. Adjust paths to match your server layout.

## 1. Environment variables

Copy `.env.example` to `.env` on the server (outside git):

```bash
cp .env.example .env
```

Set at minimum:

```env
NANOPORTAL_API_TOKEN=<openssl rand -hex 32>
ELEVENLABS_API_KEY=...   # optional TTS
```

Ensure PHP loads `.env` — `api/env.php` reads the repo-root file on each request. Alternatively set `NANOPORTAL_API_TOKEN` in Apache `SetEnv` or php-fpm pool config.

## 2. Operator Basic Auth (`/admin/`)

Generate the password file (absolute path required by Apache):

```bash
sudo htpasswd -c /var/www/html/admin/.htpasswd operator
```

`admin/.htpasswd` is gitignored — never commit it.

Edit `admin/.htaccess` if your document root differs:

```apache
AuthUserFile /var/www/html/admin/.htpasswd
```

After deploy, visiting `/admin/` must show a browser login dialog. Use the **TOKEN?** button in the header to store `NANOPORTAL_API_TOKEN` in the browser (see [AUTH.md](AUTH.md)).

## 3. File permissions

```bash
chown -R www-data:www-data data/
chmod 755 data/
chmod 644 data/state.json   # after first run
```

## 4. Mosquitto (MQTT)

Copy `hardware/mosquitto/mosquitto.conf.example` to `/etc/mosquitto/conf.d/nanoportal.conf`.

Create broker credentials:

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd admin
sudo systemctl restart mosquitto
```

Verify anonymous access is **denied** and WebSocket `:9001` accepts the new user.

On each kiosk/admin browser, set broker URL (**BROKER?**) and credentials (**MQTT AUTH?**).

## 5. Node-RED bridge

Set environment variable `STATE_URL` (e.g. `http://127.0.0.1/api/state.php`).

Add HTTP Request headers for all POST nodes:

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `X-Nanoportal-Token` | same as `.env` |

## 6. Smoke test

```bash
# Should 401 when token is configured
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost/api/state.php \
  -H "Content-Type: application/json" -d '{"status":"IDLE"}'

# Should 200 with token
curl -s -X POST http://localhost/api/state.php \
  -H "Content-Type: application/json" \
  -H "X-Nanoportal-Token: YOUR_TOKEN" \
  -d '{"status":"IDLE"}'

# Full reset should 403 without admin header
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost/api/state.php \
  -H "Content-Type: application/json" \
  -H "X-Nanoportal-Token: YOUR_TOKEN" \
  -d '{"_full_reset":true}'
```

Expected: `401`, `200`, `403`.

## 7. Local dev (Node)

```bash
# .env with optional NANOPORTAL_API_TOKEN
node scripts/dev-server.mjs
```

Same token rules apply to `http://127.0.0.1:8787/api/*.php`.

See also [AUTH.md](AUTH.md) and [DOKUMENTACIO.md](DOKUMENTACIO.md).
