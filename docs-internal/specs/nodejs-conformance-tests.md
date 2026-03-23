# Spec: Node.js Conformance Test Suite Integration

## Status

Draft

## Motivation

secure-exec validates Node.js compatibility via two mechanisms today:

1. **Project-matrix** — 42 real-world npm package fixtures run in host Node and
   secure-exec, comparing normalized `code`/`stdout`/`stderr`. This validates
   that popular packages load and behave identically, but doesn't test the
   individual Node.js API surface systematically.

2. **Runtime-driver tests** — Hand-written tests in `tests/runtime-driver/` and
   `tests/test-suite/` exercise bridge, polyfill, and stub behavior. These are
   valuable but cover only the APIs we thought to test.

Neither approach gives us **systematic per-API coverage** of Node.js built-in
modules. If `fs.readFile` works for Express but breaks with a specific flag
combination, we won't know. If `Buffer.from` handles ASCII but corrupts Latin-1,
we won't catch it until a user reports it.

The official Node.js test suite (`test/parallel/` in `nodejs/node`) contains
**~3,842 individual test files** covering every built-in module. Bun runs
thousands of these upstream tests before every release (targeting 75%+ pass
rate). Deno vendors ~1,229 of the 3,936 tests (~31% passing). Both projects
treat the upstream Node.js test suite as the authoritative conformance target.

secure-exec should do the same — systematically run upstream Node.js tests
through the sandbox and track pass/fail rates per module.

## Goals

1. Run the **entire** upstream Node.js 22.x test suite through secure-exec
2. Specify the **expected result** (pass or fail) for every test, with a
   documented reason for every expected failure
3. Discover compatibility gaps that project-matrix and hand-written tests miss
4. Integrate into CI with a "no regressions" gate (unexpected results block
   merges)
5. Make the default posture **opt-out** — new upstream tests are automatically
   expected to pass unless explicitly marked as expected-fail

## Non-Goals

