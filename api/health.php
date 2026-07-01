<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/log_lib.php';
require_once __DIR__ . '/env.php';

load_dotenv_if_present(dirname(__DIR__));

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = dirname(__DIR__);
$dataDir = nanoportal_data_dir($root);
$stateFile = $dataDir . DIRECTORY_SEPARATOR . 'state.json';

ensure_health_boot_marker($dataDir);

$stateReadable = is_readable($stateFile);
$state = $stateReadable ? load_state($stateFile) : default_state();
$stateRev = (int) ($state['_rev'] ?? 0);

$dataDirWritable = is_dir($dataDir) && is_writable($dataDir);
if ($dataDirWritable) {
    $probe = $dataDir . DIRECTORY_SEPARATOR . '.write_probe_' . getmypid();
    $dataDirWritable = @file_put_contents($probe, 'ok') !== false;
    if (is_file($probe)) {
        @unlink($probe);
    }
}

$stateWritable = $stateReadable && is_writable($stateFile);
if (!$stateWritable && $dataDirWritable && !is_file($stateFile)) {
    $stateWritable = true;
}

$lastError = nanoportal_last_log_error($dataDir);
$ttsStatus = 'idle';
$placeholder = $state['audio']['last_placeholder'] ?? null;
if (is_array($placeholder) && isset($placeholder['status'])) {
    $ttsStatus = (string) $placeholder['status'];
}

$checks = [
    'state_readable' => $stateReadable,
    'state_writable' => $stateWritable,
    'state_rev' => $stateRev,
    'data_dir_writable' => $dataDirWritable,
    'elevenlabs_key_set' => trim((string) (getenv('ELEVENLABS_API_KEY') ?: '')) !== '',
    'tts_status' => $ttsStatus,
    'last_error' => $lastError['msg'] ?? null,
    'last_error_at' => $lastError['at'] ?? null,
    'uptime_seconds' => nanoportal_uptime_seconds($dataDir),
];

$criticalOk = $checks['state_readable'] && $checks['data_dir_writable'];
$ok = $criticalOk;

http_response_code($ok ? 200 : 503);
echo json_encode(['ok' => $ok, 'checks' => $checks], JSON_UNESCAPED_UNICODE);
