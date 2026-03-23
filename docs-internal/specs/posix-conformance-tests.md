# Spec: POSIX Conformance Test Suite Integration (os-test)

## Status

Draft

## Motivation

secure-exec's WasmVM aims for "full POSIX compliance 1:1" — every syscall and
shell behavior should match a real Linux system exactly. Today we validate POSIX
behavior via two mechanisms:

1. **C parity tests** (`packages/wasmvm/test/c-parity.test.ts`) — Hand-written C
   programs in `native/wasmvm/c/programs/` compiled to both WASM and native,
   comparing stdout/stderr/exit code. These cover the syscalls we thought to
   test (~45 programs), but miss large swaths of the POSIX surface.

2. **`syscall_coverage.c`** — A single program exercising every libc-to-WASI and
   libc-to-host-import path. Structured as `name: ok`/`name: FAIL` output.
   Valuable but hand-maintained and limited to one test case per syscall.

Neither approach gives us **systematic coverage** of POSIX APIs. If `opendir`
works for basic directory listing but breaks with `DT_UNKNOWN` entries, we won't
know. If `pipe` works for simple read/write but fails with `O_NONBLOCK`, we
won't catch it until a real program breaks.

[os-test](https://sortix.org/os-test/) is an actively developed POSIX.1-2024
conformance test suite created by the Sortix project, funded by NLnet/NGI Zero
Commons. It provides hundreds of standalone C test programs covering io, malloc,
signal, UDP, POSIX headers, and more. Systems including OpenBSD, Redox, Midipix,
and others already use os-test to find real implementation bugs.

secure-exec should integrate os-test — systematically compile and run upstream
POSIX conformance tests through the WasmVM kernel and track pass/fail rates.

## Goals

1. Run the **entire** os-test suite through the WasmVM kernel (compiled to
   wasm32-wasip1 via wasi-sdk)
2. Maintain an explicit **exclusion list** of tests that cannot pass, each with
   a documented reason — every other test is expected to pass
3. Discover POSIX compliance gaps that hand-written C tests miss
4. Integrate into CI with a "no regressions" gate (new failures block merges)
5. Run each test both **natively and in WASM**, comparing results for parity
   (extending the existing c-parity model)
6. Auto-generate a publishable conformance report for the docs site

## Non-Goals

- 100% pass rate (many POSIX tests exercise features that are architecturally
  impossible in WASM — `fork`, `exec`, `pthreads`, `mmap`, real signals, etc.)
- Replacing hand-written C parity tests or `syscall_coverage.c` — this is an
  additional layer of systematic coverage
- Testing non-POSIX behavior (Linux-specific syscalls, GNU extensions)

## Core Principle: Opt-Out, Not Opt-In

The runner discovers **all** os-test programs and runs them. The only way to skip
or expect failure for a test is to add it to the exclusion list with a documented
reason. This means:

- When we update to a newer os-test release, new tests run immediately. If they
  fail, we either fix the gap or add them to the exclusion list with a reason.
- The exclusion list is the complete inventory of known POSIX incompatibilities.
  Its size is a direct measure of how far we are from full POSIX conformance.
- Removing an entry from the exclusion list is a one-line change that
  immediately promotes the test to "must pass" status.

## Design

### Approach: Vendored Tests with Exclusion List

Vendor the os-test source into the repo. Compile every test program to both
native and wasm32-wasip1. Run both, compare results. Maintain a single exclusion
list documenting every test that cannot pass and why.

**Why vendor instead of git submodule:**
- Vendored files are reviewable in PRs
- No network dependency at test time
- We can see exactly what's being tested in git blame
- ISC license is compatible with our Apache-2.0 policy

### Directory Structure

```
native/wasmvm/c/
├── os-test/                        # Vendored os-test source
│   ├── include/                    # os-test headers (io/, malloc/, signal/, etc.)
│   │   ├── io/
│   │   ├── malloc/
│   │   ├── signal/
│   │   └── ...
│   └── src/                        # Individual test .c files
│       ├── io/
│       │   ├── close_basic.c
│       │   ├── dup_basic.c
│       │   ├── open_creat.c
│       │   ├── pipe_basic.c
│       │   ├── read_basic.c
│       │   ├── write_basic.c
│       │   └── ...
│       ├── malloc/
│       ├── signal/
│       └── ...
├── Makefile                        # Extended with os-test targets
└── ...

packages/wasmvm/test/
├── posix-conformance.test.ts       # Vitest test driver
├── posix-exclusions.json           # Tests that cannot pass + documented reasons
└── ...

scripts/
├── import-os-test.ts               # Script to pull/update from upstream
├── validate-posix-exclusions.ts    # Script to verify exclusion list integrity
└── generate-posix-report.ts        # Script to generate docs/posix-conformance-report.mdx
```

### Exclusion List Format

`posix-exclusions.json` is the single source of truth for tests that are NOT
expected to pass. Every entry MUST include a reason explaining why the test is
excluded. The reason must be specific enough that someone can evaluate whether
the exclusion is still valid.

```json
{
  "osTestVersion": "0.1.0",
  "sourceCommit": "abc123def456",
  "lastUpdated": "2026-03-21",
  "exclusions": {
    "signal/kill_basic": {
      "status": "skip",
      "reason": "kill() requires real signal delivery — WASM has no preemptive interruption",
      "category": "wasm-limitation"
    },
    "io/fork_pipe": {
      "status": "skip",
      "reason": "fork() is impossible in WASM — cannot copy linear memory",
      "category": "wasm-limitation"
    },
    "io/mmap_basic": {
      "status": "skip",
      "reason": "mmap() not available — WASM memory is separate from host",
      "category": "wasm-limitation"
    },
    "io/dup2_cloexec": {
      "status": "fail",
      "reason": "dup2 does not clear O_CLOEXEC on the new fd — host_process import gap",
      "category": "implementation-gap",
      "issue": "https://github.com/rivet-dev/secure-exec/issues/NNN"
    },
    "io/pread_offset": {
      "status": "fail",
      "reason": "pread does not preserve file offset after read — VFS bug",
      "category": "implementation-gap",
      "issue": "https://github.com/rivet-dev/secure-exec/issues/NNN"
    }
  }
}
```

#### Exclusion Status Values

- **`skip`** — Test is not compiled or executed. Use for tests that CANNOT work
  in the WASM sandbox (fork, exec, mmap, pthreads, real signals, raw sockets).
  These are structurally impossible to pass.
- **`fail`** — Test is compiled and executed but expected to fail. Use for tests
  that COULD work but don't yet due to an implementation gap. These MUST have an
  `issue` field linking to a tracking issue. The intent is to fix them.

The distinction matters: `skip` means "we architecturally cannot support this",
`fail` means "we should support this but don't yet."

#### Exclusion Categories

Every exclusion MUST have a `category` from this fixed set:

| Category | Meaning | Example |
|---|---|---|
| `wasm-limitation` | Feature impossible in wasm32-wasip1 | fork, exec, mmap, pthreads, real signals |
| `wasi-gap` | WASI Preview 1 lacks the required syscall | raw sockets, epoll/poll/select, shared memory |
| `implementation-gap` | We could support this but haven't yet | dup2 O_CLOEXEC, pread offset preservation |
| `patched-sysroot` | Test requires patched sysroot features not yet wired | Custom host imports not linked |
| `compile-error` | Test doesn't compile for wasm32-wasip1 (missing header, etc.) | Uses `<sys/mman.h>`, `<pthread.h>` |
| `timeout` | Test takes too long or hangs in WASM (usually a blocking syscall) | Tests that poll/spin on real-time signals |

#### Exclusion List Policies

1. **Every exclusion MUST have a non-empty `reason`** that is specific enough to
   evaluate. "doesn't work" is not acceptable. "dup2 does not clear O_CLOEXEC
   on the new fd because the host_process import doesn't track close-on-exec
   flags" is.

2. **`fail` exclusions MUST link to a tracking issue.** If we intend to fix it,
   there must be a place to track that intent.

3. **`skip` exclusions do NOT need tracking issues** — they represent
   architectural boundaries, not bugs.

4. **Bulk exclusions by prefix are allowed** to avoid listing hundreds of
   individual test files for entirely impossible feature areas:

   ```json
   {
     "signal/*": {
       "status": "skip",
       "reason": "WASM has no preemptive signal delivery — all signal tests require real async signals",
       "category": "wasm-limitation",
       "glob": true
     }
   }
   ```

   When `"glob": true`, the key is treated as a glob pattern.

5. **The exclusion list is append-only by default.** Removing an entry means
   the test is now expected to pass — this should be accompanied by the fix
   that makes it pass.

6. **Periodic audit.** The `validate-posix-exclusions.ts` script checks that:
   - Every excluded test actually exists in the vendored os-test source
   - Every `fail` exclusion still fails (if it now passes, the exclusion
     should be removed)
   - No test is excluded without a reason
   - Glob patterns match at least one test

### Build Integration

#### Makefile Additions

Extend `native/wasmvm/c/Makefile` with os-test targets:

```makefile
# --- os-test conformance suite ---

OS_TEST_DIR     := os-test
OS_TEST_SOURCES := $(shell find $(OS_TEST_DIR)/src -name '*.c' 2>/dev/null)
OS_TEST_NAMES   := $(patsubst $(OS_TEST_DIR)/src/%.c,%,$(OS_TEST_SOURCES))

# Build directory mirrors source directory structure
OS_TEST_WASM    := $(addprefix $(BUILD_DIR)/os-test/,$(OS_TEST_NAMES))
OS_TEST_NATIVE  := $(addprefix $(NATIVE_DIR)/os-test/,$(OS_TEST_NAMES))

OS_TEST_CFLAGS  := -I $(OS_TEST_DIR)/include

.PHONY: os-test os-test-native

os-test: wasi-sdk wasm-opt-check $(OS_TEST_WASM)
	@echo "=== os-test WASM Build Report ==="
	@echo "Tests: $(words $(OS_TEST_NAMES)) compiled"
	@echo "Output: $(BUILD_DIR)/os-test/"

os-test-native: $(OS_TEST_NATIVE)
	@echo "=== os-test Native Build Report ==="
	@echo "Tests: $(words $(OS_TEST_NAMES)) compiled"
	@echo "Output: $(NATIVE_DIR)/os-test/"

$(BUILD_DIR)/os-test/%: $(OS_TEST_DIR)/src/%.c $(WASI_SDK_DIR)/bin/clang
	@mkdir -p $(dir $@)
	$(CC) $(WASM_CFLAGS) $(OS_TEST_CFLAGS) -o $@.wasm $<
	wasm-opt -O3 --strip-debug $@.wasm -o $@
	@rm -f $@.wasm

$(NATIVE_DIR)/os-test/%: $(OS_TEST_DIR)/src/%.c
	@mkdir -p $(dir $@)
	$(NATIVE_CC) $(NATIVE_CFLAGS) $(OS_TEST_CFLAGS) -o $@ $<
```

Tests that require the patched sysroot (those using `host_process` or
`host_user` imports) will fail at link time with the vanilla sysroot. The
Makefile uses `|| true` for os-test builds so compilation failures don't abort
the full build — individual compile failures are tracked in the exclusion list
under category `compile-error`.

#### Fetch Script

Add a target or script to download/update os-test:

```makefile
OS_TEST_URL := https://sortix.org/os-test/release/os-test-0.1.0.tar.gz

fetch-os-test:
	@echo "Fetching os-test..."
	@mkdir -p $(LIBS_CACHE)
	@curl -fSL "$(OS_TEST_URL)" -o "$(LIBS_CACHE)/os-test.tar.gz"
	@tar -xzf "$(LIBS_CACHE)/os-test.tar.gz" -C .
	@echo "os-test extracted to $(OS_TEST_DIR)/"
```

### Test Runner (`posix-conformance.test.ts`)

The runner discovers all compiled os-test binaries, checks each against the
exclusion list, and runs everything not excluded — both natively and in WASM:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmVmRuntime } from '../src/driver.ts';
import { createKernel } from '@secure-exec/core';
import type { Kernel } from '@secure-exec/core';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join, relative } from 'node:path';
import { minimatch } from 'minimatch';
import exclusions from './posix-exclusions.json';

