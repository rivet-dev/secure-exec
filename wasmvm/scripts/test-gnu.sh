#!/usr/bin/env bash
#
# GNU Coreutils Compatibility Test Runner
#
# Runs a subset of GNU coreutils-compatible tests against the wasmVM/WasmCore
# runtime. Tests focus on pure computation behavior (not OS-dependent features).
#
# Reference: https://github.com/coreutils/coreutils/tree/master/tests
#
# Usage:
#   ./scripts/test-gnu.sh           # Run all GNU compat tests
#   ./scripts/test-gnu.sh --verbose  # Show individual test results
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMANDS_DIR="$PROJECT_DIR/target/wasm32-wasip1/release/commands"

# Check standalone binaries exist
if [ ! -d "$COMMANDS_DIR" ]; then
    echo "Error: Commands directory not found at $COMMANDS_DIR"
    echo "Run 'make wasm' first."
    exit 1
fi

echo "=== GNU Coreutils Compatibility Test Suite ==="
echo "Commands dir: $COMMANDS_DIR ($( ls -1 "$COMMANDS_DIR" | wc -l ) binaries)"
echo ""

# Determine verbosity
VERBOSE_FLAG=""
if [[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]]; then
    VERBOSE_FLAG="--test-reporter=spec"
fi

# Run the Node.js test suite
cd "$PROJECT_DIR/host"

# Use node:test runner with the GNU compat test file
if [ -n "$VERBOSE_FLAG" ]; then
    node --test $VERBOSE_FLAG test/gnu-compat.test.js 2>&1
else
    # Default: run with spec reporter for summary output
    node --test --test-reporter=spec test/gnu-compat.test.js 2>&1
fi

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "=== All GNU compatibility tests PASSED ==="
else
    echo "=== Some GNU compatibility tests FAILED (see above) ==="
    echo "See test/KNOWN-FAILURES.md for documented incompatibilities."
fi

exit $EXIT_CODE
