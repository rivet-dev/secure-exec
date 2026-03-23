# POSIX Compatibility

> **This is a living document.** Update it when kernel, WasmVM, Node bridge, or Python bridge behavior changes for any POSIX-relevant feature.

> **Looking for automated test results?** See the [POSIX Conformance Report](posix-conformance-report.mdx) for os-test suite results with per-suite pass rates and exclusion details.

This document tracks how closely the secure-exec kernel, runtimes, and bridges conform to POSIX and Linux behavior. The goal is full POSIX compliance 1:1 — every syscall, signal, and shell behavior should match a real Linux system unless an architectural constraint makes it impossible.

For command-level support (ls, grep, awk, etc.), see [WasmVM Supported Commands](wasmvm/supported-commands.md). For Node.js API compatibility (fs, http, crypto modules), see [Node.js Compatibility](nodejs-compatibility.mdx). For Python API compatibility, see [Python Compatibility](python-compatibility.mdx).

---

## Architecture Constraints

All runtimes execute inside a sandboxed environment (V8 isolates for Node, Pyodide for Python, WASM Workers for WasmVM). The kernel is implemented in TypeScript and runs in JavaScript. These constraints impose hard limits:

- **No fork()** — WASM cannot copy linear memory; V8 isolates cannot be cloned. Only `spawn()` (with explicit command) is supported.
- **No async signal delivery to WASM** — JavaScript has no preemptive interruption. `worker.terminate()` is equivalent to SIGKILL; there is no way to deliver SIGINT/SIGTERM to running WASM code.
- **No pthreads in WASM** — `wasm32-wasip1` does not support threads. Each process runs in its own Worker.
- **No raw sockets in WASM** — WASI Preview 1 has no socket API. Browser sandbox prevents direct network access.
- **No mmap** — WASM memory is separate from host filesystem.
- **No ptrace** — No debug/trace interface across the WASM boundary.
- **No setuid/setgid** — Incompatible with WASM sandboxing. Fixed uid/gid per process.

---

## Kernel

The kernel (`packages/kernel/`) is the foundational POSIX layer. All runtimes mount into it and observe identical VFS, process, FD, and pipe state.

### Process Model

| Feature | Status | Notes |
|---------|--------|-------|
| PID allocation | Implemented | Monotonically increasing, unique per lifetime |
| Process creation (spawn) | Implemented | Cross-runtime spawn with parent-child tracking (`ppid`) |
| Process groups (pgid) | Implemented | `setpgid()`, `getpgid()` with POSIX constraints (cross-session join rejected) |
| Sessions (sid) | Implemented | `setsid()` creates new session, process becomes session leader |
| Environment inheritance | Implemented | Child gets `{ ...parentEnv, ...overrides }` |
| Working directory inheritance | Implemented | Child inherits parent cwd unless overridden |
| fork() | Not possible | WASM/browser constraint — replaced with spawn() |
| exec() family | Not possible | Cannot replace running process image |
| vfork() | Not possible | Not needed in WASM |
| getpid() / getppid() | Implemented | Exposed to drivers via kernel interface |

### Signals

