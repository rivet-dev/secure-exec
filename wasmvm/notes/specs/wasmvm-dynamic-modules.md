# WasmVM Dynamic Module Loading

## Technical Specification v1.0

**Date:** March 19, 2026
**Status:** Implemented
**Supersedes:** Multicall binary architecture from `wasmvm-mvp.md` (multicall crate deleted)

---

## 1. Summary

Replace the monolithic multicall WASM binary with individually compiled standalone WASM binaries, loaded dynamically on demand. Any Rust crate with a `fn main()` entrypoint can be compiled to a WASM binary and dropped into a commands directory — the kernel discovers it automatically and makes it available as a command. No file extension required — binaries are identified by WASM magic bytes, just as Linux identifies ELF binaries by magic number.

### 1.1 Goals

- **Eliminate the multicall binary** — no more `dispatch.rs` match table, no single binary containing all commands
- **Filesystem-based discovery** — drop a binary in a directory and it becomes a command, like `/usr/bin/` on Linux
- **No extension required** — files are validated by WASM magic bytes (`\0asm`), not by filename
- **PATH support** — multiple search directories, first match wins, configurable at runtime
- **Any Rust crate compiles** — a `cargo` wrapper handles the build toolchain so third-party crates "just work"
- **Lazy loading** — commands are compiled to `WebAssembly.Module` on first use and cached for fast re-instantiation
- **On-demand discovery** — commands are discovered when first spawned, not only at init
- **No manifest files** — the filesystem IS the manifest

### 1.2 Non-Goals

- WASM Component Model adoption (future work, tooling too immature)
- Changing the WASI host runtime or kernel RPC protocol

---

## 2. Background

### 2.1 Current Architecture

The current system compiles ~70 commands into a single `multicall.wasm` binary (~15MB). The JS-side driver (`WasmVmRuntimeDriver`) has a hardcoded `WASMVM_COMMANDS` array and a single `wasmBinaryPath`. Each worker loads the same multicall binary and calls `_start()`, which invokes `fn main()`. The Rust `main()` reads `argv[0]` (set by the worker via WASI args) and routes through `dispatch::run()` — a `match` statement mapping command names to handlers. Note: the multicall binary also exports a `dispatch()` function, but this is dead code — the JS side has never called it.

```
kernel.spawn("grep", [...])
  → CommandRegistry: "grep" → WasmVmRuntimeDriver
    → Worker loads multicall.wasm, calls _start()
      → main() reads argv[0]="grep" → dispatch::run("grep", args)
```

**Problems:**

1. Adding a command requires modifying `dispatch.rs`, `main.rs`, `Cargo.toml`, and the JS `WASMVM_COMMANDS` array
2. Every spawn loads the entire 15MB binary even if only one command is needed
3. Third-party Rust crates cannot be added without integrating them into the multicall workspace
4. Binary size grows monotonically — every new command increases load time for all commands

### 2.2 WASIX Prior Art

Wasmer's WASIX project solved this same problem:

- **Custom Rust target** (`wasm32-wasmer-wasi`) with a patched sysroot extending WASI with threads, sockets, fork/exec, signals, and TTY support
- **`cargo-wasix`** — a cargo wrapper that auto-downloads a pre-built sysroot and compiles any Rust crate to a standalone WASM binary
- **Package registry** — individual WASM packages (bash, python, coreutils) loadable on demand
- **`@wasmer/sdk`** — JS SDK that runs WASIX programs in browsers/Node.js, fetching packages from the registry

We adopt the same architectural pattern (standalone binaries + cargo wrapper + dynamic loading) but target our existing `wasm32-wasip1` + custom host imports rather than WASIX.

### 2.3 Existing Bug: Path-Based Command Resolution

During this investigation, a latent bug was discovered in the current system that applies equally to the new architecture. It must be fixed as part of this work.

**brush-shell PATH resolution flow:**

1. User types `ls`
2. brush-shell searches PATH, finds `/bin/ls` (stub file with mode 0o755)
3. `executable()` returns `true` unconditionally on WASI (stub in `brush-core/src/sys/stubs/fs.rs`)
4. brush-shell calls `Command::new("/bin/ls")` — the resolved path
5. `arg0("ls")` is a **no-op on WASI** (stub in `brush-core/src/sys/stubs/commands.rs`)
6. `proc_spawn` sends argv[0] = `"/bin/ls"` to the kernel
7. `commandRegistry.resolve("/bin/ls")` → `null` → **ENOENT**

The registry only stores bare names (`"ls"`) not paths (`"/bin/ls"`). This bug is masked today because commonly tested commands (`echo`, `test`, `true`, `false`, `cd`, `export`) are brush-shell builtins that never hit PATH lookup.

**Fix:** `CommandRegistry.resolve()` must strip path prefixes — extract the basename when a direct lookup fails.

---

## 3. Architecture

### 3.1 Overview

