#!/bin/bash
# patch-wasi-libc.sh — Vendor, patch, and build wasi-libc as a custom sysroot
#
# Clones wasi-libc at the commit pinned by wasi-sdk-25, applies patches from
# patches/wasi-libc/ that route POSIX functions through our host_process and
# host_user WASM imports, and builds the patched sysroot.
#
# Usage:
#   ./scripts/patch-wasi-libc.sh [--check] [--reverse]
#
# Options:
#   --check    Dry-run: verify patches apply cleanly without building
#   --reverse  Reverse (unapply) previously applied patches

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WASMCORE_DIR="$(dirname "$SCRIPT_DIR")"
PATCHES_DIR="$WASMCORE_DIR/patches/wasi-libc"

# wasi-libc commit pinned by wasi-sdk-25's git submodule
WASI_LIBC_COMMIT="574b88da481569b65a237cb80daf9a2d5aeaf82d"
WASI_LIBC_REPO="https://github.com/WebAssembly/wasi-libc.git"

# Directories
VENDOR_DIR="$WASMCORE_DIR/c/vendor"
WASI_LIBC_DIR="$VENDOR_DIR/wasi-libc"
WASI_SDK_DIR="$VENDOR_DIR/wasi-sdk"
SYSROOT_DIR="$WASMCORE_DIR/c/sysroot"

# Parse arguments
MODE="apply"
for arg in "$@"; do
    case "$arg" in
        --check)
            MODE="check"
            ;;
        --reverse)
            MODE="reverse"
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: $0 [--check] [--reverse]"
            exit 1
            ;;
    esac
done

# Ensure wasi-sdk is available (needed for building the sysroot)
if [ "$MODE" = "apply" ] && [ ! -d "$WASI_SDK_DIR" ]; then
    echo "ERROR: wasi-sdk not found at $WASI_SDK_DIR"
    echo "Run 'make -C $WASMCORE_DIR/c wasi-sdk' first."
    exit 1
fi

# Clone or verify wasi-libc at pinned commit
if [ ! -d "$WASI_LIBC_DIR" ]; then
    if [ "$MODE" = "check" ]; then
        echo "ERROR: wasi-libc not vendored at $WASI_LIBC_DIR"
        echo "Run '$0' (without --check) to clone and build."
        exit 1
    fi

    echo "=== Cloning wasi-libc at $WASI_LIBC_COMMIT ==="
    mkdir -p "$VENDOR_DIR"
    git clone "$WASI_LIBC_REPO" "$WASI_LIBC_DIR"
    git -C "$WASI_LIBC_DIR" checkout "$WASI_LIBC_COMMIT"
    echo ""
else
    # Verify we're at the expected commit
    CURRENT_COMMIT="$(git -C "$WASI_LIBC_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")"
    if [ "$CURRENT_COMMIT" != "$WASI_LIBC_COMMIT" ]; then
        echo "WARNING: wasi-libc is at $CURRENT_COMMIT, expected $WASI_LIBC_COMMIT"
        if [ "$MODE" != "check" ]; then
            echo "Resetting to pinned commit..."
            git -C "$WASI_LIBC_DIR" checkout "$WASI_LIBC_COMMIT"
        fi
    fi
fi

# Find patch files
if [ "$MODE" = "reverse" ]; then
    PATCH_FILES=$(find "$PATCHES_DIR" -name '*.patch' -type f 2>/dev/null | sort -r)
else
    PATCH_FILES=$(find "$PATCHES_DIR" -name '*.patch' -type f 2>/dev/null | sort)
fi

if [ -z "$PATCH_FILES" ]; then
    echo "No patch files found in $PATCHES_DIR"
    if [ "$MODE" = "apply" ]; then
        echo "Building vanilla (unpatched) sysroot..."
    else
        exit 0
    fi
