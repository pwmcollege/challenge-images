#!/bin/sh
set -eu

CDN_ROOT="/opt/cdn"
WORK_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$WORK_DIR"
}

trap cleanup EXIT HUP INT TERM

install_font() {
    name="$1"
    family="$2"
    archive="$WORK_DIR/$name.tgz"
    package_dir="$WORK_DIR/$name"
    font_dir="$CDN_ROOT/fonts/$name"

    mkdir -p "$package_dir" "$font_dir/files"
    tarball_url="$(curl --fail --location --silent --show-error \
        "https://registry.npmjs.org/@fontsource-variable/$name/latest" | jq --raw-output '.dist.tarball')"
    curl --fail --location --silent --show-error \
        "$tarball_url" --output "$archive"

    tar -xzf "$archive" -C "$package_dir" --strip-components=1 \
        package/LICENSE package/standard.css package/standard-italic.css
    tar -xzf "$archive" -C "$font_dir/files" --strip-components=2 --wildcards \
        "package/files/$name-*-standard-*.woff2"
    install -m 644 "$package_dir/LICENSE" "$font_dir/LICENSE"

    : > "$CDN_ROOT/fonts/$name.css"
    for stylesheet in standard.css standard-italic.css; do
        sed \
            -e "s/'$family Variable'/'$family'/g" \
            -e "s|url(./files/|url(/fonts/$name/files/|g" \
            "$package_dir/$stylesheet" >> "$CDN_ROOT/fonts/$name.css"
        printf '\n' >> "$CDN_ROOT/fonts/$name.css"
    done
}

install_font inter Inter
install_font dm-sans 'DM Sans'
