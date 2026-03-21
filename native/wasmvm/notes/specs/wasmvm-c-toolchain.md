# WasmVM C Toolchain: Compiling C Programs to WebAssembly

## Technical Specification v1.0

**Date:** March 19, 2026
**Status:** Draft
**Depends on:** `wasmvm-dynamic-modules.md` (command discovery, module cache, worker changes)

---

## 1. Summary

Enable compilation of C programs to standalone WebAssembly modules that run on our existing WasmVM host runtime. C binaries are built with the same toolchain infrastructure and installed to `commandDirs` alongside Rust binaries, discovered and executed by the dynamic modules infrastructure from `wasmvm-dynamic-modules.md`.

The key new work is a **patched wasi-libc sysroot** that maps POSIX functions (`pipe()`, `getpid()`, `kill()`, etc.) to our existing `host_process` and `host_user` WASM imports — the C equivalent of our Rust std patches (`patches/0001-0005`). The patched sysroot is to C programs what the `wasi-ext` crate is to Rust programs.

We already solved this problem for Rust. See `wasmvm-mvp.md` §2.3 for WASIX/wasi-sdk prior art and why we chose our own approach. The C toolchain applies the same vendor+patch strategy (`scripts/patch-wasi-libc.sh`) to wasi-libc's bottom-half instead of Rust's `std::sys::pal::wasi`.

### 1.1 What This Is

- A patched wasi-libc sysroot built with our vendor+patch strategy
- A build toolchain (wasi-sdk clang + patched sysroot) that compiles C source to standalone WASM binaries
- A set of progressively complex C test fixtures validating WASI and bridge coverage
- A path for opting real C commands into the package alongside Rust commands

### 1.2 What This Is Not

- Not a fork of wasi-libc — we vendor and patch, same as our Rust std patches
- Not WASIX — we don't depend on Wasmer, wasix-libc, or any proprietary runtime
- Not a general-purpose C development environment — this targets our specific host runtime

### 1.3 Relationship to Dynamic Modules

This spec **builds on** `wasmvm-dynamic-modules.md` and does not duplicate its work:

| Concern | Handled by |
|---------|-----------|
| Command discovery (filesystem scan, WASM magic bytes) | Dynamic modules §3.2-3.3 |
| Module cache + compiled module transfer to workers | Dynamic modules §3.4 |
| `WorkerInitData.wasmModule` and worker-side instantiation | Dynamic modules §4.4 |
| `tryResolve()` for on-demand discovery | Dynamic modules §4.1-4.3 |
| Command permissions | Dynamic modules §9 |
| Browser distribution (CDN manifest, `compileStreaming`) | Dynamic modules §8 |
| **Patched wasi-libc sysroot** | **This spec §3** |
| **C compilation toolchain** | **This spec §4** |
| **C test fixtures and real commands** | **This spec §5** |

C-compiled WASM binaries are indistinguishable from Rust-compiled ones at the driver level — both are standalone WASM modules with `_start` exports that import `wasi_snapshot_preview1` and optionally `host_process`/`host_user`. The driver doesn't know or care what language produced them.

### 1.4 Test Fixtures vs. Real Commands

All C programs are compiled with the same toolchain, but they serve different purposes:

- **Test fixtures** (`hello`, `args`, `pipe_test`, `spawn_child`, etc.) validate that the WASI polyfill and custom imports work correctly for C-compiled binaries. They live in `c/programs/`, are compiled by CI, and run by the test harness directly. They are NOT installed to `commandDirs` and do not appear as kernel commands.

- **Real commands** are C programs intended to ship as part of the command set (e.g., a future SQLite CLI, or a C utility with no Rust equivalent). These are opt-in: listed explicitly in a `COMMANDS` variable in the Makefile and installed to `commandDirs` alongside Rust binaries during `make install`. Name collisions with existing Rust commands are resolved by the dynamic modules `commandDirs` search order — the first directory wins.

The build process is identical for both. The only difference is whether `make install` copies them to `commandDirs`.

---

## 2. Patched wasi-libc Sysroot

