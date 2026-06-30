<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';

@set_time_limit(0);

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-store');
header('X-Accel-Buffering: no');
header('Connection: keep-alive');

$root = dirname(__DIR__);
$stateFile = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'state.json';

$lastEventId = trim((string) ($_SERVER['HTTP_LAST_EVENT_ID'] ?? ''));
$lastRev = $lastEventId !== '' ? (int) $lastEventId : (int) ($_GET['rev'] ?? 0);
$keepaliveTicks = 0;

while (!connection_aborted()) {
    $state = load_state($stateFile);
    $rev = (int) ($state['_rev'] ?? 0);
    if ($rev > $lastRev) {
        $lastRev = $rev;
        $keepaliveTicks = 0;
        echo 'id: ' . $rev . "\n";
        echo 'data: ' . json_encode($state, JSON_UNESCAPED_UNICODE) . "\n\n";
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    } else {
        ++$keepaliveTicks;
        if ($keepaliveTicks >= 25) {
            echo ": keepalive\n\n";
            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
            $keepaliveTicks = 0;
        }
    }
    usleep(200000);
}