const TEST_TIMEOUT_MS = 30_000;
const C_BUILD_DIR = resolve(__dirname, '../../../native/wasmvm/c/build');
const NATIVE_DIR = resolve(__dirname, '../../../native/wasmvm/c/build/native');
const OS_TEST_WASM_DIR = join(C_BUILD_DIR, 'os-test');
const OS_TEST_NATIVE_DIR = join(NATIVE_DIR, 'os-test');
const COMMANDS_DIR = resolve(__dirname, '../../../native/wasmvm/target/wasm32-wasip1/release/commands');

// Discover all compiled os-test binaries (WASM side is authoritative)
function discoverTests(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...discoverTests(join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results.sort();
}

// Resolve exclusions (expand globs)
function resolveExclusions(
  testNames: string[],
  raw: typeof exclusions.exclusions,
): Map<string, (typeof exclusions.exclusions)[string]> {
  const map = new Map();
  for (const [pattern, config] of Object.entries(raw)) {
    if (config.glob) {
      for (const name of testNames) {
        if (minimatch(name, pattern)) map.set(name, config);
      }
    } else {
      map.set(pattern, config);
    }
  }
  return map;
}

// Run native binary
function runNative(path: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const proc = spawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.stdin.end();
    proc.on('close', (code) => res({ exitCode: code ?? 1, stdout, stderr }));
  });
}

