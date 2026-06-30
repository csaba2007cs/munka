<?php
declare(strict_types=1);

/** Load repo-root .env into putenv (does not override existing env vars). */
function load_dotenv_if_present(string $root): void
{
    $file = $root . DIRECTORY_SEPARATOR . '.env';
    if (!is_readable($file)) {
        return;
    }
    $lines = file($file, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        return;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $eq = strpos($line, '=');
        if ($eq === false || $eq < 1) {
            continue;
        }
        $key = trim(substr($line, 0, $eq));
        if ($key === '' || getenv($key) !== false) {
            continue;
        }
        $value = trim(substr($line, $eq + 1));
        if (
            (str_starts_with($value, '"') && str_ends_with($value, '"'))
            || (str_starts_with($value, "'") && str_ends_with($value, "'"))
        ) {
            $value = substr($value, 1, -1);
        }
        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
    }
}

function env_int(string $key, int $default): int
{
    $raw = getenv($key);
    if ($raw === false || $raw === '') {
        return $default;
    }
    $n = (int) $raw;

    return $n > 0 ? $n : $default;
}

function max_photobooth_files(): int
{
    return env_int('MAX_PHOTOBOOTH_FILES', 100);
}

function max_visitor_files(): int
{
    return env_int('MAX_VISITOR_FILES', 50);
}

function max_window_files(): int
{
    return env_int('MAX_WINDOW_FILES', 30);
}

function max_tts_files(): int
{
    return env_int('MAX_TTS_FILES', 20);
}

function max_upload_files_for_kind(string $kind): int
{
    return match ($kind) {
        'visitor' => max_visitor_files(),
        'window' => max_window_files(),
        default => max_photobooth_files(),
    };
}
