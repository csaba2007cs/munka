#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1}"
VIDEO_PATH="${VIDEO_PATH:-/shared/assets/video/}"
VIDEO_FILE="${VIDEO_FILE:-}"
MQTT_HOST="${MQTT_HOST:-127.0.0.1}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_USER="${MQTT_USER:-}"
MQTT_PASS="${MQTT_PASS:-}"
MQTT_TOPIC="${MQTT_TOPIC:-bigscreen/video}"
MQTT_TEST_PAYLOAD="${MQTT_TEST_PAYLOAD:-smoke-test-$(date +%s).mp4}"

usage() {
  cat <<'EOF'
Usage: scripts/production-smoke-test.sh

Environment:
  BASE_URL       Apache base URL (default: http://127.0.0.1)
  VIDEO_FILE     deployed MP4 filename; otherwise first local MP4 is used
  MQTT_HOST      broker host (default: 127.0.0.1)
  MQTT_PORT      broker TCP port (default: 1883)
  MQTT_USER      optional MQTT username
  MQTT_PASS      optional MQTT password
  MQTT_TOPIC     retained state topic (default: bigscreen/video)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}
require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_command curl
require_command mosquitto_pub
require_command mosquitto_sub

if [[ -z "$VIDEO_FILE" ]]; then
  VIDEO_FILE=$(find "${VIDEO_ROOT:-shared/assets/video}" -maxdepth 1 -type f -name '*.mp4' -printf '%f\n' | sort | head -n 1)
fi
[[ -n "$VIDEO_FILE" ]] || fail "no MP4 file found; set VIDEO_FILE to a deployed filename"

video_url="${BASE_URL%/}${VIDEO_PATH%/}/$VIDEO_FILE"
headers=$(curl --fail --silent --show-error --dump-header - --output /dev/null "$video_url") ||
  fail "Apache video request failed: $video_url"
printf '%s\n' "$headers" | grep -qi '^Accept-Ranges:[[:space:]]*bytes' ||
  fail "missing Accept-Ranges: bytes"
printf '%s\n' "$headers" | grep -qi '^Content-Length:' ||
  fail "missing Content-Length"
printf '%s\n' "$headers" | grep -qi '^Content-Type:[[:space:]]*video/mp4' ||
  fail "missing Content-Type: video/mp4"

range_headers=$(curl --fail --silent --show-error --dump-header - --output /dev/null \
  -H 'Range: bytes=0-1023' "$video_url") ||
  fail "Apache range request failed"
printf '%s\n' "$range_headers" | head -n 1 | grep -q ' 206 ' ||
  fail "range request did not return HTTP 206"

auth_args=()
if [[ -n "$MQTT_USER" ]]; then
  auth_args+=(-u "$MQTT_USER")
fi
if [[ -n "$MQTT_PASS" ]]; then
  auth_args+=(-P "$MQTT_PASS")
fi

received_file=$(mktemp)
cleanup() {
  rm -f "$received_file"
}
trap cleanup EXIT

timeout 10 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" \
  "${auth_args[@]}" -t "$MQTT_TOPIC" -C 1 -W 8 > "$received_file" &
subscriber_pid=$!
sleep 1
mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" "${auth_args[@]}" \
  -q 1 -r -t "$MQTT_TOPIC" -m "$MQTT_TEST_PAYLOAD"
wait "$subscriber_pid"
grep -Fxq "$MQTT_TEST_PAYLOAD" "$received_file" ||
  fail "retained MQTT payload was not received"

printf 'PASS: Apache static video headers and range response\n'
printf 'PASS: MQTT retained state on %s:%s topic=%s payload=%s\n' \
  "$MQTT_HOST" "$MQTT_PORT" "$MQTT_TOPIC" "$MQTT_TEST_PAYLOAD"
