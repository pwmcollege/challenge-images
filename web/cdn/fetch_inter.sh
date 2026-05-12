#!/bin/sh
set -eu

VER="${1:-4.1}"
ZIP="Inter-${VER}.zip"
URL="https://github.com/rsms/inter/releases/download/v${VER}/${ZIP}"

DEST_DIR="/opt/cdn/fonts/inter"
CSS_OUT="/opt/cdn/fonts/inter.css"

mkdir -p "$DEST_DIR"
: > "$CSS_OUT"

curl -fL "$URL" -o /tmp/inter.zip
unzip -q /tmp/inter.zip -d /tmp/inter
rm -f /tmp/inter.zip

find /tmp/inter -type f -path '*/web/*.woff2' -exec cp {} "$DEST_DIR/" \;
rm -rf /tmp/inter

for f in "$DEST_DIR"/*.woff2; do
    base="$(basename "$f" .woff2)"

    style="normal"
    name="$base"
    case "$name" in
        *Italic) style="italic"; name="${name%Italic}" ;;
    esac

    name="${name#Inter-}"
    name="${name#InterDisplay-}"

case "$name" in
    Thin)       weight=100 ;;
    ExtraLight) weight=200 ;;
    Light)      weight=300 ;;
    Regular)    weight=400 ;;
    Medium)     weight=500 ;;
    SemiBold)   weight=600 ;;
    Bold)       weight=700 ;;
    ExtraBold)  weight=800 ;;
    Black)      weight=900 ;;
    *) continue ;;
esac

printf "@font-face { font-family: 'Inter'; font-style: %s; font-weight: %s; font-display: swap; src: url('/fonts/inter/%s') format('woff2'); }\n" \
    "$style" "$weight" "$(basename "$f")" >> "$CSS_OUT"
done