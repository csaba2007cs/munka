<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/env.php';

load_dotenv_if_present(dirname(__DIR__));

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
    $state = load_state($stateFile);
    $etag = send_state_get_headers($state);
    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        exit;
    }
    echo json_encode($state, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    require_write_token();

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
        require_admin_header();

        $fresh = modify_state_locked($stateFile, static function (array $current) use ($patch): array {
            $conflict = check_patch_rev($current, $patch);
            if ($conflict !== null) {
                return $conflict;
            }

            return default_state();
        });
        if (is_state_conflict($fresh)) {
            http_response_code(409);
            echo json_encode(
                ['error' => 'conflict', 'current_rev' => $fresh['current_rev']],
                JSON_UNESCAPED_UNICODE,
            );
            exit;
        }
        if ($fresh === null) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to persist state'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        echo json_encode($fresh, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $merged = modify_state_locked($stateFile, static function (array $current) use ($patch): array {
        $conflict = check_patch_rev($current, $patch);
        if ($conflict !== null) {
            return $conflict;
        }
        $clean = strip_rev_from_patch($patch);
        $merged = merge_state($current, $clean);
        $merged = apply_quiz_answer_lock($current, $clean, $merged);

        return apply_hardware_event_log($merged, $clean);
    });

    if (is_state_conflict($merged)) {
        http_response_code(409);
        echo json_encode(
            ['error' => 'conflict', 'current_rev' => $merged['current_rev']],
            JSON_UNESCAPED_UNICODE,
        );
        exit;
    }
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