Standard wasi-libc maps POSIX functions to WASI syscalls where possible and stubs the rest with `-ENOSYS`. Standard C file I/O, stdio, malloc, sleep, chdir, mmap emulation, signal emulation, and `getpid` (hardcoded `42`) all work out of the box.

Our patches replace specific stubs with calls to our custom WASM imports. Each patch adds a new `.c` file to wasi-libc's `libc-bottom-half/sources/` directory.

### 2.1 Patched Functions

| POSIX function | wasi-libc today | Patched to call | Import module |
|---------------|----------------|-----------------|---------------|
| `pipe()` | `-ENOSYS` | `__host_fd_pipe()` | `host_process.fd_pipe` |
| `dup()` | `-ENOSYS` | `__host_fd_dup()` | `host_process.fd_dup` |
| `dup2()` | `-ENOSYS` | `__host_fd_dup2()` | `host_process.fd_dup2` |
| `getpid()` | Returns `42` | `__host_proc_getpid()` | `host_process.proc_getpid` |
| `getppid()` | `-ENOSYS` | `__host_proc_getppid()` | `host_process.proc_getppid` |
| `kill()` | `-ENOSYS` | `__host_proc_kill()` | `host_process.proc_kill` |
| `waitpid()` | `-ENOSYS` | `__host_proc_waitpid()` | `host_process.proc_waitpid` |
| `posix_spawn()` | `-ENOSYS` | `__host_proc_spawn()` | `host_process.proc_spawn` |
| `getuid()` | `-ENOSYS` | `__host_getuid()` | `host_user.getuid` |
| `getgid()` | `-ENOSYS` | `__host_getgid()` | `host_user.getgid` |
| `geteuid()` | `-ENOSYS` | `__host_geteuid()` | `host_user.geteuid` |
| `getegid()` | `-ENOSYS` | `__host_getegid()` | `host_user.getegid` |
| `isatty()` | Basic filetype check | `__host_isatty()` | `host_user.isatty` |

### 2.2 Out of Scope

- `fork()` — impossible in WASM, use `posix_spawn()` instead
- `exec*()` — no process replacement, use `posix_spawn()` + `waitpid()`
- `socket()`/`connect()`/`bind()` — no networking in our runtime
- `pthread_*()` — no threading, each WASM instance is single-threaded
- `setjmp()`/`longjmp()` — would require Asyncify transform

### 2.3 Patch Pattern

Each patch declares WASM imports using Clang's `import_module`/`import_name` attributes and wraps them in POSIX-compatible functions. Example for `pipe()`:

```c
#define WASM_IMPORT(mod, fn) \
    __attribute__((__import_module__(mod), __import_name__(fn)))

WASM_IMPORT("host_process", "fd_pipe")
uint32_t __host_fd_pipe(uint32_t* ret_read_fd, uint32_t* ret_write_fd);

int pipe(int fd[2]) {
    uint32_t r, w;
    uint32_t err = __host_fd_pipe(&r, &w);
    if (err != 0) { errno = (int)err; return -1; }
    fd[0] = (int)r;
    fd[1] = (int)w;
    return 0;
}
```

This generates `(import "host_process" "fd_pipe" (func ...))` in the WASM binary — identical to what Rust's `#[link(wasm_import_module = "host_process")]` produces. The JS host in `kernel-worker.ts` satisfies both with the same functions.

All import signatures use the same ABI: `i32` params, out-pointers for results, errno return value. The canonical source of truth is `wasmvm/crates/wasi-ext/src/lib.rs` — C signatures must match exactly.

---

## 3. Build System

### 3.1 Directory Structure

```
wasmvm/
├── c/
│   ├── Makefile                 # C-specific build orchestration
│   ├── sysroot/                 # Patched wasi-libc sysroot (built, gitignored)
│   ├── programs/                # C source files (test fixtures + real commands)
│   │   ├── hello.c
│   │   ├── args.c
│   │   ├── pipe_test.c
│   │   └── ...
│   └── vendor/                  # Vendored wasi-libc source (gitignored)
├── patches/
│   ├── wasi-libc/               # Patches for wasi-libc
│   │   ├── 0001-pipe-dup.patch
│   │   ├── 0002-spawn-wait.patch
│   │   ├── 0003-kill.patch
│   │   ├── 0004-getpid.patch
│   │   ├── 0005-user-identity.patch
│   │   └── 0006-isatty.patch
│   ├── 0001-wasi-process-spawn.patch   # existing Rust std patches
│   └── ...
├── scripts/
│   ├── patch-std.sh             # existing — Rust std patches
│   ├── patch-vendor.sh          # existing — Rust crate patches
│   └── patch-wasi-libc.sh      # NEW — wasi-libc patches
├── Makefile                     # Top-level: make wasm (Rust), make c-wasm (C), make install (both)
```

