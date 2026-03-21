# Spec: Node.js Official Test Suite Integration

## Status

Proposed

## Motivation

secure-exec emulates Node.js inside an isolated-vm sandbox. The project-matrix
test suite validates parity for ~43 real-world packages, but coverage is
opportunistic — it tests whatever APIs each package happens to use. There is no
systematic way to know which Node.js APIs are correctly emulated and which have
subtle behavioral divergences.

The official Node.js test suite (`test/parallel/` alone has ~1,600+ test files)
is the authoritative source of truth for Node.js behavior. Running a curated
subset against secure-exec would:

1. **Systematically find compatibility gaps** — instead of discovering them when
   a user's package breaks, find them proactively per-module
2. **Provide a quantitative compatibility score** — e.g., "fs: 73/120 passing,
   path: 45/45 passing" — for the docs and for prioritizing bridge work
3. **Prevent regressions** — new bridge changes can be validated against the
   official behavioral spec
4. **Build credibility** — Bun publishes per-module pass rates; secure-exec
   should too

### Prior art

**Bun** runs thousands of Node.js official tests before every release. They
adapted (not copied verbatim) the test suite, replacing error strings with error
codes. They track per-module pass rates (e.g., `node:fs` 92%, `node:zlib` 98%)
and target 75% minimum per commit. Tests are re-run for every commit.

**Deno** repurposed portions of the Node.js test suite for their Node
compatibility layer, focusing on modules like `fs`.

Both runtimes found that the test suite cannot be run as-is — it requires
adaptation for the target runtime's execution model.

## Node.js test suite structure

### Organization

```
nodejs/node/test/
├── common/              # Shared helpers (mustCall, platformTimeout, tmpdir)
├── fixtures/            # Test data files
├── parallel/            # ~1,600 tests (main target — can run concurrently)
├── sequential/          # Tests requiring serial execution
├── es-module/           # ESM-specific tests
├── async-hooks/         # async_hooks tests
├── internet/            # Tests requiring outbound network
├── pseudo-tty/          # TTY-dependent tests
└── ...                  # 30+ other subdirectories
```

### Test file conventions

Every test follows this pattern:

```javascript
'use strict';
const common = require('../common');   // always first — detects global leaks
const assert = require('node:assert');
const fs = require('node:fs');

// Tests use node:assert exclusively — no external frameworks
assert.strictEqual(fs.existsSync('/tmp'), true);

// Async tests use common.mustCall() to verify callbacks fire
fs.readFile('/tmp/test', common.mustCall((err, data) => {
  assert.ifError(err);
  assert.ok(data.length > 0);
}));
```

Key conventions:
- `'use strict'` at top of every file
- `require('../common')` first (even if unused) — detects global variable leaks
- `node:assert` with strict assertions only (`strictEqual`, `deepStrictEqual`)
- `common.mustCall(fn, expectedCalls)` wraps callbacks to verify invocation count
- `common.mustSucceed(fn)` for error-first callbacks
- `common.platformTimeout(ms)` for platform-adjusted timeouts
- Tests exit 0 on success, non-zero or timeout on failure — no test runner framework
- Files named `test-{module}-{feature}.js` (e.g., `test-fs-read.js`)

### Module coverage (relevant to secure-exec)

| Module | Approx. test count in `test/parallel/` | Bridge tier |
|--------|----------------------------------------|-------------|
| fs | 150+ | Tier 1 (full bridge) |
| path | 15+ | Tier 2 (polyfill) |
| crypto | 80+ | Tier 3 (stub — getRandomValues/randomUUID only) |
| http | 100+ | Tier 1 (full bridge) |
| net | 40+ | Tier 4 (deferred) |
| child_process | 50+ | Tier 1 (full bridge) |
| stream | 60+ | Tier 2 (polyfill) |
| buffer | 60+ | Tier 2 (polyfill) |
| events | 30+ | Tier 2 (polyfill) |
| url | 20+ | Tier 2 (polyfill) |
| util | 40+ | Tier 2 (polyfill) |
| os | 15+ | Tier 1 (full bridge) |
| dns | 15+ | Tier 1 (full bridge) |
| zlib | 25+ | Tier 2 (polyfill) |
| timers | 20+ | Tier 1 (full bridge) |
| process | 40+ | Tier 1 (full bridge) |
| assert | 20+ | Tier 2 (polyfill) |
| querystring | 10+ | Tier 2 (polyfill) |
| string_decoder | 5+ | Tier 2 (polyfill) |

