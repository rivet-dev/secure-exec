# Brush Shell — WASM Integration Research

**Date:** 2026-03-16
**Purpose:** Evaluate brush as the shell implementation for wasmVM, focusing on WASM compatibility and integration path.

---

## Decision

Going forward with **brush** (https://github.com/reubeno/brush) as the shell implementation for wasmVM. Brush is a bash-compatible shell written in Rust with an existing WASM build target and clean platform abstraction layer.

---

## 1. Brush Already Builds for WASM

The maintainer (reubeno) has personally authored WASM support:

- **PR #116** (merged July 4, 2024): "feat: get building on windows and wasm-wasip1 targets" — introduced the platform abstraction layer (`brush-core/src/sys/`) with a `stubs` module for unsupported platforms.
- **PR #425** (merged April 7, 2025): "chore: get building for wasm32-unknown-unknown" — added the second WASM target.
- **CI builds both WASM targets on every PR and push to main:**
  - `wasm32-unknown-unknown` — built with `--no-default-features --features minimal`
  - `wasm32-wasip2` — built with `--no-default-features --features minimal`
- The maintainer has stated he's "long wanted to see brush runnable in a browser."

---

## 2. Platform Abstraction Layer

Brush has a clean platform abstraction at `brush-core/src/sys/`:

| Module | Purpose |
|--------|---------|
| `unix/` | Full Unix implementation (signals, processes, terminal, etc.) |
| `windows/` | Windows implementation |
| `wasm.rs` | Re-exports everything from `stubs/` |
| `stubs/` | Stub implementations returning `NotSupportedOnThisPlatform` errors or no-ops |

### What the stubs cover:

- **Signals** — `FakeSignal` that returns `futures::future::pending()` (never fires)
- **Process management** — `kill_process`, `move_to_foreground` etc. return errors or no-op
- **Terminal control** — TTY operations, foreground/background process groups all no-op
- **File descriptor operations** — stubbed
- **Resource usage** — stubbed
- **Network** — stubbed
- **Pipes** — stubbed (uses `spawn_blocking` — see blockers)

### Key: `nix` crate is never compiled for WASM

The `nix` crate is gated behind `cfg(unix)` in brush-core's Cargo.toml. Same for `libc`, `command-fds`, `terminfo`, `uzers`. None of these are compiled for WASM targets.

---

## 3. What Brush Uses From `nix` (Unix only)

For reference, these are the Unix-specific dependencies that the stubs replace:

**Signal handling:** `nix::sys::signal::{Signal, kill, SigAction, SigHandler, SaFlags, SigSet, sigaction}`, `nix::sys::wait::{waitid, WaitPidFlag, WaitStatus}`, `nix::unistd::{Pid, setpgid, getpgid}`

**Terminal control:** `nix::sys::termios::{Termios, tcgetattr, tcsetattr, LocalFlags, OutputFlags}`, `nix::unistd::{getppid, getpgrp, tcgetpgrp, tcsetpgrp, ttyname}`

**Resource usage:** `nix::sys::resource::{getrusage, UsageWho}`, `nix::sys::time::TimeVal`

**Polling:** `nix::poll::{PollFd, PollFlags, PollTimeout, poll}`, `nix::sys::stat::{fstat, SFlag}`

**Filesystem:** `nix::unistd::{access, AccessFlags}`, `nix::libc::{confstr, _CS_PATH}`

**Process:** `nix::unistd::setsid()`, `nix::fcntl::{fcntl, FcntlArg::F_SETPIPE_SZ}`

**Builtins:** `nix::sys::stat::{Mode, umask}` (umask), `nix::sys::signal::SIGKILL` (kill), `nix::sys::signal::SIGSTOP` (suspend), `nix::unistd::PathconfVar::PIPE_BUF` (ulimit)

All of these are handled by the stubs layer on WASM.

---

## 4. Tokio on WASM

### Allowed features (stable, no `tokio_unstable` needed):

- `sync` — Mutex, RwLock, Semaphore, mpsc, oneshot, broadcast, watch, Notify, Barrier
- `macros` — `#[tokio::main]`, `#[tokio::test]`, `tokio::select!`, `tokio::join!`
- `io-util` — AsyncReadExt, AsyncWriteExt, BufReader, BufWriter (traits/combinators, NOT I/O driver)
- `rt` — Current-thread runtime (`Builder::new_current_thread()`), single-threaded task scheduler, `tokio::spawn()`
- `time` — works if platform supports timers (WASI provides `clock_time_get`)

### Blocked features (hard `compile_error!` on WASM without `tokio_unstable`):

- `fs` — requires `spawn_blocking` (threads)
- `io-std` — stdin/stdout not available
- `net` — no socket creation in WASI
- `process` — no OS process spawning
- `rt-multi-thread` — no threads on wasm32-wasip1
- `signal` — requires Unix/Windows

### Brush-core's existing WASM config:

```toml
[target.'cfg(target_family = "wasm")'.dependencies]
tokio = { features = ["io-util", "macros", "rt", "sync"] }
```

This is exactly the minimal working set. Provides: single-threaded task scheduler, channels/mutexes, select!/join!, async I/O traits.

### tokio-util

No WASM-specific configuration needed. Minimal config: `features = ["codec", "io-util"]`, avoiding `net`.

### Key runtime issue: `spawn_blocking`

`spawn_blocking` compiles on wasm32-wasip1 (it's part of `rt`) but **panics at runtime** because there are no threads. Brush uses this in `stubs/async_pipe.rs` and `commands.rs`. Must be replaced with `tokio::spawn` on the WASM path or avoided entirely.

### With `tokio_unstable` flag:

- `fs` — enabled for WASI as of tokio v1.41.0, but requires `wasm32-wasip1-threads`
- `net` — partial, cannot create new sockets
- `rt-multi-thread` — requires `wasm32-wasip1-threads` (experimental target)
- `signal`, `process` — still fundamentally broken

---

## 5. Existing Projects Using Brush + WASM

### WASHM (mavity/washm)

- **GitHub:** https://github.com/mavity/washm
- **NPM:** https://www.npmjs.com/package/washm
- **Discussion:** https://github.com/reubeno/brush/discussions/855
- Created Dec 2025. Compiles brush to WASM, runs via Node.js or browser (https://was.hm).
- Uses a fork of brush (`mavity/brush-fork`), vendors brush + uutils/coreutils into a single WASM binary.
- **Key blocker identified:** task-local storage for running in-process coreutils with isolated stdio (WASM is single-threaded).
- Maintainer responded positively; contributor expressed interest in upstreaming WASM-compatible tweaks.

---

## 6. Known Blockers for wasmVM Integration

### 6.1 `spawn_blocking` Runtime Panic

Brush uses `tokio::task::spawn_blocking` in the WASM stubs for async pipes and command execution. This compiles but panics at runtime on wasm32-wasip1 (no threads). Must be replaced with `tokio::spawn` or restructured to avoid blocking tasks.

### 6.2 Coreutils Builtins Gated Out

`uucore` is under `cfg(any(unix, windows))` in brush-builtins' Cargo.toml. WASM gets no coreutils builtins. **For wasmVM this is fine** — commands run in separate Workers via the multicall binary. The shell only needs to dispatch to the host.

### 6.3 Command Execution Stubs Return Errors

The WASM stubs return `NotSupportedOnThisPlatform` for command execution. For wasmVM, these stubs need to be replaced with calls to wasmVM's `proc_spawn` WASI imports so the JS host can spawn Workers for external commands.

### 6.4 No Process Spawning in WASI

WASI has no `fork()`, `exec()`, or `posix_spawn()`. All command execution must go through wasmVM's custom WASI imports that delegate to the JS host's Worker-based process model.

### 6.5 Startup RC Files

Brush tries to read `.bashrc`, `.profile`, etc. on startup. In WASM contexts these cause errors. Need to be suppressed or handled gracefully.

---

## 7. Integration Architecture for wasmVM

### Current architecture (TypeScript shell):

```
User input → TS shell (parse + evaluate) → spawn Workers → WASM multicall binary
```

### Proposed architecture (brush in WASM):

```
User input → brush (parse + evaluate in WASM) → custom WASI imports → JS host → spawn Workers → WASM multicall binary
```

### What needs to happen:

1. **Replace command execution stubs** — Instead of returning `NotSupportedOnThisPlatform`, call wasmVM's `proc_spawn` WASI import to delegate command execution to the JS host.

2. **Replace `spawn_blocking` calls** — Audit all `spawn_blocking` usage on the WASM path and replace with `tokio::spawn` or synchronous alternatives.

3. **Wire I/O** — Shell stdin/stdout/stderr must cross the WASM-host boundary. Brush's async I/O traits (`AsyncRead`/`AsyncWrite`) can be backed by wasmVM's ring buffer / SharedArrayBuffer pipes.

4. **Suppress RC file loading** — Either skip startup files on WASM or provide a minimal VFS with empty/controlled RC files.

5. **Build integration** — Add brush-core (with `minimal` features) as a dependency in the wasmVM WASM build. Verify it compiles alongside the existing multicall binary.

---

## 8. Open Tokio WASM Issues (for tracking)

| Issue | Status | Summary |
|-------|--------|---------|
| #4827 | Open | Meta: Stabilize WASI support. `time` stabilized. Networking and tests pending. |
| #5238 | Open | I/O driver panic on wasm32-wasi (error code 29). Root cause in mio's WASI error handling. |
| #6516 | Open | io-std (stdin/stdout) not available in WASM. |
| #7550 | Open | Request for full wasm32-unknown-unknown support (threads, fs, timer). |

---

## 9. Recommendation

Brush is viable for wasmVM. The WASM build path is established, the platform abstraction is clean, and the tokio dependency is manageable with the minimal feature set. The main work is:

1. Replacing the command execution stubs with wasmVM host calls (medium effort)
2. Fixing `spawn_blocking` usage (low effort — small number of call sites)
3. Wiring brush's I/O to wasmVM's pipe infrastructure (medium effort)

This gives wasmVM a battle-tested bash-compatible shell without implementing the POSIX grammar from scratch.
