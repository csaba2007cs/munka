# Nanoportal MQTT-beállítása

A böngészős kioszkok WebSocketen, a `9001`-es porton csatlakoznak a Mosquittóhoz.
A szerveroldali eszközök és CLI-eszközök a `1883`-as porton, MQTT TCP-n kommunikálnak.

## Broker

A példakonfigurációt telepítsd `/etc/mosquitto/conf.d/nanoportal.conf` néven.
Letiltja a névtelen hozzáférést, és korlátozza az MQTT-payloadok méretét, hogy
videóbájtokat ne lehessen MQTT-n keresztül küldeni:

```conf
listener 1883
allow_anonymous false
password_file /etc/mosquitto/passwd

listener 9001
protocol websockets
allow_anonymous false
password_file /etc/mosquitto/passwd

message_size_limit 65536
max_packet_size 131072
```

A videófájlokat az Apache szolgálja ki a `shared/assets/video/` könyvtárból.
Az MQTT csak fájlneveket, rétegállapotot és lejátszási parancsokat továbbít.

## Topicok

Az állapottopicok QoS 1-et és retained üzeneteket használnak:

```text
bigscreen/layer
bigscreen/video
bigscreen/photo
bigscreen/players
smallscreen/layer
smallscreen/video
smallscreen/photo
smallscreen/quiz
```

A pillanatnyi parancsok QoS 0-t használnak, és nem retained üzenetek:

```text
bigscreen/video/play
bigscreen/video/pause
bigscreen/video/reset
session/control
```

Példa:

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -u user1 -P 'PASSWORD' \
  -q 1 -r -t bigscreen/video -m intro-a1b2c3d4e5f6.mp4
mosquitto_pub -h 127.0.0.1 -p 1883 -u user1 -P 'PASSWORD' \
  -t bigscreen/video/play -m play
```

A pontos helyi ellenőrző parancsokat és eredményeket a
`DOKUMENTACIO.md`.
