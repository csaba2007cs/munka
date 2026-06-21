<?php
declare(strict_types=1);

function default_state(): array
{
    return [
        'status' => 'IDLE',
        'current_step' => 1,
        'players' => [],
        'pending_registrations' => [],
        'players_confirmed' => false,
        'quiz_state' => [
            'hero_title' => 'KIKÉPZÉSI MODUL LEZÁRVA',
            'hero_subtitle' => 'Kutatói alkalmassági ellenőrzés folyamatban',
            'header_status' => 'Kutatói alkalmassági ellenőrzés folyamatban',
            'task_label' => '1. FELADAT',
            'question_text' => 'Melyik faj tojásából kell mintát szereznetek?',
            'current_question_id' => 1,
            'question_title' => '1. FELADAT: Melyik faj tojásából kell mintát szereznetek?',
            'options' => [
                ['id' => 'a', 'label' => 'Tyrannotitan'],
                ['id' => 'b', 'label' => 'Patagotitan'],
                ['id' => 'c', 'label' => 'ismeretlen kisragadozó'],
            ],
            'correct_option_id' => 'b',
            'selected_answer' => null,
            'validation' => 'idle',
            'feedback_visible' => false,
            'feedback_instruction' => 'UV-fénnyel vizsgáljátok meg a tojásrakó helyhez kapcsolódó képet.',
            'sidebar_title' => 'VIZSGA FOLYAMAT',
            'sidebar_items' => [
                ['id' => 'celpont', 'label' => 'célpont', 'done' => true],
                ['id' => 'fenyegetes', 'label' => 'fenyegetés', 'done' => false],
                ['id' => 'mintavetel', 'label' => 'mintavétel', 'done' => false],
                ['id' => 'mozgasi', 'label' => 'mozgási korlát', 'done' => false],
            ],
            'hud_scan_percent' => 97,
            'hud_footer' => 'NP-SYS // MISSION MODULE',
            'footer_left' => 'A múltban nincs második esély.',
        ],
        'display' => [
            'background_audio' => 'ambient_loop_placeholder.mp3',
            'background_video' => 'phase_01_placeholder.mp4',
            'camera_feed_url' => '',
        ],
        'audio' => [
            'last_triggered' => null,
            'last_placeholder' => null,
            'queue' => [],
        ],
        'hardware' => default_hardware(),
        'screens' => default_screens(),
        'visitors' => [],
        'group_contact' => default_group_contact(),
        'updated_at' => null,
    ];
}

function default_screens(): array
{
    return [
        'big' => [
            'layer' => 'window',
            'window_image' => '',
            'media' => [
                'video' => 'phase_01_placeholder.mp4',
                'audio' => 'ambient_loop_placeholder.mp3',
            ],
            'celebration' => [
                'template' => 'crowd_europe',
                'duration_sec' => 9,
                'cheer_audio' => 'ambient_loop_placeholder.mp3',
            ],
        ],
        'small' => [
            'layer' => 'idle',
            'idle_image' => '/shared/assets/images/small-idle.svg',
            'media' => [
                'video' => '',
                'audio' => '',
            ],
            'touch_enabled' => false,
        ],
    ];
}

function default_group_contact(): array
{
    return [
        'email' => '',
        'phone' => '',
    ];
}

function ensure_mobilmozi_defaults(array $state): array
{
    $state = ensure_hardware_defaults($state);
    if (!isset($state['screens']) || !is_array($state['screens'])) {
        $state['screens'] = default_screens();
    } else {
        $state['screens'] = array_replace_recursive(default_screens(), $state['screens']);
    }
    if (!isset($state['visitors']) || !is_array($state['visitors'])) {
        $state['visitors'] = [];
    }
    if (!isset($state['group_contact']) || !is_array($state['group_contact'])) {
        $state['group_contact'] = default_group_contact();
    } else {
        $state['group_contact'] = array_replace_recursive(default_group_contact(), $state['group_contact']);
    }

    return $state;
}

function default_hardware(): array
{
    return [
        'last_sensor_event' => null,
        'event_log' => [],
        'zones' => [
            'zone_a' => ['label' => 'Zóna A', 'led' => 'unknown'],
            'zone_b' => ['label' => 'Zóna B', 'led' => 'unknown'],
        ],
    ];
}

function ensure_hardware_defaults(array $state): array
{
    if (!isset($state['hardware']) || !is_array($state['hardware'])) {
        $state['hardware'] = default_hardware();

        return $state;
    }
    $state['hardware'] = array_replace_recursive(default_hardware(), $state['hardware']);

    return $state;
}

function normalize_sensor_event(mixed $event): ?array
{
    if (!is_array($event)) {
        return null;
    }
    $device = trim((string) ($event['device'] ?? ''));
    $type = trim((string) ($event['type'] ?? ''));
    $at = trim((string) ($event['at'] ?? ''));
    if ($device === '' || $type === '' || $at === '') {
        return null;
    }
    $out = ['device' => $device, 'type' => $type, 'at' => $at];
    if (isset($event['message']) && (string) $event['message'] !== '') {
        $out['message'] = (string) $event['message'];
    }

    return $out;
}

