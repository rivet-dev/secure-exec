# Kernel Hardening & Documentation Spec

Addresses bugs, test quality gaps, missing coverage, and documentation debt identified in the 2026-03-16 audit of the kernel, WasmVM driver, and Node driver.

---

## P0 — Critical Bugs

### 1. FD Table Memory Leak

**Location:** `packages/kernel/src/process-table.ts`, `packages/kernel/src/fd-table.ts`

**Problem:** When a process exits, its per-PID FD table is never removed from `FDTableManager`. The method `fdTableManager.remove(pid)` exists (fd-table.ts:274) but is never called. Every `kernel.spawn()` leaks an FD table indefinitely. FileDescription refcounts never reach 0, preventing pipe cleanup.

**Fix:**
- In the kernel's `onExit` handler (kernel.ts, inside `spawnInternal`), call `this.fdTableManager.remove(pid)` after `processTable.markExited(pid, exitCode)`
- Add a test: spawn 100 processes, verify FD table count returns to baseline after all exit
- Add a test: spawn process with dup'd FD, exit, verify FileDescription refcount reaches 0

**Acceptance criteria:**
- `fdTableManager.remove(pid)` called on every process exit
- Test: spawn N processes, all exit, `fdTableManager` internal map size === 0 (excluding init process)
- Test: pipe read/write FileDescriptions are freed after both endpoints' processes exit
- Typecheck passes, tests pass

### 2. SharedArrayBuffer 1MB Truncation (WasmVM)

**Location:** `packages/runtime/wasmvm/src/syscall-rpc.ts`

**Problem:** The WasmVM RPC uses a 1MB SharedArrayBuffer for all response data. File reads >1MB silently truncate with no error. Large directory listings overflow.

**Fix:**
- Detect when response exceeds buffer capacity
- Return EIO (errno 76) with a diagnostic message instead of silent truncation
- Consider chunked reads for large files (future enhancement, not required now)

**Acceptance criteria:**
- When kernel fdRead returns >1MB, worker returns EIO instead of truncated data
- Test: write 2MB file to VFS, attempt fdRead from WasmVM, verify error (not truncated data)
- Typecheck passes, tests pass

---

## P1 — Test Quality (Replace Fake Tests)

### 3. Node Driver: Replace Fake Security Test

**Location:** `packages/runtime/node/test/driver.test.ts` — "cannot access host filesystem directly"

**Problem:** Tests against SimpleVFS (in-memory) which has no `/etc/passwd`. The test only proves the VFS is empty, not that host filesystem access is blocked. Uses negative assertion (`not.toContain('root:x:0:0')`) instead of asserting the actual error.

**Fix — replace with real boundary tests:**
- Test that reading `/etc/passwd` throws ENOENT from kernel VFS (positive assertion on error type)
- Test that symlink traversal (`/tmp/link → /etc/passwd`) is blocked
- Test that relative path escape (`../../etc/passwd`) is blocked or resolved within VFS root
- Test that `process.binding('spawn_sync')` is not accessible (prevents raw child_process bypass)

