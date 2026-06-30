<?php
declare(strict_types=1);

/** Best-effort MQTT publish via mosquitto_pub (optional on server). */
function mqtt_publish_json(string $topic, array $payload, bool $retain = true): void
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return;
    }

    $host = trim((string) (getenv('MQTT_BROKER_HOST') ?: '127.0.0.1'));
    $port = (int) (getenv('MQTT_BROKER_PORT') ?: '1883');
    $user = trim((string) (getenv('MQTT_BROKER_USER') ?: ''));
    $pass = (string) (getenv('MQTT_BROKER_PASS') ?: '');

    $pub = '';
    if (PHP_OS_FAMILY === 'Windows') {
        $where = @shell_exec('where mosquitto_pub 2>nul');
        if (is_string($where)) {
            $pub = trim(explode("\n", $where)[0] ?? '');
        }
    } else {
        $pub = trim((string) (@shell_exec('command -v mosquitto_pub 2>/dev/null') ?: ''));
    }
    if ($pub === '') {
        return;
    }

    $auth = '';
    if ($user !== '') {
        $auth = ' -u ' . escapeshellarg($user) . ' -P ' . escapeshellarg($pass);
    }
    $retainFlag = $retain ? ' -r' : '';
    $cmd = sprintf(
        '%s -h %s -p %d%s%s -t %s -m %s',
        escapeshellarg($pub),
        escapeshellarg($host),
        $port,
        $auth,
        $retainFlag,
        escapeshellarg($topic),
        escapeshellarg($json),
    );
    @exec($cmd);
}
