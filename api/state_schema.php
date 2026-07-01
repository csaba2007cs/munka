<?php
declare(strict_types=1);

const STATE_PATCH_SCHEMA = [
    'status' => 'string',
    'current_step' => 'integer',
    'players' => 'array',
    'pending_registrations' => 'array',
    'players_confirmed' => 'boolean',
    'quiz_state' => 'array',
    'display' => 'array',
    'audio' => 'array',
    'hardware' => 'array',
    'screens' => 'array',
    'visitors' => 'array',
    'group_contact' => 'array',
    'updated_at' => 'string',
    '_full_reset' => 'boolean',
    '_restore_state' => 'boolean',
    '_rev' => 'integer',
];

const STATE_STATUS_VALUES = ['IDLE', 'RUNNING', 'PAUSED', 'COMPLETED'];

function patch_value_matches_type(mixed $value, string $type): bool
{
    return match ($type) {
        'string' => is_string($value),
        'integer' => is_int($value) && !is_float($value),
        'boolean' => is_bool($value),
        'array' => is_array($value),
        default => false,
    };
}

/** @return list<string> */
function validate_patch_types(array $patch): array
{
    $errors = [];
    foreach ($patch as $key => $value) {
        $key = (string) $key;
        if (!array_key_exists($key, STATE_PATCH_SCHEMA)) {
            $errors[] = "unknown key: {$key}";
            continue;
        }
        $expected = STATE_PATCH_SCHEMA[$key];
        if (!patch_value_matches_type($value, $expected)) {
            $errors[] = "invalid type for key {$key}: expected {$expected}";
            continue;
        }
        if ($key === 'status' && !in_array($value, STATE_STATUS_VALUES, true)) {
            $errors[] = 'invalid status value';
        }
    }

    return $errors;
}

function validate_patch_max_depth(mixed $value, int $maxDepth = 12, int $depth = 0): ?string
{
    if ($depth > $maxDepth) {
        return 'patch exceeds maximum nesting depth';
    }
    if (!is_array($value)) {
        return null;
    }
    foreach ($value as $child) {
        if (is_array($child)) {
            $err = validate_patch_max_depth($child, $maxDepth, $depth + 1);
            if ($err !== null) {
                return $err;
            }
        }
    }

    return null;
}
