<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';

function human_bytes(int $bytes): string
{
    if ($bytes < 0) {
        $bytes = 0;
    }
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $i = 0;
    $v = (float) $bytes;
    while ($v >= 1024 && $i < count($units) - 1) {
        $v /= 1024;
        ++$i;
    }

    return ($i > 0 ? (string) round($v, 1) : (string) (int) $v) . ' ' . $units[$i];
}

function prune_old_uploads(string $dir, string $prefix, int $max_keep): void
{
    if ($max_keep < 1 || !is_dir($dir)) {
        return;
    }
    $pattern = $dir . DIRECTORY_SEPARATOR . $prefix . '_*';
    $files = glob($pattern);
    if ($files === false || count($files) <= $max_keep) {
        return;
    }
    usort($files, static fn (string $a, string $b): int => (filemtime($a) ?: 0) <=> (filemtime($b) ?: 0));
    $to_delete = array_slice($files, 0, count($files) - $max_keep);
    foreach ($to_delete as $f) {
        if (is_file($f)) {
            @unlink($f);
        }
    }
}

function prune_tts_files(string $dir, int $max_keep): void
{
    if ($max_keep < 1 || !is_dir($dir)) {
        return;
    }
    $files = glob($dir . DIRECTORY_SEPARATOR . 'tts_*.mp3');
    if ($files === false || count($files) <= $max_keep) {
        return;
    }
    usort($files, static fn (string $a, string $b): int => (filemtime($a) ?: 0) <=> (filemtime($b) ?: 0));
    foreach (array_slice($files, 0, count($files) - $max_keep) as $f) {
        if (is_file($f)) {
            @unlink($f);
        }
    }
}

/** @return array{photobooth: int, visitor: int, window: int, tts: int} */
function count_data_files(string $dir): array
{
    $counts = [
        'photobooth' => 0,
        'visitor' => 0,
        'window' => 0,
        'tts' => 0,
    ];
    if (!is_dir($dir)) {
        return $counts;
    }
    $handle = opendir($dir);
    if ($handle === false) {
        return $counts;
    }
    while (($name = readdir($handle)) !== false) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        $full = $dir . DIRECTORY_SEPARATOR . $name;
        if (!is_file($full)) {
            continue;
        }
        if (str_starts_with($name, 'photobooth_')) {
            ++$counts['photobooth'];
        } elseif (str_starts_with($name, 'visitor_')) {
            ++$counts['visitor'];
        } elseif (str_starts_with($name, 'window_')) {
            ++$counts['window'];
        } elseif (str_starts_with($name, 'tts_') && str_ends_with(strtolower($name), '.mp3')) {
            ++$counts['tts'];
        }
    }
    closedir($handle);

    return $counts;
}

function dir_size_bytes(string $dir): int
{
    if (!is_dir($dir)) {
        return 0;
    }
    $total = 0;
    $handle = opendir($dir);
    if ($handle === false) {
        return 0;
    }
    while (($name = readdir($handle)) !== false) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        $full = $dir . DIRECTORY_SEPARATOR . $name;
        if (is_file($full)) {
            $total += (int) filesize($full);
        }
    }
    closedir($handle);

    return $total;
}

/** @return array<string, mixed> */
function storage_summary(string $dataDir): array
{
    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        $dataDir = dirname($dataDir);
    }
    $dataBytes = dir_size_bytes($dataDir);
    $diskFree = disk_free_space($dataDir);
    if ($diskFree === false) {
        $diskFree = 0;
    }

    return [
        'data_dir_bytes' => $dataBytes,
        'data_dir_human' => human_bytes($dataBytes),
        'file_counts' => count_data_files($dataDir),
        'disk_free_bytes' => (int) $diskFree,
        'disk_free_human' => human_bytes((int) $diskFree),
    ];
}
