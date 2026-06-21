<?php
declare(strict_types=1);

require_once __DIR__ . '/state_lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = dirname(__DIR__);
$audioDir = $root . DIRECTORY_SEPARATOR . 'shared' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'audio';
$stateFile = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'state.json';

function list_audio_files(string $dir): array
{
    if (!is_dir($dir)) {
        return [];
    }
    $files = [];
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $name;
        if (is_file($path) && preg_match('/\.(mp3|wav|ogg|m4a)$/i', $name)) {
            $files[] = $name;
        }
    }
    sort($files);

    return $files;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $baseUrl = '/shared/assets/audio/';
    $clips = list_audio_files($audioDir);
    $mapped = array_map(static fn (string $f): array => [
        'file' => $f,
        'url' => $baseUrl . rawurlencode($f),
    ], $clips);

    echo json_encode([
        'clips' => $mapped,
        'placeholder' => 'Add .mp3/.wav files under shared/assets/audio/',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $body = file_get_contents('php://input');
    $payload = json_decode($body ?: '{}', true);
    if (!is_array($payload) || !isset($payload['clip']) || !is_string($payload['clip'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Expected JSON: {"clip":"filename.mp3"}'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $clip = basename($payload['clip']);
    $full = $audioDir . DIRECTORY_SEPARATOR . $clip;
    if (!is_file($full)) {
        http_response_code(404);
        echo json_encode(['error' => 'Unknown clip'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $trigger = [
        'clip' => $clip,
        'url' => '/shared/assets/audio/' . rawurlencode($clip),
        'at' => gmdate('c'),
    ];

    $state = modify_state_locked($stateFile, static function (array $state) use ($trigger): array {
        if (!isset($state['audio']) || !is_array($state['audio'])) {
            $state['audio'] = [];
        }
        $state['audio']['last_triggered'] = $trigger;
        if (!isset($state['audio']['queue']) || !is_array($state['audio']['queue'])) {
            $state['audio']['queue'] = [];
        }
        $state['audio']['queue'][] = $trigger;

        return $state;
    });

    if ($state === null) {
        http_response_code(500);
        echo json_encode(['error' => 'Persist failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'ok' => true,
        'playUrl' => $trigger['url'],
        'state' => $state,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