```
┌───────────────────────────────────────────────────────────┐
│  Build Time                                               │
│                                                           │
│  cargo secureexec build                                   │
│  ├── target: wasm32-wasip1                                │
│  ├── -Z build-std=std,panic_abort                         │
│  ├── links wasi-ext (host_process / host_user imports)    │
│  ├── wasm-opt -O3 --strip-debug                           │
│  └── strip .wasm extension from output filenames          │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│  Commands Directory (filesystem)                          │
│                                                           │
│  /path/to/commands/                                       │
│  ├── ls                ← no extension, just like /usr/bin │
│  ├── grep                                                 │
│  ├── sh                                                   │
│  ├── jq                                                   │
│  └── my-custom-tool       ← third-party, just dropped in │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│  Runtime (JS)                                             │
│                                                           │
│  WasmVmRuntimeDriver                                      │
│  ├── commandDirs: string[]         ← PATH-like search     │
│  ├── moduleCache: Map<string, WebAssembly.Module>          │
│  ├── init(): scan dirs, validate magic, populate commands │
│  ├── spawn("grep"): resolve → compile/cache → instantiate │
│  └── on miss: rescan dirs (on-demand discovery)           │
│                                                           │
│  kernel-worker.ts                                         │
│  ├── receives wasmBinaryPath per command (not global)     │
│  ├── loads specific binary                                │
│  └── calls _start() (standard WASI, no dispatch export)   │
└───────────────────────────────────────────────────────────┘
```

### 3.2 Binary Identification

Files are identified as WASM binaries by reading the first 4 bytes and checking for the WASM magic number:

```
\0asm  (0x00 0x61 0x73 0x6D)
```

This is the same approach Linux uses with ELF headers (`\x7fELF`). No file extension is required or expected. During directory scanning, any file whose first 4 bytes match the WASM magic is treated as a command binary. Files that don't match (READMEs, shell scripts, dotfiles, etc.) are silently skipped.

```typescript
const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6D]);

async function isWasmBinary(path: string): Promise<boolean> {
  const fd = await open(path, 'r');
  const buf = new Uint8Array(4);
  await read(fd, buf, 0, 4, 0);
  await close(fd);
  return buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6D;
}
```

### 3.3 Command Resolution

Resolution follows Unix PATH semantics with on-demand discovery:

```
spawn("grep", [...])
  1. Check moduleCache — if cached, instantiate immediately
  2. If command contains '/': treat as path, extract basename for registry lookup
  3. Else: scan commandDirs in order for file named {command}
  4. Validate WASM magic bytes
  5. Compile to WebAssembly.Module, cache it
  6. Instantiate and run
```

**On-demand discovery:** The driver does an initial scan at `init()` to populate the `commands` list for the kernel's `CommandRegistry`. Because the kernel resolves commands via the registry *before* calling `driver.spawn()`, on-demand discovery requires cooperation between the kernel and driver:

1. `CommandRegistry.resolve()` returns null for an unknown command
2. The kernel calls a new `driver.tryResolve(command)` method before throwing ENOENT
3. The driver synchronously checks `commandDirs` for the binary (using `fs.existsSync` + sync 4-byte magic read)
4. If found, the driver updates its internal `_commandPaths` map and returns `true`
5. The kernel calls `commandRegistry.registerCommand(command, driver)` and `populateBin()` for the new command
6. The kernel retries `spawnInternal()` with the now-registered command

This ensures new binaries dropped into `commandDirs` after init are discoverable without a full restart, while keeping the kernel's registry as the single source of truth.

**Resolution order in `commandDirs`** mirrors `$PATH` — first directory containing a file named `{command}` with valid WASM magic wins. This enables overlaying custom implementations over defaults.

### 3.4 Module Cache and Worker Transfer

In the current architecture, each worker independently reads the binary from disk and calls `WebAssembly.compile()` (kernel-worker.ts lines 632-633). This means every spawn pays the full ~50-200ms compile cost, defeating any driver-side caching.

The fix: **compile on the main thread, transfer the compiled `WebAssembly.Module` to the worker via structured clone.** `WebAssembly.Module` is a `Transferable` object in Node.js (since v16) — it can be passed through `workerData` without serialization overhead.

```typescript
class ModuleCache {
  private cache = new Map<string, WebAssembly.Module>();
  // Dedup concurrent compilations — store the pending promise
  private pending = new Map<string, Promise<WebAssembly.Module>>();

  async resolve(binaryPath: string): Promise<WebAssembly.Module> {
    const cached = this.cache.get(binaryPath);
    if (cached) return cached;

    // Dedup: if another spawn is already compiling this binary, await it
    const inflight = this.pending.get(binaryPath);
    if (inflight) return inflight;

    const promise = this._compile(binaryPath);
    this.pending.set(binaryPath, promise);
    try {
      const module = await promise;
      this.cache.set(binaryPath, module);
      return module;
    } finally {
      this.pending.delete(binaryPath);
    }
  }

  private async _compile(binaryPath: string): Promise<WebAssembly.Module> {
    const bytes = await readFile(binaryPath);
    return WebAssembly.compile(bytes);
  }

  invalidate(binaryPath: string): void {
    this.cache.delete(binaryPath);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

**Worker-side change:** `WorkerInitData` gains an optional `wasmModule: WebAssembly.Module` field. When present, the worker skips `readFile` + `compile` and calls `WebAssembly.instantiate(init.wasmModule, imports)` directly. The driver passes the pre-compiled module via `workerData`:

```typescript
// Driver side — in _launchWorker
const module = await this._moduleCache.resolve(binaryPath);
const workerData: WorkerInitData = {
  wasmModule: module,     // pre-compiled, transferred via structured clone
  wasmBinaryPath: binaryPath,  // fallback path (used if wasmModule absent)
  command, args, pid, ...
};
```

```typescript
// Worker side — in kernel-worker.ts main()
const wasmModule = init.wasmModule
  ?? await WebAssembly.compile(await readFile(init.wasmBinaryPath));