- 100% pass rate (many Node.js tests exercise features secure-exec intentionally
  doesn't support — `net.createServer`, `cluster`, `worker_threads`, etc.)
- Replacing project-matrix or hand-written tests — this is an additional layer

## Core Principle: Expected Results, Not Exclusions

Every test has an expected outcome. The default expectation is **pass**. The
expectations file documents every test that is NOT expected to pass, with a
specific reason why.

This is fundamentally different from an exclusion/skip list:

- **Tests expected to fail are still executed.** We verify they fail. This means
  we instantly detect when a previously-failing test starts passing (e.g.,
  because we added support for a module or fixed a bridge gap).
- **The expectations file is a complete inventory** of every known
  incompatibility. Its size is a direct measure of how far we are from full
  Node.js conformance.
- **No hiding behind "skip."** An unsupported module like `cluster` doesn't get
  skipped — its tests run, fail as expected, and the failure reason is
  documented. If we ever add cluster support, those tests auto-promote.
- **`skip` is reserved strictly for tests that hang, timeout, or crash** the
  sandbox. This is a tiny set — most failing tests fail cleanly and quickly.

## Design

### Approach: Vendored Tests with Expected Results

Vendor the full `test/parallel/` directory from Node.js 22.x into the repo. Run
every test file. Maintain a single expectations file documenting every test that
is not expected to pass and why.

**Why vendor instead of git submodule or download-at-test-time:**
- Vendored files are reviewable in PRs (we can see exactly what's being tested)
- No network dependency at test time
- We can apply minimal patches if a test needs adaptation (e.g., replacing
  `require('../common')` with our own compatibility shim)
- Clear git blame for when tests were added or updated

### Directory Structure

```
packages/secure-exec/tests/
├── node-conformance/
│   ├── runner.test.ts              # Vitest test driver
│   ├── expectations.json           # Expected results for every non-passing test
│   ├── common/                     # Our reimplementation of Node's test/common
│   │   ├── index.js                # Core helpers (mustCall, mustNotCall, etc.)
│   │   ├── fixtures.js             # Fixture file helpers
│   │   └── tmpdir.js               # Temp directory helpers
│   ├── fixtures/                   # Test data files (from upstream test/fixtures/)
│   │   └── ...
│   ├── parallel/                   # Vendored tests from Node's test/parallel/
│   │   ├── test-buffer-alloc.js
│   │   ├── test-buffer-bytelength.js
│   │   ├── test-path-basename.js
│   │   ├── test-fs-readfile.js
│   │   └── ... (all ~3,842 test files)
│   └── scripts/
│       ├── import-tests.ts         # Script to pull/update tests from upstream
│       └── validate-expectations.ts # Script to verify expectations integrity
```

### Expectations File Format

`expectations.json` is the single source of truth for tests that are NOT
expected to pass. **Tests not listed are expected to pass.** Every entry MUST
include a reason explaining why the test does not pass.

```json
{
  "nodeVersion": "22.14.0",
  "sourceCommit": "abc123def456",
  "lastUpdated": "2026-03-22",
  "expectations": {
    "test-cluster-basic.js": {
      "expected": "fail",
      "reason": "cluster module is Tier 5 (Unsupported) — require('cluster') throws by design",
      "category": "unsupported-module"
    },
    "test-worker-threads-basic.js": {
      "expected": "fail",
      "reason": "worker_threads is Tier 4 (Deferred) — no cross-isolate threading support",
      "category": "unsupported-module"
    },
    "test-net-server-listen.js": {
      "expected": "skip",
      "reason": "HANGS — blocks on net.createServer().listen() callback that never fires",
      "category": "unsupported-module"
    },
    "test-dgram-send.js": {
      "expected": "fail",
      "reason": "dgram is Tier 5 (Unsupported) — UDP not implemented",
      "category": "unsupported-module"
    },
    "test-fs-watch.js": {
      "expected": "skip",
      "reason": "HANGS — blocks on fs.watch() callback that never fires (inotify not available in VFS)",
      "category": "unsupported-api"
    },
    "test-fs-stat-bigint.js": {
      "expected": "fail",
      "reason": "VFS stat does not populate BigInt fields (birthtimeNs, etc.)",
      "category": "implementation-gap",
      "issue": "https://github.com/rivet-dev/secure-exec/issues/NNN"
    },
    "test-buffer-backing-arraybuffer.js": {
      "expected": "fail",
      "reason": "requires SharedArrayBuffer which is disabled in timing-hardened mode",
      "category": "security-constraint"
    },
    "test-crypto-dh.js": {
      "expected": "fail",
      "reason": "crypto.createDiffieHellman not bridged — crypto is Tier 3 (Stub)",
      "category": "unsupported-api"
    },
    "test-inspector-esm.js": {
      "expected": "fail",
      "reason": "inspector is Tier 5 (Unsupported) — V8 inspector protocol not exposed",
      "category": "unsupported-module"
    },
    "test-repl-history.js": {
      "expected": "fail",
      "reason": "repl is Tier 5 (Unsupported)",
      "category": "unsupported-module"
    },
    "test-http-server-keep-alive-timeout.js": {
      "expected": "fail",
      "reason": "bridged http.createServer does not implement keep-alive timeout",
      "category": "implementation-gap",
      "issue": "https://github.com/rivet-dev/secure-exec/issues/NNN"
    },
    "test-child-process-fork.js": {
      "expected": "fail",
      "reason": "child_process.fork is permanently unsupported — IPC across isolate boundary not possible",
      "category": "unsupported-api"
    },
    "test-process-getgroups.js": {
      "expected": "fail",
      "reason": "requires --expose-internals V8 flag — not available in sandbox",
      "category": "requires-v8-flags"
    },
    "test-addon-hello-world.js": {
      "expected": "fail",
      "reason": "native addons (.node) are rejected by the sandbox",
      "category": "native-addon"
    },
    "test-readline-interactive.js": {
      "expected": "skip",
      "reason": "HANGS — blocks on readline question() waiting for stdin that never arrives",
      "category": "unsupported-api"
    }
  }
}
```

#### Expected Result Values

- **`fail`** — Test IS executed and expected to exit non-zero. This is the
  primary status for tests that don't pass. The test runs, we verify it fails,
  and the reason is documented. If the test starts passing, the runner errors
  and tells the developer to remove the entry — locking in the improvement.

- **`skip`** — Test is NOT executed. **Reserved strictly for tests that hang,
  timeout, or crash the sandbox.** A test that fails cleanly (throws, asserts,
  exits non-zero) should be `fail`, not `skip`. The `skip` status exists only
  to prevent the test suite from blocking on tests that would eat a 30-second
  timeout each.

The distinction is critical: `fail` means "this test runs and fails — we know
exactly what happens." `skip` means "this test would hang or crash if we ran
it — we can't even get a clean failure." The vast majority of entries should
be `fail`.

#### When to Use `skip` vs `fail`

| Scenario | Use | Why |
|---|---|---|
| `require('cluster')` throws immediately | `fail` | Clean failure, fast, informative |
| `net.createServer().listen()` blocks forever | `skip` | Would hang for 30s before timeout |
| `fs.watch()` registers watcher, callback never fires | `skip` | Would hang waiting for events |
| `crypto.createDiffieHellman()` throws "not implemented" | `fail` | Clean throw, instant |
| V8 flag `--expose-internals` not available | `fail` | Test errors immediately on internal require |
| `readline.question()` waits for stdin forever | `skip` | Would hang on stdin read |
| Native addon `.node` file rejected | `fail` | Clean error on require |

**Rule of thumb:** If the test exits (pass or fail) within a few seconds, use
`fail`. If it would block indefinitely waiting for I/O, callbacks, or events
that will never arrive, use `skip`.

#### Expectation Categories

Every entry MUST have a `category` from this fixed set:

| Category | Meaning | Example |
|---|---|---|
| `unsupported-module` | Tests a Tier 4/5 module that secure-exec doesn't implement | `cluster`, `dgram`, `worker_threads`, `inspector` |
| `unsupported-api` | Tests a specific API within a supported module that is deferred/unsupported | `fs.watch`, `child_process.fork`, `crypto.createDiffieHellman` |
| `implementation-gap` | Tests an API we intend to support but haven't fully implemented | `fs.stat` BigInt fields, HTTP keep-alive timeout |
| `security-constraint` | Tests a feature disabled for security reasons | `SharedArrayBuffer`, `--expose-internals` |
| `requires-v8-flags` | Tests that need `// Flags:` pragmas we can't honor | `--expose-internals`, `--expose-gc`, `--max-old-space-size` |
| `native-addon` | Tests that load compiled C++ addons | `test/addons/*`, `test/node-api/*` |
| `platform-specific` | Tests that need OS features not available in the VFS | Real TTY, raw sockets, file permissions bits |
| `test-infra` | Tests that exercise Node.js's own test infrastructure, not runtime behavior | `test-test-runner-*`, `test-runner-*` |

#### Expectations File Policies

1. **Every entry MUST have a non-empty `reason`** that is specific enough to
   evaluate. "doesn't work" is not acceptable. "cluster module is Tier 5
   (Unsupported) — require('cluster') throws by design" is.

2. **`implementation-gap` entries MUST link to a tracking issue.** These
   represent work we intend to do, so there must be a place to track it.

3. **Other categories do NOT need tracking issues** — they represent
   architectural boundaries or design decisions, not bugs.

4. **`skip` entries MUST explain why the test hangs/crashes.** The reason must
   describe the specific blocking behavior (e.g., "blocks on
   net.createServer().listen() callback that never fires"). Vague reasons like
   "unsupported module" are not acceptable for `skip` — if the test fails
   cleanly, it should be `fail`.

5. **Bulk expectations by glob are allowed** to avoid listing hundreds of
   individual test files for modules where most tests have the same expected
   result:

   ```json
   {
     "test-cluster-*.js": {
       "expected": "fail",
       "reason": "cluster module is Tier 5 (Unsupported) — require('cluster') throws by design",
       "category": "unsupported-module",
       "glob": true
     }
   }
   ```

   When `"glob": true`, the key is treated as a glob pattern. Individual
   entries override glob matches (e.g., a specific `test-cluster-fork.js`
   entry with `skip` overrides the glob `fail` if that particular test hangs).

6. **Auto-promotion is enforced.** If a `fail`-expected test starts passing,
   the runner errors and tells the developer to remove the entry. This
   prevents the expectations file from becoming stale.

7. **Periodic audit.** The `validate-expectations.ts` script checks that:
   - Every entry matches at least one file in `parallel/`
   - Every entry has a non-empty `reason`
   - Every `implementation-gap` entry has an `issue` URL
   - Every `skip` entry has a reason describing the hang/crash behavior
   - Glob patterns match at least one file

### Test Runner (`runner.test.ts`)

The runner discovers all `test-*.js` files in `parallel/`, checks each against
the expectations file, and runs everything (except `skip`):

```typescript
import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { minimatch } from "minimatch";
import expectations from "./expectations.json";
import { createTestNodeRuntime } from "../test-utils.js";

const TEST_TIMEOUT_MS = 30_000;
const PARALLEL_DIR = join(__dirname, "parallel");

// Build resolved expectations map (expand globs, individual entries override)
function resolveExpectations(
  testFiles: string[],
  raw: typeof expectations.expectations,
): Map<string, (typeof expectations.expectations)[string]> {
  const map = new Map();
  // First pass: apply glob patterns
  for (const [pattern, config] of Object.entries(raw)) {
    if (config.glob) {
      for (const file of testFiles) {
        if (minimatch(file, pattern)) map.set(file, config);
      }
    }
  }
  // Second pass: individual entries override globs
  for (const [pattern, config] of Object.entries(raw)) {
    if (!config.glob) {
      map.set(pattern, config);
    }
  }
  return map;
}

// Discover all test files
const allTestFiles = (await readdir(PARALLEL_DIR))
  .filter((f) => f.startsWith("test-") && f.endsWith(".js"))
  .sort();

const resolved = resolveExpectations(allTestFiles, expectations.expectations);

// Group by module for readable output
const byModule = groupByModule(allTestFiles);

for (const [moduleName, testFiles] of Object.entries(byModule)) {
  describe(`node/${moduleName}`, () => {
    for (const testFile of testFiles) {
      const expectation = resolved.get(testFile);

      // skip = test hangs/crashes, do not execute
      if (expectation?.expected === "skip") {
        it.skip(`${testFile} — SKIP: ${expectation.reason}`, () => {});
        continue;
      }

      it(testFile, async () => {
        const testCode = await readFile(
          join(PARALLEL_DIR, testFile), "utf-8"
        );

        const runtime = createTestNodeRuntime({
          permissions: conformanceTestPermissions,
          filesystem: createConformanceFs(testFile),
        });

        const result = await runtime.exec(testCode);

        if (expectation?.expected === "fail") {
          // Expected failure — verify it still fails.
          // If it passes, that's a signal to remove the entry.
          if (result.code === 0) {
            throw new Error(
              `${testFile} is expected to fail but now passes! ` +
              `Remove it from expectations.json to lock in this fix.`
            );
          }
        } else {
          // No entry = expected to pass.
          expect(result.code).toBe(0);
        }
      }, TEST_TIMEOUT_MS);
    }
  });
}
```

**Key behaviors:**
- **Not in expectations file** → test MUST pass (exit code 0). Failure blocks CI.
- **Expected `fail`** → test is executed and verified to fail. If it
  *unexpectedly passes*, the runner errors and tells the developer to remove
  the entry — locking in the improvement.
- **Expected `skip`** → test is not executed. Shown as skipped in output. Used
  ONLY for tests that would hang/crash.

### `common/` Compatibility Shim

Node.js test files `require('../common')` as their first line. We provide a
secure-exec-compatible reimplementation that:

1. **Exports the same helpers**: `mustCall`, `mustCallAtLeast`, `mustNotCall`,
   `mustSucceed`, `mustNotMutateObjectDeep`, `expectsError`, `expectWarning`,
   `skip`, `platformTimeout`, `getArrayBufferViews`, `invalidArgTypeHelper`,
   `allowGlobals`, platform detection booleans
2. **Adapts to sandbox environment**: `common.tmpDir` → VFS temp directory,
   `common.fixturesDir` → `/fixtures/` in VFS, platform booleans reflect
   sandbox (always Linux-like)
3. **Skips gracefully**: `common.hasCrypto`, `common.hasIntl`,
   `common.hasOpenSSL` report based on what secure-exec actually supports
4. **Does NOT reimplement**: `common.PORT` (no server binding), inspector
   helpers, DNS helpers, TLS cert helpers

This is the highest-effort piece but also the most reusable — once `common/` is
solid, adding new test files is mostly mechanical.

### Import Script (`scripts/import-tests.ts`)

A script to pull/refresh test files from an upstream Node.js release:

```
pnpm tsx scripts/import-tests.ts --node-version 22.14.0
```

The script:
1. Downloads the Node.js source tarball (or clones at a tag)
2. Copies the entire `test/parallel/` directory into `parallel/`
3. Copies required `test/fixtures/` files
4. Copies `test/common/` as reference (not directly used by our runner)
5. Records `nodeVersion` and `sourceCommit` in `expectations.json`

Unlike an opt-in model, there is **no filtering step**. All tests land. The
runner will immediately surface any new test that fails, forcing a decision:
fix the gap or add the test to the expectations file with a reason.

### Execution Model

Each upstream test file is executed as a self-contained script via
`runtime.exec(code)`. The key adaptation is **module resolution**: upstream
tests use `require('../common')` and `require('../common/tmpdir')`. We handle
this by:

1. **VFS pre-population**: Before each test, populate the VFS with:
   - `/test/common/` → our `common/` shim files
   - `/test/fixtures/` → vendored fixture data
   - `/test/parallel/` → the test file itself (for self-referencing tests)
   - `/tmp/` → writable temp directory

2. **Working directory**: Set `cwd` to `/test/parallel/` so that relative
   `require('../common')` resolves to `/test/common/`

3. **Permissions**: Grant `allowAllFs` + `allowAllEnv` (tests need full FS and
   env access within the VFS). Network is denied by default unless the specific
   test needs it.

### CI Integration

#### Test Command

```bash
# Run all conformance tests
pnpm vitest run packages/secure-exec/tests/node-conformance/runner.test.ts

# Run a specific module
pnpm vitest run packages/secure-exec/tests/node-conformance/runner.test.ts -t "node/buffer"
```

#### CI Gate: No Unexpected Results

The CI check enforces two invariants:

1. **Tests not in the expectations file MUST pass.** Any failure here means
   either a regression was introduced or a new upstream test exposed a gap.
   The fix is either to fix the code or add the test to the expectations file
   with a reason (which is a reviewable, auditable change).

2. **Tests expected to `fail` that now pass MUST be promoted.** The runner
   errors if an expected-fail test starts passing. This prevents the
   expectations file from becoming stale — improvements are automatically
   surfaced.

#### Separate CI Job

Conformance tests run in a dedicated CI job:

```yaml
# .github/workflows/conformance.yml
conformance:
  name: Node.js Conformance
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
    - run: pnpm install
    - run: pnpm build
    - run: pnpm vitest run packages/secure-exec/tests/node-conformance/runner.test.ts
```

**Rationale:** Conformance tests are slow (~3,842 test files, each spawning a
V8 isolate). Keeping them in a separate job avoids slowing down the main test
suite while still blocking merges on regressions.

### Metrics and Reporting

The runner outputs a summary after each run:

```
Node.js Conformance Summary (v22.14.0)
───────────────────────────────────────
Module          Total   Pass    Fail    Skip    Pass Rate
buffer          67      58      9       0       86.6%
path            25      24      1       0       96.0%
url             30      25      5       0       83.3%
events          30      27      3       0       90.0%
fs              247     89      155     3       36.0%
process         93      31      62      0       33.3%
cluster         83      0       83      0       0.0%
net             148     0       12      136     0.0%
...
───────────────────────────────────────
TOTAL           3842    1847    1856    139     49.9%
Expected fail:  1856 (all confirmed failing)
Skipped:        139 (hang/crash)
Must-pass:      1847 (all passing)
```

This summary is:
- Printed to stdout after test execution
- Written to `conformance-report.json` for CI artifact upload
- Compared against previous runs to surface trends

The **pass rate** and the **expected-fail count** are the two headline metrics.
The goal over time is to shrink the expected-fail list. The skip list should
stay small and stable.

### Auto-Generated Conformance Report (`docs/conformance-report.mdx`)

After each test run, the runner generates a machine-readable
`conformance-report.json`. A script converts this into a publishable MDX page
at `docs/conformance-report.mdx` that is linked from the Node.js compatibility
page.

#### Report Generation Script (`scripts/generate-report.ts`)

```bash
pnpm tsx scripts/generate-report.ts \
  --input conformance-report.json \
  --expectations expectations.json \
  --output ../../docs/conformance-report.mdx
```

The script:
1. Reads `conformance-report.json` (test results) and `expectations.json`
   (expected results with reasons)
2. Generates `docs/conformance-report.mdx` with:
   - Frontmatter (title, description, icon)
   - Headline metrics (total tests, pass rate, expected-fail count, skip count)
   - Per-module breakdown table (pass/fail/skip counts and pass rate)
   - Full expected-fail list grouped by category, with reasons visible
3. The generated file includes a header comment:
   `{/* AUTO-GENERATED — do not edit. Run scripts/generate-report.ts */}`

#### Generated Page Structure

```mdx
---
title: Node.js Conformance Report
description: Upstream Node.js test suite results for secure-exec.
icon: "chart-bar"
---

{/* AUTO-GENERATED — do not edit. Run scripts/generate-report.ts */}

## Summary

| Metric | Value |
| --- | --- |
| Node.js version | 22.14.0 |
| Total tests | 3,842 |
| Passing | 2,047 (53.3%) |
| Expected fail | 1,656 |
| Skipped (hang/crash) | 139 |
| Last updated | 2026-03-22 |

## Per-Module Results

| Module | Total | Pass | Fail | Skip | Pass Rate |
| --- | --- | --- | --- | --- | --- |
| assert | 25 | 23 | 2 | 0 | 92.0% |
| buffer | 67 | 58 | 9 | 0 | 86.6% |
| child_process | 107 | 28 | 79 | 0 | 26.2% |
| cluster | 83 | 0 | 83 | 0 | 0.0% |
| console | 20 | 16 | 4 | 0 | 80.0% |
| net | 148 | 0 | 12 | 136 | 0.0% |
| ...  | | | | | |

## Expected Failures by Category

### Unsupported Modules (800 tests)

Tests for modules that secure-exec does not implement by design. These tests
run and fail as expected.

| Test | Module | Reason |
| --- | --- | --- |
| `test-cluster-*.js` (83) | cluster | Tier 5 — require('cluster') throws by design |
| `test-dgram-*.js` (75) | dgram | Tier 5 — UDP not implemented |
| `test-inspector-*.js` (71) | inspector | Tier 5 — V8 inspector not exposed |
| ... | | |

### Implementation Gaps (189 tests)

Tests for supported APIs that don't fully pass yet. Each has a tracking issue.

| Test | Reason | Issue |
| --- | --- | --- |
| `test-fs-stat-bigint.js` | VFS stat missing BigInt fields | [#NNN](https://github.com/rivet-dev/secure-exec/issues/NNN) |
| `test-http-server-keep-alive-timeout.js` | Keep-alive timeout not bridged | [#NNN](https://github.com/rivet-dev/secure-exec/issues/NNN) |
| ... | | |

### Security Constraints (N tests)
### Requires V8 Flags (N tests)
### Native Addons (N tests)
### Platform-Specific (N tests)
### Test Infrastructure (N tests)

## Skipped Tests (Hang/Crash) — N tests

Tests that cannot be executed because they hang indefinitely or crash the
sandbox. These are NOT expected failures — they are tests we cannot run at all.

| Test | Reason |
| --- | --- |
| `test-net-server-listen.js` | Blocks on net.createServer().listen() callback that never fires |
| `test-fs-watch.js` | Blocks on fs.watch() callback that never fires |
| `test-readline-interactive.js` | Blocks on readline question() waiting for stdin |
| ... | |
```

#### Docs Navigation

Add `conformance-report` to the Reference group in `docs/docs.json`, adjacent
to `nodejs-compatibility`:

```json
{
  "group": "Reference",
  "pages": [
    "api-reference",
    "nodejs-compatibility",
    "conformance-report",
    "benchmarks",
    ...
  ]
}
```

#### Link from Node.js Compatibility Page

Add a callout at the top of `docs/nodejs-compatibility.mdx` linking to the
conformance report:

```mdx
<Info>
  See the [Node.js Conformance Report](/conformance-report) for per-module
  pass rates from the upstream Node.js test suite.
</Info>
```

#### CI Report Generation

The conformance CI job generates and commits the report:

```yaml
conformance:
  name: Node.js Conformance
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
    - run: pnpm install
    - run: pnpm build
    - run: pnpm vitest run packages/secure-exec/tests/node-conformance/runner.test.ts
    - name: Generate conformance report
      run: pnpm tsx packages/secure-exec/tests/node-conformance/scripts/generate-report.ts
             --input conformance-report.json
             --expectations packages/secure-exec/tests/node-conformance/expectations.json
             --output docs/conformance-report.mdx
    - name: Upload report artifact
      uses: actions/upload-artifact@v4
      with:
        name: conformance-report
        path: |
          conformance-report.json
          docs/conformance-report.mdx
```

The generated `conformance-report.mdx` is committed to the repo so the docs
site always reflects the latest CI results. On `main` branch pushes, the CI
job can auto-commit the updated report (or open a PR if the report changed).

### Expectations Validation (`scripts/validate-expectations.ts`)

A standalone script that audits the expectations file for integrity:

```bash
pnpm tsx scripts/validate-expectations.ts
```

Checks:
1. Every key in `expectations` matches at least one file in `parallel/` (or is
   a valid glob that matches files)
2. Every entry has a non-empty `reason` string
3. Every `implementation-gap` entry has a non-empty `issue` URL
4. Every entry has a valid `category` from the fixed set
5. Every `skip` entry has a reason that describes hang/crash behavior (not just
   "unsupported module")
6. No test file appears in multiple glob matches without an individual override
7. Reports any files in `parallel/` that are not in the expectations file AND
   not in the last test run results — i.e., orphaned tests

This runs in CI alongside the conformance tests.

### Updating Upstream Tests

When Node.js releases a new patch/minor in the 22.x line:

1. Run `import-tests.ts --node-version 22.x.y` to refresh vendored files
2. Run the conformance suite — new/changed tests that fail will be immediately
   visible
3. For each new failure: fix the gap or add to expectations file with reason
4. Remove entries for tests that were deleted upstream
5. Update `nodeVersion` and `sourceCommit` in `expectations.json`
6. Commit as a single PR: "chore: update conformance tests to Node.js 22.x.y"

Major version bumps (22 → 24) are a larger effort — new APIs, changed
behaviors, new test files. Handle as a dedicated project.

### Patch Policy

When an upstream test needs a minimal fix to work in secure-exec (e.g., a
hardcoded path or platform-specific assumption), we allow patching the vendored
file with a `// SECURE-EXEC PATCH:` comment explaining the change:

```javascript
// SECURE-EXEC PATCH: VFS uses /tmp instead of os.tmpdir()
const tmpDir = '/tmp';
```

Patches should be minimal and rare. If a test needs significant changes to
pass, that's a signal the underlying runtime behavior diverges — add it to the
expectations file instead.

## Implementation Plan

### Step 1: Bootstrap Infrastructure

- Create `tests/node-conformance/` directory structure
- Implement `common/index.js` shim with core helpers (`mustCall`,
  `mustNotCall`, `mustNotMutateObjectDeep`, `expectsError`, `skip`,
  `getArrayBufferViews`, `invalidArgTypeHelper`, platform booleans)
- Implement `common/tmpdir.js` (VFS-backed temp directory)
- Implement `common/fixtures.js` (VFS fixture loader)
- Write `runner.test.ts` with expectations-driven execution
- Create initial `expectations.json` with metadata fields and empty expectations

### Step 2: Import Full Test Suite

- Write `scripts/import-tests.ts`
- Import all `test/parallel/` test files from Node.js 22.x
- Import required `test/fixtures/` data
- Run suite — expect many failures on first run

### Step 3: Initial Triage

- For each failing test, classify and add to `expectations.json`:
  - Unsupported modules → bulk glob expectations (`test-cluster-*.js`, etc.)
    with `expected: "fail"`
  - Hanging tests → individual `expected: "skip"` with hang description
  - Unsupported APIs → individual `expected: "fail"` with specific reason
  - Implementation gaps → `expected: "fail"` with tracking issue
  - V8 flags / native addons / platform features → `expected: "fail"` with reason
- Target: all expected-pass tests passing, all expected-fail tests confirmed
  failing, skip list as small as possible

### Step 4: CI Integration

- Add `conformance.yml` workflow
- Add `validate-expectations.ts` script
- Wire both into CI
- Add conformance report as CI artifact

### Step 5: Fix Root Causes and Shrink Expected-Fail List

- Fix process `'exit'` event emission on normal completion (bridge and/or
  V8 isolate runner — editing native/v8-runtime/ is allowed)
- Fix `process.exit()` exit code swallowing in exit event handlers
- Add missing `common/` helpers (mustNotMutateObjectDeep, getArrayBufferViews,
  invalidArgTypeHelper)
- Re-triage after fixes (pass count may drop as mustCall verification activates)
- Review `implementation-gap` entries, prioritize by impact
- Fix bridge/polyfill gaps to convert expected-fail entries to passing
- Remove entries from expectations file as fixes land
- Track pass rate trend over time

### Step 6: Report Generation and Documentation

- Implement `scripts/generate-report.ts` to produce `docs/conformance-report.mdx`
- Add `conformance-report` to `docs/docs.json` navigation under Reference
- Add Info callout in `docs/nodejs-compatibility.mdx` linking to the report
- Wire report generation into the conformance CI job
- Add conformance coverage obligations to the compatibility governance contract

## Expected Initial Expectations Breakdown

Based on upstream test counts and secure-exec's support tiers:

| Category | Est. Expected-Fail | Est. Skip (hang) | Examples |
|---|---|---|---|
| `unsupported-module` | ~700 | ~100 | cluster (83), dgram (75), worker_threads (138), inspector (71), repl (104). Most fail cleanly; net/tls server tests may hang |
| `unsupported-api` | ~150 | ~50 | fs.watch (hangs), child_process.fork (fails), crypto DH/ECDH/Sign (fails). Watcher/listener tests may hang |
| `requires-v8-flags` | ~150 | 0 | `--expose-internals`, `--expose-gc` — all fail cleanly on missing internal modules |
| `native-addon` | ~170 | 0 | test/addons/*, test/node-api/* — all fail cleanly on require |
| `platform-specific` | ~80 | 0 | pseudo-tty, raw sockets — most fail cleanly |
| `test-infra` | ~50 | 0 | test-runner-*, test-test-* — fail on missing node:test module |
| `implementation-gap` | ~150-300 | 0 | Bridged modules with partial coverage — fail cleanly with wrong results |
| **Total** | **~1,450-1,700** | **~150** | |
| **Expected passing** | **~2,000-2,250** | | ~52-58% pass rate |

Note: the skip count should be much smaller than the old model because most
"unsupported module" tests now run as expected-fail instead of being skipped.

## Open Questions

1. **Test isolation**: Should each test get a fresh VFS, or share a common
   snapshot? Fresh is safer (no cross-test contamination) but slower.
   Recommendation: fresh VFS per test, optimize later if needed.

2. **Timeout budget**: Upstream tests are designed to run in <30s on real Node.
   V8 isolate overhead may require higher timeouts. Start with 30s, bump per
   module as needed. Expected-fail tests that timeout should be re-categorized
   as `skip` to keep the suite fast.

3. **WPT tests**: Node.js also runs Web Platform Tests for `URL`,
   `TextEncoder`/`TextDecoder`, `fetch`, `Blob`, etc. These are a natural
   complement. Should we include WPT alongside or separately? Recommendation:
   separately, as WPT has its own runner infrastructure (`test/common/wpt.js`).

4. **Differential mode**: Should we also run each test in host Node.js and
   compare output (like project-matrix), or just check exit code?
   Recommendation: start with exit-code-only (pass/fail). Differential output
   comparison adds complexity and many tests produce non-deterministic output
   (PIDs, timestamps, memory addresses). Add differential mode for specific
   modules where output parity matters.

5. **Parallelism**: Node's `test/parallel/` tests are designed to run
   concurrently. Can we run them concurrently in secure-exec, or does each
   needing its own V8 isolate + VFS make that impractical? Start serial,
   profile, then add parallelism if needed.

6. **Timeout-to-skip promotion**: Should the runner automatically mark tests
   that timeout as `skip` candidates? This would help identify hanging tests
   during initial triage. Recommendation: yes, report timeouts separately in
   the summary so they can be reviewed and added as `skip` entries.

## Prior Art

| Project | Approach | Coverage |
|---|---|---|
| **Bun** | Runs upstream Node.js test files directly; tracks per-module pass rates | ~75% target; 100% for events/os/path |
| **Deno** | Vendors Node.js tests into `tests/node_compat/`; tracks in `config.jsonc` | ~31% (~1,229 of 3,936 tests) |
| **WinterTC** | Developing ECMA-429 "Minimum Common Web API" with curated WPT subset | Web APIs only, not Node.js-specific |
| **Edge.js** (Wasmer) | WASM sandbox; claims Node v24 compat via WASIX | No public conformance metrics |

Our approach differs from both Bun and Deno by running the **entire** test suite
with **explicit expected results** for every non-passing test. Unlike Deno's
opt-in config or Bun's pass-rate tracking, we document the specific reason each
test fails and verify that expected-fail tests actually fail — catching
improvements that would otherwise go unnoticed.
