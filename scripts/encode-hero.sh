#!/usr/bin/env bash
# 첫 화면 히어로 영상 인코딩 — 원본(design/hero-source.*) → public/hero.mp4 + public/hero.webm + public/hero-poster.jpg
# 사용: scripts/encode-hero.sh design/hero-source.mov
# 요구: ffmpeg (brew install ffmpeg). 목표: 각 3MB 이하, 세로 720px(열 높이용), 음성 제거.
set -euo pipefail
SRC="${1:?원본 경로}"
OUT="$(dirname "$0")/../public"
# H.264 mp4 — 720p, 24fps, CRF 28, faststart(스트리밍 시작 빠르게)
ffmpeg -y -i "$SRC" -an -vf "scale=-2:720,fps=24" -c:v libx264 -profile:v high -preset slow -crf 28 \
  -pix_fmt yuv420p -movflags +faststart "$OUT/hero.mp4"
# VP9 webm — 같은 크기, 2-pass 없이 CRF 36
ffmpeg -y -i "$SRC" -an -vf "scale=-2:720,fps=24" -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 "$OUT/hero.webm"
# poster — 첫 프레임
ffmpeg -y -i "$SRC" -vf "scale=-2:720" -frames:v 1 -q:v 4 "$OUT/hero-poster.jpg"
ls -la "$OUT"/hero.mp4 "$OUT"/hero.webm "$OUT"/hero-poster.jpg
