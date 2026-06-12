<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = dirname(__DIR__);
$stateFile = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'state.json';

function utf8_len(string $s): int
{
    if (function_exists('mb_strlen')) {
        return (int) mb_strlen($s, 'UTF-8');
    }

    return strlen($s);
}

function load_state(string $path): array
{
    if (!is_readable($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function save_state(string $path, array $state): bool
{
    $state['updated_at'] = gmdate('c');
    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        return false;
    }
    return rename($tmp, $path);
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

    $state = load_state($stateFile);
    if ($state === [] || !isset($state['status'])) {
        http_response_code(500);
        echo json_encode(['error' => 'State file unavailable — check data/state.json'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!isset($state['pending_registrations']) || !is_array($state['pending_registrations'])) {
        $state['pending_registrations'] = [];
    }

    $maxId = 0;
    foreach ($state['pending_registrations'] as $row) {
        if (is_array($row) && isset($row['id'])) {
            $maxId = max($maxId, (int) $row['id']);
        }
    }

    $row = [
        'id' => $maxId + 1,
        'name' => $name,
        'at' => gmdate('c'),
    ];
    $state['pending_registrations'][] = $row;

    if (!save_state($stateFile, $state)) {
        http_response_code(500);
        echo json_encode(['error' => 'Persist failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['ok' => true, 'entry' => $row, 'pending_registrations' => $state['pending_registrations']], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
