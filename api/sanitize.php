<?php
declare(strict_types=1);

function utf8_len(string $s): int
{
    if (function_exists('mb_strlen')) {
        return (int) mb_strlen($s, 'UTF-8');
    }

    return strlen($s);
}

function sanitize_person_name(string $raw, int $maxLen = 120): string
{
    $name = trim(strip_tags($raw));
    $name = preg_replace('/[^\p{L}\p{N}\s\-\.\']/u', '', $name) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, $maxLen, 'UTF-8');
    }

    return substr($name, 0, $maxLen);
}

function sanitize_tts_name(string $raw): string
{
    $name = trim(strip_tags($raw));
    $name = preg_replace('/[^\p{L}\p{N}\s\-\.]/u', '', $name) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, 60, 'UTF-8');
    }

    return substr($name, 0, 60);
}
