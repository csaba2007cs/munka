<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';

function snapshots_dir(string $dataDir): string
{
    return $dataDir . DIRECTORY_SEPARATOR . 'snapshots';
}

function snapshot_retention_days(): int
{
    return env_int('SNAPSHOT_RETENTION_DAYS', 30);
}

function snapshot_filename_pattern(): string
{
    return '/^state_(IDLE|RUNNING|COMPLETED|PRERESET)_(\d{8})_(\d{6})\.json$/';
}

/** @return array{label: string, date: string, time: string, unix: int}|null */
function parse_snapshot_filename(string $name): ?array
{
    $base = basename($name);
    if (!preg_match(snapshot_filename_pattern(), $base, $m)) {
        return null;
    }
    $date = $m[2];
    $time = $m[3];
    $dt = DateTimeImmutable::createFromFormat(
        'Ymd His',
        $date . ' ' . substr($time, 0, 2) . substr($time, 2, 2) . substr($time, 4, 2),
        new DateTimeZone('UTC'),
    );
    if ($dt === false) {
        return null;
    }

    return [
        'label' => $m[1],
        'date' => $date,
        'time' => $time,
        'unix' => $dt->getTimestamp(),
    ];
}

function snapshot_completed_at_iso(string $filename): ?string
{
    $parsed = parse_snapshot_filename($filename);
    if ($parsed === null) {
        return null;
    }
    $dt = (new DateTimeImmutable('@' . $parsed['unix']))->setTimezone(new DateTimeZone('UTC'));

    return $dt->format('Y-m-d\TH:i:s\Z');
}

function save_state_snapshot(string $dataDir, string $label, array $state): ?string
{
    $label = preg_replace('/[^A-Z0-9_]/', '', strtoupper($label)) ?? '';
    if ($label === '') {
        return null;
    }
    $dir = snapshots_dir($dataDir);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        return null;
    }
    $ts = gmdate('Ymd_His');
    $filename = "state_{$label}_{$ts}.json";
    $path = $dir . DIRECTORY_SEPARATOR . $filename;
    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return null;
    }
    if (file_put_contents($path, $json) === false) {
        return null;
    }

    return $filename;
}

function prune_old_snapshots(string $dir, int $days): void
{
    if ($days < 1 || !is_dir($dir)) {
        return;
    }
    $cutoff = time() - ($days * 86400);
    $files = glob($dir . DIRECTORY_SEPARATOR . '*.json');
    if ($files === false) {
        return;
    }
    foreach ($files as $f) {
        if (is_file($f) && (filemtime($f) ?: 0) < $cutoff) {
            @unlink($f);
        }
    }
}

/** @return list<string> */
function list_snapshot_files(string $dataDir): array
{
    $dir = snapshots_dir($dataDir);
    if (!is_dir($dir)) {
        return [];
    }
    $files = glob($dir . DIRECTORY_SEPARATOR . 'state_*.json');
    if ($files === false) {
        return [];
    }
    $out = [];
    foreach ($files as $full) {
        $name = basename($full);
        if (parse_snapshot_filename($name) !== null) {
            $out[] = $name;
        }
    }
    usort($out, static function (string $a, string $b): int {
        $pa = parse_snapshot_filename($a);
        $pb = parse_snapshot_filename($b);
        $ta = $pa['unix'] ?? 0;
        $tb = $pb['unix'] ?? 0;

        return $tb <=> $ta;
    });

    return $out;
}

function snapshot_file_path(string $dataDir, string $filename): ?string
{
    $base = basename($filename);
    if (parse_snapshot_filename($base) === null) {
        return null;
    }
    $dir = snapshots_dir($dataDir);
    $path = $dir . DIRECTORY_SEPARATOR . $base;
    $realDir = realpath($dir);
    $realPath = realpath($path);
    if ($realDir === false || $realPath === false || !str_starts_with($realPath, $realDir . DIRECTORY_SEPARATOR)) {
        return null;
    }

    return $realPath;
}

/** @return list<string> */
function extract_player_names(array $state): array
{
    $players = $state['players'] ?? [];
    if (!is_array($players)) {
        return [];
    }
    $names = [];
    foreach ($players as $p) {
        if (is_array($p)) {
            $name = trim((string) ($p['name'] ?? ''));
            if ($name !== '') {
                $names[] = $name;
            }
        } elseif (is_string($p) && trim($p) !== '') {
            $names[] = trim($p);
        }
    }

    return $names;
}

function find_running_before(string $dataDir, int $completedUnix): ?int
{
    $dir = snapshots_dir($dataDir);
    if (!is_dir($dir)) {
        return null;
    }
    $files = glob($dir . DIRECTORY_SEPARATOR . 'state_RUNNING_*.json');
    if ($files === false) {
        return null;
    }
    $best = null;
    foreach ($files as $full) {
        $parsed = parse_snapshot_filename(basename($full));
        if ($parsed === null || $parsed['unix'] > $completedUnix) {
            continue;
        }
        if ($best === null || $parsed['unix'] > $best) {
            $best = $parsed['unix'];
        }
    }

    return $best;
}

/**
 * @return list<array{filename: string, completed_at: string|null, players: list<string>, steps_completed: int, duration_minutes: int|null}>
 */
function list_completed_sessions(string $dataDir, int $limit = 10): array
{
    $sessions = [];
    foreach (list_snapshot_files($dataDir) as $filename) {
        $parsed = parse_snapshot_filename($filename);
        if ($parsed === null || $parsed['label'] !== 'COMPLETED') {
            continue;
        }
        $path = snapshot_file_path($dataDir, $filename);
        if ($path === null || !is_readable($path)) {
            continue;
        }
        $raw = file_get_contents($path);
        if ($raw === false) {
            continue;
        }
        $state = json_decode($raw, true);
        if (!is_array($state)) {
            continue;
        }
        $runningUnix = find_running_before($dataDir, $parsed['unix']);
        $duration = null;
        if ($runningUnix !== null) {
            $duration = (int) max(0, round(($parsed['unix'] - $runningUnix) / 60));
        }
        $sessions[] = [
            'filename' => $filename,
            'completed_at' => snapshot_completed_at_iso($filename),
            'players' => extract_player_names($state),
            'steps_completed' => (int) ($state['current_step'] ?? 0),
            'duration_minutes' => $duration,
        ];
        if (count($sessions) >= $limit) {
            break;
        }
    }

    return $sessions;
}

function maybe_snapshot_on_status_change(string $dataDir, array $current, array $next): void
{
    $prev = (string) ($current['status'] ?? '');
    $new = (string) ($next['status'] ?? '');
    $triggers = ['IDLE', 'RUNNING', 'COMPLETED'];
    if ($prev === $new || !in_array($new, $triggers, true)) {
        return;
    }
    save_state_snapshot($dataDir, $new, $next);
    prune_old_snapshots(snapshots_dir($dataDir), snapshot_retention_days());
}
