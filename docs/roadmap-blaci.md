# Nanoportal ütemterv

Ez a dokumentum a Nanoportal-prototípus telepítésközpontú feladatait követi.

## Elkészült

- Megosztott PHP-állapot-API validálással és optimista revízió-ellenőrzésekkel.
- MQTT-admin- és kioszkkliens.
- Közvetlen Apache-videokiszolgálás bájttartományokkal és változtathatatlan,
  tartalom-hashelt fájlnevekkel.
- FFmpeg-feldolgozás, kiadási manifestek, füsttesztek és korlátozott médiatisztítás.

## Telepítést követő feladatok

- Futtasd az `scripts/production-smoke-test.sh` parancsot az Ubuntu-gépen.
- Futtasd le a Firefox-kioszk kétórás lejátszási és retained-állapot-visszaállítási tesztjét.
- Rögzítsd a telepített videómanifestet, valamint az Apache- és Mosquitto-verziókat
  a kiadási ellenőrzőlistában.
