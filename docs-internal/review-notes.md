# Kernel & Runtime Driver Review — 2026-03-16

Comprehensive audit of kernel implementation, runtime drivers (WasmVM, Node), test quality, API surface, and E2E coverage.

---

## 1. Architecture Overview (How It Works)

The kernel is a **userspace OS abstraction** owning VFS, FD tables, process table, pipe manager, device layer, command registry, and permissions. Runtime drivers (WasmVM, Node, Python) are pluggable execution engines that mount into the kernel and make syscalls through `KernelInterface`.

### Mount Order & Command Resolution
```
kernel.mount(wasmvmDriver)  // registers sh, bash, cat, grep, echo, ... (90+ commands)
kernel.mount(nodeDriver)     // registers node, npm, npx (overrides wasmvm stubs)
kernel.mount(pythonDriver)   // registers python, python3 (overrides wasmvm stubs)
```
Last-mounted driver wins for overlapping commands. WasmVM provides the shell; Node/Python override their respective stub commands.

### Process Spawning Flow
1. `kernel.spawn("node", ["-e", "..."])` → command registry resolves "node" → Node driver
2. Kernel allocates PID, creates FD table (fork parent's + apply stdio overrides)
3. Kernel calls `nodeDriver.spawn(command, args, processContext)`
4. Node driver creates V8 isolate, wires `child_process.spawn` → `kernel.spawn()` (round-trip)
5. When Node code calls `execSync("echo hello")`, it routes back through kernel → WasmVM

### Cross-Runtime Pipe Flow
```
echo hello | node -e 'process.stdin.pipe(process.stdout)'
```
1. WasmVM shell sees pipe operator, calls `kernel.pipe()` → `{readFd, writeFd}`
2. Spawns `echo` with `stdoutFd: writeFd`, spawns `node` with `stdinFd: readFd`
3. echo writes to pipe via kernel fdWrite, node reads from pipe via kernel fdRead
4. Data flows: WasmVM worker → SharedArrayBuffer RPC → kernel pipe buffer → Node isolate

---

## 2. API Examples

### Spawn a Node Process
```typescript
import { createKernel } from '@secure-exec/kernel';
import { createWasmVmRuntime } from '@secure-exec/runtime-wasmvm';
import { createNodeRuntime } from '@secure-exec/runtime-node';

const kernel = createKernel({ filesystem: vfs });
await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: '...' }));
await kernel.mount(createNodeRuntime());

// exec() — shell command, returns {exitCode, stdout, stderr}
const result = await kernel.exec('node -e "console.log(1+2)"');
// result.stdout === "3\n", result.exitCode === 0

// spawn() — direct, with streaming callbacks
const proc = kernel.spawn('node', ['-e', 'console.log("hello")'], {
  onStdout: (data) => process.stdout.write(data),
  onStderr: (data) => process.stderr.write(data),
});
const exitCode = await proc.wait();
```

### Spawn WasmVM Shell That Calls Into Node
```typescript
// WasmVM shell executes, spawns node via kernel command registry
const result = await kernel.exec(`
  echo '{"name":"test"}' | node -e '
    let d="";
    process.stdin.on("data",c=>d+=c);
    process.stdin.on("end",()=>console.log(JSON.parse(d).name))
  '
`);
// result.stdout === "test\n"
```

### Cross-Runtime Pipe (WasmVM echo → Node uppercase)
```typescript
const result = await kernel.exec(
  `echo hello | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(d.toUpperCase()))'`
);
// result.stdout === "HELLO\n"
```

### Node Spawning Shell Commands (child_process routing)
```typescript
const result = await kernel.exec(`node -e "
  const { execSync } = require('child_process');
  const files = execSync('ls /tmp', { encoding: 'utf-8' });
  console.log(files);
"`);
// Node's execSync routes through kernel → WasmVM 'sh -c "ls /tmp"'
```

### Write to VFS, Read from Another Runtime
```typescript
await kernel.writeFile('/tmp/data.txt', 'hello from kernel');
const result = await kernel.exec('cat /tmp/data.txt');       // WasmVM reads it
const result2 = await kernel.exec('node -e "console.log(require(\'fs\').readFileSync(\'/tmp/data.txt\',\'utf8\'))"');
// Both return "hello from kernel"
```

### npm run Scripts (Full Round-Trip)
```typescript
// Assuming project dir with package.json containing scripts
const result = await kernel.exec('npm run greet', { timeout: 30000 });
// npm reads package.json → child_process.spawn('sh', ['-c', 'echo hello'])
// → routes through kernel → WasmVM executes → output flows back
```

---

## 3. Test Quality Audit

### Tests That Are Genuinely Solid

| Test File | Tests | Verdict |
|-----------|-------|---------|
| `packages/kernel/test/fd-table.test.ts` | 7 tests: stdio pre-alloc, open/dup/dup2, refcount, fork, stat | Solid — unconditional assertions, correct POSIX semantics |
| `packages/kernel/test/pipe-manager.test.ts` | 6 tests: create, write-read, blocking, EOF, buffer accumulation | Solid — proper async behavior testing |
| `packages/kernel/test/device-layer.test.ts` | 10 tests: /dev/null, /dev/zero, /dev/urandom, EPERM | Solid — correct device semantics |
| `packages/kernel/test/command-registry.test.ts` | 5 tests: register, resolve, last-mounted-wins | Solid — tests critical conflict behavior |
| `packages/kernel/test/process-table.test.ts` | 5 tests: PID alloc, waitpid, markExited, kill, ESRCH | Solid — correct process lifecycle |
| `packages/runtime/wasmvm/test/wasi-polyfill.test.ts` | ~100+ tests across 8 test files (~7900 lines) | Solid — comprehensive WASI syscall testing |

### Tests With Escape Hatches / Fake Assertions

#### Node Driver: "child_process.spawn routes through kernel" — MOCKED
**File:** `packages/runtime/node/test/driver.test.ts:349-377`
```typescript
// MockRuntimeDriver hardcoded to return 'mock-echo-output'
const mockDriver = new MockRuntimeDriver(['bash', 'echo'], {
  echo: { exitCode: 0, stdout: 'mock-echo-output' },
});
await kernel.mount(mockDriver);
await kernel.mount(createNodeRuntime());