function event_log_key(array $event): string
{
    return $event['device'] . '|' . $event['type'] . '|' . $event['at'];
}

function apply_hardware_event_log(array $merged, array $patch): array
{
    if (!isset($patch['hardware']) || !is_array($patch['hardware'])) {
        return ensure_hardware_defaults($merged);
    }
    if (!array_key_exists('last_sensor_event', $patch['hardware'])) {
        return ensure_hardware_defaults($merged);
    }

    $merged = ensure_hardware_defaults($merged);
    $event = normalize_sensor_event($patch['hardware']['last_sensor_event']);
    if ($event === null) {
        return $merged;
    }

    $merged['hardware']['last_sensor_event'] = $event;
    $key = event_log_key($event);
    $log = [$event];
    foreach ($merged['hardware']['event_log'] as $row) {
        if (!is_array($row)) {
            continue;
        }
        $norm = normalize_sensor_event($row);
        if ($norm === null || event_log_key($norm) === $key) {
            continue;
        }
        $log[] = $norm;
        if (count($log) >= 50) {
            break;
        }
    }
    $merged['hardware']['event_log'] = array_slice($log, 0, 50);

    return $merged;
}

function decode_state_raw(string $raw): array
{
    if ($raw === '') {
        return default_state();
    }
    $decoded = json_decode($raw, true);

    return ensure_mobilmozi_defaults(is_array($decoded) ? $decoded : default_state());
}

function load_state(string $path): array
{
    if (!is_readable($path)) {
        return default_state();
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return default_state();
    }

    return decode_state_raw($raw);
}

function write_state_fp($fp, array $state): bool
{
    $state['updated_at'] = gmdate('c');
    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }
    rewind($fp);
    ftruncate($fp, 0);
    if (fwrite($fp, $json) === false) {
        return false;
    }
    fflush($fp);

    return true;
}

function save_state(string $path, array $state): bool
{
    $state['updated_at'] = gmdate('c');
    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        return false;
    }

    return rename($tmp, $path);
}

/**
 * Exclusive read-modify-write on state.json. Returns false if mutator rejects; null on I/O error.
 *
 * @return array|false|null
 */
function modify_state_locked(string $path, callable $mutator)
{
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        return null;
    }
    $fp = fopen($path, 'c+');
    if ($fp === false) {
        return null;
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);

        return null;
    }
    rewind($fp);
    $raw = stream_get_contents($fp);
    if ($raw === false) {
        $raw = '';
    }
    $current = decode_state_raw($raw);
    $next = $mutator($current);
    if ($next === false) {
        flock($fp, LOCK_UN);
        fclose($fp);

        return false;
    }
    if (!is_array($next)) {
        flock($fp, LOCK_UN);
        fclose($fp);

        return null;
    }
    $next = ensure_mobilmozi_defaults($next);
    if (!write_state_fp($fp, $next)) {
        flock($fp, LOCK_UN);
        fclose($fp);

        return null;
    }
    flock($fp, LOCK_UN);
    fclose($fp);

    return $next;
}

function merge_state(array $base, array $patch): array
{
    $nested = ['quiz_state', 'display', 'audio', 'hardware', 'screens', 'group_contact'];
    foreach ($patch as $key => $value) {
        if (in_array($key, $nested, true) && is_array($value) && isset($base[$key]) && is_array($base[$key])) {
            $base[$key] = array_replace_recursive($base[$key], $value);
        } else {
            $base[$key] = $value;
        }
    }

    return $base;
}

/** Ha a helyes válasz már megjelent, ne lehessen POST-tal felülírni a választ hármasát (kivételes: status / current_step változik, vagy _full_reset). */
function apply_quiz_answer_lock(array $current, array $patch, array $merged): array
{
    $qs = $current['quiz_state'] ?? null;
    if (!is_array($qs)) {
        return $merged;
    }
    $lock = !empty($qs['feedback_visible']) && ($qs['validation'] ?? '') === 'correct';
    if (!$lock) {
        return $merged;
    }
    if (!empty($patch['_full_reset'])) {
        return $merged;
    }
    if (array_key_exists('status', $patch) && (string) ($patch['status'] ?? '') !== (string) ($current['status'] ?? '')) {
        return $merged;
    }
    if (array_key_exists('current_step', $patch) && (int) ($patch['current_step'] ?? 0) !== (int) ($current['current_step'] ?? 1)) {
        return $merged;
    }
    if (!isset($merged['quiz_state']) || !is_array($merged['quiz_state'])) {
        $merged['quiz_state'] = [];
    }
    $merged['quiz_state']['selected_answer'] = $qs['selected_answer'] ?? null;
    $merged['quiz_state']['validation'] = $qs['validation'] ?? 'idle';
    $merged['quiz_state']['feedback_visible'] = !empty($qs['feedback_visible']);

    return $merged;
}