const instance = await WebAssembly.instantiate(wasmModule, imports);
```

First spawn: ~50-200ms (main-thread compile + cache). Subsequent spawns: ~1-5ms (instantiate from cached module).

---

## 4. Component Changes

### 4.1 CommandRegistry (kernel)

**File:** `packages/kernel/src/command-registry.ts`

Two changes: path-based resolution and single-command dynamic registration.

```typescript
resolve(command: string): RuntimeDriver | null {
  // Direct name lookup
  const direct = this.commands.get(command);
  if (direct) return direct;

  // Path-based: "/bin/ls" → "ls"
  if (command.includes('/')) {
    const basename = command.split('/').pop()!;
    return this.commands.get(basename) ?? null;
  }

  return null;
}

/** Register a single command (used for on-demand discovery). */
registerCommand(command: string, driver: RuntimeDriver): void {
  this.commands.set(command, driver);
}
```

**File:** `packages/kernel/src/kernel.ts`

Add on-demand discovery fallback in `spawnInternal()`:

```typescript
private spawnInternal(command: string, args: string[], ...) {
  let driver = this.commandRegistry.resolve(command);

  // On-demand discovery: ask drivers if they can resolve unknown commands
  if (!driver) {
    for (const d of this.drivers) {
      if (d.tryResolve?.(command)) {
        this.commandRegistry.registerCommand(command, d);
        // Create /bin stub so brush-shell PATH lookup works for future calls
        this.commandRegistry.populateBinEntry(this.vfs, command);
        driver = d;
        break;
      }
    }
  }

  if (!driver) throw new KernelError("ENOENT", `command not found: ${command}`);
  // ... rest of spawnInternal
}
```

### 4.2 WasmVmRuntimeDriver

**File:** `packages/runtime/wasmvm/src/driver.ts`

Replace:
- `WASMVM_COMMANDS` hardcoded array → derived from filesystem scan
- `wasmBinaryPath: string` (single binary) → `commandDirs: string[]` (search path)
- Add `ModuleCache` for compiled modules
- Add on-demand rescan on cache miss

```typescript
export interface WasmVmRuntimeOptions {
  /** Directories to scan for WASM command binaries, searched in order. */
  commandDirs: string[];
}

class WasmVmRuntimeDriver implements RuntimeDriver {
  readonly name = 'wasmvm';

  private _commands: string[] = [];
  private _commandPaths = new Map<string, string>();  // command → binary path
  private _moduleCache = new ModuleCache();
  private _commandDirs: string[];

  get commands(): string[] { return this._commands; }

  async init(kernel: KernelInterface): Promise<void> {
    this._kernel = kernel;
    await this._scanCommandDirs();
  }

  /** Scan all command directories, validating WASM magic bytes. */
  private async _scanCommandDirs(): Promise<void> {
    this._commandPaths.clear();
    this._commands = [];

    for (const dir of this._commandDirs) {
      const entries = await readdir(dir);
      for (const entry of entries) {
        // Skip dotfiles and directories
        if (entry.startsWith('.')) continue;
        const fullPath = join(dir, entry);

        // Validate WASM magic
        if (!(await isWasmBinary(fullPath))) continue;

        // First match wins (PATH semantics)
        if (!this._commandPaths.has(entry)) {
          this._commandPaths.set(entry, fullPath);
          this._commands.push(entry);
        }
      }
    }
  }

  /**
   * Called by the kernel when CommandRegistry.resolve() returns null.
   * Synchronously checks commandDirs for the command binary.
   */
  tryResolve(command: string): boolean {
    for (const dir of this._commandDirs) {
      const fullPath = join(dir, command);
      if (!fs.existsSync(fullPath)) continue;

      // Sync 4-byte magic check
      const fd = fs.openSync(fullPath, 'r');
      const buf = Buffer.alloc(4);
      fs.readSync(fd, buf, 0, 4, 0);
      fs.closeSync(fd);
      if (buf[0] !== 0x00 || buf[1] !== 0x61 || buf[2] !== 0x73 || buf[3] !== 0x6D) continue;

      this._commandPaths.set(command, fullPath);
      if (!this._commands.includes(command)) this._commands.push(command);
      return true;
    }
    return false;
  }

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const binaryPath = this._commandPaths.get(command);
    if (!binaryPath) throw new Error(`wasmvm: command not found: ${command}`);
    this._launchWorker(command, args, ctx, binaryPath, ...);
  }
}
```

### 4.3 RuntimeDriver Interface

**File:** `packages/kernel/src/types.ts`

Add optional `tryResolve` method to the `RuntimeDriver` interface:

```typescript
interface RuntimeDriver {
  // ... existing members
  /** Optional: attempt to resolve an unknown command. Called by kernel before ENOENT. */
  tryResolve?(command: string): boolean;
}
```

Only drivers with dynamic command discovery (WasmVM) implement this. Drivers with static command lists (Node, Python) leave it undefined — the kernel skips them.

### 4.4 WorkerInitData

**File:** `packages/runtime/wasmvm/src/syscall-rpc.ts`

Add optional `wasmModule` field:

```typescript
export interface WorkerInitData {
  wasmModule?: WebAssembly.Module;  // pre-compiled, transferred via structured clone
  wasmBinaryPath: string;           // fallback path (if wasmModule absent)
  command: string;
  args: string[];
  // ... rest unchanged
}
```

### 4.4 kernel-worker.ts

**File:** `packages/runtime/wasmvm/src/kernel-worker.ts`

Changes:
- Accept pre-compiled `WebAssembly.Module` via `init.wasmModule` (transferred from main thread via structured clone)
- Fall back to `readFile` + `compile` if `wasmModule` is absent (backwards compat with multicall mode)
- `init.command` is already passed as argv[0] via `processIO.getArgs()` — no change needed
- The worker already calls `_start()` — no dispatch-related changes

```typescript
// Before (current — compiles per-worker)
const wasmBytes = await readFile(init.wasmBinaryPath);
const wasmModule = await WebAssembly.compile(wasmBytes);