**Priority order for integration**: path > buffer > events > url > util >
assert > querystring > string_decoder > stream > zlib > fs > process > os >
timers > child_process > http > dns > crypto > net

Rationale: start with Tier 2 polyfills (pure JS, high expected pass rate) to
validate the harness, then move to Tier 1 bridges (more complex, more
divergence), then Tier 3/4 (stubs/deferred — expect low pass rates, useful for
gap documentation).

## Integration approach

### Why NOT run as-is

The Node.js test suite cannot be executed unmodified inside secure-exec because:

1. **`common` module** — requires filesystem access to `test/common/` and
   `test/fixtures/`. The sandbox would need these mounted or the `common` module
   shimmed.
2. **Process-level assertions** — many tests spawn child processes, check exit
   codes, or test process signals. These assume a real OS environment.
3. **Platform assumptions** — tests assume access to `/tmp`, user home
   directories, real network interfaces, etc.
4. **Native addons** — tests for native-addon APIs are irrelevant.
5. **Execution model** — tests assume `node test-foo.js` execution; secure-exec
   uses `proc.exec(code)`.

### Proposed approach: adapted test runner with `common` shim

**Phase 1: Curated subset with `common` shim**

Create a lightweight test harness that:

1. **Vendors a curated subset** of Node.js `test/parallel/` tests into the
   secure-exec repo under `packages/secure-exec/tests/nodejs-suite/vendored/`
2. **Provides a `common` shim** that adapts the Node.js `test/common/` module
   to work inside the sandbox (e.g., `mustCall` tracking, `tmpdir` pointing to
   VFS `/tmp`, global leak detection disabled)
3. **Runs each test file** through `proc.exec()` in a fresh `NodeRuntime`
   instance, captures exit code and stdio
4. **Reports per-module pass/fail/skip/error counts** in a structured format

```
packages/secure-exec/tests/
├── nodejs-suite/
│   ├── nodejs-suite.test.ts       # Vitest driver
│   ├── common-shim.ts             # common module shim for sandbox
│   ├── runner.ts                  # Test execution engine
│   ├── manifest.json              # Curated test list with expected status
│   ├── vendored/                  # Vendored Node.js test files
│   │   ├── test-path-parse.js
│   │   ├── test-path-join.js
│   │   ├── test-buffer-alloc.js
│   │   └── ...
│   └── fixtures/                  # Vendored test fixtures (data files)
│       └── ...
```

**Phase 2: Automated curation pipeline**

Add a script that:
1. Clones `nodejs/node` at a pinned tag (e.g., `v22.14.0`)
2. Filters `test/parallel/test-{module}-*.js` for target modules
3. Statically analyzes each test for compatibility signals:
   - Uses `child_process.spawn/fork` → skip (process spawning tests)
   - Uses `require('cluster')` / `require('worker_threads')` → skip
   - Uses `net.createServer()` / `http.createServer()` → keep (server bridge exists)
   - References `/dev/`, `/proc/`, platform-specific paths → skip
   - Has `// Flags:` with unsupported flags → skip
4. Copies compatible tests to `vendored/`
5. Generates `manifest.json` with initial status

**Phase 3: CI dashboard**

- Run the suite in CI on every PR
- Generate a compatibility report artifact:
  ```
  Node.js Test Suite Compatibility Report
  =======================================
  path:           45/45  (100%)
  buffer:         52/60  ( 87%)
  events:         28/30  ( 93%)
  url:            18/20  ( 90%)
  util:           35/40  ( 88%)
  stream:         41/60  ( 68%)
  fs:             89/150 ( 59%)
  process:        22/40  ( 55%)
  child_process:  18/50  ( 36%)
  http:           25/100 ( 25%)
  crypto:          3/80  (  4%)
  net:             0/40  (  0%)
  ─────────────────────────────
  TOTAL:         376/715 ( 53%)
  ```
- Publish per-module scores to `docs/nodejs-compatibility.mdx`
- Fail CI if any previously-passing test regresses (ratchet)

## `common` shim design

The `common` module is the backbone of every Node.js test. The shim must
provide functional equivalents for the most-used helpers:

### Must implement

