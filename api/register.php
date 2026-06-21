<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';

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

function utf8_len(string $s): int
{
    if (function_exists('mb_strlen')) {
        return (int) mb_strlen($s, 'UTF-8');
    }

    return strlen($s);
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

    $name = trim($payload['name']);
    if ($name === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Name must not be empty'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (utf8_len($name) > 120) {
        http_response_code(400);
        echo json_encode(['error' => 'Name too long (max 120)'], JSON_UNESCAPED_UNICODE);
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
        http_response_code(500);
        echo json_encode(['error' => 'Persist failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'ok' => true,
        'entry' => $row,
        'pending_registrations' => $state['pending_registrations'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