| Feature | Status | Notes |
|---------|--------|-------|
| SIGINT (2) via Ctrl+C | Implemented | PTY line discipline generates signal; delivered to foreground process group |
| SIGTERM (15) | Implemented | Graceful shutdown; `terminateAll()` sends SIGTERM, waits 1s, escalates to SIGKILL |
| SIGKILL (9) | Implemented | Immediate termination via driver |
| SIGWINCH (28) | Implemented | Delivered via `shell.resize()` to foreground process group |
| Signal 0 (existence check) | Implemented | Succeeds if process exists, ESRCH if not |
| Process group signaling | Implemented | `kill(-pgid, signal)` sends to all processes in group |
| SIGPIPE (13) | Implemented | `PipeManager.write()` delivers SIGPIPE via `onBrokenPipe` callback before EPIPE error |
| SIGCHLD (17) | Implemented | Delivered to parent on child exit; default action: ignore (no termination) |
| SIGALRM (14) | Implemented | `alarm(pid, seconds)` schedules delivery; default action: terminate (128+14) |
| SIGSTOP (19) / SIGCONT (18) | Implemented | `stop()` sets status to "stopped", `cont()` resumes; delivered via `kill()` |
| SIGTSTP (20) via Ctrl+Z | Implemented | PTY line discipline generates SIGTSTP; process suspended via `stop()` |
| SIGQUIT (3) via Ctrl+\ | Implemented | PTY line discipline generates SIGQUIT; echoes `^\` |
| SIGHUP (1) | Implemented | Generated on PTY master close; delivered to foreground process group |
| Signal masks (sigprocmask) | **Missing** | Processes cannot block/unblock signals |
| Signal handlers (sigaction) | Not possible | Untrusted code cannot register handlers; kernel owns lifecycle |
| Real-time signals | Not possible | No RT signal infrastructure |

### File Descriptors

| Feature | Status | Notes |
|---------|--------|-------|
| FD allocation (lowest available) | Implemented | Standard algorithm in `ProcessFDTable.allocateFd()` |
| Standard FDs (0/1/2) | Implemented | Pre-allocated via `initStdio()` |
| FD limits | Implemented | `MAX_FDS_PER_PROCESS = 256`; exceeding throws EMFILE |
| dup(fd) | Implemented | New FD shares same FileDescription, increments refCount |
| dup2(oldFd, newFd) | Implemented | Closes newFd first, then dups. Same-FD case is no-op. |
| FD inheritance on fork | Implemented | Child FD table forked with all parent FDs, refCounts bumped |
| Shared cursors | Implemented | Multiple FDs sharing a FileDescription share cursor position |
| /dev/fd/N | Implemented | `fdOpen()` interprets `/dev/fd/N` as dup(N) |
| FD_CLOEXEC flag | Implemented | Stored per-FD; set via `fcntl(F_SETFD)` or `O_CLOEXEC` at open time |
| fcntl() | Implemented | F_DUPFD, F_DUPFD_CLOEXEC, F_GETFD, F_SETFD, F_GETFL |
| O_CLOEXEC | Implemented | Recognized at open time; sets `cloexec` flag on FD entry |
| O_NONBLOCK | **Missing** | All reads/writes are blocking or Promise-based |
| File locking (flock) | Implemented | Advisory flock with LOCK_SH, LOCK_EX, LOCK_UN, LOCK_NB |
| select / poll / epoll | Not possible | JavaScript async model; all I/O is Promise-based |

### TTY / PTY

| Feature | Status | Notes |
|---------|--------|-------|
| PTY allocation (master/slave) | Implemented | `/dev/pts/N` path allocation |
| Termios attributes | Implemented | `icanon`, `echo`, `isig`, `icrnl`, `opost`, `onlcr` |
| Control characters | Implemented | VINTR (^C), VSUSP (^Z), VQUIT (^\), VEOF (^D), VERASE (DEL) |
| tcgetattr / tcsetattr | Implemented | Get/set termios on a PTY via FD |
| tcsetpgrp / tcgetpgrp | Implemented | Set/get foreground process group |
| Canonical mode | Implemented | Buffer input until newline, handle backspace, ^D EOF |
| Echo mode | Implemented | Byte-by-byte echo; visual erase for backspace |
| Output processing (ONLCR) | Implemented | Lone `\n` → `\r\n` |
| isatty() | Implemented | Returns true if FD points to PTY slave |
| Line buffer limit | Implemented | `MAX_CANON = 4096` |
| PTY buffer limits | Implemented | `MAX_PTY_BUFFER_BYTES = 65536` (64KB per direction) |
| SIGTSTP on ^Z | Implemented | PTY line discipline delivers SIGTSTP; echoes `^Z` |
| VMIN / VTIME | **Missing** | Reads always block until next data or EOF |
| Flow control (^S/^Q) | **Missing** | XON/XOFF not implemented |
| SIGHUP on master close | Implemented | Sends SIGHUP to foreground process group on PTY master close |
| Advanced local modes | **Missing** | IEXTEN, ECHOE, ECHOK, ECHONL, NOFLSH, TOSTOP not exposed |

### Pipes

| Feature | Status | Notes |
|---------|--------|-------|
| Anonymous pipe creation | Implemented | `PipeManager.createPipe()` with read/write ends |
| Blocking reads | Implemented | Blocks until data available or write end closed |
| Buffered writes | Implemented | Data buffered if no reader waiting |
| EOF signaling | Implemented | Read returns null when write end closes and buffer drained |
| Buffer limits | Implemented | `MAX_PIPE_BUFFER_BYTES = 65536` (64KB); EAGAIN on full |
| Cross-runtime pipes | Implemented | WasmVM and Node processes can pipe to each other |
| Pipe FD inheritance | Implemented | Part of forked FD table |
| SIGPIPE on broken pipe | Implemented | `PipeManager.write()` delivers SIGPIPE via `onBrokenPipe` callback, then EPIPE |
| Named pipes (FIFO) | **Missing** | Only anonymous pipes |
| Atomic writes under PIPE_BUF | **Missing** | Writes are not atomic; buffered chunks can split |

### Exit Codes & Wait

| Feature | Status | Notes |
|---------|--------|-------|
| waitpid(pid) | Implemented | Blocks until process exits, returns `{ pid, status }` |
| Immediate return if exited | Implemented | Resolves immediately for already-exited processes |
| ESRCH for unknown PID | Implemented | Throws error |
| Zombie state | Implemented | Process stays in table for 60s after exit |
| Zombie cleanup | Implemented | Automatic reap after `ZOMBIE_TTL_MS` |
| POSIX wstatus encoding | Implemented | `waitpid` returns POSIX-encoded wstatus; `WIFEXITED`/`WEXITSTATUS`/`WIFSIGNALED`/`WTERMSIG` helpers in `@secure-exec/kernel` |
| WNOHANG flag | Implemented | Returns null immediately if process is still running |
| WUNTRACED / WCONTINUED | **Missing** | No stopped/continued process tracking |

### Virtual File System

| Feature | Status | Notes |
|---------|--------|-------|
| readFile / writeFile | Implemented | Full read/write with ENOENT errors |
| stat / lstat | Implemented | Full VirtualStat: mode, size, timestamps, ino, nlink, uid, gid |
| mkdir (recursive) | Implemented | `mkdir(path, { recursive: true })` |
| rmdir / removeFile | Implemented | Proper cleanup |
| rename | Implemented | Atomic rename within VFS |
| truncate | Implemented | Shorten file to length bytes |
| pread | Implemented | Positional read without advancing cursor |
| symlink / readlink | Implemented | Symbolic link creation and resolution |
| link (hard links) | Implemented | Reference counting with nlink |
| chmod | Implemented | Set file permissions (mode bits) |
| chown | Implemented | Interface exists; may be stubbed by backends |
| utimes | Implemented | Set access/modification times |
| realpath | Implemented | Resolve to canonical path |
| /dev/null | Implemented | Reads return empty, writes discard |
| /dev/zero | Implemented | Reads return zero-filled buffer (up to 4096 bytes) |
| /dev/urandom | Implemented | Cryptographically random bytes via `crypto.getRandomValues()` |
| /dev/stdin, /dev/stdout, /dev/stderr | Implemented | Character devices with fixed inodes |
| /dev/fd/ | Implemented | Pseudo-directory listing open FDs per process |
| ACLs / xattr | **Missing** | Only rwx model; no extended attributes |
| File locking (fcntl locks) | **Missing** | Only `flock()` advisory locks; no `fcntl()` F_SETLK/F_GETLK |
| /proc filesystem | **Missing** | No /proc/self, /proc/[pid]/* |

### Environment & Working Directory

| Feature | Status | Notes |
|---------|--------|-------|
| Per-process env | Implemented | Stored in ProcessEntry, inherited on spawn |
| Env override on spawn | Implemented | `kernel.spawn(cmd, args, { env })` |
| Per-process cwd | Implemented | Stored in ProcessEntry, inherited on spawn |
| cwd override on spawn | Implemented | `kernel.spawn(cmd, args, { cwd })` |
| setenv / unsetenv after spawn | Implemented | `kernel.setenv(pid, key, value)` / `kernel.unsetenv(pid, key)` mutate process env |
| chdir() after spawn | Implemented | `kernel.chdir(pid, path)` validates path exists and is a directory |

---

## WasmVM Runtime

The WasmVM runtime (`packages/runtime/wasmvm/`) runs WASM binaries in Web Workers with a custom WASI Preview 1 polyfill.

### WASI Support

| Feature | Status | Notes |
|---------|--------|-------|
| WASI Preview 1 (46 functions) | Implemented | Custom JS polyfill for all standard functions |
| Custom `host_process` module | Implemented | proc_spawn, proc_waitpid, proc_kill, proc_getpid/ppid, fd_pipe, fd_dup/dup2, sleep_ms |
| Custom `host_user` module | Implemented | getuid, getgid, geteuid, getegid, isatty, getpwuid |
| WASI Preview 2 / Component Model | Not used | No browser support |

### What Works

- **File I/O**: Full WASI fd_read/fd_write/fd_seek/fd_stat/fd_close + directory operations
- **Process spawning**: `proc_spawn` RPC to kernel, child runs in new Worker
- **Pipes**: Ring buffer pipes (64KB, SharedArrayBuffer + Atomics.wait)
- **Environment & argv**: Standard WASI args_get/environ_get
- **Exit codes**: `proc_exit()` → WasiProcExit exception → exit code propagation
- **Shell (brush-shell)**: Bash 5.x compatible — pipes, redirections, variable expansion, command substitution, globbing, control flow, functions, here-docs, 40+ builtins

### What's Missing

- **Async signal delivery**: WASM execution is synchronous within Worker; only `worker.terminate()` (SIGKILL equivalent) works
- **Threads**: `wasm32-wasip1` doesn't support pthreads; `std::thread::spawn` panics
- **Networking**: HTTP via `host_net` import module (used by curl, wget, git); raw sockets not supported
- **Job control**: fg/bg/jobs stubbed; SIGTSTP/SIGSTOP/SIGCONT delivered but background scheduling limited
- **Terminal handling**: isatty() works; termios/stty operations stubbed
- **chmod enforcement**: WASI has no chmod syscall; VFS-level metadata only, no actual permission enforcement on reads/writes

### Known Issues

- **Browser async spawn race**: `proc_spawn` is synchronous but Worker creation is async; race between spawn and waitpid
- **VFS changes lost in pipelines**: Intermediate pipeline stages' file writes discarded (only last stage preserved)
- **SharedArrayBuffer 1MB truncation**: File reads >1MB silently truncate
- **uu_sort panics**: Uses `std::thread::spawn` which panics on WASI

---

## Node.js Bridge

The Node bridge (`packages/core/src/bridge/`) provides Node.js API compatibility inside V8 isolates.

### Module Support Tiers

| Tier | Label | Meaning |
|------|-------|---------|
| 1 | Bridge | Custom implementation in secure-exec bridge |
| 2 | Polyfill | Browser-compatible polyfill (node-stdlib-browser) |
| 3 | Stub | Minimal compatibility surface |
| 4 | Deferred | require() succeeds, methods throw "not supported" |
| 5 | Unsupported | require() throws immediately |

### POSIX-Relevant Modules

| Module | Tier | Status |
|--------|------|--------|
| fs | 1 | Comprehensive: readFile, writeFile, stat, mkdir, symlink, chmod, streams, opendir, glob. Missing: watch/watchFile (Tier 4). |
| child_process | 1 | spawn, exec, execFile (sync + async). Routes through kernel command registry. npm/npx routed through Node RuntimeDriver (host npm-cli.js/npx-cli.js in V8 isolate). fork() permanently unsupported. |
| process | 1 | pid, ppid, env, cwd, argv, exit, stdin/stdout/stderr, platform, arch. No signal handlers. |
| os | 1 | platform, arch, hostname, homedir, tmpdir, cpus, totalmem, freemem. Values from injected config, not host. |
| path | 2 | Full polyfill via path-browserify. |
| buffer | 2 | Full Buffer class polyfill. |
| stream | 2 | Readable, Writable, Transform, Duplex, pipeline. Web Streams via stream/web. |
| events | 2 | Full EventEmitter polyfill. |
| crypto | 1+3 | Hashing, HMAC, ciphers, signing, key generation all bridge to host. WebCrypto subtle API. |
| http / https | 1 | Client + server. Request/response streaming. Agent pooling. |
| dns | 1 | lookup, resolve, resolve4/6. |
| net | 4 | Raw TCP sockets throw unsupported error. |
| tls | 4 | TLS layer independent of http/https; deferred. |
| cluster | 5 | Unsupported — multi-process management. |
| dgram | 5 | Unsupported — UDP sockets. |

### Security Features

- **Deny-by-default permissions** across fs, network, child_process, and env domains
- **Dangerous env stripping**: `LD_PRELOAD`, `NODE_OPTIONS`, `DYLD_INSERT_LIBRARIES` filtered from child processes
- **Timing mitigation**: Default frozen clocks (`timingMitigation: "freeze"`); opt-out available
- **Payload limits**: 4MB JSON parse, 10MB base64 transfer across isolate boundary
- **Native addon rejection**: `.node` files cannot be loaded

---

## Python Bridge

The Python bridge (`packages/python/`) runs Python via Pyodide (CPython compiled to WASM via Emscripten). This is an **experimental runtime**.

### What Works

| Feature | Status |
|---------|--------|
| File I/O (open/read/write) | Basic support |
| os.environ | Read/write with permission filtering |
| os.getcwd() / os.chdir() | Works |
| os.makedirs() | Works |
| subprocess (Popen, run, call) | Monkey-patched to route through kernel RPC |
| os.system() | Routes to `kernel_spawn('sh', ['-c', cmd])` |
| print() / sys.stdout | Streams through onStdio hook |
| sys.exit() | Maps to SystemExit |
| secure_exec.fetch() | Custom HTTP function, permission-gated |

### What's Missing

| Feature | Reason |
|---------|--------|
| Signals (signal module) | Emscripten/WASM limitation |
| Threading / multiprocessing | WASM is single-threaded |
| Sockets (socket, http.client, urllib) | No WASI socket API |
| os.stat / os.chmod / os.chown | Emscripten limitation |
| os.getpid / os.getuid / os.getgid | Emscripten limitation |
| File descriptors (os.open/read/write) | WASM doesn't expose real FDs |
| Package installation (pip/micropip) | Blocked with `ERR_PYTHON_PACKAGE_INSTALL_UNSUPPORTED` |

### Sandbox Escape Prevention

- `import js` and `import pyodide_js` blocked by custom MetaPathFinder
- All file access through `secure_exec.read_text_file()` checked against permissions
- Environment variables filtered at init time

---

## Summary Scorecard

| Area | Kernel | WasmVM | Node Bridge | Python Bridge |
|------|--------|--------|-------------|---------------|
| File I/O | 95% | 85% | 90% | 40% |
| Processes | 85% | 65% | 75% | 30% |
| Pipes | 95% | 80% | 85% | N/A |
| Signals | 80% | 10% | 10% | 0% |
| TTY/PTY | 95% | 25% | 15% | 0% |
| Environment | 100% | 95% | 85% | 80% |
| Shell | N/A | 80% | N/A | N/A |
| Networking | N/A | 30% | 75% | 10% |

---

## Architecturally Impossible

These gaps cannot be fixed without fundamental changes to the execution model:

| Limitation | Reason | Workaround |
|------------|--------|------------|
| fork() | WASM can't copy linear memory; browser has no process fork | spawn() only |
| Async signal delivery to WASM | JavaScript has no preemptive interruption | worker.terminate() = SIGKILL |
| Signal handlers in user code | Untrusted code can't register handlers | Kernel owns lifecycle |
| Non-blocking I/O (select/poll/epoll) | JavaScript async model | Promise-based I/O |
| pthreads in WASM | wasm32-wasip1 doesn't support threads | One Worker per process |
| Network sockets in WASM | WASI Preview 1 has no socket API | HTTP via `host_net` import module (curl, wget, git) and Node bridge |
| mmap / shared memory | WASM memory separate from host FS | read/write only |
| ptrace / process debugging | No debug interface across WASM boundary | Not possible |
| setuid / setgid | Incompatible with sandbox model | Fixed uid/gid |