| Helper | Purpose | Shim strategy |
|--------|---------|---------------|
| `common.mustCall(fn, exact)` | Assert callback fires exactly N times | Track call count, assert at process exit |
| `common.mustSucceed(fn)` | Assert no error in error-first callback | Wrap fn, throw on err |
| `common.mustNotCall(msg)` | Assert callback never fires | Return fn that throws |
| `common.expectsError(settings)` | Assert specific error type/code/message | Return validator fn |
| `common.tmpDir` | Temp directory path | Point to VFS `/tmp/node-test-XXXX` |
| `common.hasCrypto` | Whether crypto is available | `true` (limited) |
| `common.hasIPv6` | Whether IPv6 is available | `false` (safe default) |
| `common.isWindows` / `common.isLinux` / `common.isMacOS` | Platform checks | Based on `os.platform()` bridge |
| `common.platformTimeout(ms)` | Scale timeout for slow platforms | Pass-through (sandbox is fast) |
| `common.skip(msg)` | Skip test with reason | `process.exit(0)` with skip marker |

### Safe to stub/omit

| Helper | Reason |
|--------|--------|
| `common.PORT` | Server tests use port 0 anyway |
| `common.childShouldThrowAndAbort()` | Process abort tests irrelevant |
| `common.crashOnUnhandledRejection()` | Sandbox handles differently |
| `common.disableCrashOnUnhandledRejection()` | Same |
| `common.enoughTestCpu` / `common.enoughTestMem` | Always true in sandbox |

### Submodules to shim

- `common/tmpdir` — `tmpdir.path` → `/tmp/node-test`, `tmpdir.refresh()` → mkdir + clean
- `common/fixtures` — `fixtures.path(name)` → resolve from vendored fixtures dir
- `common/countdown` — simple counter implementation (tiny)

## Test manifest format

```json
{
  "nodeVersion": "v22.14.0",
  "generated": "2026-03-20",
  "tests": [
    {
      "file": "test-path-parse.js",
      "module": "path",
      "status": "pass",
      "skipReason": null
    },
    {
      "file": "test-fs-read-stream.js",
      "module": "fs",
      "status": "fail",
      "skipReason": null
    },
    {
      "file": "test-child-process-fork.js",
      "module": "child_process",
      "status": "skip",
      "skipReason": "uses child_process.fork (not bridged)"
    }
  ]
}
```

Status values:
- `pass` — test passes in sandbox (asserted in CI)
- `fail` — test fails, failure is expected and tracked
- `skip` — test excluded from suite (incompatible with sandbox model)
- `error` — test crashes/times out (distinct from assertion failure)

The ratchet rule: once a test reaches `pass`, it can never regress to `fail`
or `error` without updating the manifest and providing a justification. This
prevents silent regressions.

## Execution engine

```typescript
// nodejs-suite/runner.ts — simplified sketch

interface TestResult {
  file: string;
  module: string;
  status: 'pass' | 'fail' | 'error' | 'skip';
  durationMs: number;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

async function runNodejsTest(
  testFile: string,
  commonShimCode: string,
  fixturesDir: string,
): Promise<TestResult> {
  const testCode = await readFile(testFile, 'utf8');

  // Prepend common shim: rewrite require('../common') to use our shim
  const shimmedCode = `
    // Inject common shim
    const __commonShim = (function() { ${commonShimCode} })();
    const __originalRequire = require;
    require = function(id) {
      if (id === '../common' || id === '../../common') return __commonShim;
      if (id.startsWith('../common/')) return __commonShim[id.split('/').pop()];
      return __originalRequire(id);
    };
    ${testCode}
  `;

  const proc = createTestNodeRuntime({
    filesystem: new NodeFileSystem(),
    permissions: { ...allowAllFs, ...allowAllEnv, ...allowAllNetwork },
    processConfig: { cwd: '/tmp/node-test', env: {} },
  });

  try {
    const events: StdioEvent[] = [];
    const result = await proc.exec(shimmedCode, {
      filePath: testFile,
      env: {},
    });

    return {
      file: path.basename(testFile),
      module: extractModule(testFile),
      status: result.code === 0 ? 'pass' : 'fail',
      durationMs: /* timer */,
      stdout: formatStdio(events, 'stdout'),
      stderr: formatStdio(events, 'stderr'),
      errorMessage: result.errorMessage,
    };
  } catch (e) {
    return {
      file: path.basename(testFile),
      module: extractModule(testFile),
      status: 'error',
      durationMs: /* timer */,
      stdout: '',
      stderr: '',
      errorMessage: String(e),
    };
  } finally {
    proc.dispose();
  }
}
```