const allTests = discoverTests(OS_TEST_WASM_DIR);
const resolved = resolveExclusions(allTests, exclusions.exclusions);

// Group by suite (top-level directory: io, malloc, signal, etc.)
const bySuite = new Map<string, string[]>();
for (const test of allTests) {
  const suite = test.includes('/') ? test.split('/')[0] : 'root';
  if (!bySuite.has(suite)) bySuite.set(suite, []);
  bySuite.get(suite)!.push(test);
}

for (const [suite, tests] of bySuite) {
  describe(`posix/${suite}`, () => {
    let kernel: Kernel;

    beforeEach(async () => {
      kernel = await createKernel({
        runtime: createWasmVmRuntime({ commandDirs: [COMMANDS_DIR] }),
      });
    });

    afterEach(async () => {
      await kernel.shutdown();
    });

    for (const testName of tests) {
      const exclusion = resolved.get(testName);

      if (exclusion?.status === 'skip') {
        it.skip(`${testName} — ${exclusion.reason}`, () => {});
        continue;
      }

      it(testName, async () => {
        // Run natively
        const nativePath = join(OS_TEST_NATIVE_DIR, testName);
        const nativeResult = existsSync(nativePath)
          ? await runNative(nativePath)
          : null;

        // Run in WASM via kernel
        const wasmBinary = await readFile(join(OS_TEST_WASM_DIR, testName));
        const wasmResult = await kernel.exec(wasmBinary);

        if (exclusion?.status === 'fail') {
          // Known failure — assert it still fails
          if (wasmResult.code === 0) {
            throw new Error(
              `${testName} is excluded as "fail" but now passes! ` +
              `Remove it from posix-exclusions.json to lock in this fix.`
            );
          }
        } else {
          // Not excluded — must pass
          expect(wasmResult.code).toBe(0);

          // If native binary exists, compare output parity
          if (nativeResult) {
            expect(wasmResult.code).toBe(nativeResult.exitCode);
            expect(wasmResult.stdout.trim()).toBe(nativeResult.stdout.trim());
          }
        }
      }, TEST_TIMEOUT_MS);
    }
  });
}
```

**Key behaviors:**
- **Not in exclusion list** → test MUST pass (exit code 0) AND match native
  output. Failure blocks CI.
- **Excluded as `skip`** → test is not executed. Shown as skipped in output.
- **Excluded as `fail`** → test is executed but expected to fail. If it
  *unexpectedly passes*, the runner errors and tells the developer to remove
  the exclusion entry.

### CI Integration

#### Test Command

```bash
# Build os-test binaries (WASM + native)
make -C native/wasmvm/c os-test os-test-native

