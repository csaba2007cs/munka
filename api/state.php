<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

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
    echo json_encode(load_state($stateFile), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $body = file_get_contents('php://input');
    if ($body === false || $body === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Empty body'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $patch = json_decode($body, true);
    if (!is_array($patch)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!empty($patch['_full_reset'])) {
        $fresh = modify_state_locked($stateFile, static fn (): array => default_state());
        if ($fresh === null) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to persist state'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        echo json_encode($fresh, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $merged = modify_state_locked($stateFile, static function (array $current) use ($patch): array {
        $merged = merge_state($current, $patch);
        $merged = apply_quiz_answer_lock($current, $patch, $merged);

        return apply_hardware_event_log($merged, $patch);
    });

    if ($merged === null) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to persist state'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode($merged, JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
