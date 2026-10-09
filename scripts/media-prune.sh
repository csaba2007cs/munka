#!/usr/bin/env bash
set -Eeuo pipefail

VIDEO_DIR="${VIDEO_DIR:-shared/assets/video}"
KEEP_COUNT="${KEEP_COUNT:-3}"
DRY_RUN=1

usage() {
  cat <<'EOF'
Usage: scripts/media-prune.sh [--apply] [video-dir] [keep-count]

Keeps the newest keep-count hashed MP4 files and their manifests. The default
is a dry run; pass --apply to delete older generated MP4s and manifests.
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    --apply) DRY_RUN=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) VIDEO_DIR="$1"; shift ;;
  esac
fi
if [[ $# -gt 0 ]]; then
  KEEP_COUNT="$1"
fi

[[ "$KEEP_COUNT" =~ ^[1-9][0-9]*$ ]] || {
  printf 'ERROR: keep-count must be a positive integer\n' >&2
  exit 2
}
[[ -d "$VIDEO_DIR" ]] || {
  printf 'ERROR: video directory not found: %s\n' "$VIDEO_DIR" >&2
  exit 1
}

mapfile -t files < <(find "$VIDEO_DIR" -maxdepth 1 -type f -name '*.mp4' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
if (( ${#files[@]} <= KEEP_COUNT )); then
  printf 'Nothing to prune: %s MP4 file(s), keeping %s\n' "${#files[@]}" "$KEEP_COUNT"
  exit 0
fi

for ((i=KEEP_COUNT; i<${#files[@]}; i++)); do
  file="${files[$i]}"
  manifest="${file%.mp4}.manifest.txt"
  if (( DRY_RUN )); then
    printf 'WOULD DELETE %s\n' "$file"
    [[ -f "$manifest" ]] && printf 'WOULD DELETE %s\n' "$manifest"
  else
    rm -f -- "$file" "$manifest"
    printf 'DELETED %s\n' "$file"
  fi
done