// After (uses pre-compiled module when available)
const wasmModule = init.wasmModule
  ?? await WebAssembly.compile(await readFile(init.wasmBinaryPath));
```

---

## 5. Multicall Decomposition

### 5.1 Current Multicall Structure

The multicall binary contains these categories of commands:

| Category | Commands | Source | Shared deps |
|----------|----------|--------|-------------|
| **Shell** | `sh`, `bash` | brush-shell 0.3.0 | tokio (minimal), brush-parser |
| **Text search** | `grep`, `egrep`, `fgrep`, `rg` | Custom (`grep.rs`, `rg.rs`) | regex crate |
| **Text processing** | `sed`, `awk` | sed 0.1.1, awk-rs 0.1.0 | regex |
| **Data processing** | `jq`, `yq` | jaq-core 2.2, serde_yaml, toml, quick-xml | serde_json |
| **File search** | `find` | Custom (`find.rs`) | regex |
| **File type** | `file` | Custom (`file.rs`) | infer crate |
| **Compression** | `gzip`, `gunzip`, `zcat`, `tar` | Custom wrappers | flate2, tar crate |
| **Diff** | `diff` | Custom (`diff.rs`) | similar crate |
| **Custom impls** | `tree`, `du`, `column`, `rev`, `strings`, `expr` | Custom Rust files | minimal |
| **Builtins** | `sleep`, `test`/`[`, `whoami` | Custom (`builtins.rs`) | wasi-ext |
| **Shims** | `env`, `timeout`, `xargs`, `nice`, `nohup`, `stdbuf` | Custom (`shims/*.rs`) | wasi-ext (proc_spawn) |
| **uutils coreutils** | `ls`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `chmod`, `sort`, `head`, `tail`, `wc`, `cut`, `tr`, `echo`, `printf`, `seq`, `yes`, `true`, `false`, `tee`, `date`, `uname`, ... (~45 cmds) | uutils/coreutils 0.7.0 (patched) | uucore |
| **Stubs** | `hostname`, `kill`, `stty`, `chown`, `df`, ... (~15 cmds) | Custom (error messages) | none |

### 5.2 Package Split Strategy

The multicall crate (`wasmvm/crates/multicall/`) is decomposed into library crates and binary crates:

#### Library Crates (`wasmvm/crates/libs/`)

Shared implementations that multiple command binaries depend on:

```
wasmvm/crates/libs/
  grep/          ← grep.rs, rg.rs → used by grep, egrep, fgrep, rg binaries
  find/          ← find.rs → used by find binary
  jq/            ← jq.rs → used by jq binary
  yq/            ← yq.rs → used by yq binary
  awk/           ← awk.rs wrapper → used by awk binary
  gzip/          ← gzip.rs → used by gzip, gunzip, zcat binaries
  tar/           ← tar_cmd.rs → used by tar binary
  diff/          ← diff.rs → used by diff binary
  file-cmd/      ← file.rs → used by file binary
  tree/          ← tree.rs → used by tree binary
  du/            ← du.rs → used by du binary
  column/        ← column.rs → used by column binary
  rev/           ← rev.rs → used by rev binary
  strings-cmd/   ← strings.rs → used by strings binary
  expr/          ← expr.rs → used by expr binary
  builtins/      ← builtins.rs (sleep, test, whoami) → used by respective binaries
  shims/         ← shims/*.rs (env, timeout, xargs, etc.) → used by respective binaries
  stubs/         ← stub implementations → used by stub binaries
```

#### Binary Crates (`wasmvm/crates/commands/`)

Each command gets a thin binary crate — a `fn main()` calling the library:

```
wasmvm/crates/commands/
  sh/            ← brush-shell main
  ls/            ← uu_ls::uumain
  cat/           ← uu_cat::uumain
  grep/          ← libs/grep::grep
  egrep/         ← libs/grep::egrep (or symlink to grep binary)
  fgrep/         ← libs/grep::fgrep (or symlink to grep binary)
  rg/            ← libs/grep::rg
  sed/           ← sed crate main
  awk/           ← libs/awk::awk
  jq/            ← libs/jq::jq
  yq/            ← libs/yq::yq
  find/          ← libs/find::find
  gzip/          ← libs/gzip::gzip
  gunzip/        ← libs/gzip::gunzip (or symlink to gzip binary)
  zcat/          ← libs/gzip::zcat (or symlink to gzip binary)
  tar/           ← libs/tar::tar
  diff/          ← libs/diff::diff
  file/          ← libs/file-cmd::file
  tree/          ← libs/tree::tree
  ...
  env/           ← libs/shims::env
  timeout/       ← libs/shims::timeout
  xargs/         ← libs/shims::xargs
  ...
  hostname/      ← libs/stubs::hostname  (prints error + returns 1)
  kill/          ← libs/stubs::kill
  ...
```

#### Example: grep binary crate

```toml
# wasmvm/crates/commands/grep/Cargo.toml
[package]
name = "cmd-grep"
version = "0.1.0"
edition = "2024"

[[bin]]
name = "grep"
path = "src/main.rs"

[dependencies]
secureexec-grep = { path = "../../libs/grep" }
```

```rust
// wasmvm/crates/commands/grep/src/main.rs
fn main() {
    let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
    std::process::exit(secureexec_grep::grep(args));
}
```

#### Example: ls binary crate (uutils)

```toml
# wasmvm/crates/commands/ls/Cargo.toml
[package]
name = "cmd-ls"
version = "0.1.0"
edition = "2024"

[[bin]]
name = "ls"
path = "src/main.rs"

[dependencies]
uu_ls = { version = "0.7.0" }
uucore = { version = "0.7.0" }
```

```rust
// wasmvm/crates/commands/ls/src/main.rs
fn main() {
    let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
    std::process::exit(uu_ls::uumain(args.into_iter()) as i32);
}
```

#### Example: sh binary crate (brush-shell)

```toml
# wasmvm/crates/commands/sh/Cargo.toml
[package]
name = "cmd-sh"
version = "0.1.0"
edition = "2024"

[[bin]]
name = "sh"
path = "src/main.rs"

[dependencies]
brush-shell = { version = "0.3.0", features = ["minimal"] }
```

```rust
// wasmvm/crates/commands/sh/src/main.rs
fn main() {
    brush_shell::entry::run();
}
```

### 5.3 Alias Handling

Commands that are aliases of each other (`egrep` → `grep -E`, `gunzip` → `gzip -d`, `bash` → `sh`, `dir` → `ls`, `vdir` → `ls`) use **symlinks** in the commands directory, just like Linux:

```bash
cd /path/to/commands/
ln -s grep egrep
ln -s grep fgrep
ln -s gzip gunzip
ln -s gzip zcat
ln -s sh bash
ln -s ls dir
ln -s ls vdir
```

The underlying binary checks `argv[0]` to determine behavior. The driver passes the original command name (not the resolved binary path) as `init.command`, which becomes `argv[0]` via WASI args.

**Required code changes for symlink aliases:** Some command implementations currently have separate entry points per alias (e.g., `grep.rs` exports `grep()`, `egrep()`, `fgrep()` as distinct functions with hardcoded modes, called by the dispatch table). These must be refactored to check `argv[0]` and dispatch internally:

```rust
// wasmvm/crates/libs/grep/src/lib.rs — after refactor
pub fn main(args: Vec<OsString>) -> i32 {
    let cmd = args.first()
        .and_then(|a| Path::new(a).file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("grep");
    let mode = match cmd {
        "egrep" => GrepMode::Extended,
        "fgrep" => GrepMode::Fixed,
        _ => GrepMode::Basic,
    };
    grep_impl(args, mode)
}
```

Commands that already dispatch on `argv[0]` (gzip/gunzip/zcat, ls/dir/vdir, sh/bash) work with symlinks as-is. Commands requiring this refactor: **grep/egrep/fgrep**.

On platforms without symlink support (some Windows environments), the build system copies the binary instead.

### 5.4 Stub Commands

Stub commands (`hostname`, `kill`, `stty`, `chown`, `chgrp`, `df`, etc.) currently just print an error message and exit. These can either:

1. **Individual tiny binaries** — each ~1MB due to std inclusion, but never loaded unless called
2. **Single stubs binary** — one binary that checks argv[0] and prints the appropriate error (a mini-multicall for stubs only)

Option 2 is recommended — stubs share no real logic, so the mini-multicall saves ~14MB of duplicated std across ~15 stub commands. The stubs binary is the one exception to the "no multicall" rule, justified because stubs are not real commands — they exist only to provide helpful error messages.

**Note:** `more` is NOT a stub — it currently delegates to `uu_cat::uumain()` (real functionality). It must be a symlink to `cat`, not to `_stubs`. Similarly, `spawn-test` (internal test command in the current dispatch table) must be preserved — either as its own binary or removed explicitly.

---

## 6. Build System

### 6.1 cargo-secureexec

A cargo subcommand (or shell script wrapper) that compiles any Rust crate to a secure-exec compatible WASM binary:

```bash
# Build a single command
cargo secureexec build -p cmd-ls --release

# Build all commands
cargo secureexec build --release --workspace

# Build a third-party crate
cd /path/to/some-rust-cli-tool
cargo secureexec build --release
```

Under the hood:

```bash
#!/usr/bin/env bash
# cargo-secureexec: compile Rust crates to secure-exec WASM binaries

set -euo pipefail

WASM_TARGET="wasm32-wasip1"

# Build with custom std
cargo build \
  --target "$WASM_TARGET" \
  -Z build-std=std,panic_abort \
  --release \
  "$@"

# Post-process: optimize and strip extension
for wasm in target/"$WASM_TARGET"/release/*.wasm; do
  [ -f "$wasm" ] || continue

  # Optimize
  wasm-opt -O3 --strip-debug "$wasm" -o "$wasm"

  # Strip .wasm extension — output is just the command name
  base="${wasm%.wasm}"
  mv "$wasm" "$base"
done
```

The key requirement is that `wasi-ext` must be available as a dependency (for `host_process` and `host_user` imports). For first-party commands this is automatic (workspace dependency). For third-party crates, they either:
1. Don't need subprocess support → work out of the box with standard WASI
2. Need subprocess support → add `wasi-ext` as a dependency

### 6.2 Makefile Changes

Replace the single multicall build target:

```makefile
# Old
wasm: multicall.wasm

# New — build all command binaries
COMMANDS := $(notdir $(wildcard crates/commands/*/Cargo.toml))
COMMANDS := $(COMMANDS:/Cargo.toml=)

