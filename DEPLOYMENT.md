# Nanoportal — Telepítési ellenőrzőlista

Éles telepítés Apache + PHP + Mosquitto környezetben. Az útvonalakat igazítsd a szerver elrendezéséhez.

## 1. Környezeti változók

Másold az `.env.example` fájlt `.env` néven a szerverre (a giten kívül):

```bash
cp .env.example .env
```

Legalább az alábbiakat állítsd be:

```env
NANOPORTAL_API_TOKEN=<openssl rand -hex 32>
ELEVENLABS_API_KEY=...   # optional TTS
```

Győződj meg róla, hogy a PHP betölti az `.env` fájlt — az `api/env.php` minden kérésnél a repó gyökerében lévő fájlt olvassa. Alternatívaként állítsd be a `NANOPORTAL_API_TOKEN` értékét az Apache `SetEnv` direktívájában vagy a php-fpm pool-konfigurációjában.

## 2. Operátori Basic Auth (`/admin/`)

Hozd létre a jelszófájlt (az Apache abszolút útvonalat igényel):

```bash
sudo htpasswd -c /var/www/html/admin/.htpasswd operator
```

Az `admin/.htpasswd` gitignore-olt fájl — soha ne commitold.

Módosítsd az `admin/.htaccess` fájlt, ha eltér a dokumentumgyökér:

```apache
AuthUserFile /var/www/html/admin/.htpasswd
```

Telepítés után a `/admin/` megnyitásakor a böngészőnek bejelentkezési ablakot kell megjelenítenie. A fejléc **TOKEN?** gombjával tárold a `NANOPORTAL_API_TOKEN` értékét a böngészőben (lásd: [AUTH.md](AUTH.md)).

## 3. Fájljogosultságok

```bash
chown -R www-data:www-data data/
chmod 755 data/
mkdir -p data/snapshots
chmod 755 data/snapshots
chmod 644 data/state.json   # after first run
```

## 4. Mosquitto (MQTT)

Másold a `hardware/mosquitto/mosquitto.conf.example` fájlt `/etc/mosquitto/conf.d/nanoportal.conf` néven.

Hozd létre a broker hitelesítő adatait:

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd admin
sudo systemctl restart mosquitto
```

Ellenőrizd, hogy a névtelen hozzáférés **tiltva van**, és a `:9001` WebSocket elfogadja az új felhasználót.

Minden kioszk- és adminböngészőben állítsd be a broker URL-jét (**BROKER?**) és hitelesítő adatait (**MQTT AUTH?**).

### 4.1 Videofolyamat

Videobájtokat soha nem szabad MQTT-n közzétenni. Az MQTT csak a videó
fájlnevét és a lejátszási parancsokat továbbítja. A Mosquitto
`hardware/mosquitto/mosquitto.conf.example` ezt brokeroldalon is kikényszeríti:

```conf
message_size_limit 65536
max_packet_size 131072
```

Telepítsd az FFmpeget, majd futtasd a feldolgozó scriptet a szerveren:

```bash
sudo apt-get install ffmpeg
mkdir -p shared/assets/video/incoming shared/assets/video
scripts/media-ingest.sh --watch
```

Másolj bármilyen, FFmpeg által olvasható videóformátumot a
`shared/assets/video/incoming/`. A script böngészőben lejátszható MP4-et
hoz létre a `shared/assets/video/` könyvtárban H.264 High, `yuv420p`, sztereó
AAC, CRF 18 és `+faststart` beállítással. A meglévő H.264-videót videó-újrakódolás nélkül másolja.
A 4 GiB-nál nagyobb bemeneteket a rendszer elutasítja.

Az elkészült fájlok tartalomból származtatott utótagot kapnak, például
`intro-a1b2c3d4e5f6.mp4`. Ne cserélj le már közzétett fájlnevet; az új fájlnevet tedd közzé a
`bigscreen/video` topicon, így a változtathatatlan böngészőgyorsítótár biztonságos marad.

Egyszeri importáláshoz a figyelő mód helyett:

```bash
scripts/media-ingest.sh --once
```

A script ellenőrzi, hogy az MP4 `moov` atomja az első 4 KiB-en belül van-e,
mielőtt az eredményt a kiszolgált videókönyvtárba helyezi. Állítsd be az
Apache-ot, hogy engedélyezze a HTTP Range-kéréseket a
`/shared/assets/video/` útvonalon; a böngészőknek a nagy fájlok megbízható
pozicionálásához szükségük van a Range támogatására.

Ubuntu Apache esetén telepítsd a
`hardware/apache/nanoportal-video.conf.example` as
`/etc/apache2/conf-available/nanoportal-media.conf`, then enable it:

```bash
sudo a2enmod headers mime
sudo a2enconf nanoportal-media
sudo apachectl configtest
sudo systemctl reload apache2
```

Ez a részlet engedélyezi a `sendfile` használatát, letiltja az `MMAP`-ot ehhez
a média könyvtárhoz, regisztrálja a videó MIME-típusait, letiltja a gzipet a
videókhoz, kikapcsolja a könyvtárindexeket, felülírás nélkül engedélyezi a
közvetlen hozzáférést, és változtathatatlan gyorsítótárazást alkalmaz. Ellenőrizd a telepített fájlt:

```bash
curl -I http://host/shared/assets/video/intro.mp4
curl -H "Range: bytes=0-1023" -i http://host/shared/assets/video/intro.mp4
```

A válasznak tartalmaznia kell a `Content-Length` és `Accept-Ranges: bytes`
fejléceket; a Range-kérésnek `206 Partial Content` választ kell adnia.

Firefox-kioszk esetén állítsd be ezeket az értékeket az `about:config` oldalon vagy a `user.js` fájlban:

```text
media.hardware-video-decoding.enabled = true
media.ffmpeg.vaapi.enabled = true
layers.acceleration.force-enabled = true
gfx.webrender.software = false
```

Tiltsd le az asztali képernyővédőt és a munkamenet tétlenségi időkorlátját.
A videórétegben ne használj `backdrop-filter`-t, animált árnyékokat vagy
átlátszó canvaseket. Hardveres gyorsítással indítsd a kioszkot, és helyi URL-t használj:

```bash
firefox --kiosk --new-instance \
  --disable-features=WebRtcHideLocalIpsWithMdns \
  http://127.0.0.1/bigscreen/