## Vitest driver

```typescript
// nodejs-suite/nodejs-suite.test.ts

import { describe, it, expect } from 'vitest';
import manifest from './manifest.json';
import { runNodejsTest } from './runner';

const TIMEOUT_MS = 30_000;

for (const entry of manifest.tests) {
  if (entry.status === 'skip') continue;

  describe(entry.module, () => {
    it(entry.file, async () => {
      const result = await runNodejsTest(
        path.join(__dirname, 'vendored', entry.file),
        commonShimCode,
        path.join(__dirname, 'fixtures'),
      );

      if (entry.status === 'pass') {
        // Ratchet: previously-passing tests must keep passing
        expect(result.status).toBe('pass');
      }

      // Always record the result for the report
      results.push(result);
    }, TIMEOUT_MS);
  });
}
```

## Phased rollout

### Phase 1: Harness + path module (week 1)

- Build the `common` shim with `mustCall`, `mustSucceed`, `mustNotCall`, `tmpdir`
- Vendor all `test-path-*.js` files from Node.js v22.14.0
- Run through the harness, target 100% pass rate (path is a pure polyfill)
- Validate the runner, manifest format, and reporting

**Why path first**: It's a pure-JS polyfill (`path-browserify`) with no bridge
dependencies, no filesystem access, and no async behavior. If the harness works
for path, the infrastructure is sound.

### Phase 2: Pure-JS polyfill modules (weeks 2-3)

Add tests for modules implemented as polyfills:
- `buffer` — 60+ tests, exercises TypedArray interop
- `events` — 30+ tests, EventEmitter semantics
- `url` — 20+ tests, URL parsing
- `util` — 40+ tests, inspect/format/types
- `assert` — 20+ tests, assertion library
- `querystring` — 10+ tests
- `string_decoder` — 5+ tests

Expected: 80-95% pass rate. Failures reveal polyfill divergences.

### Phase 3: Bridge modules (weeks 4-6)

Add tests for modules with full bridge implementations:
- `fs` — 150+ tests, largest surface area. Many will need skip (platform paths,
  permissions, symlinks, watch). Target 50%+ pass rate on compatible tests.
- `process` — 40+ tests. Skip exit/signal/spawn tests. Target env, cwd, hrtime.
- `os` — 15+ tests. Mostly bridge-backed, high expected pass rate.
- `timers` — 20+ tests. setTimeout/setInterval/setImmediate.
- `child_process` — 50+ tests. Many will skip (fork, complex IPC). Target
  spawn/exec basics.
- `http` — 100+ tests. Many will skip (Agent pooling, upgrade). Target basic
  request/response.
- `dns` — 15+ tests. lookup + resolve.

Expected: 40-70% pass rate. Failures drive bridge improvements.

### Phase 4: Stub modules + dashboard (weeks 7-8)

- Add crypto tests (expect very low pass rate — only getRandomValues/randomUUID)
- Add stream tests (polyfill — expect moderate pass rate)
- Add zlib tests (polyfill — expect moderate pass rate)
- Build CI compatibility report
- Publish scores to `docs/nodejs-compatibility.mdx`
- Set up ratchet (fail CI on regression)

## Test curation rules

### Include

- `test/parallel/test-{module}-*.js` for target modules
- Tests that use only: assert, common.mustCall, common.tmpDir, basic require
- Tests that create HTTP servers (bridge supports it)
- Tests that read/write files (fs bridge supports it)

### Exclude (skip)

- Tests using `child_process.fork()` — not bridged
- Tests using `cluster` or `worker_threads` — not bridged
- Tests using `dgram` (UDP) — not bridged
- Tests using native addons (`.node` files)
- Tests with `// Flags: --expose-internals` or other unsupported V8 flags
- Tests that inspect `/proc/`, `/dev/`, or platform-specific kernel interfaces
- Tests that depend on specific process exit behavior (`process.abort()`, uncaughtException exit codes)
- Tests that require `inspector` or debugger protocol
- Tests that depend on GC behavior (`global.gc()`, weak references timing)
- Tests that test Node.js CLI argument parsing

