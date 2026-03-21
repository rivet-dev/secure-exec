#!/bin/bash
# patch-vendor.sh — Apply crate-level patches to vendored dependencies
#
# Iterates patches/crates/<crate-name>/*.patch, finds the matching
# vendor/<crate-name> directory, applies each patch, and nulls out
# .cargo-checksum.json file hashes so Cargo accepts the modified source.
#
# Usage:
#   ./scripts/patch-vendor.sh [--check] [--reverse]
#
# Options:
#   --check    Dry-run: verify patches apply cleanly without modifying files
#   --reverse  Reverse (unapply) previously applied patches

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WASMCORE_DIR="$(dirname "$SCRIPT_DIR")"
PATCHES_DIR="$WASMCORE_DIR/patches/crates"
VENDOR_DIR="$WASMCORE_DIR/vendor"

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

if [ ! -d "$PATCHES_DIR" ]; then
    echo "No patches/crates/ directory found — nothing to patch"
    exit 0
fi

if [ ! -d "$VENDOR_DIR" ]; then
    echo "ERROR: vendor/ directory not found. Run 'cargo vendor' first."
    exit 1
fi

# Find all crate patch directories
CRATE_DIRS=$(find "$PATCHES_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

if [ -z "$CRATE_DIRS" ]; then
    echo "No crate patch directories found in $PATCHES_DIR — nothing to patch"
    exit 0
fi

TOTAL_PATCHES=0
FAILED=0

for CRATE_DIR in $CRATE_DIRS; do
    CRATE_NAME="$(basename "$CRATE_DIR")"

    # Find the matching vendor directory (crate-name or crate-name-version)
    VENDOR_CRATE=""
    if [ -d "$VENDOR_DIR/$CRATE_NAME" ]; then
        VENDOR_CRATE="$VENDOR_DIR/$CRATE_NAME"
    else
        # Try matching crate-name-* (versioned directory)
        MATCHES=$(find "$VENDOR_DIR" -maxdepth 1 -type d -name "${CRATE_NAME}-*" 2>/dev/null | sort -V | tail -1)
        if [ -n "$MATCHES" ]; then
            VENDOR_CRATE="$MATCHES"
        fi
    fi

    if [ -z "$VENDOR_CRATE" ]; then
        echo "WARNING: No vendor directory found for crate '$CRATE_NAME' — skipping"
        continue
    fi

    # Find patch files for this crate
    if [ "$MODE" = "reverse" ]; then
        PATCH_FILES=$(find "$CRATE_DIR" -name '*.patch' -type f 2>/dev/null | sort -r)
    else
        PATCH_FILES=$(find "$CRATE_DIR" -name '*.patch' -type f 2>/dev/null | sort)
    fi

    if [ -z "$PATCH_FILES" ]; then
        continue
    fi

    echo "=== $CRATE_NAME ($(basename "$VENDOR_CRATE")) ==="

    for PATCH in $PATCH_FILES; do
        PATCH_NAME="$(basename "$PATCH")"
        TOTAL_PATCHES=$((TOTAL_PATCHES + 1))

        case "$MODE" in
            check)
                echo -n "  Checking $PATCH_NAME ... "
                if patch --dry-run -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1; then
                    echo "OK (applies cleanly)"
                elif patch --dry-run -R -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1; then
                    echo "OK (already applied)"
                else
                    echo "FAIL (does not apply)"
                    FAILED=$((FAILED + 1))
                fi
                ;;
            apply)
                echo -n "  Applying $PATCH_NAME ... "
                if patch --dry-run -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1; then
                    patch -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1
                    echo "applied"
                elif patch --dry-run -R -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1; then
                    echo "already applied (skipping)"
                else
                    echo "FAIL (does not apply)"
                    FAILED=$((FAILED + 1))
                fi
                ;;
            reverse)
                echo -n "  Reversing $PATCH_NAME ... "
                if patch -R --dry-run -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1; then
                    patch -R -p1 -d "$VENDOR_CRATE" < "$PATCH" > /dev/null 2>&1
                    echo "reversed"
                else
                    echo "not applied (skipping)"
                fi
                ;;
        esac
    done

    # Null out .cargo-checksum.json hashes so Cargo accepts patched sources
    if [ "$MODE" = "apply" ]; then
        CHECKSUM_FILE="$VENDOR_CRATE/.cargo-checksum.json"
        if [ -f "$CHECKSUM_FILE" ]; then
            # Replace the "files" object with an empty object to skip checksum verification
            python3 -c "
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
data['files'] = {}
with open(path, 'w') as f:
    json.dump(data, f)
" "$CHECKSUM_FILE" 2>/dev/null || \
            # Fallback: use sed if python3 is not available
            sed -i 's/"files":{[^}]*}/"files":{}/' "$CHECKSUM_FILE"
        fi
    fi

    echo ""
done

echo "=== Summary ==="
echo "Total patches processed: $TOTAL_PATCHES"

if [ "$FAILED" -ne 0 ]; then
    echo "FAILED: $FAILED patch(es) did not apply"
    exit 1
else
    case "$MODE" in
        check)   echo "All vendor patches verified." ;;
        apply)   echo "All vendor patches applied successfully." ;;
        reverse) echo "All vendor patches reversed." ;;
    esac
fi
