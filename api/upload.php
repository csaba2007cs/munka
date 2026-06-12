<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST required'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing file field "photo"'], JSON_UNESCAPED_UNICODE);
    exit;
}

$file = $_FILES['photo'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'Upload error'], JSON_UNESCAPED_UNICODE);
    exit;
}

$tmp = $file['tmp_name'] ?? '';
if (!is_string($tmp) || !is_uploaded_file($tmp)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid upload'], JSON_UNESCAPED_UNICODE);
    exit;
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmp);
$map = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];
if (!isset($map[$mime])) {
    http_response_code(415);
    echo json_encode(['error' => 'Unsupported image type'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ext = $map[$mime];
$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
    http_response_code(500);
    echo json_encode(['error' => 'Cannot write data directory'], JSON_UNESCAPED_UNICODE);
    exit;
}

$kind = isset($_POST['kind']) ? (string) $_POST['kind'] : 'photobooth';
$prefixMap = [
    'photobooth' => 'photobooth',
    'visitor' => 'visitor',
    'window' => 'window',
];
$prefix = $prefixMap[$kind] ?? 'photobooth';
$name = $prefix . '_' . gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$dest = $dataDir . DIRECTORY_SEPARATOR . $name;

if (!move_uploaded_file($tmp, $dest)) {
    http_response_code(500);
    echo json_encode(['error' => 'Save failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$publicPath = '/data/' . rawurlencode($name);
$mtime = filemtime($dest);
echo json_encode([
    'ok' => true,
    'path' => $publicPath,
    'filename' => $name,
    'mtime' => $mtime !== false ? gmdate('c', $mtime) : null,
], JSON_UNESCAPED_UNICODE);
