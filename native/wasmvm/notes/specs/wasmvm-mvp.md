# WasmCore: A Comprehensive WASM Coreutils Runtime

## Technical Specification v1.0

**Date:** March 15, 2026
**Status:** Superseded — multicall architecture replaced by standalone binaries (see `wasmvm-dynamic-modules.md`)

---

## 1. Executive Summary

WasmCore is a BusyBox-style WebAssembly binary containing a comprehensive Unix userland — coreutils, text processing tools, data processing utilities — paired with a JavaScript host runtime that emulates a Unix operating system. The WASM binary runs identically in browsers and Node.js. The JS host provides process management, pipe orchestration, a virtual filesystem, and a shell interpreter.

The end product is a portable, sandboxed Unix environment that runs anywhere JavaScript runs. A developer can embed it in a web page, use it as an AI agent sandbox, run it in a serverless function, or use it as a cross-platform scripting environment — all from a single WASM binary and a JS runtime with no native dependencies.

### 1.1 What This Is

A single `coreutils.wasm` binary (~10-20MB estimated) containing 100+ Unix utilities compiled from unmodified Rust source code, paired with a `wasm-os.js` runtime (~5-8K lines) that acts as the kernel. Together they provide:

- A full coreutils implementation (ls, cp, mv, cat, sort, head, tail, chmod, stat, etc.)
- Text processing (grep, sed, awk, find, xargs)
- Data processing (jq, yq)
- Pipeline execution (`cat file | sort | uniq -c | head`)
- Subprocess spawning and lifecycle management
- A virtual in-memory filesystem
- Shell command parsing and orchestration

### 1.2 What This Is Not

- Not a Linux kernel or full POSIX operating system
- Not a container or VM — there is no syscall passthrough to a real kernel
- Not a port of GNU coreutils — we use uutils/coreutils (Rust)
- Not dependent on WASIX, Wasmer, Emscripten, or any proprietary runtime
- Does not support fork(), pthreads, or Berkeley sockets in phase 1
- Does not use Asyncify or JSPI for blocking call support

---

## 2. Prior Art and Related Work

This section documents existing projects that solve adjacent problems, what we learn from each, and why we are not using them directly.

### 2.1 just-bash (Vercel Labs)

**Repository:** https://github.com/vercel-labs/just-bash
**Approach:** Pure TypeScript bash interpreter with an in-memory virtual filesystem.
**What it does:** Implements ~70 Unix commands as TypeScript functions. Parses bash syntax (pipes, redirects, variables, loops, functions) and dispatches to built-in command implementations. Designed for AI agents that need a sandboxed bash environment.

**What we learn from it:**

- Proves the "shell in JS, commands in a runtime" architecture works well for AI agent use cases.
- Demonstrates that you don't need real subprocesses for 95% of shell scripting workflows — in-process dispatch with in-memory pipe buffers is sufficient.
- Shows the command set that matters in practice: coreutils + grep/sed/awk/find + jq/yq covers the vast majority of use cases.
- Their use of optional runtimes (Python, JS via QuickJS, SQLite) as opt-in features is a good pattern for managing binary size.

**Why we aren't using it:** It's a TypeScript reimplementation of each command. We want the real utilities compiled from Rust, giving us GNU-compatible behavior, better performance on large inputs, and no risk of behavioral divergence from the real tools.

**Reference:** https://justbash.dev/

### 2.2 uutils/coreutils

**Repository:** https://github.com/uutils/coreutils
**Approach:** Cross-platform Rust reimplementation of GNU coreutils.
**What it does:** Implements all GNU coreutils (~100+ utilities) in Rust, targeting full GNU test suite compatibility. Currently at ~96% GNU compatibility. Each utility is a separate crate with a `uumain()` entry point, and there is an existing multicall (BusyBox-style) binary.

**What we learn from it:**

- The crate-per-utility architecture is exactly what we need. Each `uu_*` crate can be imported as a library dependency.
- The existing multicall binary proves the dispatch pattern works.
- It already compiles partially to `wasm32-wasip1` — pure computation utilities (cat, sort, base64, wc, etc.) work today. Only utilities that touch process spawning, user/group databases, or OS-specific APIs fail.
- A subset has already been compiled to WASM by the Wasmer team: https://wasmer.io/syrusakbary/coreutils

**Why it doesn't work out of the box:** The Rust standard library for `wasm32-wasip1` stubs out `std::process::Command::spawn()` to return `Err(Unsupported)`. This means utilities like `env` (when running a command), `timeout`, `nice`, and `nohup` fail. Additionally, `getuid()`/`getgid()` and pipe creation are not available.