**Acceptance criteria:**
- Old negative assertion removed
- New test: `fs.readFileSync('/etc/passwd')` → catch block asserts error.code === 'ENOENT' or error.message contains 'ENOENT'
- New test: create symlink /tmp/escape → /etc/passwd in VFS, read /tmp/escape → ENOENT (VFS doesn't resolve to host)
- New test: `fs.readFileSync('../../etc/passwd')` from cwd /app → ENOENT
- All assertions unconditional
- Typecheck passes, tests pass

### 4. Node Driver: Replace Fake child_process Routing Test

**Location:** `packages/runtime/node/test/driver.test.ts` — "child_process.spawn routes through kernel"

**Problem:** Uses MockRuntimeDriver with hardcoded output. Only verifies mock's canned response appeared — doesn't prove routing actually happened. Would pass if mock happened to return the right string for the wrong reason.

**Fix:**
- Mount a spy driver that records what commands were dispatched to it (command name, args, caller PID)
- Verify the spy received exactly one spawn call for 'echo' with args ['hello']
- Verify the caller PID matches the Node process's PID in the kernel process table
- Still verify output contains the mock's response

**Acceptance criteria:**
- Spy driver records: `{ command: 'echo', args: ['hello'], callerPid: <node-pid> }`
- Assert spy.calls.length === 1
- Assert spy.calls[0].command === 'echo'
- Assert output contains mock response
- Typecheck passes, tests pass

### 5. Node Driver: Replace Placeholder Fork Bomb Test

**Location:** `packages/runtime/node/test/driver.test.ts` — "cannot spawn unlimited processes"

**Problem:** Spawns 5 processes and expects all to succeed. Tests nothing about limits. The name claims it tests fork bomb protection but the test body doesn't exercise any limit.

**Fix:**
- Rename to "concurrent child process spawning" (honest name)
- Add a separate test for resource limits (if kernel implements them)
- If no limit exists yet, add a test documenting the current behavior (spawns N processes, all succeed, tracked in kernel process table) and a TODO for limit enforcement

**Acceptance criteria:**
- Test renamed to reflect what it actually tests
- Test spawns 10+ child processes, verifies each gets unique PID from kernel process table
- All assertions unconditional
- Typecheck passes, tests pass

### 6. Kernel Integration: Fix Stdin Tests to Verify Consumption

**Location:** `packages/kernel/test/kernel-integration.test.ts` — stdin streaming tests

**Problem:** MockRuntimeDriver's `writeStdin` is a passive array push. Tests verify kernel→driver delivery but never verify the process reads the data. Would pass if stdin delivery was broken.

**Fix:**
- Add a MockRuntimeDriver mode where stdin data triggers stdout echo (simulates `cat`)
- Test: writeStdin("hello"), closeStdin(), verify stdout callback received "hello"
- This proves the full stdin→process→stdout pipeline works, not just kernel→driver delivery

**Acceptance criteria:**
- MockRuntimeDriver supports new config: `{ echoStdin: true }` — writeStdin data immediately emitted as stdout
- Test: writeStdin + closeStdin → stdout contains written data
- Test: multiple writeStdin calls → stdout contains all chunks concatenated
- Typecheck passes, tests pass

---

## P2 — Missing Test Coverage

### 7. FD Seek Operations

**Location:** `packages/kernel/src/types.ts:167-172` (KernelInterface.fdSeek)

**Problem:** fdSeek is in the KernelInterface contract but has zero test coverage. No test verifies cursor movement, SEEK_SET/SEEK_CUR/SEEK_END modes, or seeking in pipes (should fail).

**Acceptance criteria:**
- Test: write "hello world" to file, open, fdSeek(0, SEEK_SET) → read returns "hello world"
- Test: read 5 bytes, fdSeek(0, SEEK_SET), read 5 bytes → both return "hello"
- Test: fdSeek(0, SEEK_END), read → returns empty (EOF)
- Test: fdSeek on pipe FD → throws ESPIPE or similar error
- Typecheck passes, tests pass

### 8. Permission Wrapper Deny Scenarios

**Location:** `packages/kernel/src/permissions.ts`

**Problem:** The permission system exists and wraps VFS operations, but has zero test coverage for deny scenarios. No test creates a kernel with restrictive permissions and verifies operations are blocked.

**Acceptance criteria:**
- Test: createKernel with `permissions: { fs: false }`, attempt writeFile → throws EACCES
- Test: createKernel with `permissions: { fs: (req) => req.path.startsWith('/tmp') }`, write to /tmp → succeeds, write to /etc → throws EACCES
- Test: createKernel with `permissions: { childProcess: false }`, attempt spawn → throws or is blocked
- Test: verify env filtering works (`filterEnv` with restricted keys)
- Typecheck passes, tests pass

### 9. Stdio FD Override Wiring

**Location:** `packages/kernel/src/kernel.ts:432-476`

**Problem:** The code that wires stdinFd/stdoutFd/stderrFd overrides during spawn is complex and completely untested in isolation. Cross-runtime pipe tests exercise it indirectly but don't verify the FD table state.

**Acceptance criteria:**
- Test: spawn with `stdinFd: pipeReadEnd` → child's FD 0 points to pipe read description
- Test: spawn with `stdoutFd: pipeWriteEnd` → child's FD 1 points to pipe write description
- Test: spawn with all three overrides → FD table has correct descriptions for 0, 1, 2
- Test: parent FD table unchanged after child spawn with overrides
- Typecheck passes, tests pass

### 10. Concurrent PID Stress Test

**Location:** `packages/kernel/test/kernel-integration.test.ts`

**Problem:** Current test spawns only 10 concurrent processes. Doesn't stress test PID allocation or verify no duplicates under high concurrency.

**Acceptance criteria:**
- Test: spawn 100 processes concurrently, collect all PIDs, verify all unique
- Test: spawn 100 processes, wait all, verify all exit codes captured correctly
- Typecheck passes, tests pass

### 11. Pipe Refcount Edge Cases

**Location:** `packages/kernel/src/pipe-manager.ts`

**Problem:** No test verifies pipe behavior when multiple processes hold the write end (e.g., after fork). EOF should only trigger when ALL write-end holders close.

**Acceptance criteria:**
- Test: create pipe, dup write end (two references), close one → reader still blocks (not EOF)
- Test: close second write end → reader gets EOF
- Test: write through both references → reader receives both writes
- Typecheck passes, tests pass

### 12. Process Exit FD Cleanup Verification

**Problem:** Even after fixing the FD table leak (item 1), we need tests verifying the cleanup chain: process exits → FD table removed → FileDescription refcounts decremented → pipe ends freed.

**Acceptance criteria:**
- Test: spawn process with open FD to pipe write end, process exits → pipe read end gets EOF
- Test: spawn process, open 10 FDs, process exits → FDTableManager has no entry for that PID
- Typecheck passes, tests pass

### 13. Zombie Timer Cleanup on Dispose

**Location:** `packages/kernel/src/process-table.ts:78-79`

**Problem:** Zombie cleanup timers (60s setTimeout) may fire after kernel.dispose(). Unclean but not crashing.

**Acceptance criteria:**
- Store timer IDs during zombie scheduling, clear them in `terminateAll()` or a new `dispose()` method
- Test: spawn process, let it exit (becomes zombie), immediately dispose kernel → no timer warnings
- Typecheck passes, tests pass

### 14. WASM Binary CI Availability

**Problem:** WasmVM real execution tests are gated behind `skipIf(!hasWasmBinaries)`. If CI doesn't build the Rust crates, all real execution tests silently skip. The test suite reports green despite not running critical tests.

**Acceptance criteria:** (RESOLVED)
- CI pipeline runs `make wasm` to build standalone binaries to `wasmvm/target/wasm32-wasip1/release/commands/`
- CI-only test asserts `hasWasmBinaries === true` so CI fails if binaries are missing
- CLAUDE.md documents how to build locally

### 15. Error String Matching → Structured Errors (WasmVM)

**Location:** `packages/runtime/wasmvm/src/kernel-worker.ts`

**Problem:** `mapErrorToErrno()` matches on `error.message` content (`msg.includes('EBADF')`). Brittle — if kernel error messages change, errno mapping silently breaks.

**Acceptance criteria:**
- Kernel errors include a structured `code` field (e.g., `{ code: 'EBADF', message: '...' }`)
- WasmVM kernel-worker maps `error.code` → WASI errno instead of string matching
- Fallback to string matching only if `code` field is missing
- Test: throw error with code 'ENOENT' → worker maps to errno 44
- Typecheck passes, tests pass

---

## P3 — Documentation

All documentation follows the code-heavy style of sandbox-agent/docs (Mintlify MDX, 50-70% code, short prose, working examples).

### 16. Kernel Quickstart Guide

**File:** `docs/kernel/quickstart.mdx`

Covers:
- Install packages
- Create kernel with VFS
- Mount WasmVM and Node runtime drivers
- Run shell commands via `kernel.exec()`
- Spawn processes via `kernel.spawn()` with streaming output
- Cross-runtime example: Node code calling shell commands
- Write files to VFS, read from another runtime
- Cleanup with `kernel.dispose()`

### 17. Kernel API Reference

**File:** `docs/kernel/api-reference.mdx`

Covers:
- `createKernel(options)` — full KernelOptions table
- `Kernel` methods: mount, exec, spawn, dispose, readFile, writeFile, mkdir, readdir, stat, exists, commands, processes
- `ExecOptions` and `ExecResult` types
- `SpawnOptions` and `ManagedProcess` interface
- `RuntimeDriver` interface and `DriverProcess` interface
- `KernelInterface` syscall surface (fdOpen, fdRead, fdWrite, fdClose, fdSeek, fdDup, fdDup2, fdStat, spawn, waitpid, kill, pipe, vfs)
- `ProcessContext` type
- Permission types and presets

### 18. Cross-Runtime Integration Guide

**File:** `docs/kernel/cross-runtime.mdx`

Covers:
- Mount order and command resolution (with table)
- How child_process routing works (Node → kernel → WasmVM)
- Cross-runtime pipes: shell pipe operator, programmatic pipe creation
- VFS sharing: writes visible across runtimes
- npm run scripts through kernel (full round-trip example)
- Error and exit code propagation across boundaries
- Stdin streaming to processes

### 19. Writing a Custom RuntimeDriver

**File:** `docs/kernel/custom-runtime.mdx`

Covers:
- RuntimeDriver interface contract
- Minimal implementation example (echo driver)
- KernelInterface syscalls available to drivers
- ProcessContext and DriverProcess lifecycle
- Stdio routing: callbacks vs pipes
- Command registration and resolution
- Testing your driver with MockRuntimeDriver patterns

### 20. Update docs.json Navigation

Add new "Kernel" group to navigation between "Features" and "Reference".

---

## P4 — PTY, Process Groups, /dev/fd, and Positional I/O

### 21. Process Group and Session ID Tracking

**Location:** `packages/kernel/src/process-table.ts`

**Problem:** The process table tracks PIDs and parent-child relationships but not process groups or session IDs. Without these, there is no way to implement job control (`fg`, `bg`, `kill -0 -<pgid>`) or direct signals to a group of related processes. This is a prerequisite for PTY/interactive shell support.

**Implementation:**
- Add `pgid` (process group ID) and `sid` (session ID) fields to `ProcessEntry`
- Default: new process inherits parent's pgid and sid
- Add `setpgid(pid, pgid)` syscall to `KernelInterface` — allows a process to create a new group or join an existing one
- Add `setsid(pid)` syscall — creates a new session (new sid = pid, new pgid = pid, detach from controlling terminal)
- Add `getpgid(pid)` and `getsid(pid)` to `KernelInterface`
- Extend `kill()` to support negative PID: `kill(-pgid, signal)` sends signal to all processes in the group
- On process exit, if it was the session leader and had a controlling terminal, send SIGHUP to the foreground process group

**Acceptance criteria:**
- ProcessEntry has `pgid` and `sid` fields, defaulting to parent's values
- `setpgid(pid, pgid)` works: process can create new group (pgid=0 means pgid=pid) or join existing group
- `setsid(pid)` creates new session: sid=pid, pgid=pid, no controlling terminal
- `kill(-pgid, signal)` delivers signal to all processes in group
- `getpgid(pid)` and `getsid(pid)` return correct values
- Child inherits parent's pgid and sid by default
- Test: create process group, spawn 3 children in it, `kill(-pgid, SIGTERM)` → all 3 receive signal
- Test: `setsid` creates new session, process becomes session leader
- Test: `setpgid` with invalid pgid (nonexistent group, different session) → EPERM
- Typecheck passes, tests pass

### 22. PTY Device Layer (`/dev/ptmx` and `/dev/pts/*`)

**Location:** `packages/kernel/src/device-layer.ts`, new file `packages/kernel/src/pty.ts`

**Problem:** No pseudo-terminal support exists. Interactive shells need a PTY master/slave pair to provide character-at-a-time input, signal generation (^C → SIGINT, ^Z → SIGTSTP, ^\ → SIGQUIT), echo, and line editing. Without this, `kernel.spawn("bash", ["-i"])` gets line-buffered pipes instead of a terminal.

**Implementation:**

Create a `PtyManager` (similar to `PipeManager`):

```
PTY pair:
  master FD ← user reads/writes this (terminal emulator side)
  slave FD  ← process reads/writes this (thinks it's a terminal)
```

- Opening `/dev/ptmx` allocates a new PTY pair, returns the master FD. The slave is created at `/dev/pts/<N>`.
- Add `openpty(pid)` to `KernelInterface` — returns `{ masterFd, slaveFd, ptsPath }`.
- Master writes → slave reads (with line discipline processing). Slave writes → master reads (for display).
- Line discipline handles:
  - **Canonical mode** (default): buffer input until newline, support backspace/erase
  - **Raw mode**: pass bytes through immediately (no buffering, no echo)
  - **Echo**: characters written to master are echoed back to master for display
  - **Signal generation**: ^C → SIGINT to foreground process group, ^Z → SIGTSTP, ^\ → SIGQUIT, ^D → EOF
- `isatty(fd)` returns true for slave FDs (already partially supported via WasmVM patch)

**Data flow:**
```
Terminal UI → proc.writeStdin(keystroke)
  → kernel master FD write
    → line discipline processing (echo, signals, buffering)
      → slave FD readable
        → WasmVM/Node process reads stdin

Process writes to stdout/stderr
  → slave FD write
    → master FD readable
      → onStdout callback → Terminal UI
```

**Acceptance criteria:**
- `openpty(pid)` returns master FD, slave FD, and `/dev/pts/N` path
- Writing to master → readable from slave (input direction)
- Writing to slave → readable from master (output direction)
- Canonical mode: input buffered until `\n`, backspace erases last char
- Raw mode: bytes pass through immediately with no buffering
- Echo mode: input bytes echoed back through master for display
- ^C in canonical mode → SIGINT delivered to foreground process group of the slave's session
- ^Z → SIGTSTP, ^\ → SIGQUIT, ^D at start of line → EOF
- `isatty(slaveFd)` returns true, `isatty(pipeFd)` returns false
- Multiple PTY pairs can coexist (separate /dev/pts/0, /dev/pts/1, etc.)
- Master close → slave reads get EIO (terminal hangup)
- Slave close → master reads get EIO
- Test: open PTY, write "hello\n" to master, read from slave → "hello\n"
- Test: open PTY, write "hello\n" to slave, read from master → "hello\n"
- Test: raw mode, write single byte to master, immediately readable from slave (no line buffering)
- Test: canonical mode, write "ab\x7fc\n" (a, b, backspace, c, enter) → slave reads "ac\n"
- Test: ^C on master → SIGINT to foreground pgid
- Test: isatty on slave FD returns true
- Typecheck passes, tests pass

### 23. Termios (Terminal Attributes)

**Location:** new file `packages/kernel/src/termios.ts`, extend `packages/kernel/src/fd-table.ts`

**Problem:** No termios support. Processes can't switch between canonical/raw mode, toggle echo, or configure terminal behavior. Required for programs like `vim`, `less`, `top`, or any readline-based prompt.

**Implementation:**

Store terminal attributes per PTY slave in the PTY manager:

```ts
interface Termios {
  // Input flags
  icrnl: boolean;    // translate CR to NL on input
  igncr: boolean;    // ignore CR on input

  // Output flags
  opost: boolean;    // post-process output (e.g., NL → CR+NL)
  onlcr: boolean;    // translate NL to CR+NL on output

  // Local flags
  echo: boolean;     // echo input back
  echoe: boolean;    // echo erase as backspace-space-backspace
  icanon: boolean;   // canonical (line) mode
  isig: boolean;     // enable signal generation (^C, ^Z, ^\)

  // Control characters
  cc: {
    vintr: number;   // ^C (0x03)
    vquit: number;   // ^\ (0x1c)
    verase: number;  // backspace (0x7f)
    vkill: number;   // ^U (0x15) — erase line
    veof: number;    // ^D (0x04)
    vsusp: number;   // ^Z (0x1a)
    vmin: number;    // min chars for non-canonical read
    vtime: number;   // timeout for non-canonical read (tenths of sec)
  };
}
```

- Add `tcgetattr(pid, fd)` → returns current `Termios` for the PTY
- Add `tcsetattr(pid, fd, termios)` → sets terminal attributes
- Add `tcsetpgrp(pid, fd, pgid)` → set foreground process group for terminal
- Add `tcgetpgrp(pid, fd)` → get foreground process group

**Wire into KernelInterface:**
```ts
tcgetattr(pid: number, fd: number): Termios;
tcsetattr(pid: number, fd: number, attrs: Partial<Termios>): void;
tcsetpgrp(pid: number, fd: number, pgid: number): void;
tcgetpgrp(pid: number, fd: number): number;
```

**Wire into WasmVM:** Map WASI `fd_fdstat_get` filetype to `CHARACTER_DEVICE` for PTY slave FDs. Add host imports for `tcgetattr`/`tcsetattr` so brush-shell and programs can configure the terminal.

**Acceptance criteria:**
- Default termios: canonical mode on, echo on, isig on, standard control characters
- `tcsetattr` with `icanon: false` switches to raw mode — immediate byte delivery
- `tcsetattr` with `echo: false` disables echo
- `tcsetpgrp` sets foreground process group — ^C delivers SIGINT to that group only
- Programs can read current termios via `tcgetattr`
- WasmVM processes can call tcsetattr through host import
- Test: spawn shell on PTY in canonical mode, verify line buffering
- Test: switch to raw mode via tcsetattr, verify immediate byte delivery
- Test: disable echo, verify master doesn't receive echo bytes
- Test: tcsetpgrp changes which group receives ^C
- Typecheck passes, tests pass

### 24. Interactive Shell Integration (PTY + Process Groups + Termios)

**Location:** `packages/kernel/src/kernel.ts` (new `openShell` convenience method)

**Problem:** Even with PTY, process groups, and termios implemented individually, wiring them together for an interactive shell requires careful orchestration. This story provides the integration layer and proves the full stack works.

**Implementation:**

Add a convenience method to the kernel:

```ts
kernel.openShell(options?: {
  command?: string;     // default "sh"
  args?: string[];      // default ["-i"]
  env?: Record<string, string>;
  cols?: number;        // terminal width, default 80
  rows?: number;        // terminal height, default 24
}): {
  pid: number;
  masterFd: number;
  write(data: Uint8Array | string): void;  // write to master (keystrokes)
  onData(cb: (data: Uint8Array) => void): void;  // read from master (display)
  resize(cols: number, rows: number): void; // send SIGWINCH
  kill(signal?: number): void;
  wait(): Promise<number>;
}
```

Under the hood:
1. Create PTY pair via `openpty()`
2. Create new session and process group via `setsid()`
3. Set slave as controlling terminal
4. Set default termios (canonical, echo, isig)
5. Set `TERM=xterm-256color` in env
6. Set `COLUMNS` and `ROWS` in env
7. Spawn shell process with slave FD wired to stdin/stdout/stderr
8. Close slave FD in parent (child inherited it)
9. Return handle wrapping master FD

**SIGWINCH delivery:**
When `resize(cols, rows)` is called:
1. Update terminal size in PTY state
2. Send SIGWINCH to foreground process group of the session

**Acceptance criteria:**
- `kernel.openShell()` returns a handle with write/onData/resize/kill/wait
- Shell process sees `isatty(0) === true`
- Writing "echo hello\n" to handle → onData receives "hello\n" (plus prompt/echo)
- Writing ^C → shell receives SIGINT (doesn't exit, just cancels current line)
- Writing ^D on empty line → shell exits (EOF)
- resize() → SIGWINCH delivered to foreground process group
- Shell can spawn child processes that inherit the terminal's process group
- Shell `exit` → handle.wait() resolves with exit code
- Test: open shell, write "echo hello\n", verify output contains "hello"
- Test: open shell, write ^C, verify shell still running
- Test: open shell, write ^D, verify shell exits
- Test: resize, verify SIGWINCH delivered
- Test: open shell, run "cat" (foreground), ^C kills cat but not shell
- Typecheck passes, tests pass

### 25. CLI Interactive Shell (`secure-exec-shell`)

**Location:** new file `packages/secure-exec/src/cli/shell.ts` or `scripts/shell.ts`

**Problem:** `kernel.openShell()` returns a programmatic handle but there's no way to actually use it from a terminal. Developers need a one-command entry point to get an interactive shell inside the kernel for testing, debugging, and exploration.

**Implementation:**

Create a CLI entry point that wires `kernel.openShell()` to the host process's stdin/stdout:

```ts
import { createKernel } from "@secure-exec/kernel";
import { createWasmVmRuntime } from "@secure-exec/runtime-wasmvm";
import { createNodeRuntime } from "@secure-exec/runtime-node";

const kernel = createKernel({ filesystem: vfs });
await kernel.mount(createWasmVmRuntime({ wasmBinaryPath: "..." }));
await kernel.mount(createNodeRuntime());

const shell = kernel.openShell({
  env: { ...process.env, TERM: process.env.TERM || "xterm-256color" },
  cols: process.stdout.columns,
  rows: process.stdout.rows,
});

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", (chunk) => shell.write(chunk));
shell.onData((data) => process.stdout.write(data));

process.stdout.on("resize", () => {
  shell.resize(process.stdout.columns, process.stdout.rows);
});

const code = await shell.wait();
process.stdin.setRawMode(false);
process.exit(code);
```

- Runnable via `npx tsx scripts/shell.ts` or a bin entry in package.json
- Accepts optional args: `--wasm-path`, `--no-node` (skip mounting Node driver), `--cwd`
- On shell exit, restores terminal and exits with the shell's exit code

**Acceptance criteria:**
- Running the script drops you into an interactive shell inside the kernel
- `echo hello`, `ls /`, `cat` with stdin all work interactively
- Tab characters, arrow keys, and backspace pass through correctly (raw mode)
- ^C sends SIGINT (cancels command, doesn't exit shell)
- ^D on empty line exits the shell
- Window resize updates the shell (SIGWINCH)
- `node -e "console.log(42)"` works (cross-runtime via kernel)
- Shell exit restores terminal to normal mode
- Typecheck passes, tests pass

### 26. Device `/dev/fd` Pseudo-Directory (was 25)

**Location:** `packages/kernel/src/device-layer.ts`

**Problem:** `/dev/fd/N` paths are recognized in the device layer (line 29) but not implemented. Programs like bash use `/dev/fd/N` to access open file descriptors by path (e.g., process substitution `<(command)` uses `/dev/fd/63`). Without this, bash process substitution and some heredoc patterns break.

**Implementation:**
- Intercept `readFile("/dev/fd/N")` → extract N, call `fdRead(pid, N, ...)` on the caller's FD table
- Intercept `writeFile("/dev/fd/N", data)` → extract N, call `fdWrite(pid, N, data)`
- Intercept `stat("/dev/fd/N")` → call `fdStat(pid, N)`, return appropriate stat
- Intercept `readDir("/dev/fd")` → list all open FDs for the calling process as entries
- `open("/dev/fd/N")` → dup(N) — opening a /dev/fd path creates a new FD pointing to the same description

**Requires:** PID context in device layer operations. Currently the device layer wraps VFS without PID awareness. Either:
- Pass PID through a context parameter, or
- Use a per-request context (similar to how KernelInterface methods take pid)

**Acceptance criteria:**
- `readFile("/dev/fd/0")` reads from the process's stdin FD
- `readFile("/dev/fd/N")` where N is an open file FD → returns file content at current cursor
- `stat("/dev/fd/N")` returns stat for the underlying file
- `readDir("/dev/fd")` lists open FD numbers as directory entries
- `open("/dev/fd/N")` equivalent to `dup(N)`
- Reading `/dev/fd/N` where N is not open → EBADF
- Test: open file as FD 5, read via `/dev/fd/5` → same content
- Test: create pipe, write to write end, read via `/dev/fd/<readEnd>` → pipe data
- Test: readDir("/dev/fd") lists 0, 1, 2 (at minimum) for any process
- Typecheck passes, tests pass

### 27. fdPread / fdPwrite (Positional I/O) (was 26)

**Location:** `packages/kernel/src/fd-table.ts`, `packages/kernel/src/kernel.ts`, `packages/runtime/wasmvm/src/kernel-worker.ts`

**Problem:** WasmVM's kernel-worker RPC defines `fdPread` and `fdPwrite` handlers but they fall back to sequential `fdRead`/`fdWrite` without respecting the offset parameter. Positional I/O reads/writes at a specific offset without changing the FD's cursor position. This is used by databases (SQLite), memory-mapped file patterns, and concurrent readers of the same file.

**Implementation:**
- Add `fdPread(pid, fd, length, offset)` to `KernelInterface` — reads `length` bytes at `offset` without moving cursor
- Add `fdPwrite(pid, fd, data, offset)` to `KernelInterface` — writes `data` at `offset` without moving cursor
- Implementation: save current cursor, seek to offset, read/write, restore cursor. Or better: read directly from VFS at offset without touching the FD cursor at all.
- Wire into WasmVM kernel-worker's existing `fdPread`/`fdPwrite` handlers (currently stubs)
- fdPread/fdPwrite on pipes → ESPIPE (positional I/O not supported on pipes)

**Acceptance criteria:**
- `fdPread(pid, fd, 5, 0n)` reads 5 bytes at offset 0 without changing FD cursor
- `fdPwrite(pid, fd, data, 10n)` writes at offset 10 without changing FD cursor
- After pread/pwrite, subsequent fdRead/fdWrite continues from the cursor's original position
- fdPread on pipe → ESPIPE
- fdPwrite on pipe → ESPIPE
- Concurrent pread calls on same FD return correct data (no cursor interference)
- Test: write "hello world", fdPread(0, 5) → "hello", then fdRead → "hello world" (cursor at 0)
- Test: fdPread(6, 5) → "world", cursor unchanged
- Test: fdPwrite at offset 6, fdRead from 0 → "hello world" with written bytes at offset 6
- Test: fdPread on pipe FD → ESPIPE
- Typecheck passes, tests pass

---

## P5 — Documentation for New Features

### 28. PTY and Interactive Shell Documentation (was 27)

**File:** `docs/kernel/interactive-shell.mdx`

Covers:
- What PTY support enables (interactive bash, vim, less, readline)
- `kernel.openShell()` quickstart with streaming I/O
- Wiring to a terminal UI (xterm.js in browser, raw stdin in Node)
- Process groups and job control (fg/bg/^C/^Z)
- Termios configuration (raw mode, echo, signal generation)
- Resize handling (SIGWINCH)
- Full example: Node.js CLI that opens an interactive shell

### 29. Update Kernel API Reference for New Syscalls (was 28)

**File:** `docs/kernel/api-reference.mdx` (update existing)

Add:
- `kernel.openShell(options?)` method and return type
- `openpty(pid)` in KernelInterface section
- `tcgetattr/tcsetattr/tcsetpgrp/tcgetpgrp` in KernelInterface section
- `setpgid/setsid/getpgid/getsid` in KernelInterface section
- `fdPread/fdPwrite` in KernelInterface section
- `/dev/fd`, `/dev/ptmx`, `/dev/pts/*` in device layer notes
- `Termios` type reference

---

## P6 — Bridge Hardening & Host Protection

### 30. Global Host Resource Budgets (was 29)

**Location:** `packages/secure-exec/src/node/execution-driver.ts`, `packages/secure-exec/src/bridge/process.ts`, `packages/secure-exec/src/shared/permissions.ts`

**Problem:** No global caps on output bytes, bridge-call rate, timer count, or child-process count. A hostile workload can amplify host CPU or memory usage without bound. The kernel now owns process spawning for kernel-path workloads, but the bridge path (direct NodeRuntime usage) still has no limits.

**Implementation:**
- Add `ResourceBudget` config to `NodeRuntimeOptions` and/or `SystemDriver`:
  ```ts
  resourceBudgets?: {
    maxOutputBytes?: number;        // total stdout+stderr bytes (default 10MB)
    maxBridgeCalls?: number;        // total bridge RPC calls per execution (default 100_000)
    maxTimers?: number;             // concurrent setInterval/setTimeout (default 1_000)
    maxChildProcesses?: number;     // concurrent child processes (default 50)
  };
  ```
- Track counts in execution driver; throw/reject when budget exceeded
- Bridge calls that exceed budget return an error to the isolate rather than crashing the host
- Kernel path: add `maxProcesses` option to `KernelOptions` for kernel-level process cap

**Acceptance criteria:**
- Exceeding `maxOutputBytes` → subsequent stdout/stderr writes silently dropped or error returned, execution continues but output truncated
- Exceeding `maxChildProcesses` → `child_process.spawn()` returns error, no host process created
- Exceeding `maxTimers` → `setInterval`/`setTimeout` throws, existing timers continue
- Exceeding `maxBridgeCalls` → bridge returns error, isolate can catch
- Test: set maxOutputBytes=100, write 200 bytes → only first 100 captured
- Test: set maxChildProcesses=3, spawn 5 → first 3 succeed, last 2 error
- Test: set maxTimers=5, create 10 intervals → first 5 succeed, rest throw
- Kernel: set maxProcesses=10, spawn 15 → first 10 succeed, rest throw EAGAIN
- Typecheck passes, tests pass

### 30. Child-Process Output Buffering Caps

**Location:** `packages/secure-exec/src/bridge/child-process.ts`

**Problem:** `spawnSync`/`execSync` paths collect stdout/stderr as unbounded strings (lines ~348-357). No `maxBuffer` enforcement. A malicious child process can produce gigabytes of output, exhausting host memory. The file is 710 lines with `@ts-nocheck` at the top.

**Implementation:**
- Enforce Node's `maxBuffer` option (default 1MB per Node.js convention) on `execSync`/`spawnSync`
- When accumulated output exceeds `maxBuffer`, kill the child process and throw with `code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'`
- Also apply to async `exec()` callback API (which buffers by default)
- For `spawn()` streaming API, no cap needed (caller manages backpressure via stream events)

**Acceptance criteria:**
- `execSync('cmd')` with default maxBuffer (1MB): output >1MB → throws ERR_CHILD_PROCESS_STDIO_MAXBUFFER
- `execSync('cmd', { maxBuffer: 100 })`: output >100 bytes → throws
- `spawnSync('cmd')` respects maxBuffer on stdout and stderr independently
- Async `exec(cmd, cb)` enforces maxBuffer, kills child on exceed
- Test: execSync producing 2MB output with maxBuffer=1MB → throws correct error code
- Test: spawnSync with small maxBuffer → truncated with correct error
- Typecheck passes, tests pass

### 31. Missing fs APIs in Bridge

**Location:** `packages/secure-exec/src/bridge/fs.ts`

**Problem:** 14 `fs` APIs are missing from the bridge, limiting Node.js compatibility for real-world packages. The kernel VFS has the underlying primitives for many of these; the bridge just needs wiring.

**Missing APIs:**
- `fs.cp(src, dest, options?)` / `fs.cpSync` — recursive copy (distinct from existing `copyFile`)
- `fs.glob(pattern)` / `fs.globSync` — file globbing
- `fs.opendir(path)` — returns async Dir iterator
- `fs.mkdtemp(prefix)` / `fs.mkdtempSync` — create temp directory with random suffix
- `fs.statfs(path)` / `fs.statfsSync` — filesystem statistics
- `fs.readv(fd, buffers)` / `fs.readvSync` — scatter read into multiple buffers
- `fs.fdatasync(fd)` / `fs.fdatasyncSync` — flush data (not metadata) to storage
- `fs.fsync(fd)` / `fs.fsyncSync` — flush data and metadata to storage

**Implementation notes:**
- `cp`/`cpSync`: implement as recursive readdir + copyFile; support `recursive`, `force`, `filter` options
- `glob`/`globSync`: implement using readdir + minimatch-style matching or delegate to a tiny glob library
- `opendir`: return an object with `read()` async iterator yielding `Dirent` entries
- `mkdtemp`: generate random suffix, call `mkdir`
- `statfs`: return reasonable defaults for virtual filesystem (block size, available blocks, etc.)
- `readv`: sequential reads into provided buffers
- `fdatasync`/`fsync`: no-op for in-memory VFS; for NodeFileSystem, delegate to host

**Acceptance criteria:**
- Each API matches Node.js signature and basic behavior
- `cp` recursively copies directories with `{ recursive: true }`
- `mkdtemp('/tmp/prefix-')` creates unique directory
- `opendir` returns async iterable of Dirent objects
- `glob('**/*.js')` returns matching file paths
- `statfs` returns object with `bsize`, `blocks`, `bfree`, `bavail`, `type` fields
- `readv` reads into multiple buffers sequentially
- `fdatasync`/`fsync` resolve without error (no-op for in-memory)
- All APIs available on `fs`, `fs/promises`, and `fs` callback forms where applicable
- Typecheck passes, tests pass

### 32. Wire Deferred fs APIs Through Bridge

**Location:** `packages/secure-exec/src/bridge/fs.ts`

**Problem:** `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes`, `watch`, `watchFile` all throw "not supported in sandbox" in the bridge. The kernel VFS interface already defines `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes` — the bridge just needs to call through to the VFS instead of throwing.

**Implementation:**
- For each API: remove the `throw` and wire to the corresponding VFS method via the bridge's filesystem reference
- `watch`/`watchFile`: these require filesystem event notification which neither VFS implementation supports. Keep these throwing but with a clearer error message: "fs.watch is not supported — use polling or explicit reads instead"
- Gate behind `permissions.fs` checks (same as existing fs operations)

**Acceptance criteria:**
- `fs.chmodSync('/tmp/f', 0o755)` succeeds (delegates to VFS)
- `fs.symlinkSync('/tmp/target', '/tmp/link')` creates symlink
- `fs.readlinkSync('/tmp/link')` returns '/tmp/target'
- `fs.linkSync('/tmp/f', '/tmp/f2')` creates hard link
- `fs.truncateSync('/tmp/f', 0)` truncates file
- `fs.utimesSync('/tmp/f', atime, mtime)` updates timestamps
- `fs.chownSync('/tmp/f', 1000, 1000)` updates ownership
- `fs.watch` still throws with clear message
- All available in sync, async callback, and promises forms
- Permissions checks applied (denied when `permissions.fs` blocks)
- Typecheck passes, tests pass

### 33. Express Project-Matrix Fixture

**Location:** `packages/secure-exec/tests/projects/`

**Problem:** Only Hono is covered in framework fixtures (via `esm-import-pass`). Express is the most widely used Node.js framework and exercises different code paths (CommonJS requires, middleware chaining, route parameter parsing, `http.createServer` delegation). Missing coverage risks compatibility regressions for the most common real-world use case.

**Implementation:**
- Create `packages/secure-exec/tests/projects/express-pass/`
- `package.json` with `express` dependency
- `index.js` that:
  1. Creates Express app with 2-3 routes
  2. Starts listening on a port (or uses `supertest` to avoid network)
  3. Makes requests and verifies responses
  4. Prints deterministic stdout for parity comparison
  5. Exits with code 0 on success
- Must be sandbox-blind (no sandbox-specific code)
- Must work with both host Node and kernel/secure-exec

**Acceptance criteria:**
- Fixture passes in host Node (`node index.js` → exit 0, expected stdout)
- Fixture passes through kernel project-matrix (`e2e-project-matrix.test.ts`)
- Fixture passes through secure-exec project-matrix (`project-matrix.test.ts`)
- Stdout parity between host and sandbox
- No sandbox-aware branches in fixture code
- Typecheck passes, tests pass

### 34. Fastify Project-Matrix Fixture

**Location:** `packages/secure-exec/tests/projects/`

**Problem:** Fastify is the second most popular Node.js framework and uses different patterns than Express (async/await handlers, schema validation, plugin system, pino logger). Covering it catches compatibility issues in async middleware, JSON schema, and structured logging paths.

**Implementation:**
- Create `packages/secure-exec/tests/projects/fastify-pass/`
- Same pattern as Express fixture: create app, register routes, make requests, verify responses, print stdout, exit 0

**Acceptance criteria:**
- Same as Express fixture (item 33) — host parity, sandbox-blind, passes both project matrices
- Typecheck passes, tests pass

### 35. Package Manager Layout Fixtures (pnpm, yarn, bun)

**Location:** `packages/secure-exec/tests/projects/`

**Problem:** npm flat `node_modules` layout works, but pnpm (symlink-based), yarn PnP (no `node_modules`), and bun (hardlink-based) layouts are untested. Real projects use these package managers, and module resolution through the VFS/bridge must handle symlinks, `.pnp.cjs`, and alternate directory structures.

**Implementation:**
- Create `packages/secure-exec/tests/projects/pnpm-layout-pass/` — project installed with pnpm, uses workspace symlinks
- Create `packages/secure-exec/tests/projects/bun-layout-pass/` — project installed with bun, uses hardlinks
- Each fixture: require a dependency, verify it resolves correctly, print output, exit 0
- Yarn PnP is out of scope for now (requires `.pnp.cjs` loader hook support which likely doesn't work)

**Acceptance criteria:**
- pnpm fixture: `require('left-pad')` resolves through symlinked `node_modules/.pnpm/` structure
- bun fixture: `require('left-pad')` resolves through bun's layout
- Both pass host parity comparison
- Both pass through kernel and secure-exec project matrices
- Typecheck passes, tests pass

### 36. Remove @ts-nocheck From Bridge Files

**Location:** `packages/secure-exec/src/bridge/polyfills.ts`, `bridge/os.ts`, `bridge/child-process.ts`, `bridge/process.ts`, `bridge/network.ts`

**Problem:** 5 bridge files have `@ts-nocheck` at the top, making type errors invisible. These files are security-critical (they form the isolate-to-host boundary). Type errors here can silently introduce vulnerabilities — wrong argument types to bridge calls, missing null checks, incorrect return types.

**Implementation:**
- Remove `@ts-nocheck` from each file one at a time
- Fix all type errors that surface
- Do NOT change runtime behavior — only add type annotations, casts, and interface conformance
- Expected common fixes: add explicit types to callback parameters, add null checks, type bridge call returns

**Acceptance criteria:**
- All 5 files have `@ts-nocheck` removed
- Zero type errors from `tsc --noEmit`
- No runtime behavior changes (existing tests still pass)
- Typecheck passes, tests pass

---

## P7 — Compatibility & Maintainability

### 37. Fix v8.serialize/deserialize Structured Clone Semantics

**Location:** `packages/secure-exec/isolate-runtime/src/inject/bridge-initial-globals.ts`

**Problem:** `v8.serialize()` uses `JSON.stringify()` and `v8.deserialize()` uses `JSON.parse()`. This is observably wrong for: `Map`, `Set`, `RegExp`, `Date`, circular references, `undefined` values, `BigInt`, `ArrayBuffer`, typed arrays, `Error` objects, and `NaN`/`Infinity`. Real Node.js uses V8's structured clone algorithm.

**Implementation:**
- Replace JSON serialization with structured clone serialization
- Options:
  a. Use `isolated-vm`'s `copy()` or `transferIn()`/`transferOut()` which use V8's internal serializer
  b. Implement a JS-level structured clone using `structuredClone()` if available in the isolate
  c. Use a polyfill that handles Map, Set, Date, RegExp, circular refs, typed arrays
- Must handle: Map, Set, Date, RegExp, Error, ArrayBuffer, SharedArrayBuffer (reject), typed arrays, circular references, undefined, NaN, Infinity, BigInt

**Acceptance criteria:**
- `v8.serialize(new Map([['a', 1]]))` → buffer that `v8.deserialize` → `Map { 'a' => 1 }`
- `v8.serialize(new Set([1, 2]))` → roundtrips to `Set { 1, 2 }`
- `v8.serialize(/foo/gi)` → roundtrips to `/foo/gi`
- `v8.serialize(new Date(0))` → roundtrips to `Date(0)`
- Circular references survive roundtrip
- `undefined` values preserved (not stripped like JSON)
- `NaN`, `Infinity`, `-Infinity` preserved
- `BigInt` values preserved
- `ArrayBuffer` and typed arrays preserved
- Test: roundtrip each type above
- Typecheck passes, tests pass

### 38. HTTP Agent Pooling, Upgrade, and Trailer APIs

**Location:** `packages/secure-exec/src/bridge/network.ts`

**Problem:** `http.Agent` is a stub. Missing: connection pooling/keep-alive controls, HTTP upgrade handling (WebSocket upgrade), trailer headers, and socket-level events (`connect`, `socket`, `upgrade`). Packages like `ws` (WebSocket), `got`, and `axios` depend on these.

**Implementation:**
- `http.Agent`: implement `maxSockets`, `maxFreeSockets`, `keepAlive`, `keepAliveMsecs` options. Track active/free sockets. Reuse connections when keep-alive enabled.
- `upgrade` event: when server responds with 101, emit `upgrade` event on request with `(response, socket, head)`. Socket can be a minimal duplex wrapper.
- Trailer headers: support `response.trailers` property. Parse trailers from chunked transfer-encoding responses.
- Socket events: emit `socket` event on request when connection established. Emit `connect` on the socket.

**Acceptance criteria:**
- `new http.Agent({ keepAlive: true, maxSockets: 5 })` — agent limits concurrent connections
- Request with `Connection: upgrade` and 101 response → `upgrade` event fires
- Response with trailer headers → `response.trailers` populated
- `request.on('socket', cb)` fires with socket-like object
- Test: Agent with maxSockets=1, two concurrent requests → second waits for first
- Test: upgrade request → upgrade event fires with response and socket
- Typecheck passes, tests pass

### 39. Codemod Example

**Location:** `examples/codemod/`

**Problem:** No example demonstrates secure-exec in a realistic tool-building workflow. A codemod example shows the primary use case: running untrusted/generated code transformations safely.

**Implementation:**
- Create `examples/codemod/` with `package.json`, `src/index.ts`
- Example flow:
  1. Read a source file from disk
  2. Write it to sandbox VFS
  3. Execute a codemod script (e.g., rename function, update imports) inside the sandbox
  4. Read the transformed file back from VFS
  5. Print the diff
- Use `jscodeshift`-style transform or simple string replacement
- Demonstrate: filesystem isolation (codemod can only see VFS files), output capture, error handling

**Acceptance criteria:**
- `pnpm --filter codemod-example start` runs successfully
- Example transforms a sample file and prints the result
- Sandbox prevents codemod from accessing host filesystem
- README explains the pattern
- Typecheck passes

---

## P8 — Refactoring

### 40. Split NodeExecutionDriver Into Focused Modules

**Location:** `packages/secure-exec/src/node/execution-driver.ts` (1756 lines)

**Problem:** The execution driver is a monolith handling: isolate bootstrap, module resolution, ESM compilation, bridge setup, execution lifecycle, stdio routing, and resource tracking. Changes to one concern risk breaking others. The `@ts-nocheck` on bridge files (item 36) compounds this — once types are enforced, the monolith becomes harder to maintain.

**Implementation:**
- Extract into focused modules (same directory):
  - `isolate-bootstrap.ts` — isolate creation, memory limit setup, initial context
  - `module-resolver.ts` — require resolution, ESM reverse lookup, package.json parsing
  - `esm-compiler.ts` — ESM to CJS compilation, source map handling
  - `bridge-setup.ts` — bridge function registration, global injection
  - `execution-lifecycle.ts` — exec/run flow, timeout handling, cleanup
- Keep `execution-driver.ts` as the facade that wires modules together
- No behavior changes — pure extraction refactor

**Acceptance criteria:**
- `execution-driver.ts` reduced to <300 lines (facade + wiring)
- Each extracted module has a clear single responsibility
- All existing tests pass without modification
- No runtime behavior changes
- Typecheck passes, tests pass

### 41. ESM Module Reverse Lookup O(1)

**Location:** `packages/secure-exec/src/node/execution-driver.ts`

**Problem:** Large import graphs risk quadratic resolver work during ESM reverse lookup (mapping compiled module back to source path).

**Implementation:**
- Build a reverse lookup map (compiled path → source path) during compilation
- Store as a `Map<string, string>` alongside the forward resolution cache
- Lookup becomes O(1) instead of scanning the forward map

**Acceptance criteria:**
- Reverse lookup uses Map.get() not Array.find() or iteration
- Performance: 1000-module import graph resolves in <10ms (not quadratic)
- All existing ESM tests pass
- Typecheck passes, tests pass

### 42. Resolver Memoization

**Location:** `packages/secure-exec/src/package-bundler.ts`, `packages/secure-exec/src/shared/require-setup.ts`, `packages/secure-exec/src/node/execution-driver.ts`

**Problem:** Repeated miss probes across `require()` and `import()` paths. Same non-existent paths get probed multiple times.

**Implementation:**
- Add negative result cache: `Map<string, false>` for paths known not to exist
- Add positive result cache: `Map<string, string>` for resolved paths
- Cache `package.json` parse results: `Map<string, PackageJson>` keyed by directory
- Invalidation: caches are per-execution (cleared on dispose), no stale entry risk

**Acceptance criteria:**
- Same `require('nonexistent')` called twice → only one VFS probe
- Same `require('express')` called twice → only one resolution walk
- `package.json` in same directory read once, reused for subsequent resolves
- All existing module resolution tests pass
- Typecheck passes, tests pass

---

## P9 — Post-Implementation Fixes

Issues found during adversarial review of Ralph's implementation of items 1-42.

### 43. Fix Zombie Timer Cleanup Tests (US-013 was pass-vacuous)

**Location:** `packages/kernel/test/kernel-integration.test.ts` — zombie timer cleanup tests

**Problem:** The tests for US-013 only verify that `kernel.dispose()` completes without throwing. They do NOT verify that zombie cleanup timers are actually cleared from memory. A broken implementation that never clears timers would still pass. The test comments acknowledge this: "If timers weren't cleared, they'd fire 60s later referencing disposed state."

**Fix:**
- Expose timer tracking from ProcessTable (e.g., `zombieTimerCount` getter or `_zombieTimers` for test inspection)
- After process exits and becomes zombie, assert timer was scheduled (count > 0)
- After `kernel.dispose()`, assert timer was cleared (count === 0)
- Alternative: use `vi.useFakeTimers()` to advance time past the 60s zombie TTL after dispose and verify no errors/callbacks fire

**Acceptance criteria:**
- Test: spawn process, let it exit → `processTable.zombieTimerCount > 0` (timer scheduled)
- Test: call `kernel.dispose()` → `processTable.zombieTimerCount === 0` (timer cleared)
- Test: with fake timers, advance 60s after dispose → no callbacks fire, no errors
- Tests would FAIL if timers are not actually cleared during dispose
- Typecheck passes, tests pass

### 44. Fix pnpm Layout Fixture (US-038 was a stub)

**Location:** `packages/secure-exec/tests/projects/pnpm-layout-pass/`

**Problem:** The fixture has no actual pnpm-style `node_modules` layout. There's no `.pnpm/` symlink directory structure and no `pnpm-lock.yaml`. The fixture just has a `package.json` and `src/index.js` with a regular npm-style flat layout. It doesn't test what it claims to test — pnpm's symlink-based module resolution.

**Fix:**
- Actually install with `pnpm install` to create the real `.pnpm/` directory structure with symlinks
- Commit the resulting `pnpm-lock.yaml` and `node_modules/` layout (or generate it in CI)
- Verify `node_modules/left-pad` is a symlink pointing into `.pnpm/left-pad@1.3.0/node_modules/left-pad`
- The fixture's `index.js` should `require('left-pad')` and verify it resolves through the symlink chain
- `fixture.json` should specify `"packageManager": "pnpm"`

**Acceptance criteria:**
- `pnpm-lock.yaml` exists in fixture directory
- `node_modules/.pnpm/` directory exists with real symlink structure
- `node_modules/left-pad` is a symlink (not a regular directory)
- `require('left-pad')` resolves through the symlink chain
- Fixture passes through both project matrices (host parity + kernel)
- Typecheck passes, tests pass

### 45. Fix bun Layout Fixture (US-038 was misnamed)

**Location:** `packages/secure-exec/tests/projects/bun-layout-pass/`

**Problem:** The fixture's `fixture.json` says `"packageManager": "npm"` — it's just an npm layout with a different directory name. There's no bun lockfile (`bun.lockb`) and no bun-style `node_modules` structure. It doesn't test bun's hardlink-based module resolution at all.

**Fix:**
- Actually install with `bun install` to create the real bun layout
- Commit `bun.lockb` and the resulting `node_modules/` structure
- Update `fixture.json` to `"packageManager": "bun"`
- The fixture's `index.js` should `require('left-pad')` and verify it resolves through bun's layout
- Verify `node_modules/left-pad` is a hardlink (not symlink, not regular copy)

**Acceptance criteria:**
- `bun.lockb` exists in fixture directory
- `fixture.json` says `"packageManager": "bun"`
- `node_modules/left-pad` installed via bun's layout (hardlinks)
- `require('left-pad')` resolves correctly
- Fixture passes through both project matrices (host parity + kernel)
- Typecheck passes, tests pass

### 46. Express/Fastify Fixtures Should Use Real HTTP (optional improvement)

**Location:** `packages/secure-exec/tests/projects/express-pass/`, `fastify-pass/`

**Problem:** Both fixtures use programmatic request dispatchers with EventEmitter mocks instead of actually starting a server and making HTTP requests. This tests the framework's routing/middleware logic but doesn't exercise the network stack (http.createServer, socket handling, request parsing). A bug in the network bridge would not be caught.

**Fix:**
- Start the server on a random port (e.g., port 0 for auto-assignment)
- Make real HTTP requests using Node's built-in `http.get`/`http.request`
- Verify response status codes and bodies
- Close server and exit
- Keep the programmatic tests as a fallback if network isn't available

**Acceptance criteria:**
- Express fixture starts real HTTP server, makes real requests, verifies responses
- Fastify fixture starts real HTTP server, makes real requests, verifies responses
- Both still sandbox-blind (no sandbox-specific code)
- Both still pass host parity comparison
- Typecheck passes, tests pass