# Run conformance tests
pnpm vitest run packages/wasmvm/test/posix-conformance.test.ts

# Run a specific suite
pnpm vitest run packages/wasmvm/test/posix-conformance.test.ts -t "posix/io"
```

#### CI Gate: No Regressions

The CI check enforces two invariants:

1. **Tests not in the exclusion list MUST pass and match native parity.** Any
   failure means either a regression or a new os-test release exposed a gap.

2. **Tests excluded as `fail` that now pass MUST be promoted.** The runner
   errors if a `fail`-excluded test starts passing. This prevents the exclusion
   list from becoming stale.

#### Separate CI Job

```yaml
# .github/workflows/posix-conformance.yml
posix-conformance:
  name: POSIX Conformance (os-test)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
    - run: pnpm install
    - run: pnpm build
    - name: Build WASM binaries
      run: cd native/wasmvm && make wasm
    - name: Build os-test (WASM + native)
      run: make -C native/wasmvm/c os-test os-test-native
    - run: pnpm vitest run packages/wasmvm/test/posix-conformance.test.ts
    - name: Generate conformance report
      run: pnpm tsx scripts/generate-posix-report.ts
             --input posix-conformance-report.json
             --exclusions packages/wasmvm/test/posix-exclusions.json
             --output docs/posix-conformance-report.mdx
    - name: Upload report artifact
      uses: actions/upload-artifact@v4
      with:
        name: posix-conformance-report
        path: |
          posix-conformance-report.json
          docs/posix-conformance-report.mdx
