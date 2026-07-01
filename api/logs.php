<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/log_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_admin_header();

$root = dirname(__DIR__);
$dataDir = nanoportal_data_dir($root);
$lines = read_log_lines($dataDir, 50);

echo json_encode(['lines' => $lines], JSON_UNESCAPED_UNICODE);