```

A visszaállítási oldal a `bigscreen/index-v3.html`, amely a 3. fázis tesztelése
előtti oldal pontos másolata. Az új oldal ideiglenes megkerüléséhez irányítsd
a kioszk URL-jét a `/bigscreen/index-v3.html` címre.

### 4.2 Automatikus videóátmenet

Az operátor a `bigscreen/video/next` retained MQTT-topicon egyetlen következő,
tartalom-hash alapú fájlnevet állíthat be. Az üres payload törli a beállítást.
A bigscreen böngésző a `video.duration - video.currentTime` értéket figyeli,
és körülbelül 10 másodperccel a tényleges vég előtt egyszer közzéteszi az
`ending_soon` eseményt. Szüneteltetés, keresés és pufferelés nem indít
falióra-alapú előrejelzést.

Az átmenetet pontosan egy kijelölt példány végezze:

```text
http://127.0.0.1/bigscreen/?videoOwner=1
```

Az események a `bigscreen/video/events` topicon jelennek meg QoS 1-gyel,
de nem retained üzenetként:

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 \
  -t 'bigscreen/video/events' \
  -q 1 -v
```

Sikeres átmenet után a bigscreen a következő fájlnevet retained
`bigscreen/video` állapotként közzéteszi, majd törli a retained
`bigscreen/video/next` értéket. Minden esemény `eventId` és `playbackId`
azonosítót tartalmaz; a QoS 1 miatt a fogyasztóknak kezelniük kell az esetleges
duplikált kézbesítést.

## 5. Node-RED-híd

Állítsd be a `STATE_URL` környezeti változót (például:
`http://127.0.0.1/api/state.php`).

Az összes POST-node-hoz add hozzá az alábbi HTTP Request-fejléceket:

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `X-Nanoportal-Token` | same as `.env` |

## 6. Füstteszt

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

Elvárt eredmény: `401`, `200`, `403`.

## 7. Helyi fejlesztés (Node)

```bash
# .env with optional NANOPORTAL_API_TOKEN
node scripts/dev-server.mjs
```

Ugyanezek a token-szabályok érvényesek a `http://127.0.0.1:8787/api/*.php` útvonalakra is.

## 8. A 3. fázis átvételi ellenőrzései

A csak böngészőben elvégezhető ellenőrzéseket a célként használt Firefox-kioszkon
kell futtatni. A hibakereső réteg alapértelmezés szerint ki van kapcsolva, és
MQTT-n kapcsolható:

```text
Topic:   bigscreen/debug/video-quality
Payload: on | off | toggle
```

Az overlay a
`video.getVideoPlaybackQuality()`.

Tesztmédiát csak elegendő lemezterülettel és FFmpeggel rendelkező gépen generálj:

```bash
ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30 \
  -f lavfi -i sine=frequency=440 -t 21600 \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac \
  -movflags +faststart test-4gb.mp4
```

Telepítés után futtasd a `node scripts/self-test.mjs` parancsot. A 4 GiB-os
indulási idő, a 200 üzenetes terhelés, a kétórás tartósteszt, a retained
visszajátszás és a Firefox-dekóder ellenőrzése valódi kioszkot, brokert,
Apache-ot és generált médiát igényel; ezek a szolgáltatások és hardver nélkül
ebben a Windows-checkoutban nem reprodukálhatók érvényesen.

## 9. A 4. fázis üzemeltetési megerősítése

Futtasd az éles füsttesztet a telepített Nanoportal gyökeréből. Ellenőrzi a
direct Apache delivery, `Content-Length`, `Accept-Ranges`, `Content-Type`,
HTTP `206` range behavior, and a retained QoS 1 MQTT message:

```bash
BASE_URL=http://127.0.0.1 \
VIDEO_FILE=intro-a1b2c3d4e5f6.mp4 \
MQTT_HOST=127.0.0.1 MQTT_PORT=1883 MQTT_USER=user1 MQTT_PASS='...' \
scripts/production-smoke-test.sh
```

A script ideiglenes retained füstteszt-payloadot tesz közzé. A teszt után
töröld, ha a topic éles állapotot tartalmaz:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -u user1 -P '...' \
  -r -t bigscreen/video -n
```

A generált médiához `.manifest.txt` fájl tartozik a forrás- és kimeneti
SHA-256-hashekkel, az FFmpeg verziójával, az átalakítás módjával, a paraméterekkel
és UTC-időbélyeggel. A kiadás jóváhagyásakor tekintsd át. A tisztítás
előnézetéhez, majd alkalmazásához:

```bash
scripts/media-prune.sh shared/assets/video 3
scripts/media-prune.sh --apply shared/assets/video 3
```

Az aktív és az esetleges visszaállítási fájlnevet tartsd a ritkítási hatókörön
kívül, vagy tartsd meg őket úgy, hogy a legújabb `KEEP_COUNT` fájlok között
legyenek. Ritkítást csak annak ellenőrzése után ütemezz, hogy az MQTT-n retained
`bigscreen/video` érték már nem hivatkozik régebbi fájlra.

Lásd még: [AUTH.md](AUTH.md) és [DOKUMENTACIO.md](DOKUMENTACIO.md).