### Static analysis heuristics for automated curation

```javascript
const SKIP_PATTERNS = [
  /child_process\.(fork|execFile)/,     // fork not bridged
  /require\(['"]cluster['"]\)/,          // cluster not bridged
  /require\(['"]worker_threads['"]\)/,   // workers not bridged
  /require\(['"]dgram['"]\)/,            // UDP not bridged
  /require\(['"]inspector['"]\)/,        // inspector not bridged
  /require\(['"]repl['"]\)/,             // repl not bridged
  /\/\/\s*Flags:\s*--expose/,            // internal flags
  /\/\/\s*Flags:\s*--harmony/,           // experimental flags
  /process\.abort\(\)/,                  // abort tests
  /global\.gc\(\)/,                      // GC-dependent
  /\.node['"]\)/,                        // native addon loading
  /require\(['"]\.\.\/common\/sea['"]\)/, // single-executable tests
];
```

## Relationship to existing test infrastructure

### Complements, does not replace

| Suite | Purpose | Scope |
|-------|---------|-------|
| **test-suite/** | Shared integration tests across all drivers | Generic runtime behavior |
| **runtime-driver/** | Driver-specific behavior | Node-only features (memoryLimit, etc.) |
| **project-matrix/** | Real-world package parity | Black-box package output comparison |
| **cli-tools/** | CLI agent E2E | Pi, Claude Code, OpenCode inside sandbox |
| **nodejs-suite/** (new) | Official Node.js behavioral spec | Per-API correctness against upstream |

The Node.js suite tests **individual API correctness** while the project-matrix
tests **package-level integration**. Both are needed — a package can work despite
individual API bugs if it doesn't hit those code paths, and individual APIs can
pass tests while integration breaks due to ordering/state issues.

### Shared infrastructure

- Reuses `createTestNodeRuntime()` from `test-utils.ts`
- Reuses `NodeFileSystem`, permissions, and network adapter from secure-exec
- Follows the `contracts/runtime-driver-test-suite-structure.md` layout
  convention (test files named by domain, not "contract")
- No mocking of external services (per CLAUDE.md testing policy)

## Documentation updates

When the suite is running:

1. **`docs/nodejs-compatibility.mdx`** — add "Node.js Test Suite Results"
   section with per-module pass rates and last-run date
2. **`docs-internal/todo.md`** — mark the "Add Node.js test suite" item done
3. **`README.md`** — mention compatibility scores in the comparison section
   if numbers are strong enough to be a selling point

## Risks and mitigations

### Test volume overwhelms CI

~800+ tests across all target modules. At 5s average per test, that's ~67
minutes serial. **Mitigation**: Run tests in parallel (Vitest's default),
group by module with separate describe blocks, set a 10s per-test timeout.
Consider splitting into a dedicated CI job that runs on merge only (not every
PR push).

### `common` shim divergence

The `common` module evolves with Node.js releases. The shim may drift.
**Mitigation**: Pin to a specific Node.js tag. Re-vendor and update shim when
bumping the target version. Document the pinned version in `manifest.json`.

### Test files assume filesystem state

Many tests create temp files, expect `/tmp` access, or read fixtures.
**Mitigation**: The `common/tmpdir` shim creates a fresh `/tmp/node-test-*`
per test. Vendored fixtures are mounted via NodeFileSystem. Tests that need
platform-specific paths are skipped.

### Maintenance burden of vendored tests

Vendored test files are a snapshot — they don't auto-update. **Mitigation**:
The curation script (Phase 2) can re-vendor from a newer tag. The diff shows
which tests changed, were added, or were removed. Run quarterly or when
bumping the target Node.js version.

### Low initial pass rates may be discouraging

Crypto (4%), net (0%) will show very low numbers. **Mitigation**: Present
results per tier. Tier 2 polyfills should show 80%+. Frame low-pass modules
as "known scope" rather than failures. The scores improve as bridge work
progresses.

## Success criteria

- Harness runs vendored Node.js tests through `proc.exec()` with `common` shim
- Per-module pass/fail/skip/error counts are reported
- At least `path` module achieves 100% pass rate (validates harness)
- At least 5 modules integrated with tracked results
- Ratchet prevents regressions on previously-passing tests
- CI generates a compatibility report artifact
- `docs/nodejs-compatibility.mdx` updated with test suite results