const proc = kernel.spawn('node', ['-e', `
  const { execSync } = require('child_process');
  const result = execSync('echo hello');
  console.log('child output:', result.toString().trim());
`]);
const code = await proc.wait();
expect(code).toBe(0);
expect(output).toContain('mock-echo-output');
```
**Problem:** Only verifies mock's canned response appeared. If routing was bypassed and real host `echo` ran, output would be "hello" not "mock-echo-output" — test WOULD catch a complete bypass. But it doesn't verify the routing *mechanism* (e.g., that `kernel.spawn` was called, not `child_process.spawn` directly). A half-broken implementation that sometimes routes and sometimes doesn't wouldn't be caught.

#### Node Driver: "cannot access host filesystem directly" — NEGATIVE ASSERTION
**File:** `packages/runtime/node/test/driver.test.ts:451-478`
```typescript
expect(stderr).toContain('blocked:');
expect(stdout).not.toContain('root:x:0:0');
```
**Problem:** Tests against an in-memory VFS (SimpleVFS) that has no `/etc/passwd` by default. The test only proves SimpleVFS doesn't have the file, NOT that host filesystem access is blocked. Would pass even if isolation was completely broken — the VFS just happens not to contain `/etc/passwd`. Missing: symlink escape tests, relative path traversal tests, `../../../etc/passwd` tests.

#### Node Driver: "fork bomb" test — DOESN'T TEST LIMITS
**File:** `packages/runtime/node/test/driver.test.ts:480-509`
```typescript
// Spawns 5 child processes, expects them ALL to succeed
// No limit enforcement tested — 5 processes is trivially small
// No memory limit, no CPU limit, no FD limit tested
```
**Problem:** Tests that 5 processes can spawn and complete. Doesn't test what happens at 100 or 1000. Doesn't verify any resource limits exist.

#### Kernel Integration: stdin tests verify transport, not consumption
**File:** `packages/kernel/test/kernel-integration.test.ts:188-254`
```typescript
// MockRuntimeDriver.writeStdin just pushes to stdinCapture array
// Never verifies the "process" actually reads the data
// Tests kernel→driver delivery, not end-to-end stdin behavior
```
**Problem:** The mock's `writeStdin` is a passive array push. No test verifies data actually reaches a process's stdin stream. Would pass even if stdin delivery was completely broken — the kernel just pushes bytes into a void.

### Tests That Pass Trivially (No Real Execution)

| Test | What It Actually Tests | Real? |
|------|----------------------|-------|
| WasmVM "driver.commands contains 90+ commands" | Hardcoded array length | No execution |
| WasmVM "spawn with missing binary exits code 1" | Worker creation fails with `/nonexistent/` path | Error path only |
| WasmVM "throws ENOENT for unknown commands" | Kernel routing rejects before driver.spawn() | No driver execution |
| WasmVM "throws when spawning before init" | Null check on `this._kernel` | No execution |
| Kernel "dispose is idempotent" | Second dispose doesn't throw | Idle kernel only |

### Tests Gated Behind skipIf (May Not Run in CI)

4 WasmVM test suites require standalone WASM binaries (built from Rust crates via `make wasm`):
- `describe.skipIf(!hasWasmBinaries)('real execution')` — echo, cat, false
- `describe.skipIf(!hasWasmBinaries)('stdin streaming')` — cat with writeStdin
- `describe.skipIf(!hasWasmBinaries)('proc_spawn routing')` — echo through kernel

All E2E tests with real npm skip if npm registry unreachable.

**Risk:** If CI doesn't build WASM binaries or lacks network, these tests silently skip and the suite still passes green. (Mitigated: CI-only guard test asserts binaries exist.)

---

## 4. Implementation Corner-Cutting & Bugs

### CRITICAL: FD Table Memory Leak
**File:** `packages/kernel/src/process-table.ts` + `fd-table.ts`

When a process exits, its FD table is **never removed** from `FDTableManager`. The `fdTableManager.remove(pid)` method exists (fd-table.ts:274) but is never called. Over thousands of spawns:
- FD tables accumulate in memory indefinitely
- FileDescription refcounts never reach 0
- Pipe read/write ends never get cleaned up

**Fix:** Call `fdTableManager.remove(pid)` in `processTable.markExited()` or in the kernel's onExit handler.

### MEDIUM: 1MB SharedArrayBuffer Limit (WasmVM)
**File:** `packages/runtime/wasmvm/src/syscall-rpc.ts`

The WasmVM RPC uses a 1MB SharedArrayBuffer for response data. File reads, directory listings, or any syscall response >1MB will **silently truncate**. No error, no indication — just missing data.

### MEDIUM: Error String Matching for errno (WasmVM)
**File:** `packages/runtime/wasmvm/src/kernel-worker.ts`
```typescript
if (msg.includes('EBADF')) return 8;
if (msg.includes('ENOENT')) return 44;
```
Maps error messages to WASI errno by string matching. If kernel changes error message format, errno mapping breaks silently.

### MEDIUM: Zombie Timer Race on Dispose
**File:** `packages/kernel/src/process-table.ts:78-79`

Zombie process cleanup uses `setTimeout(60s)`. If kernel disposes while zombies exist, timers may fire after disposal. The `reap()` method checks entry status, so it won't crash, but it's unclean.

### LOW: Pipe Reader Waiter Leak
If a pipe reader crashes while blocked on `read()`, the waiter callback stays in the array until the write end closes. If write end never closes, small memory leak per blocked reader.

### LOW: No fdPread/fdPwrite
WasmVM kernel-worker defines but never implements positional I/O. Falls back to fdRead/fdWrite without offset, losing positional semantics. Not needed by current WASM programs.

---

## 5. Missing Test Coverage (Critical Gaps)

### Security Boundaries — ZERO coverage
- No test for symlink escape (`/tmp/link → /etc/passwd`)
- No test for relative path traversal (`../../etc/passwd`)
- No test that host binaries can't be called directly
- No test for memory limit enforcement (128MB per isolate)
- No test for CPU time limit enforcement
- No test for FD exhaustion
- No test for process count limits

### Kernel Features — ZERO coverage
- **FD seek operations** — fdSeek() untested (part of KernelInterface contract)
- **Stdio FD override wiring** — kernel.ts:432-476 (pipe→stdin/stdout/stderr) untested in isolation
- **Permission wrapping** — kernel creates permissioned VFS but no test exercises deny scenarios
- **exec() with stdin** — kernel.ts:116-124 writes data but delivery never verified end-to-end
- **Process exit → FD cleanup** — no test verifies FD tables are cleaned up (they aren't — see bug above)

### Cross-Runtime — Weak coverage
- No test verifying `kernel.spawn()` was actually called (vs bypass)
- No test for concurrent cross-runtime operations under load
- Signal forwarding only tested with MockRuntimeDriver
- No test for pipe closure with multiple refcount holders

---

## 6. E2E / Real-World Test Status

### npm install — WORKS with Real Network
**File:** `packages/secure-exec/tests/kernel/e2e-npm-install.test.ts`
- Downloads real `left-pad@1.3.0` from npm registry
- Uses NodeFileSystem (host disk at temp dir)
- Verifies installed package is `require()`-able
- Skip if no network (5s reachability check)
- 30s timeout

### npm run Scripts — WORKS
**File:** `packages/secure-exec/tests/kernel/e2e-npm-scripts.test.ts`
- Full round-trip: npm → child_process.spawn → kernel → WasmVM shell
- Tests: `npm run greet`, `npm run count` (&&), `npm run env-check` ($npm_package_name)
- Tests nonexistent script error handling

### npm Lifecycle Scripts — WORKS
**File:** `packages/secure-exec/tests/kernel/e2e-npm-lifecycle.test.ts`
- postinstall hooks execute through kernel
- npm install with postinstall that writes file via WasmVM shell

### npx — WORKS
**File:** `packages/secure-exec/tests/kernel/e2e-npx-and-pipes.test.ts`
- `npx -y semver` (real npm registry)
- Piped input to `node -e` (stdin handling)

### Concurrently — WORKS
**File:** `packages/secure-exec/tests/kernel/e2e-concurrently.test.ts`
- Multiple parallel child processes
- Tests concurrent PID allocation
- kill-others-on-fail handling

### Next.js Build — WORKS (with workarounds)
**File:** `packages/secure-exec/tests/kernel/e2e-nextjs-build.test.ts`
- `npx next build` on minimal project
- **Workarounds applied:** `NEXT_DISABLE_SWC=1`, `NEXT_EXPERIMENTAL_WORKERS=0`, `output:'export'`
- Each workaround hides a feature that doesn't work: SWC native addon, worker_threads, full SSR
- 120s timeout

### Python + WasmVM — WORKS
**File:** `packages/secure-exec/tests/kernel/e2e-python.test.ts`
- `print(42)`, json stdlib, `os.system('echo')`, exit code propagation
- Cross-runtime: echo piped to Python uppercase

### Project Matrix (Host Parity) — WORKS
**File:** `packages/secure-exec/tests/kernel/e2e-project-matrix.test.ts`
- 8 fixture projects: semver, dotenv, module-access, crypto-random, fs-metadata-rename, esm-import, rivetkit, net-unsupported
- Runs each through kernel, compares output parity with host Node
- Real filesystem via NodeFileSystem

### Android — NOT FOUND
No Android-specific code, examples, or tests exist in the repository. The codebase targets Node.js and browser environments.

---

## 7. What's Not Being Faked in E2E

The E2E tests use real:
- **Network access** — npm install downloads from registry, npx fetches packages
- **Filesystem** — NodeFileSystem wraps real `node:fs/promises` at temp dirs
- **Package resolution** — npm/npx find host Node installation, resolve packages normally
- **Shell execution** — WasmVM binary runs real Rust-compiled BusyBox shell
- **Process spawning** — Real V8 isolates for Node, real WASM instantiation for WasmVM

What IS abstracted:
- VFS for unit/integration tests uses InMemoryFileSystem (not host fs)
- MockRuntimeDriver for kernel unit tests (not real driver execution)
- Network availability check gates tests (skip if unreachable)

---

## 8. Concerns & Recommendations

### P0 — Fix Now
1. **FD table memory leak**: Call `fdTableManager.remove(pid)` on process exit. Every spawn leaks an FD table.
2. **1MB SharedArrayBuffer limit**: At minimum, detect truncation and return EIO instead of silently corrupting data.

### P1 — Fix Before Production
3. **Security boundary tests**: Add symlink escape, path traversal, host binary access, and resource limit enforcement tests.
4. **WASM binaries in CI**: (RESOLVED) CI builds standalone WASM binaries via `make wasm`. Guard test fails if binaries are missing.
5. **Permission wrapper tests**: The permission system exists but has zero test coverage. Add deny-scenario tests.
6. **Replace negative security assertions**: "output doesn't contain X" tests should be replaced with positive assertions about error behavior.

### P2 — Improve Quality
7. **FD seek tests**: fdSeek is in the KernelInterface contract but untested.
8. **Stdio FD override tests**: The pipe-wiring code (kernel.ts:432-476) is complex and untested in isolation.
9. **Process limit enforcement**: Add tests for what happens at 100+ concurrent processes.
10. **Error code consistency**: Replace string-matching errno in WasmVM with structured error types.
11. **Pipe refcount edge cases**: Test multiple holders of write end, verify EOF only on last close.

### P3 — Hardening
12. **Zombie timer cleanup on dispose**: Clear pending zombie cleanup timers during kernel.dispose().
13. **Concurrent PID stress test**: Current test spawns 10; should stress test with hundreds.
14. **Next.js workaround tracking**: Document which features are intentionally unsupported (SWC, workers, SSR) so they can be fixed later.
15. **Device /dev/fd pseudo-directory**: Not implemented; document as known gap.

---

## 9. WasmVM Driver Internals (Quick Reference)

### Architecture
- Each spawn() creates a Node.js Worker thread
- Worker loads WASM binary, instantiates with WASI + custom imports
- All file/process syscalls route through SharedArrayBuffer RPC to main thread
- Main thread forwards to KernelInterface (fdRead, fdWrite, fdOpen, vfs*, spawn, waitpid, pipe, kill)
- Worker blocks on `Atomics.wait()`, main thread responds with `Atomics.notify()`
- 30 second timeout per syscall (returns EIO on timeout)

### Signal Buffer Layout (Int32Array)
- [0] STATE: 0=idle, 1=response-ready
- [1] ERRNO: WASI error code
- [2] INT_RESULT: integer result (fd number, bytes written, exit code)
- [3] DATA_LEN: length of response data in 1MB data buffer

### Stdio Detection
Driver checks kernel FD table to detect if stdio is piped:
- If piped: routes writes through kernel fdWrite (pipe-aware)
- If not piped: streams via postMessage (direct callback)

---

## 10. Node Driver Internals (Quick Reference)

### Architecture
- Each spawn() creates a real V8 isolate via `isolated-vm` (not a shell subprocess)
- Memory limit: 128MB per isolate (configurable)
- `child_process.spawn/execSync` monkey-patched to route through `KernelCommandExecutor`
- KernelCommandExecutor calls `kernel.spawn()` for cross-runtime dispatch
- npm/npx get special host-fallback VFS (reads from host fs for npm's own internal modules)

### Bridge Stack
```
Sandboxed Node code
  → child_process.execSync('echo hello')
    → Bridge intercepts → KernelCommandExecutor.spawn('echo', ['hello'])
      → kernel.spawn('echo', ['hello'])
        → command registry resolves 'echo' → WasmVM driver
          → WasmVM worker executes echo
            → stdout flows back through kernel pipes/callbacks
```
