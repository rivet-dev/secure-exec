# POSIX Hardening Specification

## Technical Specification v1.0

**Date:** March 19, 2026
**Status:** Proposed
**Companion:** `docs/posix-compatibility.md` (living compliance tracker)
**Prereqs:** Items from `docs-internal/spec-hardening.md` (P0-P2 bugs and test gaps)

---

## 1. Summary

This spec covers every POSIX compliance gap identified in the kernel, WasmVM runtime, Node bridge, and Python bridge that **can be implemented** within the current architecture. It excludes items that are architecturally impossible (fork, async signal delivery to WASM, raw sockets in WASM, pthreads, mmap, ptrace, setuid/setgid) and items already covered by `docs-internal/spec-hardening.md`.

### 1.1 Scope

Items are organized by priority:

- **P0** — Critical POSIX violations that cause incorrect behavior in common workflows
- **P1** — Missing POSIX features that limit shell/process fidelity
- **P2** — Missing POSIX features that improve compatibility but aren't blocking
- **P3** — Quality-of-life improvements for POSIX parity

### 1.2 Out of Scope

These cannot be implemented without fundamental architecture changes:

| Feature | Reason |
|---------|--------|
| fork() / vfork() | WASM can't copy linear memory |
| exec() family | Can't replace running process image |
| Async signal delivery to WASM code | JS has no preemptive interruption |
| User-registered signal handlers | Untrusted code can't control lifecycle |
| pthreads / threading | wasm32-wasip1 doesn't support threads |
| Raw sockets in WASM | WASI Preview 1 has no socket API |
| mmap / shared memory | WASM memory separate from host |
| ptrace / strace | No debug interface across WASM boundary |
| setuid / setgid binaries | Incompatible with sandbox model |
| Real-time signals (SIGRTMIN-SIGRTMAX) | No RT signal infrastructure |
| select / poll / epoll | JS async model incompatible |

---

## 2. P0 — Critical POSIX Violations

### 2.1 SIGPIPE on Broken Pipe Write

**Location:** `packages/kernel/src/pipe-manager.ts`

**Problem:** Writing to a pipe whose read end is closed throws an EPIPE error but does NOT deliver SIGPIPE to the writing process. POSIX requires that a write to a broken pipe both raises EPIPE *and* sends SIGPIPE to the writer. Without this, pipelines like `yes | head -1` don't terminate correctly — `yes` never receives SIGPIPE and keeps running until the kernel forces cleanup.

**Current behavior (line 87-88):**
```ts
if (pipe.readClosed) {
  throw this.createError('EPIPE', 'Broken pipe');
}
```