wasm:
	cargo secureexec build --release --workspace
	@echo "Built $(words $(COMMANDS)) command binaries"

# Install to commands directory
install: wasm
	mkdir -p $(COMMANDS_DIR)
	for cmd in $(COMMANDS); do \
	  cp target/wasm32-wasip1/release/$$cmd $(COMMANDS_DIR)/; \
	done
	# Create symlinks for aliases
	cd $(COMMANDS_DIR) && ln -sf grep egrep && ln -sf grep fgrep
	cd $(COMMANDS_DIR) && ln -sf gzip gunzip && ln -sf gzip zcat
	cd $(COMMANDS_DIR) && ln -sf sh bash
	cd $(COMMANDS_DIR) && ln -sf ls dir && ln -sf ls vdir
	cd $(COMMANDS_DIR) && ln -sf cat more
```

### 6.3 Output Layout

```
/path/to/commands/
  ls          (~1.5MB)
  grep        (~1.2MB)
  egrep       → grep (symlink)
  fgrep       → grep (symlink)
  sh          (~4MB)
  bash        → sh (symlink)
  jq          (~2MB)
  cat         (~1.2MB)
  sed         (~1.3MB)
  awk         (~1.5MB)
  find        (~1.2MB)
  tar         (~1.3MB)
  gzip        (~1.2MB)
  gunzip      → gzip (symlink)
  more        → cat (symlink, NOT a stub — delegates to uu_cat)
  ...
  _stubs      (~1.5MB, mini-multicall for stub commands)
  hostname    → _stubs (symlink)
  kill        → _stubs (symlink)
  stty        → _stubs (symlink)
  ...