```

### Metrics and Reporting

The runner outputs a summary after each run:

```
POSIX Conformance Summary (os-test v0.1.0)
───────────────────────────────────────────
Suite           Total   Pass    Fail    Skip    Pass Rate
io              85      62      8       15      72.9%
malloc          12      11      1       0       91.7%
signal          34      0       0       34      —
include         200     178     12      10      93.7%
...
───────────────────────────────────────────
TOTAL           420     310     28      82      73.8%
Excluded:       110 (skip: 82, fail: 28)
Must-pass:      310 (all passing)
Native parity:  310/310 (100%)
```

This summary is:
- Printed to stdout after test execution
- Written to `posix-conformance-report.json` for CI artifact upload
- Compared against previous runs to surface trends

### Auto-Generated Conformance Report (`docs/posix-conformance-report.mdx`)

After each test run, a script generates a publishable MDX page:

```bash
pnpm tsx scripts/generate-posix-report.ts \
  --input posix-conformance-report.json \
  --exclusions packages/wasmvm/test/posix-exclusions.json \
  --output docs/posix-conformance-report.mdx
```

#### Generated Page Structure

```mdx
---
title: POSIX Conformance Report
description: os-test POSIX.1-2024 conformance results for WasmVM.
icon: "chart-bar"
---

{/* AUTO-GENERATED — do not edit. Run scripts/generate-posix-report.ts */}

## Summary

| Metric | Value |
| --- | --- |
| os-test version | 0.1.0 |
| Total tests | 420 |
| Passing | 310 (73.8%) |
| Excluded (fail) | 28 |
| Excluded (skip) | 82 |
| Native parity | 100% |
| Last updated | 2026-03-21 |

## Per-Suite Results

| Suite | Total | Pass | Fail | Skip | Pass Rate |
| --- | --- | --- | --- | --- | --- |
| io | 85 | 62 | 8 | 15 | 72.9% |
| malloc | 12 | 11 | 1 | 0 | 91.7% |
| signal | 34 | 0 | 0 | 34 | — |
| include | 200 | 178 | 12 | 10 | 93.7% |
| ... | | | | | |