**Fix:**
- Before throwing EPIPE, call `this.processTable.kill(pid, SIGPIPE)` where `pid` is the writing process
- The PipeManager needs access to the ProcessTable (inject via constructor or method parameter)
- The `write()` method needs to know the caller's PID (add `pid` parameter)
- Default SIGPIPE behavior: terminate the process (unless masked — but we don't have sigprocmask, so always terminate)

**Acceptance criteria:**
- Write to broken pipe → SIGPIPE delivered to writing process, then EPIPE thrown
- Pipeline `yes | head -1`: head exits after reading 1 line, yes receives SIGPIPE and terminates
- Test: create pipe, close read end, write to write end → writer process gets SIGPIPE and exits with 128+13=141
- Test: pipeline where reader exits early → writer terminates via SIGPIPE
- Typecheck passes, tests pass

### 2.2 FD Table Cleanup on Process Exit

**NOTE:** This is item 1 in `spec-hardening.md` (P0). Including here for completeness — it MUST be done before other items.

**Problem:** `fdTableManager.remove(pid)` never called on process exit. Every spawn leaks an FD table. FileDescription refcounts never reach 0.

### 2.3 POSIX wstatus Encoding for waitpid

**Location:** `packages/kernel/src/process-table.ts`

**Problem:** `waitpid()` returns `{ pid, status: exitCode }` where `status` is the raw exit code number. POSIX encodes the exit status differently depending on how the process terminated:
- Normal exit: `(exitCode & 0xFF) << 8`
- Signal death: `signalNumber & 0x7F`
- Stopped: `(signalNumber << 8) | 0x7F`

Without this encoding, programs using the shell's `$?` or waitpid macros (WIFEXITED, WEXITSTATUS, WIFSIGNALED, WTERMSIG) will misinterpret results.

**Fix:**
- Track *how* a process exited in ProcessEntry: `exitReason: 'normal' | 'signal'` and `exitSignal?: number`
- When `markExited` is called, store both the exit code and the reason
- When `kill(pid, SIGKILL)` or `kill(pid, SIGTERM)` terminates a process, set `exitReason: 'signal'` and `exitSignal: signalNumber`
- `waitpid()` returns POSIX-encoded wstatus:
  - Normal: `(exitCode << 8) | 0`
  - Signal: `(0 << 8) | signalNumber`
- Provide helper functions: `WIFEXITED(status)`, `WEXITSTATUS(status)`, `WIFSIGNALED(status)`, `WTERMSIG(status)`
- Export helpers from kernel for use by runtimes and tests

**Acceptance criteria:**
- Process exits normally with code 42 → waitpid returns wstatus where `WIFEXITED(s) === true` and `WEXITSTATUS(s) === 42`
- Process killed by SIGKILL → waitpid returns wstatus where `WIFSIGNALED(s) === true` and `WTERMSIG(s) === 9`
- Process killed by SIGTERM → `WTERMSIG(s) === 15`
- Shell `$?` reflects correct exit code (this is brush-shell's responsibility, but kernel provides the raw data)
- Test: spawn, normal exit(0) → WIFEXITED, WEXITSTATUS(0)
- Test: spawn, normal exit(1) → WIFEXITED, WEXITSTATUS(1)
- Test: spawn, kill(SIGKILL) → WIFSIGNALED, WTERMSIG(9)
- Test: spawn, kill(SIGTERM) → WIFSIGNALED, WTERMSIG(15)
- Typecheck passes, tests pass

---

## 3. P1 — Missing POSIX Features (High Impact)

### 3.1 SIGTSTP (Ctrl+Z) and Job Control Signals

**Location:** `packages/kernel/src/pty.ts`, `packages/kernel/src/process-table.ts`

**Problem:** The PTY line discipline recognizes ^Z (`vsusp` control char, 0x1A) but does nothing with it. POSIX requires that ^Z sends SIGTSTP to the foreground process group, which suspends the process. Without this, interactive shell users can't background running commands with Ctrl+Z.

**What's needed:**

1. **SIGTSTP delivery**: When ^Z is typed and `isig` is true, send SIGTSTP (20) to the foreground process group
2. **Process stopped state**: Add `status: 'stopped'` to ProcessEntry (alongside 'running' and 'exited')
3. **SIGCONT delivery**: `kill(pid, SIGCONT)` resumes a stopped process
4. **SIGSTOP**: Like SIGTSTP but cannot be caught/ignored (in our model, equivalent since we don't have handlers)
5. **Job control shell integration**: brush-shell's `fg`, `bg`, `jobs` builtins currently stubbed — they need kernel support

**Implementation:**

ProcessTable changes:
```ts
interface ProcessEntry {
  status: 'running' | 'stopped' | 'exited';
  // ...existing fields...
}

// New methods:
stop(pid: number): void;    // Set status to 'stopped', notify waiters with WUNTRACED
cont(pid: number): void;    // Set status to 'running', resume execution
```

PTY changes (pty.ts, processInput):
```ts
// After existing ^C handling:
if (isig && byte === cc.vsusp) {
  // Send SIGTSTP to foreground process group
  const fgpgid = this.getForegroundPgid(ptyId);
  if (fgpgid !== undefined) {
    this.processTable.kill(-fgpgid, SIGTSTP);
  }
  // Echo "^Z\r\n"
  this.echoToMaster(ptyId, '^Z\r\n');
  return;
}
```

Driver integration:
- `RuntimeDriver.kill(SIGTSTP)` → driver pauses the process (Worker: pause message loop; Node: send signal to child)
- `RuntimeDriver.kill(SIGCONT)` → driver resumes the process
- For WasmVM: SIGTSTP is effectively a no-op on the WASM Worker (can't pause synchronous execution), but the kernel state change still works for shell job tracking

**Acceptance criteria:**
- ^Z at shell → foreground process receives SIGTSTP, shell shows `[1]+ Stopped  <command>`
- `fg` resumes stopped process → SIGCONT delivered, process continues
- `bg` resumes stopped process in background → SIGCONT delivered, process runs in background
- `jobs` lists stopped and background processes with correct state
- `kill -CONT <pid>` resumes a stopped process
- Stopped process doesn't consume CPU (where possible — WasmVM Worker may spin)
- Test: spawn process, send SIGTSTP → process status becomes 'stopped'
- Test: send SIGCONT to stopped process → status becomes 'running'
- Test: ^Z in shell PTY → foreground process stopped, shell shows notification
- Test: `fg` in shell → stopped process resumed
- Typecheck passes, tests pass

### 3.2 SIGQUIT (Ctrl+\)

**Location:** `packages/kernel/src/pty.ts`

**Problem:** ^\ (`vquit`, 0x1C) is defined in termios control characters but never generates SIGQUIT (3). POSIX requires ^\ to send SIGQUIT to the foreground process group. SIGQUIT is like SIGTERM but conventionally produces a core dump (which we can skip, but the signal should still terminate the process).

**Fix:**
- In `processInput()`, after the SIGINT check, add SIGQUIT handling:
  ```ts
  if (isig && byte === cc.vquit) {
    const fgpgid = this.getForegroundPgid(ptyId);
    if (fgpgid !== undefined) {
      this.processTable.kill(-fgpgid, SIGQUIT);
    }
    this.echoToMaster(ptyId, '^\\\r\n');
    return;
  }
  ```
- SIGQUIT default action: terminate process (same as SIGTERM for us)

**Acceptance criteria:**
- ^\ at shell → foreground process receives SIGQUIT and terminates
- Echo shows `^\` followed by newline
- Exit code: 128 + 3 = 131 (signal 3)
- Test: spawn process, write ^\ to PTY master → process terminated with SIGQUIT
- Typecheck passes, tests pass

### 3.3 SIGHUP on Terminal Hangup

**Location:** `packages/kernel/src/pty.ts`, `packages/kernel/src/process-table.ts`

**Problem:** When a PTY master is closed (terminal disconnected), slave reads return EOF but no SIGHUP is sent. POSIX requires SIGHUP to be sent to the session leader's process group when the controlling terminal hangs up. This is important for:
- Terminal emulator closed → all processes in the session should receive SIGHUP
- SSH disconnect → same behavior

**Fix:**
- When master FD is closed (PtyManager cleanup):
  1. Find the session associated with this PTY
  2. Send SIGHUP (1) to the foreground process group
  3. Then send SIGCONT (in case they were stopped — POSIX requires this)
  4. Slave reads should return EIO (not just EOF) after master closes

**Acceptance criteria:**
- Close PTY master → SIGHUP sent to session's foreground process group
- Stopped processes in the group receive SIGCONT after SIGHUP (so they can process the SIGHUP)
- Slave reads after master close → EIO
- Test: open shell PTY, close master FD → shell process receives SIGHUP
- Test: open shell PTY, spawn child in foreground, close master → child receives SIGHUP
- Typecheck passes, tests pass

### 3.4 WNOHANG Flag for waitpid

**Location:** `packages/kernel/src/process-table.ts`

**Problem:** `waitpid()` always blocks until the process exits. There's no way to check if a process has exited without blocking. Shell job control and event-driven process management need non-blocking wait.

**Fix:**
- Add `options` parameter to `waitpid()`:
  ```ts
  waitpid(pid: number, options?: { WNOHANG?: boolean }): Promise<{ pid: number; status: number } | null>;
  ```
- When `WNOHANG` is set and process hasn't exited: return `null` immediately (not 0 — we return objects)
- When `WNOHANG` is set and process has exited: return `{ pid, status }` immediately

**Acceptance criteria:**
- `waitpid(pid, { WNOHANG: true })` on running process → returns null immediately
- `waitpid(pid, { WNOHANG: true })` on exited process → returns `{ pid, status }` immediately
- `waitpid(pid)` (no options) → still blocks as before
- Test: spawn long-running process, WNOHANG → null, then wait for exit → { pid, status }
- Typecheck passes, tests pass

### 3.5 FD_CLOEXEC (Close-on-Exec Flag)

**Location:** `packages/kernel/src/fd-table.ts`

**Problem:** No per-FD close-on-exec flag. POSIX allows marking FDs with FD_CLOEXEC so they're automatically closed when the process spawns a child (via exec). Currently, all FDs are inherited. The kernel has a heuristic that closes parent pipe FDs after wiring child stdio, but it's not a general mechanism.

**Fix:**
- Add `cloexec: boolean` flag to `FileDescription` (default `false`)
- Add `fdSetCloexec(pid, fd, value)` to KernelInterface
- Add `fdGetCloexec(pid, fd)` to KernelInterface
- When creating child FD table via `fork()`, skip FDs marked cloexec
- Support `O_CLOEXEC` flag in `fdOpen()` — sets cloexec on the new FD

**Acceptance criteria:**
- FD created with O_CLOEXEC → child process doesn't inherit it
- `fdSetCloexec(pid, fd, true)` → subsequent spawns don't inherit that FD
- FD created without cloexec → child inherits it (current behavior preserved)
- Pipe FDs: default to cloexec=false (current behavior), but shell can set cloexec on pipes used for internal bookkeeping
- Test: open file with O_CLOEXEC, spawn child → child gets EBADF on that FD
- Test: open file without O_CLOEXEC, spawn child → child can read the FD
- Test: set cloexec after open, spawn → not inherited
- Typecheck passes, tests pass

### 3.6 Mutable Environment (setenv/unsetenv)

**Location:** `packages/kernel/src/kernel.ts`, `packages/kernel/src/process-table.ts`

**Problem:** Environment variables are immutable after process creation. `setenv()` and `unsetenv()` don't exist. The shell can track its own env in-process, but kernel-level env queries (e.g., from another runtime asking about a process's env) see only the original env.

**Fix:**
- Make `ProcessEntry.env` mutable
- Add `setenv(pid, key, value)` to KernelInterface
- Add `unsetenv(pid, key)` to KernelInterface
- Guard with same ownership check as `getenv` (only the process's own driver can modify)
- Shell `export VAR=val` → calls `setenv(pid, 'VAR', 'val')` through kernel interface
- Child processes inherit the *current* env at spawn time (snapshot semantics)

**Acceptance criteria:**
- `setenv(pid, 'FOO', 'bar')` → subsequent `getenv(pid)` includes `FOO=bar`
- `unsetenv(pid, 'FOO')` → `FOO` removed from process env
- Child process spawned after setenv → inherits the updated env
- Child process spawned before setenv → has original env (snapshot semantics)
- Cross-driver env modification blocked (EPERM)
- Test: setenv, verify getenv reflects change
- Test: setenv, spawn child, verify child has new var
- Test: unsetenv, verify var removed
- Typecheck passes, tests pass

### 3.7 Mutable Working Directory (chdir)

**Location:** `packages/kernel/src/kernel.ts`, `packages/kernel/src/process-table.ts`

**Problem:** Working directory is immutable after process creation. `chdir()` doesn't exist at the kernel level. The shell's `cd` builtin works within the shell process (brush-shell manages it internally), but the kernel's `getcwd(pid)` still returns the original cwd.

**Fix:**
- Make `ProcessEntry.cwd` mutable
- Add `chdir(pid, path)` to KernelInterface
- Validate the path exists and is a directory (via VFS stat)
- Guard with ownership check (only the process's own driver can chdir)
- Wire into WasmVM's WASI polyfill so brush-shell's `cd` updates the kernel state

**Acceptance criteria:**
- `chdir(pid, '/tmp')` → `getcwd(pid)` returns '/tmp'
- chdir to nonexistent path → ENOENT
- chdir to file (not directory) → ENOTDIR
- Child process inherits parent's *current* cwd at spawn time
- Test: chdir, verify getcwd
- Test: chdir, spawn child, verify child cwd
- Test: chdir to bad path → error
- Typecheck passes, tests pass

---

## 4. P2 — Missing POSIX Features (Medium Impact)

### 4.1 Named Pipes (FIFO)

**Location:** `packages/kernel/src/pipe-manager.ts`, `packages/kernel/src/vfs.ts`

**Problem:** Only anonymous pipes exist. Named pipes (FIFOs) are a POSIX feature that allows unrelated processes to communicate via a filesystem path. Created with `mkfifo(path)`.

**Fix:**
- Add `mkfifo(path, mode)` to VFS interface
- FIFO is a special file type in the VFS (not a regular file, not a directory)
- Opening a FIFO for reading blocks until a writer opens it (and vice versa)
- Once both ends are open, data flows like a regular pipe
- `stat(path)` returns `isFIFO: true`

**Acceptance criteria:**
- `mkfifo('/tmp/fifo')` creates a FIFO node in VFS
- `stat('/tmp/fifo')` shows it's a FIFO
- Process A opens for read (blocks), Process B opens for write → both unblock
- Data written by B readable by A
- B closes → A gets EOF
- Test: mkfifo, concurrent open for read and write, verify data flows
- Typecheck passes, tests pass

### 4.2 Atomic Writes Under PIPE_BUF

**Location:** `packages/kernel/src/pipe-manager.ts`

**Problem:** POSIX guarantees that writes of `PIPE_BUF` bytes or fewer (typically 4096 on Linux) are atomic — they will not be interleaved with writes from other processes. Currently, writes are not atomic and chunks can split.

**Fix:**
- Define `PIPE_BUF = 4096`
- Writes of ≤ PIPE_BUF bytes are delivered as a single unit (not split)
- Writes of > PIPE_BUF bytes may be split (current behavior acceptable)
- The atomicity guarantee only matters when multiple writers write to the same pipe concurrently

**Acceptance criteria:**
- Two processes writing 100-byte messages to the same pipe → messages not interleaved
- Write of 4096 bytes → delivered as single chunk to reader
- Write of 8192 bytes → may be split (acceptable)
- Test: two writers, each writing 100-byte messages concurrently → reader gets complete messages (no interleaving)
- Typecheck passes, tests pass

### 4.3 File Locking (flock)

**Location:** `packages/kernel/src/fd-table.ts`, new file `packages/kernel/src/file-lock.ts`

**Problem:** No advisory file locking. Programs like databases, package managers, and build tools use flock() or fcntl() locking to coordinate access to shared files.

**Fix:**
- Implement advisory (non-mandatory) locking per inode
- `flock(fd, operation)` where operation is LOCK_SH (shared/read), LOCK_EX (exclusive/write), LOCK_UN (unlock), optionally | LOCK_NB (non-blocking)
- Shared locks: multiple readers allowed
- Exclusive lock: only one holder, blocks all other lock requests
- Locks are per-FileDescription (not per-FD) — dup'd FDs share the same lock
- Locks released when all FDs referencing the FileDescription are closed (process exit cleans up)

**Acceptance criteria:**
- `flock(fd, LOCK_EX)` → exclusive lock acquired
- Second `flock(fd2, LOCK_EX)` on same file → blocks until first released
- `flock(fd, LOCK_SH)` → shared lock, multiple readers allowed
- `flock(fd, LOCK_EX | LOCK_NB)` when file locked → returns EWOULDBLOCK immediately
- `flock(fd, LOCK_UN)` → releases lock
- Process exit → all locks released
- Test: exclusive lock blocks second exclusive lock
- Test: two shared locks allowed simultaneously
- Test: LOCK_NB returns error instead of blocking
- Typecheck passes, tests pass

### 4.4 fcntl (File Descriptor Control)

**Location:** `packages/kernel/src/fd-table.ts`, `packages/kernel/src/kernel.ts`

**Problem:** No fcntl() syscall. POSIX programs use fcntl for FD_CLOEXEC (covered in 3.5), file locks (covered in 4.3), and FD duplication (F_DUPFD, F_DUPFD_CLOEXEC).

**Fix:**
- Add `fcntl(pid, fd, cmd, arg?)` to KernelInterface
- Support commands:
  - `F_DUPFD` — dup FD to lowest available >= arg (like dup but with minimum)
  - `F_DUPFD_CLOEXEC` — like F_DUPFD but set cloexec on new FD
  - `F_GETFD` — get FD flags (FD_CLOEXEC)
  - `F_SETFD` — set FD flags
  - `F_GETFL` — get file status flags (O_RDONLY, O_WRONLY, O_RDWR, O_APPEND)
  - `F_SETFL` — set file status flags (limited: only O_APPEND changeable)
  - `F_GETLK` / `F_SETLK` / `F_SETLKW` — record locking (if implementing fcntl locks)

**Acceptance criteria:**
- `fcntl(pid, fd, F_DUPFD, 10)` → new FD >= 10 pointing to same description
- `fcntl(pid, fd, F_GETFD)` → returns FD_CLOEXEC flag state
- `fcntl(pid, fd, F_SETFD, FD_CLOEXEC)` → sets close-on-exec
- `fcntl(pid, fd, F_GETFL)` → returns open flags
- Test: F_DUPFD with minfd=10 → new FD is 10 (if 10 available)
- Test: F_GETFD after F_SETFD → reflects change
- Typecheck passes, tests pass

### 4.5 /proc/self and /proc/[pid] (Minimal)

**Location:** `packages/kernel/src/device-layer.ts`

**Problem:** No `/proc` filesystem. Many programs read `/proc/self/fd`, `/proc/self/exe`, `/proc/self/environ`, or `/proc/self/cwd` to introspect. We don't need a full procfs — just the most commonly used paths.

**Fix:**
- Intercept `/proc/self/*` paths in the device layer (similar to `/dev/*`)
- Map `/proc/self` to the requesting process's PID
- Support:
  - `/proc/self/fd/` → readdir lists open FDs (same as `/dev/fd/`)
  - `/proc/self/fd/N` → access to FD N (same as `/dev/fd/N`)
  - `/proc/self/environ` → read returns `KEY=VALUE\0KEY=VALUE\0...` format
  - `/proc/self/cwd` → readlink returns process's cwd
  - `/proc/self/exe` → readlink returns process's command name
  - `/proc/[pid]/` → same as above but for specific PID (requires PID ownership check)
- `stat('/proc')` returns directory with appropriate mode

**Acceptance criteria:**
- `readDir('/proc/self/fd')` → lists open FD numbers
- `readFile('/proc/self/environ')` → returns null-separated KEY=VALUE pairs
- `readlink('/proc/self/cwd')` → returns cwd
- `readlink('/proc/self/exe')` → returns command name/path
- `/proc/self` is equivalent to `/proc/<own-pid>`
- Test: read /proc/self/environ, verify matches getenv
- Test: readDir /proc/self/fd, verify lists 0,1,2 at minimum
- Typecheck passes, tests pass

---

## 5. P3 — Quality of Life

### 5.1 umask

**Location:** `packages/kernel/src/kernel.ts`, `packages/kernel/src/process-table.ts`

**Problem:** No umask. POSIX file creation uses umask to determine default permissions. Without umask, all files are created with whatever mode the caller specifies (or a hardcoded default).

**Fix:**
- Add `umask` field to ProcessEntry (default 0o022 — standard Linux default)
- Add `umask(pid, newMask?)` to KernelInterface — returns old mask, optionally sets new
- When creating files/directories via VFS, apply `mode & ~umask`
- Child inherits parent's umask

**Acceptance criteria:**
- Default umask is 0o022
- `mkdir('/tmp/d', 0o777)` with umask 0o022 → effective mode 0o755
- `umask(pid, 0o077)` → files created with 0o700 when requesting 0o777
- Child process inherits parent's umask
- Test: set umask, create file, verify mode
- Typecheck passes, tests pass

### 5.2 SIGALRM and alarm()

**Location:** `packages/kernel/src/process-table.ts`, `packages/kernel/src/kernel.ts`

**Problem:** No SIGALRM. POSIX `alarm(seconds)` schedules SIGALRM after the specified time. Used by timeout mechanisms in shell scripts and some C programs.

**Fix:**
- Add `alarm(pid, seconds)` to KernelInterface
- Sets a timer; when it fires, send SIGALRM (14) to the process
- `alarm(pid, 0)` cancels any pending alarm
- Calling alarm again replaces the previous alarm (only one per process)
- Default SIGALRM action: terminate process

**Acceptance criteria:**
- `alarm(pid, 1)` → SIGALRM delivered after 1 second
- `alarm(pid, 0)` → cancels pending alarm
- Second `alarm()` replaces first
- SIGALRM default action: terminate process (exit code 128 + 14 = 142)
- Test: alarm(1), wait 1.5s → process terminated with SIGALRM
- Test: alarm(1), alarm(0) → no signal delivered
- Typecheck passes, tests pass

### 5.3 Process Timing (times/getrusage)

**Location:** `packages/kernel/src/process-table.ts`

**Problem:** No process timing information. POSIX `times()` and `getrusage()` return CPU time consumed. Not critical for correctness but useful for `time` builtin and performance measurement.

**Fix:**
- Track `startTime` (already done) and accumulate wall-clock time per process
- `times(pid)` returns `{ utime, stime, cutime, cstime }` (user time, system time, children's times)
- Since we can't distinguish user vs system time in JS, return wall clock as `utime` and 0 as `stime`
- `getrusage(pid)` returns `{ ru_utime, ru_stime, ru_maxrss }` with similar approximations

**Acceptance criteria:**
- `times(pid)` returns non-zero utime after process runs
- cutime/cstime reflect children's accumulated time
- Values are in milliseconds (or POSIX clock ticks — we can choose)
- Test: spawn process that runs for 100ms, times() shows ~100ms utime
- Typecheck passes, tests pass

### 5.4 Structured Error Codes in Kernel

**NOTE:** This is item 15 in `spec-hardening.md` (P2). Including here because it's critical for POSIX errno fidelity.

**Problem:** Kernel errors use string matching (`msg.includes('EBADF')`). Should use structured `{ code: 'EBADF', message: '...' }`.

### 5.5 Python Bridge: os.stat, os.chmod, os.chown

**Location:** `packages/secure-exec-python/src/driver.ts`

**Problem:** Python's `os.stat()`, `os.chmod()`, `os.chown()` don't work because Emscripten's WASI layer doesn't connect to our VFS. These are commonly used operations.

**Fix:**
- Bridge `os.stat()` to kernel VFS via `secure_exec.stat(path)` custom function (similar pattern to `secure_exec.read_text_file`)
- Bridge `os.chmod()` to kernel VFS via `secure_exec.chmod(path, mode)`
- Bridge `os.chown()` to kernel VFS via `secure_exec.chown(path, uid, gid)`
- Register these as Pyodide globals in the driver's Python bootstrap code

**Acceptance criteria:**
- `os.stat('/tmp/file')` returns stat result matching kernel VFS
- `os.chmod('/tmp/file', 0o755)` changes mode in kernel VFS
- `os.chown('/tmp/file', 1000, 1000)` changes ownership in kernel VFS
- All gated behind permissions
- Test: stat, chmod, chown from Python code
- Typecheck passes, tests pass

### 5.6 Python Bridge: Subprocess stdout/stderr Capture

**Location:** `packages/secure-exec-python/src/driver.ts`

**Problem:** `subprocess.Popen(cmd, stdout=PIPE).communicate()` returns empty bytes for stdout/stderr. The monkey-patched _KernelPopen discards output by design (to prevent unbounded buffering), but this breaks real-world Python scripts that need subprocess output.

**Fix:**
- When `stdout=PIPE` or `stderr=PIPE` is specified, capture output in a bounded buffer (max 1MB per stream, matching Node's default maxBuffer)
- `communicate()` returns the captured output
- When buffer exceeds limit, truncate and set a flag (don't crash)
- When stdout/stderr is not PIPE, continue discarding (current behavior)

**Acceptance criteria:**
- `subprocess.run(['echo', 'hello'], capture_output=True).stdout` → `b'hello\n'`
- `subprocess.check_output(['echo', 'hello'])` → `b'hello\n'`
- Output > 1MB → truncated, no crash
- Without capture_output → output still discarded (current behavior)
- Test: capture stdout from subprocess
- Test: capture stderr from subprocess
- Typecheck passes, tests pass

---

## 6. Implementation Order

The items should be implemented in this order to respect dependencies:

### Phase 1: Critical Fixes (P0)
1. **2.2** FD table cleanup (spec-hardening item 1) — prerequisite for everything
2. **2.1** SIGPIPE on broken pipe
3. **2.3** POSIX wstatus encoding

### Phase 2: Process Lifecycle (P1)
4. **3.6** Mutable environment (setenv/unsetenv)
5. **3.7** Mutable working directory (chdir)
6. **3.4** WNOHANG for waitpid
7. **3.5** FD_CLOEXEC
8. **3.1** SIGTSTP/SIGSTOP/SIGCONT and job control
9. **3.2** SIGQUIT
10. **3.3** SIGHUP on terminal hangup

### Phase 3: Filesystem & IPC (P2)
11. **4.4** fcntl
12. **4.1** Named pipes (FIFO)
13. **4.2** Atomic writes under PIPE_BUF
14. **4.3** File locking (flock)
15. **4.5** /proc/self (minimal)

### Phase 4: Quality of Life (P3)
16. **5.1** umask
17. **5.2** SIGALRM and alarm()
18. **5.3** Process timing
19. **5.4** Structured error codes (spec-hardening item 15)
20. **5.5** Python os.stat/chmod/chown
21. **5.6** Python subprocess capture

---

## 7. Testing Strategy

All items above require tests. The test strategy is:

1. **Unit tests** in `packages/kernel/test/` for kernel-level features (signals, FDs, process table, pipes)
2. **Integration tests** in `packages/secure-exec/tests/kernel/` for cross-runtime behavior (signal delivery through PTY, pipe SIGPIPE across runtimes)
3. **Shell tests** in `packages/secure-exec/tests/kernel/` for interactive shell features (^Z, fg/bg, jobs)
4. **Python tests** in `packages/secure-exec/tests/runtime-driver/python/` for Python bridge features
5. **Parity tests** comparing behavior against real Linux where possible

Each test should:
- Test the happy path
- Test error conditions (ENOENT, EPERM, EBADF, etc.)
- Test edge cases (concurrent access, race conditions, cleanup after failure)
- Be named by domain (e.g., `signal-delivery.test.ts`, `job-control.test.ts`, `fd-cloexec.test.ts`)

---

## 8. Files Changed

### Kernel (most changes):
- `packages/kernel/src/process-table.ts` — stopped state, wstatus, setenv, chdir, umask, alarm, times
- `packages/kernel/src/pipe-manager.ts` — SIGPIPE, FIFO, atomic writes
- `packages/kernel/src/fd-table.ts` — FD_CLOEXEC, fcntl
- `packages/kernel/src/pty.ts` — SIGTSTP, SIGQUIT, SIGHUP
- `packages/kernel/src/kernel.ts` — new KernelInterface methods
- `packages/kernel/src/types.ts` — interface updates
- `packages/kernel/src/device-layer.ts` — /proc/self
- New: `packages/kernel/src/file-lock.ts` — flock implementation
- New: `packages/kernel/src/wstatus.ts` — POSIX wstatus encoding/decoding helpers

### WasmVM:
- `packages/runtime/wasmvm/src/wasi-polyfill.ts` — wire new syscalls
- `packages/runtime/wasmvm/src/kernel-worker.ts` — new RPC handlers

### Python:
- `packages/secure-exec-python/src/driver.ts` — os.stat/chmod/chown bridge, subprocess capture

### Tests:
- `packages/kernel/test/` — new test files for each feature
- `packages/secure-exec/tests/kernel/` — integration tests
- `packages/secure-exec/tests/runtime-driver/python/` — Python bridge tests

### Docs:
- `docs/posix-compatibility.md` — update status for each completed item
