<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'GET required'], JSON_UNESCAPED_UNICODE);
    exit;
}

$limit = 12;
if (isset($_GET['limit'])) {
    $raw = filter_var($_GET['limit'], FILTER_VALIDATE_INT);
    if ($raw !== false && $raw > 0 && $raw <= 50) {
        $limit = $raw;
    }
}

$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dataDir)) {
    echo json_encode(['files' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

$allowed = ['jpg', 'jpeg', 'png', 'webp'];
$entries = [];

foreach (scandir($dataDir) ?: [] as $name) {
    if ($name === '.' || $name === '..') {
        continue;
    }
    if (!str_starts_with($name, 'photobooth_')) {
        continue;
    }
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) {
        continue;
    }
    $full = $dataDir . DIRECTORY_SEPARATOR . $name;
    if (!is_file($full)) {
        continue;
    }
    $mtime = filemtime($full);
    if ($mtime === false) {
        continue;
    }
    $entries[] = [
        'filename' => $name,
        'path' => '/data/' . rawurlencode($name),
        'mtime' => gmdate('c', $mtime),
        'mtime_unix' => $mtime,
    ];
}

usort($entries, static function (array $a, array $b): int {
    return ($b['mtime_unix'] ?? 0) <=> ($a['mtime_unix'] ?? 0);
});

$entries = array_slice($entries, 0, $limit);
foreach ($entries as &$row) {
    unset($row['mtime_unix']);
}
unset($row);

echo json_encode(['files' => $entries], JSON_UNESCAPED_UNICODE);
