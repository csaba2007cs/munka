<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/mqtt_notify.php';
require_once __DIR__ . '/sanitize.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = dirname(__DIR__);
$dataDir = $root . DIRECTORY_SEPARATOR . 'data';
$stateFile = $dataDir . DIRECTORY_SEPARATOR . 'state.json';

if (!is_dir($dataDir)) {
    if (!mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot create data directory'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $state = load_state($stateFile);
    $pending = isset($state['pending_registrations']) && is_array($state['pending_registrations'])
        ? $state['pending_registrations']
        : [];
    echo json_encode(['pending_registrations' => $pending], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $body = file_get_contents('php://input');
    $payload = json_decode($body ?: '{}', true);
    if (!is_array($payload) || !isset($payload['name']) || !is_string($payload['name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Expected JSON: {"name":"..."}'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $name = sanitize_person_name($payload['name']);
    if (utf8_len($name) < 1 || utf8_len($name) > 120) {
        http_response_code(400);
        echo json_encode(['error' => 'name must be 1–120 chars'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $row = null;
    $state = modify_state_locked($stateFile, static function (array $state) use ($name, &$row): array {
        if (!isset($state['pending_registrations']) || !is_array($state['pending_registrations'])) {
            $state['pending_registrations'] = [];
        }
        $maxId = 0;
        foreach ($state['pending_registrations'] as $existing) {
            if (is_array($existing) && isset($existing['id'])) {
                $maxId = max($maxId, (int) $existing['id']);
            }
        }
        $row = [
            'id' => $maxId + 1,
            'name' => $name,
            'at' => gmdate('c'),
        ];
        $state['pending_registrations'][] = $row;

        return $state;
    });

    if ($state === null || $row === null) {
        nanoportal_log('error', 'register.php persist failed', ['name' => $name]);
        http_response_code(500);
        echo json_encode(['error' => 'Persist failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    mqtt_publish_json('session/registrations', [
        'pending_registrations' => $state['pending_registrations'],
    ]);

    echo json_encode([
        'ok' => true,
        'entry' => $row,
        'pending_registrations' => $state['pending_registrations'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
