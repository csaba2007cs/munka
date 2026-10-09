#!/usr/bin/env bash
set -Eeuo pipefail

INCOMING_DIR="${INCOMING_DIR:-shared/assets/video/incoming}"
OUTPUT_DIR="${OUTPUT_DIR:-shared/assets/video}"
MAX_BYTES=$((4 * 1024 * 1024 * 1024))
POLL_SECONDS="${POLL_SECONDS:-5}"
WATCH_MODE=0

usage() {
  cat <<'EOF'
Usage: scripts/media-ingest.sh [--once|--watch] [incoming-dir] [output-dir]

Accepts any FFmpeg-readable video in incoming-dir and creates a browser-ready
MP4 in output-dir. Existing H.264 video is copied; audio is encoded as AAC.
Other video codecs are transcoded to H.264 High, yuv420p, with AAC audio.
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    --once) shift ;;
    --watch) WATCH_MODE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) INCOMING_DIR="$1"; shift ;;
  esac
fi
if [[ $# -gt 0 ]]; then
  OUTPUT_DIR="$1"
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'ERROR: required command not found: %s\n' "$1" >&2
    exit 1
  }
}

require_command ffmpeg
require_command ffprobe
require_command sha256sum

mkdir -p "$INCOMING_DIR" "$OUTPUT_DIR"

is_stable() {
  local file="$1" first second
  first=$(stat -c '%s' "$file" 2>/dev/null || stat -f '%z' "$file")
  sleep 1
  second=$(stat -c '%s' "$file" 2>/dev/null || stat -f '%z' "$file")
  [[ "$first" == "$second" ]]
}

has_faststart() {
  local file="$1"
  head -c 4096 "$file" | LC_ALL=C grep -a -q 'moov'
}

process_file() {
  local input="$1" base stem digest output temp manifest size video_codec audio_codec

  [[ -f "$input" ]] || return 0
  [[ "$(basename "$input")" == .* ]] && return 0
  [[ "$input" == *.part || "$input" == *.tmp || "$input" == *.processing ]] && return 0
  is_stable "$input" || {
    printf 'SKIP (still being copied): %s\n' "$input"
    return 0
  }

  size=$(stat -c '%s' "$input" 2>/dev/null || stat -f '%z' "$input")
  if (( size > MAX_BYTES )); then
    printf 'ERROR (over 4 GiB): %s\n' "$input" >&2
    return 1
  fi

  base=$(basename "$input")
  stem="${base%.*}"
  digest=$(sha256sum "$input" | cut -c1-12)
  output="$OUTPUT_DIR/${stem}-${digest}.mp4"
  temp="$OUTPUT_DIR/.${stem}-${digest}.processing.mp4"
  manifest="${output%.mp4}.manifest.txt"

  if [[ -f "$output" && -f "$manifest" ]]; then
    printf 'SKIP (already ingested): %s\n' "$output"
    return 0
  fi

  video_codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
    -of default=noprint_wrappers=1:nokey=1 "$input" | head -n 1)
  audio_codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name \
    -of default=noprint_wrappers=1:nokey=1 "$input" | head -n 1 || true)

  rm -f "$temp"
  if [[ "$video_codec" == "h264" ]]; then
    printf 'Remuxing: %s -> %s\n' "$input" "$output"
    ffmpeg -hide_banner -loglevel error -y -i "$input" \
      -map 0:v:0 -map 0:a? -c:v copy -c:a aac -b:a 192k -ac 2 \
      -movflags +faststart "$temp"
  else
    printf 'Transcoding (%s/%s): %s -> %s\n' "${video_codec:-unknown}" \
      "${audio_codec:-none}" "$input" "$output"
    ffmpeg -hide_banner -loglevel error -y -i "$input" \
      -map 0:v:0 -map 0:a? -c:v libx264 -profile:v high -level 4.2 \
      -pix_fmt yuv420p -crf 18 -preset slow -c:a aac -b:a 192k -ac 2 \
      -movflags +faststart "$temp"
  fi

  has_faststart "$temp" || {
    rm -f "$temp"
    printf 'ERROR (moov atom is not within first 4 KiB): %s\n' "$input" >&2
    return 1
  }
  mv -f "$temp" "$output"
  {
    printf 'source_file=%s\n' "$base"
    printf 'source_sha256=%s\n' "$(sha256sum "$input" | cut -d' ' -f1)"
    printf 'output_file=%s\n' "$(basename "$output")"
    printf 'output_sha256=%s\n' "$(sha256sum "$output" | cut -d' ' -f1)"
    printf 'created_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'ffmpeg_version=%s\n' "$(ffmpeg -version | head -n 1)"
    if [[ "$video_codec" == "h264" ]]; then
      printf 'mode=remux-video-copy-audio-aac\n'
      printf 'parameters=-map 0:v:0 -map 0:a? -c:v copy -c:a aac -b:a 192k -ac 2 -movflags +faststart\n'
    else
      printf 'mode=transcode-h264-aac\n'
      printf 'parameters=-map 0:v:0 -map 0:a? -c:v libx264 -profile:v high -level 4.2 -pix_fmt yuv420p -crf 18 -preset slow -c:a aac -b:a 192k -ac 2 -movflags +faststart\n'
    fi
  } > "$manifest"
  printf 'READY: %s\n' "$output"
}

process_pending() {
  local file failed=0
  while IFS= read -r -d '' file; do
    process_file "$file" || failed=1
  done < <(find "$INCOMING_DIR" -maxdepth 1 -type f -print0)
  return "$failed"
}

if (( WATCH_MODE == 0 )); then
  process_pending
  exit $?
fi

printf 'Watching %s; output: %s\n' "$INCOMING_DIR" "$OUTPUT_DIR"
while true; do
  process_pending || true
  sleep "$POLL_SECONDS"
done