### 3.2 Build Commands

```bash
# Build patched sysroot (vendor wasi-libc, apply patches, compile)
make -C wasmvm/c sysroot

# Compile all C programs (test fixtures + real commands)
make -C wasmvm/c programs

# Install only opted-in real commands to commandDirs
make -C wasmvm/c install COMMANDS_DIR=/path/to/commands

# Top-level shortcuts:
make c-wasm          # sysroot + programs
make install         # installs both Rust and C binaries to commandDirs
```

### 3.3 patch-wasi-libc.sh

Follows the same pattern as `patch-std.sh` and `patch-vendor.sh`:

1. Clones wasi-libc to `c/vendor/wasi-libc` at a pinned commit
2. Applies patches from `patches/wasi-libc/` in order
3. Builds the patched sysroot using wasi-sdk's clang
4. Outputs to `c/sysroot/`

Supports `--check` (dry-run) and `--reverse` (unapply) flags.

### 3.4 Per-Program Compilation

```bash
$(WASI_SDK)/bin/clang \
    --target=wasm32-wasip1 \
    --sysroot=$(PATCHED_SYSROOT) \
    -O2 -flto \
    -o $(PROG) \
    programs/$(PROG).c

wasm-opt -O3 --strip-debug $(PROG) -o $(PROG)
```

No `.wasm` extension on output — binaries identified by WASM magic bytes per `wasmvm-dynamic-modules.md` §3.2.

For programs needing emulated libraries:
```bash
... -lwasi-emulated-signal -lwasi-emulated-mman -lwasi-emulated-process-clocks
```

---

## 4. Test Programs

Programs are organized in tiers by which WASM imports they exercise. All are test fixtures unless explicitly opted in as real commands.

### 4.1 Tier 1 — Pure WASI (no custom imports)

Validates the WASI polyfill for C-compiled binaries. No patched sysroot needed.

- `hello` — print "Hello, World!\n" (fd_write, proc_exit)
- `args` — print argc and each argv entry (args_get)
- `env` — print all environment variables (environ_get)
- `exitcode` — exit with code from argv[1] (proc_exit)
- `cat` — read stdin, write to stdout (fd_read, fd_write)
- `wc` — word/line/byte count from stdin (fd_read, malloc)
- `fread` — read a file by path, print contents (path_open, fd_read)
- `fwrite` — write content to a file (path_open, fd_write)
- `sort` — sort lines from stdin (malloc/realloc, qsort)
- `sha256` — compute SHA-256 of stdin (CPU-intensive math)

### 4.2 Tier 2 — Custom Imports (host_process / host_user)

Validates the patched sysroot routes POSIX functions through our custom imports.

- `isatty_test` — detect if stdout is a terminal (host_user.isatty)
- `getpid_test` — print real PID, not hardcoded 42 (host_process.proc_getpid)
- `userinfo` — print uid, gid, euid, egid (host_user.*)
- `pipe_test` — create pipe, write then read (host_process.fd_pipe)
- `dup_test` — duplicate stdout to another FD (host_process.fd_dup/fd_dup2)
- `sleep_test` — sleep for N ms, verify elapsed time (host_process.sleep_ms)

### 4.3 Tier 3 — Process Management

Validates cross-runtime process spawning from C.

- `spawn_child` — spawn `echo hello`, wait for exit (proc_spawn, proc_waitpid)
- `spawn_exit_code` — spawn child, check its exit code
- `pipeline` — pipe + spawn: `echo hello | cat` (fd_pipe + proc_spawn + fd_dup2 + proc_waitpid)
- `kill_child` — spawn long-running child, kill it (proc_spawn, proc_kill)