**Reference:** https://github.com/uutils/coreutils, https://uutils.github.io/coreutils/docs/

### 2.3 WASIX and Wasmer

**Repository:** https://github.com/wasix-org/cargo-wasix, https://wasix.org/docs/
**Approach:** Extended WASI ABI with ~100+ additional POSIX syscalls, plus a forked Rust standard library and custom C library (wasix-libc).
**What it does:** Makes `std::process::Command::spawn()`, `fork()`, `vfork()`, pthreads, Berkeley sockets, TTY ioctls, signals, and other POSIX features work transparently in WASM. Programs compile with `cargo wasix build` and run on the Wasmer runtime.

**What we learn from it:**

- **The three-layer approach is correct.** WASIX modifies (1) a WITX syscall specification, (2) a syscall bindings crate, and (3) the Rust standard library's `sys::pal::wasi` module. This is the minimum set of layers needed to make unmodified Rust code compile and run.
- **The `cargo wasix` subcommand pattern works well.** It's a thin wrapper that downloads a pre-built sysroot and invokes normal Cargo with the right flags. The sysroot contains the patched std compiled for their custom target.
- **Browser subprocess support uses the same primitives we plan to use.** The `@wasmer/sdk` uses Web Workers + SharedArrayBuffer + Atomics for subprocess management. There is no browser API that gives WASIX capabilities we don't have access to.
- **fork() is extremely expensive in the browser.** It requires serializing the entire WASM linear memory. We avoid this entirely by only supporting spawn().

**Why we aren't using it:**