else
    PATCH_COUNT=$(echo "$PATCH_FILES" | wc -l)
    echo "Found $PATCH_COUNT patch(es) in $PATCHES_DIR"
    echo "wasi-libc source: $WASI_LIBC_DIR"
    echo ""

    FAILED=0

    for PATCH in $PATCH_FILES; do
        PATCH_NAME="$(basename "$PATCH")"

        case "$MODE" in
            check)
                echo -n "Checking $PATCH_NAME ... "
                if patch --dry-run -p1 -d "$WASI_LIBC_DIR" < "$PATCH" > /dev/null 2>&1; then
                    echo "OK (applies cleanly)"
                elif patch --dry-run -R -p1 -d "$WASI_LIBC_DIR" < "$PATCH" > /dev/null 2>&1; then
                    echo "OK (already applied)"
                else
                    # Check if new files from this patch exist (layered patch scenario)
                    NEW_FILES=$(grep '^+++ b/' "$PATCH" | sed 's|^+++ b/||' | while read -r f; do
                        [ -f "$WASI_LIBC_DIR/$f" ] && echo "$f"
                    done)
                    if [ -n "$NEW_FILES" ]; then
                        echo "OK (applied, modified by later patch)"
                    else
                        echo "FAIL (does not apply)"
                        FAILED=1
                    fi
                fi
                ;;
            apply)
                echo -n "Applying $PATCH_NAME ... "
                if patch --dry-run -p1 -d "$WASI_LIBC_DIR" < "$PATCH" > /dev/null 2>&1; then
                    patch -p1 -d "$WASI_LIBC_DIR" < "$PATCH" > /dev/null 2>&1
                    echo "applied"
                else
                    echo "already applied (skipping)"
                fi
                ;;
            reverse)
                echo -n "Reversing $PATCH_NAME ... "
                if patch -R --dry-run -p1 -d "$WASI_LIBC_DIR" < "$PATCH" > /dev/null 2>&1; then
                    patch -R -p1 -d "$WASI_LIBC_DIR" < "$PATCH" > /dev/null 2>&1
                    echo "reversed"
                else
                    echo "not applied (skipping)"
                fi
                ;;
        esac
    done

    echo ""
    if [ "$FAILED" -ne 0 ]; then
        echo "Some patches failed to apply. Check patch compatibility with pinned wasi-libc."
        exit 1
    else
        case "$MODE" in
            check)   echo "All patches verified."; exit 0 ;;
            reverse) echo "All patches reversed."; exit 0 ;;
        esac
    fi
fi

# Build the sysroot (only in apply mode)
echo ""
echo "=== Building patched wasi-libc sysroot ==="

# wasi-sdk tools
WASI_CC="$WASI_SDK_DIR/bin/clang"
WASI_AR="$WASI_SDK_DIR/bin/llvm-ar"
WASI_NM="$WASI_SDK_DIR/bin/llvm-nm"

if [ ! -x "$WASI_CC" ]; then
    echo "ERROR: wasi-sdk clang not found at $WASI_CC"
    exit 1
fi

# Clean previous build artifacts and sysroot for a reproducible build
make -C "$WASI_LIBC_DIR" clean 2>/dev/null || true
rm -rf "$SYSROOT_DIR"

# Build wasi-libc with wasi-sdk's tools, output to our sysroot directory
make -C "$WASI_LIBC_DIR" \
    CC="$WASI_CC" \
    AR="$WASI_AR" \
    NM="$WASI_NM" \
    SYSROOT="$SYSROOT_DIR" \
    -j"$(nproc 2>/dev/null || echo 4)"

echo ""
echo "=== Sysroot build complete ==="

# Verify the build output
if [ -f "$SYSROOT_DIR/lib/wasm32-wasi/libc.a" ]; then
    echo "OK: $SYSROOT_DIR/lib/wasm32-wasi/libc.a exists"
else
    echo "ERROR: libc.a not found in sysroot — build may have failed"
    exit 1
fi

echo "Patched sysroot installed to: $SYSROOT_DIR"
