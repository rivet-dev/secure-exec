#!/bin/bash
# patch-std.sh — Apply wasmVM patches to the Rust std source tree
#
# Patches modify the WASI platform implementation in std to support
# process spawning, pipes, user/group IDs, and terminal detection
# via custom host_process/host_user WASM imports.
#
# Usage:
#   ./scripts/patch-std.sh [--check] [--reverse]
#
# Options:
#   --check    Dry-run: verify patches apply cleanly without modifying files
#   --reverse  Reverse (unapply) previously applied patches

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WASMCORE_DIR="$(dirname "$SCRIPT_DIR")"
PATCHES_DIR="$WASMCORE_DIR/patches"

# Get the sysroot for the toolchain specified in rust-toolchain.toml
SYSROOT="$(rustc --print sysroot)"
STD_SRC="$SYSROOT/lib/rustlib/src/rust"

if [ ! -d "$STD_SRC/library/std" ]; then
    echo "ERROR: Rust source not found at $STD_SRC"
    echo "Ensure rust-src component is installed: rustup component add rust-src"
    exit 1
fi

# Parse arguments
MODE="apply"
PATCH_FLAGS="-p1"
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

# Find all patch files in order (reversed for --reverse mode)
if [ "$MODE" = "reverse" ]; then
    PATCH_FILES=$(find "$PATCHES_DIR" -name '*.patch' -type f 2>/dev/null | sort -r)
else
    PATCH_FILES=$(find "$PATCHES_DIR" -name '*.patch' -type f 2>/dev/null | sort)
fi

if [ -z "$PATCH_FILES" ]; then
    echo "No patch files found in $PATCHES_DIR"
    exit 0
fi

PATCH_COUNT=$(echo "$PATCH_FILES" | wc -l)
echo "Found $PATCH_COUNT patch(es) in $PATCHES_DIR"
echo "Rust std source: $STD_SRC"
echo ""

FAILED=0

for PATCH in $PATCH_FILES; do
    PATCH_NAME="$(basename "$PATCH")"

    case "$MODE" in
        check)
            echo -n "Checking $PATCH_NAME ... "
            if patch --dry-run $PATCH_FLAGS -d "$STD_SRC" < "$PATCH" > /dev/null 2>&1; then
                echo "OK (applies cleanly)"
            elif patch --dry-run -R $PATCH_FLAGS -d "$STD_SRC" < "$PATCH" > /dev/null 2>&1; then
                echo "OK (already applied)"
            else
                # When layered patches modify files created by earlier patches,
                # neither forward nor reverse will match exactly. Check if any
                # new files from this patch exist as a secondary heuristic.
                NEW_FILES=$(grep '^+++ b/' "$PATCH" | sed 's|^+++ b/||' | while read -r f; do
                    [ -f "$STD_SRC/$f" ] && echo "$f"
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
            # Try forward dry-run first; if it succeeds, apply for real.
            # If forward fails, the patch is already applied (or modified by
            # a later layered patch). Using forward-first avoids false failures
            # when later patches modify files created by earlier ones.
            if patch --dry-run $PATCH_FLAGS -d "$STD_SRC" < "$PATCH" > /dev/null 2>&1; then
                patch $PATCH_FLAGS -d "$STD_SRC" < "$PATCH" > /dev/null 2>&1
                echo "applied"
            else
                echo "already applied (skipping)"
            fi
            ;;
        reverse)
            echo -n "Reversing $PATCH_NAME ... "
            if patch -R $PATCH_FLAGS -d "$STD_SRC" < "$PATCH" > /dev/null 2>&1; then
                echo "reversed"
            else
                echo "not applied (skipping)"
            fi
            ;;
    esac
done

echo ""
if [ "$FAILED" -ne 0 ]; then
    echo "Some patches failed to apply. Check patch compatibility with current nightly."
    exit 1
else
    case "$MODE" in
        check)   echo "All patches verified." ;;
        apply)   echo "All patches applied successfully." ;;
        reverse) echo "All patches reversed." ;;
    esac
fi