- **Vendor lock-in.** WASIX only runs on the Wasmer runtime. From their own documentation: "Currently, the only runtime that supports WASIX is Wasmer." (https://wasix.org/docs/)
- **Heavyweight browser runtime.** The `@wasmer/sdk` loads a WASM-compiled Wasmer runtime (~50K+ lines of JS/WASM) that then runs your WASM. It's WASM running WASM.
- **Mandatory SharedArrayBuffer even for single-threaded programs.** From their SDK docs: "This requirement is crucial even for running single-threaded WASIX programs because the SDK internals rely on SharedArrayBuffer for communication with Web Workers." (https://wasmerio.github.io/wasmer-js/)
- **Scope mismatch.** WASIX implements fork(), pthreads, full sockets, setjmp/longjmp, and many other features we don't need. We want ~15-20 custom syscalls, not 100+.
- **Standards concern.** WASIX is a proprietary extension. The WASI standards body has explicitly noted that fork() "conflicts directly with Component Model philosophy." WASIX may diverge permanently from standard WASI. (https://wasmruntime.com/en/blog/wasi-preview2-vs-wasix-2026)

**Reference:** https://wasmer.io/posts/announcing-wasix, https://github.com/wasix-org/cargo-wasix, https://github.com/john-sharratt/wasix

### 2.4 WASI (WebAssembly System Interface)

**Specification:** https://wasi.dev/, https://github.com/WebAssembly/WASI
**What it does:** Standardized syscall interface for WASM modules. Preview 1 (`wasi_snapshot_preview1`) provides ~45 functions covering file I/O, clock, random, args, environment variables, and basic fd operations. Preview 2 adds the Component Model, HTTP, and sockets. Preview 3 (expected 2026-2027) will add native async.

**What we learn from it:**

- WASI Preview 1 covers the vast majority of what coreutils need. File operations, directory listing, environment variables, clock — all handled.
- Process spawning is explicitly absent and may never be standardized. The GitHub issue requesting `posix_spawn` has been open since 2021 with no resolution (https://github.com/WebAssembly/WASI/issues/414).
- Rust's official documentation for the `wasm32-wasip1` target states: "spawning a process will always return an error" (https://doc.rust-lang.org/beta/rustc/platform-support/wasm32-wasip1.html).
- WASI's capability-based security model (pre-opened directories, no ambient authority) is a good fit for sandboxed execution.

**Our relationship to WASI:** We target `wasm32-wasip1` and use standard WASI for all file/clock/env/random operations. We add a small number of custom imports (`host_process`, `host_user`) on top of standard WASI for the capabilities it intentionally omits.

### 2.5 Emscripten

**What it does:** Compiles C/C++ to WASM with a comprehensive POSIX emulation layer.
**Why we're not using it:** We're compiling Rust, not C. Emscripten's runtime is heavy, browser-focused, and doesn't align with the Rust/WASI ecosystem. WASIX's own documentation notes that "Emscripten toolchain is complicated to iterate on, it requires a complex installation and dependency chain while also having non-standardized system call convention."

### 2.6 WebAssembly Standards Context

For reference, the current state of WebAssembly standards as of March 2026:

- **WASM 3.0** was released September 2025, adding 64-bit address space, garbage collection, tail calls, exception handling, and multiple memories (https://webassembly.org/news/2025-09-17-wasm-3.0/).
- **WASI Preview 2** is stable, with Component Model support. Preview 3 with native async is in development.
- **JSPI (JS Promise Integration)** is shipping in Chrome, behind a flag in Firefox, not yet in Safari. This is relevant because it would eventually eliminate the need for Workers-only blocking, but we do not depend on it (https://platform.uno/blog/the-state-of-webassembly-2025-2026/).

---

## 3. Architecture

### 3.1 High-Level Overview

```
┌──────────────────────────────────────────────────────────┐
│                     User Interface                        │
│  (xterm.js terminal, CLI, programmatic API, etc.)        │
└──────────────────┬───────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────┐
│                  JS Host Runtime ("wasm-os")              │
│                                                           │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │ Shell Parser │ │ Pipeline     │ │ Process Table     │ │
│  │ & Evaluator  │ │ Orchestrator │ │ & Worker Pool     │ │
│  └──────┬──────┘ └──────┬───────┘ └────────┬──────────┘ │
│         │               │                   │             │
│  ┌──────▼───────────────▼───────────────────▼──────────┐ │
│  │              Virtual Kernel Layer                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │ │
│  │  │ WASI     │ │ Process  │ │ Pipe/FD  │ │ User/  │ │ │
│  │  │ Polyfill │ │ Syscalls │ │ Table    │ │ Group  │ │ │
│  │  │ (45 fns) │ │ (custom) │ │ Manager  │ │ DB     │ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────────────┐  ┌────────────────────────┐    │
│  │ Virtual Filesystem    │  │ Worker Adapter Layer   │    │
│  │ (in-memory)           │  │ (Web Worker / Node.js  │    │
│  │                       │  │  worker_threads)       │    │
│  └──────────────────────┘  └────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────┐
│               Web Workers / worker_threads                │
│                                                           │
│  ┌──────────────────────────────────────────────┐        │
│  │           coreutils.wasm (Multicall Binary)   │        │
│  │                                               │        │
│  │  ┌─────┐ ┌──────┐ ┌────┐ ┌──────┐ ┌──────┐ │        │
│  │  │ cat │ │ sort │ │ ls │ │ grep │ │ jq   │ │        │
│  │  └─────┘ └──────┘ └────┘ └──────┘ └──────┘ │        │
│  │  ┌─────┐ ┌──────┐ ┌────┐ ┌──────┐ ┌──────┐ │        │
│  │  │ sed │ │ awk  │ │ wc │ │ find │ │ yq   │ │        │
│  │  └─────┘ └──────┘ └────┘ └──────┘ └──────┘ │        │
│  │  ... (~120+ utilities total)                 │        │
│  │                                               │        │
│  │  Imports:                                     │        │
│  │    wasi_snapshot_preview1.*  (standard WASI)  │        │
│  │    host_process.*           (custom: ~10 fns) │        │
│  │    host_user.*              (custom: ~6 fns)  │        │
│  └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Execution Flow

A user command like `cat file.txt | sort -r | head -5` follows this path:

1. **Shell parser** (JS) tokenizes and parses the command into an AST representing a pipeline of three stages.
2. **Pipeline orchestrator** (JS) decides execution strategy: sequential in-process (for simple pipelines) or parallel via Workers (for CPU-bound or long-running stages).
3. For each stage, the orchestrator **posts a message** to a Worker containing the command name, arguments, environment, and input data.
4. The Worker **instantiates the WASM module** (or reuses a cached instance), providing both standard WASI imports and custom `host_process`/`host_user` imports.
5. The Worker calls the WASM **dispatch function**, which routes to the appropriate utility's `uumain()`.
6. The utility reads stdin (WASI `fd_read`), does its work, writes to stdout (WASI `fd_write`), and exits.
7. The Worker **posts the output back** to the orchestrator, which feeds it as input to the next pipeline stage.
8. The final stage's stdout is returned to the user interface.

### 3.3 Blocking Call Strategy

All WASM execution happens inside Web Workers (browser) or worker_threads (Node.js). Never on the main thread. This enables synchronous blocking via `Atomics.wait()` on `SharedArrayBuffer`.

When a WASM utility calls a blocking syscall (e.g., `proc_waitpid`):

1. The WASM code calls the imported `host_process.proc_waitpid` function.
2. The JS import handler (running in the Worker thread) calls `Atomics.wait(sharedBuffer, offset, 0)`.
3. The Worker thread sleeps with zero CPU cost.
4. When the child process (in another Worker) completes, it writes the exit code to the SharedArrayBuffer and calls `Atomics.notify()`.
5. The waiting Worker wakes, reads the result, and returns it to WASM synchronously.

This approach requires **Cross-Origin Isolation headers** in browser environments:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These headers are a deployment constraint. They prevent embedding third-party iframes that don't opt in, and they prevent some third-party scripts from loading. This is an unavoidable cost of using SharedArrayBuffer in the browser.

In Node.js, `worker_threads` supports SharedArrayBuffer and Atomics natively with no special configuration.

---

## 4. The WASM Multicall Binary

### 4.1 Contents (Phase 1)

The binary is compiled from a Rust workspace that imports the following crates as library dependencies:

**Coreutils (from uutils/coreutils, unmodified):**

All ~100+ utilities from the uutils project. These include file operations (cat, cp, ln, ls, mkdir, mv, rm, rmdir, stat, touch, etc.), text processing (comm, cut, expand, fold, head, join, nl, od, paste, sort, tac, tail, tr, unexpand, uniq, wc, etc.), output (echo, printf, tee, yes), checksums (base32, base64, md5sum, sha1sum, sha256sum, etc.), permissions (chmod), navigation (basename, dirname, pwd), environment (date, env, hostname, printenv, whoami), and process utilities (expr, false, seq, sleep, test, timeout, true).

**Text processing (additional Rust crates):**

- **ripgrep** (`grep-regex`, `grep-searcher` crates) — provides `grep`, `egrep`, `fgrep`
- **sd** — provides `sed` (modern Rust regex-based stream editor)
- **frawk** — provides `awk`
- **fd-find** — provides `find`
- **xargs** — custom implementation or from uutils findutils effort

**Data processing:**

- **jaq** — provides `jq` (Rust reimplementation of jq)
- **yq** — YAML/TOML/XML processing (Rust implementation TBD; may use a custom wrapper around `serde_yaml`/`serde_json`/`toml` crates)

### 4.2 Dispatch Table

The multicall binary exposes a single entry point that routes to the correct utility:

```rust
#[no_mangle]
pub extern "C" fn dispatch(cmd_ptr: *const u8, cmd_len: u32,
                            argc: u32, argv_ptr: *const u8) -> i32 {
    let cmd = unsafe { std::str::from_utf8_unchecked(
        std::slice::from_raw_parts(cmd_ptr, cmd_len as usize)
    )};
    let args = deserialize_argv(argc, argv_ptr);

    match cmd {
        "cat"       => uu_cat::uumain(args.into_iter()),
        "sort"      => uu_sort::uumain(args.into_iter()),
        "ls"        => uu_ls::uumain(args.into_iter()),
        "grep"      => ripgrep_main(args),
        "jq"        => jaq_main(args),
        // ... 120+ more entries
        _           => { eprintln!("{}: command not found", cmd); 127 }
    }
}
```

### 4.3 Custom Syscall Bindings Crate

A small crate (`wasi-ext`) declares the custom WASM imports that the JS host must provide. These are functions that WASI intentionally does not offer.

**Module: `host_process`**

| Function | Signature | Description |
|---|---|---|
| `proc_spawn` | `(argv_ptr, argv_len, envp_ptr, envp_len, stdin_fd, stdout_fd, stderr_fd, cwd_ptr, cwd_len, ret_pid) → errno` | Spawn a child process. Returns virtual PID. |
| `proc_waitpid` | `(pid, options, ret_status) → errno` | Wait for child to exit. Blocks via Atomics. |
| `proc_kill` | `(pid, signal) → errno` | Send signal to process (only SIGTERM/SIGKILL meaningful). |
| `proc_getpid` | `(ret_pid) → errno` | Get current virtual PID. |
| `proc_getppid` | `(ret_pid) → errno` | Get parent virtual PID. |
| `fd_pipe` | `(ret_read_fd, ret_write_fd) → errno` | Create anonymous pipe. |
| `fd_dup` | `(fd, ret_new_fd) → errno` | Duplicate a file descriptor. |
| `fd_dup2` | `(old_fd, new_fd) → errno` | Duplicate fd to specific number. |

**Module: `host_user`**

| Function | Signature | Description |
|---|---|---|
| `getuid` | `(ret_uid) → errno` | Get current user ID. |
| `getgid` | `(ret_gid) → errno` | Get current group ID. |
| `geteuid` | `(ret_uid) → errno` | Get effective user ID. |
| `getegid` | `(ret_gid) → errno` | Get effective group ID. |
| `isatty` | `(fd, ret_bool) → errno` | Check if fd is a terminal. |
| `getpwuid` | `(uid, buf_ptr, buf_len, ret_len) → errno` | Get passwd entry (serialized). |

**Total: ~16 custom imports**, alongside the ~45 standard `wasi_snapshot_preview1` imports.

### 4.4 Rust Standard Library Patches

We maintain patch files against the Rust nightly source tree. These modify **only** the WASI platform-specific implementation files in `library/std/src/sys/pal/wasi/`.

**Files modified:**

| File | Change | Lines Changed (est.) |
|---|---|---|
| `process.rs` | Replace `unsupported()` stubs with calls to `host_process.proc_spawn`, `proc_waitpid`, etc. Implement `Command`, `Process`, `ExitStatus`. | ~200 |
| `pipe.rs` | Replace `unsupported()` with call to `host_process.fd_pipe`. Implement `AnonPipe` read/write. | ~50 |
| `os.rs` | Add `getuid()`, `getgid()`, `geteuid()`, `getegid()` calling `host_user.*`. | ~30 |
| `io.rs` | Wire `isatty()` to `host_user.isatty`. | ~10 |

**Total: ~290 lines of patches across 4 files.**

Everything else in the standard library — file I/O, networking stubs, clock, random, args, environment — remains unchanged and uses standard WASI.

---

## 5. The JS Host Runtime ("wasm-os")

### 5.1 WASI Polyfill (Custom Implementation)

We implement all ~45 functions of `wasi_snapshot_preview1` from scratch. This gives us full control over the virtual filesystem, fd table, and clock behavior.

Key `wasi_snapshot_preview1` functions and their mapping:

| WASI Function | Maps To |
|---|---|
| `fd_read`, `fd_write` | Virtual FD table → VFS or pipe buffer |
| `fd_seek`, `fd_tell` | VFS file cursor |
| `fd_close` | Release FD from table |
| `path_open` | VFS path resolution → new FD |
| `path_create_directory` | VFS mkdir |
| `path_unlink_file` | VFS unlink |
| `path_rename` | VFS rename |
| `fd_readdir` | VFS directory listing |
| `fd_filestat_get` | VFS stat |
| `environ_get`, `environ_sizes_get` | JS-managed environment variables |
| `args_get`, `args_sizes_get` | Passed from orchestrator per invocation |
| `clock_time_get` | `performance.now()` / `Date.now()` |
| `random_get` | `crypto.getRandomValues()` |
| `proc_exit` | Set exit code, terminate WASM execution |

### 5.2 Custom Syscall Implementations

**Process Table:**

```
processTable: Map<pid, {
  worker: Worker,
  status: number | null,
  waitBuffer: SharedArrayBuffer,  // [exitCode: i32, done: i32]
  stdin: PipeEnd | null,
  stdout: PipeEnd | null,
  stderr: PipeEnd | null,
}>
```

**`proc_spawn` implementation:**
1. Deserialize argv and envp from WASM linear memory.
2. Allocate a new virtual PID.
3. Create a `SharedArrayBuffer(8)` for the wait/notify rendezvous.
4. Spawn a new Worker, posting: the pre-compiled WASM Module, command name, args, env, fd mappings, and the SharedArrayBuffer.
5. Register the process in the process table.
6. Return the PID to WASM.

**`proc_waitpid` implementation:**
1. Look up the PID in the process table.
2. Call `Atomics.wait(waitBuffer, 1, 0)` — this blocks the Worker thread until the child writes its exit code.
3. Read the exit code from `waitBuffer[0]`.
4. Write exit code into WASM memory at the provided pointer.
5. Return to WASM.

**`proc_kill` implementation:**
1. Look up the PID in the process table.
2. Call `worker.terminate()` (equivalent to SIGKILL).
3. Write exit code 137 (128 + 9) to the wait buffer and notify.

### 5.3 Virtual Filesystem

An in-memory filesystem supporting the full WASI filesystem interface:

- Directory tree with inodes
- File content stored as `Uint8Array`
- Stat metadata (size, mtime, atime, mode, uid, gid)
- Symbolic links
- Pre-populated with standard Unix layout: `/bin`, `/tmp`, `/home/user`, `/dev/null`, `/dev/stdin`, `/dev/stdout`, `/dev/stderr`

The VFS is shared across all Workers via `SharedArrayBuffer` or by serializing/deserializing state in messages. The exact sharing strategy is a phase 2 concern; phase 1 can use a simpler model where each Worker gets a snapshot of the VFS and writes are collected and merged after execution.

### 5.4 Shell Parser and Pipeline Orchestrator

The shell parser handles:

- Simple commands: `ls -la /tmp`
- Pipelines: `cat file | sort | uniq -c`
- Redirections: `echo hello > file.txt`, `cat < input.txt`, `cmd 2>&1`
- Command chaining: `&&`, `||`, `;`
- Environment variable expansion: `$HOME`, `${VAR:-default}`
- Glob expansion: `*.txt`, `src/**/*.rs`
- Quoted strings: single, double, with escape handling

The pipeline orchestrator:

1. Parses the command string into an AST.
2. For single commands: posts to a Worker, awaits result.
3. For pipelines: creates in-memory buffers between stages, executes sequentially (phase 1) or spawns parallel Workers with SharedArrayBuffer-backed pipes (phase 2).
4. Handles exit code propagation (`$?`, `PIPESTATUS`).
5. Supports background execution (phase 2).

### 5.5 Worker Adapter Layer

A thin abstraction that normalizes the Worker API across environments:

```javascript
// Unified interface
class WorkerAdapter {
  spawn(workerScript, options) → Worker-like object
  // In browser:  new Worker(workerScript, { type: 'module' })
  // In Node.js:  new worker_threads.Worker(workerScript, { workerData: options })
}
```

Both environments support `postMessage`, `onmessage`, `SharedArrayBuffer`, and `Atomics`. The adapter handles the minor API differences (e.g., `workerData` in Node vs message passing in browser, `terminate()` behavior).

---

## 6. Build System

### 6.1 Multi-Stage Build Overview

```
Stage 1: Prepare patched Rust standard library
  ├── Install Rust nightly toolchain
  ├── Install rust-src component
  ├── Apply patch files to local std source
  └── Output: patched std source tree

Stage 2: Build WASM multicall binary
  ├── cargo +nightly build --target wasm32-wasip1
  │     -Z build-std=std,panic_abort
  ├── Uses patched std from Stage 1
  ├── Imports all utility crates (uutils, ripgrep, jaq, etc.)
  └── Output: coreutils.wasm

Stage 3: Post-process WASM
  ├── wasm-opt -O3 coreutils.wasm -o coreutils.opt.wasm
  ├── Optimize for size and speed
  └── Output: coreutils.opt.wasm (final binary)

Stage 4: Build JS host runtime
  ├── Bundle wasm-os.js and dependencies
  ├── Produce browser bundle (ESM) and Node.js bundle (CJS/ESM)
  └── Output: wasm-os.browser.js, wasm-os.node.js
```

### 6.2 Repository Structure

```
wasmcore/
├── Makefile                        # Multi-stage build orchestrator
├── rust-toolchain.toml             # Pins nightly version
│
├── patches/                        # Rust std patches
│   ├── 0001-wasi-process-spawn.patch
│   ├── 0002-wasi-pipe-support.patch
│   ├── 0003-wasi-user-group.patch
│   └── 0004-wasi-isatty.patch
│
├── crates/
│   ├── wasi-ext/                   # Custom syscall bindings
│   │   ├── Cargo.toml
│   │   └── src/lib.rs              # ~300 lines
│   │
│   ├── multicall/                  # The BusyBox binary
│   │   ├── Cargo.toml              # Depends on uu_*, ripgrep, jaq, etc.
│   │   └── src/
│   │       ├── main.rs             # Entry point
│   │       └── dispatch.rs         # Command → uumain routing table
│   │
│   └── shims/                      # Reimplementations of the ~6 commands
│       ├── Cargo.toml              #   that need subprocess support
│       └── src/                    #   (env, timeout, nice, nohup, etc.)
│           ├── env.rs              #   These use wasi-ext syscalls
│           ├── timeout.rs
│           └── ...
│
├── host/                           # JS host runtime
│   ├── package.json
│   ├── src/
│   │   ├── index.js                # Public API
│   │   ├── wasm-os.js              # Main orchestrator
│   │   ├── wasi-polyfill.js        # wasi_snapshot_preview1 implementation
│   │   ├── process.js              # host_process.* implementations
│   │   ├── user.js                 # host_user.* implementations
│   │   ├── vfs.js                  # Virtual filesystem
│   │   ├── shell.js                # Shell parser + evaluator
│   │   ├── pipeline.js             # Pipeline orchestrator
│   │   ├── fd-table.js             # File descriptor management
│   │   ├── worker-adapter.js       # Browser/Node.js Worker abstraction
│   │   └── worker-entry.js         # Worker-side WASM bootstrap
│   └── test/
│       └── ...
│
├── scripts/
│   ├── patch-std.sh                # Apply patches to rust-src
│   ├── build-wasm.sh               # Full WASM build pipeline
│   └── test-gnu.sh                 # Run GNU test suite subset
│
└── test/                           # Integration tests
    ├── coreutils.test.js           # Per-utility smoke tests
    ├── pipeline.test.js            # Pipeline execution tests
    └── process.test.js             # Subprocess lifecycle tests
```

### 6.3 Build Commands

```bash
# Full build from scratch (first time: ~5-10 minutes)
make all

# Just rebuild the WASM binary (incremental: ~15-30 seconds)
make wasm

# Just rebuild the JS host
make host

# Run tests
make test

# Clean everything
make clean
```

### 6.4 Patch Management

Patches are generated and applied against a specific Rust nightly version pinned in `rust-toolchain.toml`:

```toml
[toolchain]
channel = "nightly-2026-03-01"
components = ["rust-src"]
targets = ["wasm32-wasip1"]
```

When updating to a new nightly:

1. Update the date in `rust-toolchain.toml`.
2. Run `make patch-check` to see if patches apply cleanly.
3. If conflicts: manually resolve, regenerate patches with `diff -u`.
4. Expect conflicts roughly 2-3 times per year when Rust updates the `sys::pal::wasi` module.

---

## 7. Browser Deployment Requirements

- **HTTPS required** (for SharedArrayBuffer)
- **Cross-Origin Isolation headers required:**
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- **WASM binary must be served with correct MIME type:** `application/wasm`
- **Web Workers must be same-origin** (the worker entry script must be served from the same origin)

These headers restrict what third-party resources can be loaded on the page. Any cross-origin resources (images, scripts, iframes) must include a `Cross-Origin-Resource-Policy: cross-origin` header or use CORS. This is a well-known constraint of SharedArrayBuffer that cannot be avoided.

---

## 8. Phased Implementation Plan

### Phase 1: Foundation (Weeks 1-4)

**Goal:** `echo "hello" | cat | wc -c` works in a browser and Node.js.

- Implement the WASI polyfill (45 functions).
- Build the Worker adapter layer (browser + Node.js).
- Build the virtual filesystem.
- Compile a minimal uutils subset to `wasm32-wasip1` WITHOUT std patches (no process/pipe support yet).
- Build the dispatch table.
- Implement basic pipeline orchestration (sequential, in-memory buffers).
- Write a minimal shell parser (pipes, redirects, simple commands).

### Phase 2: Full Coreutils (Weeks 5-8)

**Goal:** All ~100 uutils commands work. The 6 subprocess commands work via std patches.

- Create and validate the std patch files (process.rs, pipe.rs, os.rs, io.rs).
- Integrate `-Z build-std` into the build pipeline.
- Build the `wasi-ext` bindings crate.
- Implement `host_process.*` and `host_user.*` in the JS host.
- Build the subprocess Worker spawning and `Atomics.wait`/`notify` lifecycle.
- Add `env`, `timeout`, `nice`, `nohup`, `stdbuf`, `chroot` as shim crates or JS host commands.
- Test against uutils' own test suite where feasible.

### Phase 3: Extended Tools (Weeks 9-12)

**Goal:** grep, sed, awk, find, jq, yq all work.

- Integrate ripgrep, sd, frawk, fd-find, jaq crates into the multicall binary.
- Write dispatch wrappers to normalize CLI interfaces (e.g., ripgrep's `rg` interface vs traditional `grep`).
- Implement glob expansion in the shell.
- Add shell features: variables, conditionals, loops, functions.
- Add `wasm-opt` post-processing to the build pipeline.

### Phase 4: Polish and Optimize (Weeks 13-16)

**Goal:** Production-ready, documented, tested.

- Run GNU coreutils test suite subset and fix compatibility issues.
- Optimize binary size (tree-shaking unused utilities, `--profile=release-small`).
- Implement parallel pipeline execution via Workers.
- Add persistent filesystem option (OPFS for browser, real FS for Node.js).
- Write documentation and API reference.
- Build example integrations: xterm.js terminal, AI agent sandbox, CLI tool.

---

## 9. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Rust nightly breaks `-Z build-std` | Build fails | Medium | Pin nightly version; only update deliberately |
| uutils crate uses unsupported WASI feature | Individual utility fails | Medium | Disable that utility in the multicall build; file upstream issue |
| SharedArrayBuffer COOP/COEP breaks embedability | Can't embed in some pages | High | Document clearly; provide a degraded mode without subprocess support |
| Binary size too large (>30MB) | Slow page loads | Medium | Tree-shake utilities; split into core + extended modules; use wasm-opt aggressively |
| Patch conflicts on Rust update | Maintenance burden | Medium-High | Keep patches minimal (~290 lines); test against Rust nightly weekly in CI |
| frawk/sd/jaq don't compile to wasm32-wasip1 | Missing tools | Low-Medium | Fall back to simpler implementations; these are pure-computation crates and likely compile fine |

---

## 10. Success Criteria

The project is considered complete when:

1. `coreutils.wasm` contains 100+ utilities and loads successfully in Chrome, Firefox, Safari, and Node.js ≥ 18.
2. `ls -la /tmp`, `cat file | sort | uniq -c`, `echo $HOME`, `grep pattern file`, and `echo '{"a":1}' | jq '.a'` all produce correct output.
3. `timeout 1 sleep 10` correctly kills the child after 1 second (subprocess support works).
4. No dependency on WASIX, Wasmer, Emscripten, or any proprietary runtime.
5. The build is reproducible from a clean checkout with `make all` on Linux and macOS.
6. Binary size is under 25MB after `wasm-opt` optimization.

---

## Appendix A: Reference Links

- **uutils/coreutils:** https://github.com/uutils/coreutils
- **uutils documentation:** https://uutils.github.io/coreutils/docs/
- **just-bash:** https://github.com/vercel-labs/just-bash
- **WASIX documentation:** https://wasix.org/docs/
- **WASIX announcement:** https://wasmer.io/posts/announcing-wasix
- **WASIX syscall bindings crate:** https://github.com/john-sharratt/wasix
- **cargo-wasix subcommand:** https://github.com/wasix-org/cargo-wasix
- **WASIX spawn tutorial:** https://wasix.org/docs/language-guide/rust/tutorials/wasix-spawn
- **@wasmer/sdk browser docs:** https://wasmerio.github.io/wasmer-js/
- **Wasmer JS SDK announcement:** https://wasmer.io/posts/introducing-the-wasmer-js-sdk
- **WASI specification:** https://wasi.dev/
- **WASI process spawn issue:** https://github.com/WebAssembly/WASI/issues/414
- **WASI Preview 2 vs WASIX comparison:** https://wasmruntime.com/en/blog/wasi-preview2-vs-wasix-2026
- **WASI ecosystem status:** https://eunomia.dev/blog/2025/02/16/wasi-and-the-webassembly-component-model-current-status/
- **Rust wasm32-wasip1 target docs:** https://doc.rust-lang.org/beta/rustc/platform-support/wasm32-wasip1.html
- **Rust WASI target changes:** https://blog.rust-lang.org/2024/04/09/updates-to-rusts-wasi-targets/
- **Compiling Rust to WASI:** https://benw.is/posts/compiling-rust-to-wasi
- **Stubbing WASI in Rust:** https://www.jakubkonka.com/2020/04/28/rust-wasi-from-scratch.html
- **Rust extensible WASM syscall PR:** https://github.com/rust-lang/rust/pull/47102
- **WASM 3.0 announcement:** https://webassembly.org/news/2025-09-17-wasm-3.0/
- **State of WebAssembly 2025-2026:** https://platform.uno/blog/the-state-of-webassembly-2025-2026/

## Appendix B: Comparison Matrix

A detailed feature comparison of just-bash vs uutils/coreutils showing which commands are available in each project was produced during the research phase. The full interactive matrix is available as `comparison-matrix.jsx` in the project repository.

Key findings: uutils provides ~100+ GNU coreutils commands. just-bash provides ~70 commands including non-coreutils tools (grep, sed, awk, jq, yq, find). The overlap is ~37 commands. WasmCore's phase 1 goal is to combine both sets into a single binary.