```

---

## 7. Binary Size Analysis

### 7.1 Size Budget

| Component | Multicall (current) | Standalone (est.) | Notes |
|-----------|-------------------|------------------|-------|
| Rust std | ~1.5MB (shared) | ~1.5MB per binary | Duplicated, but DCE removes unused parts per binary |
| uucore | ~0.5MB (shared) | ~0.3MB per binary | Each binary uses subset |
| brush-shell | ~3MB | ~4MB (standalone) | Largest single command |
| regex engine | ~0.5MB (shared) | ~0.5MB per user | In grep, rg, find, awk separately |
| jaq (jq impl) | ~1.5MB | ~2MB (standalone) | Includes serde_json |
| Total on disk | ~15MB | ~40-60MB total | But never all loaded at once |

### 7.2 Load Size Comparison

| Workload | Multicall | Standalone |
|----------|----------|------------|
| Shell only | 15MB | ~4MB (sh) |
| Shell + 5 coreutils | 15MB | ~4MB + 5 × ~1.3MB = ~10.5MB |
| Shell + all commands | 15MB | ~40-60MB |
| Single exec("ls") | 15MB | ~1.5MB |

For typical workloads (shell + handful of commands), standalone loading is **comparable or better** than the multicall approach.

### 7.3 Why Total Size Increases

Each standalone binary includes its own copy of the Rust standard library (~1.5MB after LTO/DCE). With ~50 real command binaries (excluding symlink aliases and stubs), that's ~75MB of duplicated `std` code on disk. This is the primary cost of the standalone approach.

However, this cost is **disk-only** — at runtime, only the commands actually used are loaded into memory. A shell session using 10 commands loads ~15MB total, same as the current multicall.

### 7.4 Future Optimization: Shared Libraries

WASM supports a form of dynamic linking via the `dylink.0` custom section. Shared dependencies (`std`, `uucore`, `regex`) can be compiled as position-independent WASM modules with `__memory_base`/`__table_base` globals, loaded once into shared linear memory, and linked at instantiation time.

This would let all command binaries share a single copy of `std` (~1.5MB) and `uucore` (~0.5MB), reducing total disk size to near-multicall levels while keeping full modularity.

**This is a future optimization, not a v1 requirement.** The tooling for WASM dynamic linking is still maturing, and the disk size cost is acceptable for v1 given the runtime memory benefits.

---

## 8. Browser Distribution

In Node.js environments, commands live on the filesystem and are discovered by scanning directories. In browser environments, there is no filesystem — commands must be fetched over the network.

### 8.1 Command Registry Endpoint

A static JSON manifest maps command names to URLs:

```json
{
  "version": 1,
  "baseUrl": "https://cdn.example.com/commands/v1/",
  "commands": {
    "ls":   { "size": 1500000, "sha256": "abc123..." },
    "grep": { "size": 1200000, "sha256": "def456..." },
    "sh":   { "size": 4000000, "sha256": "789abc..." }
  }
}
```

### 8.2 Browser WasmVmRuntimeDriver

The browser variant of the driver fetches binaries on demand:

```typescript
class BrowserWasmVmRuntimeDriver implements RuntimeDriver {
  private _registryUrl: string;
  private _manifest: CommandManifest | null = null;
  private _moduleCache = new ModuleCache();

