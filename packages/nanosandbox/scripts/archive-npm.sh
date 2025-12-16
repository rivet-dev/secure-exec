#!/bin/bash
set -e

cd "$(dirname "$0")/.."

NPM_VERSION="${NPM_VERSION:-11.7.0}"
ASSETS_DIR="assets/npm"

# Cache downloaded tarballs
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/nanosandbox"
NPM_TARBALL="${CACHE_DIR}/npm-${NPM_VERSION}.tgz"

echo "==> Archiving npm@${NPM_VERSION} to ${ASSETS_DIR}..."

# Clean up previous
rm -rf "$ASSETS_DIR"
mkdir -p "$CACHE_DIR"

# Download if not cached
if [ -f "$NPM_TARBALL" ]; then
    echo "    Using cached npm@${NPM_VERSION}"
else
    echo "    Downloading npm@${NPM_VERSION}..."
    curl -sL "https://registry.npmjs.org/npm/-/npm-${NPM_VERSION}.tgz" -o "$NPM_TARBALL"
fi

# Extract to temp dir
TEMP_DIR=$(mktemp -d)
tar -xzf "$NPM_TARBALL" -C "$TEMP_DIR"

# Prune unnecessary files
echo "    Pruning unnecessary files..."
rm -rf "$TEMP_DIR/package/man" "$TEMP_DIR/package/docs" "$TEMP_DIR/package/test" "$TEMP_DIR/package/changelogs"
find "$TEMP_DIR/package" -name "*.md" -type f -delete 2>/dev/null || true
find "$TEMP_DIR/package" -name "LICENSE*" -type f -delete 2>/dev/null || true
find "$TEMP_DIR/package" -name "CHANGELOG*" -type f -delete 2>/dev/null || true
find "$TEMP_DIR/package" -name "*.txt" -type f -delete 2>/dev/null || true
find "$TEMP_DIR/package" -name ".npmignore" -type f -delete 2>/dev/null || true
find "$TEMP_DIR/package" -name ".eslint*" -type f -delete 2>/dev/null || true

# Move to assets
mv "$TEMP_DIR/package" "$ASSETS_DIR"
rm -rf "$TEMP_DIR"

# Report size
SIZE=$(du -sh "$ASSETS_DIR" | cut -f1)
echo "    npm@${NPM_VERSION} archived to ${ASSETS_DIR} (${SIZE})"