## Exclusions by Category

### WASM Limitations (N tests)

Features impossible in wasm32-wasip1.

| Test | Reason |
| --- | --- |
| `signal/*` (34) | WASM has no preemptive signal delivery |
| `io/fork_*` (8) | fork() cannot copy WASM linear memory |
| ... | |

### Implementation Gaps (N tests)

Features we should support but don't yet. Each has a tracking issue.

| Test | Reason | Issue |
| --- | --- | --- |
| `io/dup2_cloexec` | dup2 doesn't clear O_CLOEXEC | [#NNN](https://github.com/rivet-dev/secure-exec/issues/NNN) |
| ... | | |
```

#### Docs Navigation

Add `posix-conformance-report` to the Experimental section in `docs/docs.json`,
adjacent to existing WasmVM docs:

```json
{
  "group": "Experimental",
  "pages": [
    "wasmvm/overview",
    "wasmvm/supported-commands",
    "posix-compatibility",
    "posix-conformance-report"
  ]
}
```

#### Link from POSIX Compatibility Page

Add a callout at the top of `docs/posix-compatibility.md`:

```md
> See the [POSIX Conformance Report](/posix-conformance-report) for per-suite
> pass rates from the os-test POSIX.1-2024 conformance suite.
```

### Exclusion List Validation (`scripts/validate-posix-exclusions.ts`)

A standalone script that audits the exclusion list:

```bash
pnpm tsx scripts/validate-posix-exclusions.ts
```

Checks:
1. Every key in `exclusions` matches at least one compiled test binary (or is a
   valid glob that matches)
2. Every entry has a non-empty `reason` string
3. Every `fail` entry has a non-empty `issue` URL
4. Every entry has a valid `category` from the fixed set
5. No test appears in multiple glob matches (ambiguity)
6. Reports any compiled test binaries not in the exclusion list AND not in the
   last test run results (orphaned tests)

This runs in CI alongside the conformance tests.

### Updating Upstream Tests

When os-test publishes a new release:

1. Run `import-os-test.ts --version X.Y.Z` to refresh vendored source
2. Rebuild: `make -C native/wasmvm/c os-test os-test-native`
3. Run the conformance suite — new/changed tests that fail will be visible
4. For each new failure: fix the gap or add to exclusion list with reason
5. Remove exclusion entries for tests deleted upstream
6. Update `osTestVersion` and `sourceCommit` in `posix-exclusions.json`
7. Commit as a single PR: "chore: update POSIX conformance tests to os-test X.Y.Z"

## Expected Initial Exclusion Breakdown

Based on os-test's coverage areas and WasmVM's architectural constraints:

| Category | Est. Excluded | Examples |
|---|---|---|
| `wasm-limitation` | ~40-60 | fork, exec, pthreads, mmap, real async signals, setuid/setgid |
| `wasi-gap` | ~10-20 | Raw sockets, epoll/poll/select, shared memory, ptrace |
| `compile-error` | ~10-20 | Tests including `<pthread.h>`, `<sys/mman.h>`, `<sys/wait.h>` with fork |
| `implementation-gap` | ~20-40 | Partial dup/pipe/stat behavior, missing fcntl flags |
| `timeout` | ~5-10 | Tests that spin on real-time features |
| **Total excluded** | **~85-150** | |
| **Expected passing** | **~270-335** | ~65-80% pass rate |

These estimates will be refined after the initial triage run.

## Relationship to Existing Tests

| Test Layer | What It Tests | Stays? |
|---|---|---|
| `syscall_coverage.c` | Every host import has at least one exercise | Yes — import-level smoke test |
| `c-parity.test.ts` | Hand-written C programs (native vs WASM) | Yes — targeted regression tests |
| `posix-conformance.test.ts` (new) | Upstream POSIX.1-2024 conformance | New — systematic coverage |
| `posix-hardening.md` items | Specific P0-P3 POSIX violations to fix | Yes — drives implementation work |

os-test conformance tests complement existing layers. They don't replace
`syscall_coverage.c` (which tests host import wiring) or hand-written parity
tests (which test specific regression scenarios). They add systematic,
upstream-maintained coverage of POSIX API semantics.

## Implementation Plan

### Step 1: Vendor os-test

- Download os-test release from sortix.org
- Place source in `native/wasmvm/c/os-test/`
- Add `os-test/` to `.gitignore` exclusions as needed
- Verify ISC license compatibility (already confirmed)

### Step 2: Build Integration

- Add `os-test` and `os-test-native` Makefile targets
- Handle compilation failures gracefully (some tests won't compile for WASM)
- Record which tests compile vs. don't as baseline data

### Step 3: Initial Test Run and Triage

- Create `posix-conformance.test.ts` runner
- Create initial `posix-exclusions.json` with empty exclusions
- Run full suite — expect many failures on first run
- For each failure, classify and add to exclusion list:
  - WASM limitations → `skip` with architectural reason
  - Compile errors → `skip` under `compile-error`
  - Implementation gaps → `fail` with tracking issue
- Target: all non-excluded tests passing

### Step 4: CI Integration

- Add `posix-conformance.yml` workflow
- Add `validate-posix-exclusions.ts` script
- Wire both into CI
- Add conformance report as CI artifact

### Step 5: Report Generation

- Implement `scripts/generate-posix-report.ts`
- Add `posix-conformance-report` to `docs/docs.json` under Experimental
- Add callout in `docs/posix-compatibility.md`
- Wire report generation into CI job

### Step 6: Shrink the Exclusion List

- Review `fail` exclusions, prioritize by impact
- Fix implementation gaps in kernel/driver/host-import layers
- Remove exclusion entries as fixes land
- Track pass rate trend over time

## Open Questions

1. **os-test release cadence**: os-test is actively developed but doesn't have
   a stable release schedule yet. Should we pin to a specific commit or wait
   for tagged releases? Recommendation: pin to a specific commit initially,
   update quarterly.

2. **Tests requiring patched sysroot**: Some os-test tests may need our patched
   sysroot (for `getpid`, `pipe`, `dup`, etc.). The Makefile should compile
   these with the patched sysroot when available, and skip them otherwise (same
   pattern as `PATCHED_PROGRAMS`). Need to identify which os-test programs
   require patched sysroot after initial import.

3. **Output comparison normalization**: Some POSIX tests may produce output
   containing PIDs, timestamps, or memory addresses. Do we need output
   normalization for parity comparison, or is exit-code-only sufficient?
   Recommendation: start with exit-code parity (both must exit 0), add output
   comparison for tests that produce deterministic output.

4. **LTP integration**: The Linux Test Project contains ~1,600 POSIX
   conformance tests (fork of the Open POSIX Test Suite). Should we also
   integrate LTP, or is os-test sufficient? Recommendation: start with os-test
   (simpler, modern, ISC licensed, designed for cross-compilation). Evaluate LTP
   later if os-test coverage proves insufficient for specific areas.

5. **WASI Test Suite**: Should we also run the official `WebAssembly/wasi-testsuite`
   to validate our WASI Preview 1 foundation? Recommendation: yes, as a
   separate effort — WASI correctness is a prerequisite for POSIX correctness.

## Prior Art

| Project | Approach | Coverage |
|---|---|---|
| **Sortix** | Author of os-test; runs it on 16+ OSes | Full POSIX.1-2024 surface |
| **Redox OS** | Uses os-test for POSIX conformance validation | io, malloc, signal suites |
| **OpenBSD** | Uses os-test to find libc bugs | Found and fixed real issues |
| **Emscripten** | Fork of Open POSIX Test Suite for WASM | Adapted ~1,600 tests for wasm32 |
| **LTP** | ~1,200 syscall + ~1,600 POSIX tests | Most comprehensive but Linux-centric |

Our approach follows the pattern established by Redox and OpenBSD: use os-test
as an external conformance oracle, maintain a clear exclusion list for what
can't pass, and systematically shrink it over time.
