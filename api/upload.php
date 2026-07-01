<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/env.php';
require_once __DIR__ . '/storage_lib.php';

load_dotenv_if_present(dirname(__DIR__));

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST required'], JSON_UNESCAPED_UNICODE);
    exit;
}

require_write_token();

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

// Magic-byte MIME detection — client Content-Type is not trusted.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmp);
$map = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/heic' => 'heic',
    'image/heif' => 'heif',
];
if (!is_string($mime) || !isset($map[$mime])) {
    http_response_code(415);
    echo json_encode(
        ['error' => 'unsupported image type: ' . (is_string($mime) ? $mime : 'unknown')],
        JSON_UNESCAPED_UNICODE,
    );
    exit;
}

$max_size = 10 * 1024 * 1024;
if (($file['size'] ?? 0) > $max_size) {
    http_response_code(413);
    echo json_encode(['error' => 'File too large (max 10MB)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ext = $map[$mime];
$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
    api_json_error(500, 'Cannot write data directory');
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
    api_json_error(500, 'Upload save failed', ['filename' => $name]);
}

if (in_array($mime, ['image/heic', 'image/heif'], true)) {
    $jpg_path = preg_replace('/\.heic$/i', '.jpg', $dest);
    if ($jpg_path === $dest) {
        $jpg_path = preg_replace('/\.heif$/i', '.jpg', $dest);
    }
    $convert = shell_exec('which convert');
    if (is_string($convert) && trim($convert) !== '') {
        shell_exec('convert ' . escapeshellarg($dest) . ' ' . escapeshellarg($jpg_path));
        if (is_file($jpg_path)) {
            unlink($dest);
            $dest = $jpg_path;
            $name = basename($jpg_path);
            $ext = 'jpg';
        }
    }
}

$publicPath = '/data/' . rawurlencode($name);
$mtime = filemtime($dest);
prune_old_uploads($dataDir, $prefix, max_upload_files_for_kind($kind));
echo json_encode([
    'ok' => true,
    'path' => $publicPath,
    'filename' => $name,
    'mtime' => $mtime !== false ? gmdate('c', $mtime) : null,
], JSON_UNESCAPED_UNICODE);
