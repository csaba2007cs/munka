<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/env.php';

load_dotenv_if_present(dirname(__DIR__));

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = dirname(__DIR__);
$dataDir = $root . DIRECTORY_SEPARATOR . 'data';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_admin_header();

$file = trim((string) ($_GET['file'] ?? ''));
if ($file !== '') {
    $path = snapshot_file_path($dataDir, $file);
    if ($path === null || !is_readable($path)) {
        http_response_code(404);
        echo json_encode(['error' => 'Snapshot not found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to read snapshot'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $state = json_decode($raw, true);
    if (!is_array($state)) {
        http_response_code(500);
        echo json_encode(['error' => 'Invalid snapshot JSON'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode($state, JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(
    ['sessions' => list_completed_sessions($dataDir, 10)],
    JSON_UNESCAPED_UNICODE,
);
