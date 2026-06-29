<?php
declare(strict_types=1);

/*
 * ElevenLabs TTS integráció — KÍSÉRLETI (2. kör, roadmap-blaci.md)
 *
 * Aktiválás:
 *   .env a repo gyökerében: ELEVENLABS_API_KEY=sk_...
 *   vagy export ELEVENLABS_API_KEY="sk_..." / Apache SetEnv
 *
 * API dokumentáció:
 *   https://elevenlabs.io/docs/api-reference/text-to-speech
 *
 * Ajánlott hang ID: Adam (hu támogatás ellenőrizendő) vagy custom clone
 *
 * Fallback: ha nincs API kulcs, a cheer_crowd.mp3 játszódik le.
 * A shared/assets/audio/ mappába kell elhelyezni: cheer_crowd.mp3
 */

require_once __DIR__ . '/state_lib.php';
require_once __DIR__ . '/env.php';

$root = dirname(__DIR__);
load_dotenv_if_present($root);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$audioDir = $root . DIRECTORY_SEPARATOR . 'shared' . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'audio';
$dataDir = $root . DIRECTORY_SEPARATOR . 'data';
$stateFile = $dataDir . DIRECTORY_SEPARATOR . 'state.json';

/** ponytail: Adam default voice; upgrade path ELEVENLABS_VOICE_ID env */
const ELEVENLABS_DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
const TTS_FALLBACK_CLIP = 'cheer_crowd.mp3';

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

function default_last_placeholder_pending(array $names): array
{
    return [
        'type' => 'elevenlabs_names',
        'names' => array_values($names),
        'status' => 'pending',
        'generated_url' => null,
        'fallback_clip' => TTS_FALLBACK_CLIP,
    ];
}

function patch_audio_placeholder(array $state, array $placeholder): array
{
    if (!isset($state['audio']) || !is_array($state['audio'])) {
        $state['audio'] = default_state()['audio'];
    }
    $state['audio']['last_placeholder'] = array_replace(
        is_array($state['audio']['last_placeholder'] ?? null) ? $state['audio']['last_placeholder'] : [],
        $placeholder,
    );

    return $state;
}

function normalize_tts_names(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }
    $names = [];
    foreach ($raw as $name) {
        if (!is_string($name) && !is_numeric($name)) {
            continue;
        }
        $trimmed = trim((string) $name);
        if ($trimmed !== '') {
            $names[] = $trimmed;
        }
    }

    return $names;
}

function elevenlabs_tts(string $apiKey, string $voiceId, string $text): array
{
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP curl extension not available'];
    }

    $url = 'https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voiceId);
    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'error' => 'curl_init failed'];
    }

    $body = json_encode([
        'text' => $text,
        'model_id' => 'eleven_multilingual_v2',
    ], JSON_UNESCAPED_UNICODE);

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'xi-api-key: ' . $apiKey,
            'Content-Type: application/json',
            'Accept: audio/mpeg',
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
    ]);

    $audio = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($audio === false || $curlErr !== '') {
        return ['ok' => false, 'error' => $curlErr !== '' ? $curlErr : 'ElevenLabs request failed'];
    }
    if ($httpCode < 200 || $httpCode >= 300) {
        return ['ok' => false, 'error' => 'ElevenLabs HTTP ' . $httpCode];
    }

    return ['ok' => true, 'bytes' => $audio];
}

function handle_tts_names(array $names, string $audioDir, string $dataDir, string $stateFile): void
{
    modify_state_locked($stateFile, static function (array $state) use ($names): array {
        return patch_audio_placeholder($state, default_last_placeholder_pending($names));
    });

    $apiKey = trim((string) (getenv('ELEVENLABS_API_KEY') ?: ''));
    if ($apiKey === '') {
        $fallbackPath = $audioDir . DIRECTORY_SEPARATOR . TTS_FALLBACK_CLIP;
        if (!is_dir($audioDir) && !mkdir($audioDir, 0755, true) && !is_dir($audioDir)) {
            http_response_code(500);
            echo json_encode(['error' => 'Cannot create audio directory'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (!is_file($fallbackPath)) {
            touch($fallbackPath);
        }

        modify_state_locked($stateFile, static function (array $state): array {
            return patch_audio_placeholder($state, [
                'status' => 'fallback',
                'fallback_clip' => TTS_FALLBACK_CLIP,
            ]);
        });

        echo json_encode([
            'ok' => true,
            'fallback' => true,
            'fallback_clip' => TTS_FALLBACK_CLIP,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $voiceId = trim((string) (getenv('ELEVENLABS_VOICE_ID') ?: ELEVENLABS_DEFAULT_VOICE_ID));
    $text = implode(', ', $names) . '!';
    $result = elevenlabs_tts($apiKey, $voiceId, $text);

    if (!$result['ok']) {
        modify_state_locked($stateFile, static function (array $state): array {
            return patch_audio_placeholder($state, ['status' => 'error']);
        });
        http_response_code(502);
        echo json_encode(['error' => $result['error'] ?? 'TTS failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true) && !is_dir($dataDir)) {
        modify_state_locked($stateFile, static function (array $state): array {
            return patch_audio_placeholder($state, ['status' => 'error']);
        });
        http_response_code(500);
        echo json_encode(['error' => 'Cannot create data directory'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $filename = 'tts_' . gmdate('Ymd_His') . '.mp3';
    $fullPath = $dataDir . DIRECTORY_SEPARATOR . $filename;
    if (file_put_contents($fullPath, $result['bytes']) === false) {
        modify_state_locked($stateFile, static function (array $state): array {
            return patch_audio_placeholder($state, ['status' => 'error']);
        });
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save TTS file'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $generatedUrl = '/data/' . rawurlencode($filename);
    modify_state_locked($stateFile, static function (array $state) use ($generatedUrl): array {
        return patch_audio_placeholder($state, [
            'status' => 'ready',
            'generated_url' => $generatedUrl,
        ]);
    });

    echo json_encode([
        'ok' => true,
        'url' => $generatedUrl,
    ], JSON_UNESCAPED_UNICODE);
    exit;
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
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (($payload['action'] ?? '') === 'tts_names') {
        $names = normalize_tts_names($payload['names'] ?? []);
        if ($names === []) {
            http_response_code(400);
            echo json_encode(['error' => 'At least one name required'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        handle_tts_names($names, $audioDir, $dataDir, $stateFile);
    }

    if (!isset($payload['clip']) || !is_string($payload['clip'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Expected JSON: {"clip":"filename.mp3"} or {"action":"tts_names","names":[]}' ], JSON_UNESCAPED_UNICODE);
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
            $state['audio'] = default_state()['audio'];
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
