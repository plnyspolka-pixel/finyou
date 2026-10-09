#!/usr/bin/env bash
# Buduje paczkę Lambdy: kod + plan kodowania z caption-burner + AWS SDK +
# statyczny FFmpeg/ffprobe (x86_64, johnvansickle.com, suma MD5 sprawdzana).
# Wynik: dist/function.zip (wgrywany przez S3 — za duży na bezpośredni upload).
set -euo pipefail
cd "$(dirname "$0")"

FFMPEG_URL="${FFMPEG_URL:-https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz}"
CACHE=.cache
rm -rf build dist
mkdir -p build/bin dist "$CACHE"

cp handler.mjs core.mjs package.json build/
# Jedno źródło planu kodowania — w paczce prawdziwa kopia zamiast przekierowania.
cp ../caption-burner/transcode-plan.mjs build/transcode-plan.mjs
(cd build && npm install --omit=dev --no-audit --no-fund --loglevel=error)

ARCHIVE="$CACHE/ffmpeg-static.tar.xz"
if [ ! -s "$ARCHIVE" ]; then
  echo "Pobieram statyczny FFmpeg…"
  curl -fsSL "$FFMPEG_URL" -o "$ARCHIVE.part"
  expected=$(curl -fsSL "$FFMPEG_URL.md5" | awk '{print $1}')
  actual=$(md5sum "$ARCHIVE.part" | awk '{print $1}')
  [ "$expected" = "$actual" ] || { echo "Zła suma MD5 FFmpega ($actual ≠ $expected)" >&2; exit 1; }
  mv "$ARCHIVE.part" "$ARCHIVE"
fi
tar -xJf "$ARCHIVE" -C "$CACHE" --wildcards '*/ffmpeg' '*/ffprobe'
cp "$CACHE"/ffmpeg-*-static/ffmpeg "$CACHE"/ffmpeg-*-static/ffprobe build/bin/
chmod 755 build/bin/ffmpeg build/bin/ffprobe
build/bin/ffmpeg -version | head -1

(cd build && zip -qr9 ../dist/function.zip .)
ls -lh dist/function.zip