### 4.4 Tier 4 — Filesystem Stress

Exercises deeper VFS/filesystem capabilities. Named `c-ls`, `c-tree`, etc. to avoid collision with existing Rust commands.

- `c-ls` — list directory contents with file sizes (opendir, readdir, stat)
- `c-tree` — recursive directory listing
- `c-find` — find files matching a pattern (recursive traversal + string matching)
- `c-cp` — copy a file (open + read + write + close)

### 4.5 Tier 5 — Real-World C Libraries

Boss fights — compile actual C libraries to validate the full libc surface.

- `json_parse` — parse JSON from stdin using cJSON (complex malloc/free patterns)
- `sqlite3_mem` — in-memory SQLite: create table, insert, query (massive libc surface)

### 4.6 Test Strategy

Each test fixture is compiled to a WASM binary **and** a native binary. The test harness runs both and compares `stdout`, `stderr`, and exit code — the same parity approach used by the project-matrix tests in `packages/secure-exec/tests/projects/`.

```typescript
test('hello: stdout matches native', async () => {
  const native = await runNative('./c/programs/hello');
  const wasm = await kernel.exec('hello');
  expect(wasm.stdout).toBe(native.stdout);
  expect(wasm.code).toBe(native.code);
});
```

---

## 5. Risks and Mitigations

### 5.1 wasi-libc Upstream Changes

**Risk:** wasi-libc updates could break our patches.
**Mitigation:** Pin to a specific commit (same as we pin Rust nightly). `patch-wasi-libc.sh --check` detects breakage early.

### 5.2 Import Signature Drift

**Risk:** C import signatures out of sync with JS host or Rust `wasi-ext` crate.
**Mitigation:** `wasi-ext/src/lib.rs` is canonical. A test compiles a minimal C program for each import and verifies it instantiates against the host.

### 5.3 setjmp/longjmp

**Risk:** Some C libraries (libpng, libjpeg) depend on these.
**Mitigation:** Out of scope — same limitation as our Rust toolchain.

### 5.4 Binary Size

**Risk:** C programs linked against full wasi-libc could be large.
**Mitigation:** `-O2 -flto` + `wasm-opt -O3 --strip-debug`. Hello-world should be <100KB; SQLite ~1-2MB.

---

## 6. Implementation Phases

### Phase 1: Pure WASI (Tier 1)

**Depends on:** Dynamic modules Phase 1 (kernel changes) and Phase 3 (driver changes). Tier 1 tests can also run against the worker directly without the full driver.

1. Download and cache wasi-sdk in `wasmvm/c/Makefile`
2. Write Tier 1 C programs
3. Compile with vanilla wasi-sdk sysroot (no patches)
4. Run test fixtures via test harness, verify parity with native
5. Optionally install to `commandDirs` to verify discovery

**No patched sysroot needed.** Validates the end-to-end pipeline.

### Phase 2: Patched Sysroot (Tier 2-3)

1. Vendor wasi-libc at pinned commit, create `scripts/patch-wasi-libc.sh`
2. Write patches for pipe/dup, spawn/wait, kill, getpid, user identity, isatty
3. Build patched sysroot
4. Write and test Tier 2-3 programs

### Phase 3: Filesystem and Real-World (Tier 4-5)

1. Write and test Tier 4 programs
2. Compile cJSON, write json_parse test
3. Compile SQLite amalgamation, write sqlite3_mem test
4. Document any WASI polyfill gaps and fix them

### Phase 4: CI

1. Add wasi-sdk download (cached) and sysroot build to CI
2. Add C test fixtures to CI test matrix
3. Update `docs/compatibility-matrix.md` with any opted-in C commands

---

## 7. Success Criteria

1. All 26 test fixtures compile with the patched toolchain
2. All 26 test fixtures produce identical output in WasmVM and native execution
3. C test fixtures can be invoked from brush-shell when installed: `hello`, `echo test | wc`
4. C binaries work in pipelines with Rust commands: `ls | c-sort`
5. The patched sysroot builds reproducibly from `make -C wasmvm/c sysroot`
6. CI builds and tests all C programs on every commit