  async init(kernel: KernelInterface): Promise<void> {
    // Fetch manifest to discover available commands
    const resp = await fetch(this._registryUrl);
    this._manifest = await resp.json();
    this._commands = Object.keys(this._manifest.commands);
  }

  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
    const entry = this._manifest!.commands[command];
    if (!entry) throw new Error(`command not found: ${command}`);

    const url = this._manifest!.baseUrl + command;
    // Fetch + compile on first use, cache for subsequent spawns
    this._launchWorker(command, args, ctx, url, ...);
  }
}
```

### 8.3 Caching Strategy

- **`WebAssembly.compileStreaming(fetch(url))`** — compiles while downloading, fastest path
- **Cache API** — browser's Cache API stores compiled modules across page loads
- **IndexedDB fallback** — for environments without Cache API
- **Integrity checking** — SHA-256 from manifest verified before instantiation

### 8.4 Bundle Preloading

For known common workloads, a preload hint can fetch likely-needed commands during idle time:

```typescript
// Preload shell + common coreutils during page load
driver.preload(['sh', 'ls', 'cat', 'grep', 'echo']);
```

---

## 9. Command Permissions

Loading arbitrary WASM binaries as commands has trust implications. While the WASI sandbox prevents host system access, all commands share the same kernel VFS and can read/write any file the sandbox allows.

### 9.1 Permission Model

Each command can be assigned a permission tier:

| Tier | VFS Access | Network | Subprocess | Examples |
|------|-----------|---------|------------|----------|
| **full** | read + write anywhere | allowed | allowed | `sh`, `env` |
| **read-write** | read + write anywhere | denied | denied | `cp`, `mv`, `rm`, `tee` |
| **read-only** | read anywhere, write nowhere | denied | denied | `cat`, `grep`, `ls`, `find`, `jq` |
| **isolated** | read cwd only, write nowhere | denied | denied | third-party/untrusted commands |

### 9.2 Enforcement

Permissions are enforced at the kernel syscall boundary — the WASI host imports (`fd_open`, `fd_write`, `proc_spawn`) check the calling process's permission tier before allowing the operation. The WASM binary itself cannot bypass this since it has no direct access to the host — every I/O operation goes through the kernel RPC.

### 9.3 Configuration

Permission tiers are set per-command via the driver options:

```typescript
createWasmVmRuntime({
  commandDirs: ['/commands'],
  permissions: {
    'sh': 'full',
    'env': 'full',
    'cp': 'read-write',
    'grep': 'read-only',
    '*': 'read-write',          // default for known commands
    '_untrusted/*': 'isolated', // commands from untrusted dir
  }
})
```

---

## 10. Migration Plan

### Phase 1: Kernel Changes (prerequisite)

1. Fix `CommandRegistry.resolve()` to handle path-based lookups (`/bin/ls` → `ls`)
2. Add `CommandRegistry.registerCommand()` for single-command dynamic registration
3. Add `CommandRegistry.populateBinEntry()` to create a single `/bin` stub
4. Add `RuntimeDriver.tryResolve?()` optional interface method
5. Add on-demand discovery fallback in `kernel.spawnInternal()` — calls `driver.tryResolve()` before ENOENT
6. Add test: brush-shell executing external commands via PATH
7. These fixes apply to both architectures and should land first

### Phase 2: Rust Decomposition

1. Create `wasmvm/crates/libs/` — extract shared implementations from multicall
2. Refactor `grep.rs` to dispatch on `argv[0]` instead of having separate `grep()`/`egrep()`/`fgrep()` entry points
3. Create `wasmvm/crates/commands/` — individual binary crates
4. Each command crate: minimal `fn main()` calling the library
5. Create `cargo-secureexec` build wrapper (must invoke `patch-std` and `patch-vendor` — inherit from existing Makefile)
6. Verify each command compiles and runs as a standalone binary
7. Keep `multicall.wasm` building in parallel during transition
8. Create symlinks for alias commands (including `more` → `cat`)
9. Create `_stubs` mini-multicall for stub commands

### Phase 3: JS Driver Changes

1. Add `ModuleCache` class with concurrent-compile deduplication
2. Add WASM magic byte validation (async for init scan, sync for on-demand `tryResolve`)
3. Refactor `WasmVmRuntimeDriver` to accept `commandDirs` instead of `wasmBinaryPath`
4. Implement `tryResolve()` for on-demand discovery (called by kernel on registry miss)
5. Implement filesystem-based command discovery in `init()` scan
6. Compile modules on main thread, transfer to workers via `workerData` structured clone
7. Update `kernel-worker.ts` to accept pre-compiled `wasmModule` in `WorkerInitData`
8. Remove `WASMVM_COMMANDS` hardcoded array
9. Support backwards-compatible `wasmBinaryPath` option during transition

### Phase 4: Browser Support

1. Implement `BrowserWasmVmRuntimeDriver` with fetch-based loading
2. Define command registry manifest format
3. Add `compileStreaming` + Cache API integration
4. Add preload API for common command sets

### Phase 5: Permissions

1. Define permission tier enforcement in kernel syscall handlers
2. Add per-command permission configuration to driver options
3. Default all first-party commands to appropriate tiers
4. Default untrusted/third-party commands to `isolated`

### Phase 6: Cleanup

1. Delete `wasmvm/crates/multicall/` (dispatch.rs, main.rs)
2. Update CI to build individual binaries
3. Update CLAUDE.md, wasmvm/CLAUDE.md to reflect new architecture
4. Update compatibility-matrix.md
5. Remove multicall references from specs and docs

---

## 11. Testing Strategy

### 11.1 Per-Command Smoke Tests

Each standalone binary gets a basic smoke test:

```typescript
test('ls produces output', async () => {
  const result = await runStandaloneCommand('/commands/ls', ['ls', '/']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('bin');
});
```

### 11.2 Binary Identification Tests

```typescript
test('identifies valid WASM binary by magic bytes', async () => {
  expect(await isWasmBinary('/commands/ls')).toBe(true);
});

test('rejects non-WASM files', async () => {
  expect(await isWasmBinary('/commands/README.md')).toBe(false);
});

test('skips dotfiles during scan', async () => {
  const driver = createWasmVmRuntime({ commandDirs: [dir] });
  await driver.init(kernel);
  expect(driver.commands).not.toContain('.hidden');
});
```

### 11.3 Command Resolution Tests

```typescript
test('resolves command from commandDirs', async () => {
  const driver = createWasmVmRuntime({ commandDirs: ['/commands'] });
  await driver.init(kernel);
  expect(driver.commands).toContain('ls');
});

test('first dir wins on conflict', async () => {
  const driver = createWasmVmRuntime({
    commandDirs: ['/custom-commands', '/default-commands']
  });
  // /custom-commands/ls takes precedence over /default-commands/ls
});

test('on-demand discovery finds new commands', async () => {
  const driver = createWasmVmRuntime({ commandDirs: [dir] });
  await driver.init(kernel);
  // Drop a new binary after init
  await copyFile(someWasm, join(dir, 'new-cmd'));
  // Spawn should find it without explicit rescan
  const result = driver.spawn('new-cmd', [], ctx);
  expect(result).toBeDefined();
});

test('path-based resolution: /bin/ls → ls', () => {
  registry.register(driver);  // driver has "ls"
  expect(registry.resolve('/bin/ls')).toBe(driver);
  expect(registry.resolve('/usr/bin/ls')).toBe(driver);
  expect(registry.resolve('ls')).toBe(driver);
});
```

### 11.4 Symlink Alias Tests

```typescript
test('egrep symlink resolves to grep binary', async () => {
  const result = await kernel.exec('egrep "pattern" /some/file');
  // Should work — egrep is a symlink to grep, argv[0]="egrep" triggers -E mode
});
```

### 11.5 Module Cache Tests

```typescript
test('compiles once, instantiates many', async () => {
  const cache = new ModuleCache();
  const m1 = await cache.resolve('/commands/ls');
  const m2 = await cache.resolve('/commands/ls');
  expect(m1).toBe(m2);  // same Module object
});
```

### 11.6 Integration Tests

All existing kernel integration tests (`test-suite/`, `runtime-driver/`) must pass with the new architecture. The behavioral contract is unchanged — only the binary loading mechanism changes.

### 11.7 brush-shell PATH Integration

```typescript
test('shell can execute external command via PATH', async () => {
  const result = await kernel.exec('ls /');
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('bin');
});

test('shell pipe with external commands', async () => {
  const result = await kernel.exec('echo hello | grep hello');
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe('hello');
});
```

---

## 12. API Changes

### 12.1 Public API

```typescript
// Before
createWasmVmRuntime({ wasmBinaryPath: '/path/to/multicall.wasm' })

// After
createWasmVmRuntime({ commandDirs: ['/path/to/commands/'] })

// Browser
createWasmVmRuntime({ registryUrl: 'https://cdn.example.com/commands/manifest.json' })
```

### 12.2 Backwards Compatibility

Support the old `wasmBinaryPath` option during migration — if provided, fall back to multicall mode. Emit a deprecation warning.

```typescript
export interface WasmVmRuntimeOptions {
  /** @deprecated Use commandDirs instead. */
  wasmBinaryPath?: string;
  /** Directories to scan for WASM command binaries (Node.js). */
  commandDirs?: string[];
  /** URL of command registry manifest (browser). */
  registryUrl?: string;
  /** Per-command permission overrides. */
  permissions?: Record<string, 'full' | 'read-write' | 'read-only' | 'isolated'>;
}
```
