<?php
declare(strict_types=1);

const NANOPORTAL_LOG_MAX_BYTES = 5 * 1024 * 1024;

function nanoportal_data_dir(string $root): string
{
    return $root . DIRECTORY_SEPARATOR . 'data';
}

function nanoportal_log_path(string $dataDir): string
{
    return $dataDir . DIRECTORY_SEPARATOR . 'app.log';
}

function nanoportal_boot_path(string $dataDir): string
{
    return $dataDir . DIRECTORY_SEPARATOR . '.health_boot';
}

function ensure_health_boot_marker(string $dataDir): void
{
    $path = nanoportal_boot_path($dataDir);
    if (is_file($path)) {
        return;
    }
    if (!is_dir($dataDir)) {
        @mkdir($dataDir, 0755, true);
    }
    @file_put_contents($path, gmdate('c'));
}

function nanoportal_uptime_seconds(string $dataDir): int
{
    ensure_health_boot_marker($dataDir);
    $path = nanoportal_boot_path($dataDir);
    if (!is_readable($path)) {
        return 0;
    }
    $raw = trim((string) file_get_contents($path));
    $ts = strtotime($raw);

    return $ts !== false ? max(0, time() - $ts) : 0;
}

function nanoportal_log(string $level, string $message, array $context = []): void
{
    $root = dirname(__DIR__);
    $dataDir = nanoportal_data_dir($root);
    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        error_log('[nanoportal] ' . $level . ': ' . $message);

        return;
    }
    $logPath = nanoportal_log_path($dataDir);
    $entry = [
        'ts' => gmdate('c'),
        'level' => $level,
        'msg' => $message,
        'context' => $context,
    ];
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE);
    if ($line === false) {
        return;
    }
    @file_put_contents($logPath, $line . "\n", FILE_APPEND | LOCK_EX);
    if (is_file($logPath) && filesize($logPath) > NANOPORTAL_LOG_MAX_BYTES) {
        @rename($logPath, $logPath . '.' . gmdate('Ymd_His'));
    }
}

/** @return array{msg: string, at: string}|null */
function nanoportal_last_log_error(string $dataDir): ?array
{
    $lines = read_log_lines($dataDir, 200);
    for ($i = count($lines) - 1; $i >= 0; --$i) {
        $row = $lines[$i];
        if (!is_array($row)) {
            continue;
        }
        if (($row['level'] ?? '') === 'error') {
            return [
                'msg' => (string) ($row['msg'] ?? ''),
                'at' => (string) ($row['ts'] ?? ''),
            ];
        }
    }

    return null;
}

/** @return list<array<string, mixed>> */
function read_log_lines(string $dataDir, int $limit = 50): array
{
    $path = nanoportal_log_path($dataDir);
    if (!is_readable($path)) {
        return [];
    }
    $raw = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($raw === false) {
        return [];
    }
    $slice = array_slice($raw, -max(1, $limit));
    $out = [];
    foreach ($slice as $line) {
        $decoded = json_decode($line, true);
        if (is_array($decoded)) {
            $out[] = $decoded;
        }
    }

    return $out;
}

function api_json_error(int $code, string $message, array $context = []): never
{
    nanoportal_log('error', $message, $context);
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
