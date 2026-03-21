# wasmVM/WasmCore: Tool Completeness & Shell Migration

## Technical Specification v2.0

**Date:** March 16, 2026
**Status:** Partially complete — tool additions done (US-001–US-019), PRD refocused to stability/testing. Multicall architecture superseded by standalone binaries (see `wasmvm-dynamic-modules.md`).
**Supersedes:** `wasmvm-post-mvp.md` (v1.1), `wasmvm-tool-parity.md` (v1.2)
**Active PRD:** `prd.json` — remaining work is stability, bug fixes, and test coverage (US-020–US-029). New tool additions (xan, find enhancements, feature flags) deferred to `notes/todo.md`.

---

## 1. Overview

This spec is the single source of truth for all remaining work on the wasmVM/WasmCore runtime. It covers three major workstreams:

1. **Rust shell** — Replace the TypeScript shell (tokenizer, parser, evaluator) with a Rust implementation compiled into the WASM binary, and delete `shell.ts`.
2. **Tool replacements** — Replace all custom implementations (grep, sed, find, 22 builtins) with established Rust crate alternatives using the `cargo vendor` + `.patch` integration pattern.
3. **New tools** — Add 19 missing commands to reach full just-bash parity (excluding Python and JavaScript runtimes).

It also carries forward non-redundant infrastructure items from the post-MVP spec (v1.1).

### 1.1 What This Replaces

**From `wasmvm-post-mvp.md` (v1.1):**

| Section | Status | Reason |
|---------|--------|--------|
| 2.1 Browser subprocess spawn race | **Carried forward** (Section 8.1) | Infrastructure fix, still needed |
| 2.2 VFS changes lost from pipeline stages | **Carried forward** (Section 8.2) | Infrastructure fix, still needed |
| 2.3 Pipe race condition | **Carried forward** (Section 8.3) | Infrastructure fix, still needed |
| 3.1 Fix dup() cursor sharing | **Carried forward** (Section 8.4) | Infrastructure fix, still needed |
| 3.2 Fix sed case-insensitive flag | **Dropped** | Replacing sed entirely (Section 4.2) |
| 3.3 Command substitution | **Dropped** | Rust shell implements this natively (Section 2) |
| 3.4 Atomics.wait timeouts | **Done** | Commit `0e61e1e` |
| 3.5 String-based error matching | **Done** | Commit `302b4f7` |
| 4.1 Unlock more uutils commands | **Superseded** | Covered by Section 4.4 (vendor+patch for all builtins) |
| 4.2 grep integration tests | **Superseded** | Replacing grep entirely (Section 4.1) |
| 4.3 Expand coreutils tests | **Carried forward** (Section 8.8) | Testing always needed |
| 4.4 Expand subprocess tests | **Carried forward** (Section 8.8) | Testing always needed |
| 4.5 Add Rust unit tests | **Superseded** | Custom implementations being replaced; new wrappers get new tests |
| 4.6 wasm-opt and Makefile | **Carried forward** (Section 8.5) | Build tooling, still needed |
| 4.7 Glob symlink loop protection | **Dropped** | Rust shell handles glob expansion (Section 2) |
| 4.8 Process table cleanup | **Carried forward** (Section 8.6) | Infrastructure fix, still needed |
| 4.9 FD reclamation | **Carried forward** (Section 8.7) | Infrastructure fix, still needed |
| 5.1 sleep host callback | **Carried forward** (Section 8.9) | Still needed |
| 5.2 chmod full POSIX mode bits | **Superseded** | `uu_chmod` via vendor+patch (Section 4.4) |
| 5.3 ls -l | **Superseded** | `uu_ls` via vendor+patch (Section 4.4) |
| 5.4 Browser worker ENOSYS | **Carried forward** (Section 8.10) | Quick fix, still needed |
| 5.5 logname fix | **Superseded** | Trivial fix, do alongside builtin replacement |
| 5.6–5.9 Shell features (here-doc, tilde, case, arith) | **Dropped** | Rust shell implements all of these (Section 2) |
| 5.10 find predicates (-exec, -mtime, -size) | **Carried forward** (Section 4.3) | Still needed |
| Section 6 POSIX compliance roadmap | **Dropped** | Rust shell covers this (Section 2.4) |
| Section 9 Streaming I/O | **Carried forward** (Section 8.11) | Architecture improvement, still needed |

### 1.2 Current State

| Metric | Value |
|--------|-------|
| WASM binary size | 6.35 MB |
| Commands wired | 88 (73 functional + 15 stubs) |
| JS host LOC | ~6,864 lines across 13 modules |
| Rust LOC | ~4,500 lines across 15 files |
| Custom implementations to replace | 5 files, ~3,100 lines |
| Builtins to replace with uutils | 22 commands in builtins.rs |
| Missing commands (just-bash parity) | 19 |

### 1.3 License Constraint

All new dependencies MUST be Apache-2.0 compatible (Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense, Zlib, CC0-1.0). No GPL, LGPL, AGPL, or copyleft-licensed packages. See Appendix A for verification checklist.

---

## 2. Rust Shell — Replacing `shell.ts`

### 2.1 Motivation

The current shell is implemented in TypeScript (`host/src/shell.ts`, 1,825 lines) as a tokenizer, parser, and evaluator. It handles pipes, redirects, variable expansion, command substitution, glob expansion, control flow (if/for/while/until), and function definitions. Moving this to Rust:

- Eliminates the largest piece of pure computation from the JS host layer
- Enables the shell to dispatch commands in-process via the multicall dispatch table (no Worker round-trip for simple commands)
- Makes pipeline setup use the same `proc_spawn` / `fd_pipe` / `proc_waitpid` mechanism that all other subprocess operations use
- Brings POSIX compliance improvements for free when using a battle-tested implementation
- Reduces JS host to ~5,000 lines of pure host-runtime glue (Workers, Atomics, VFS, WASI polyfill)

### 2.2 Implementation: `brush-shell`

**Tool:** [`brush-shell`](https://github.com/reubeno/brush) — a bash-compatible shell written in pure Rust.

- **License:** MIT (Apache-2.0 compatible)
- **Compatibility target:** bash 5.x
- **Architecture:** Lexer → Parser → AST → Evaluator
- **Features:** Full bash syntax including pipes, redirects, variable/parameter expansion, command substitution, here-documents, arithmetic expansion, glob/tilde/brace expansion, control flow (if/for/while/until/case), functions, traps, and more

brush-shell is the only shell implementation we will use. No custom shell crate, no other shell. brush-shell is aliased as both `sh` and `bash` — it is the primary and sole shell for the entire system.

**Integration approach — try tiers in order:**

**Try Tier 1 first:** Add brush-shell as a direct dependency. If it compiles for `wasm32-wasip1` out of the box, we're done.

**Try Tier 2 if Tier 1 fails:** Vendor brush-shell, apply `.patch` files for WASI compatibility:
- Stub or remove signal handling (`SIGINT`, `SIGTERM`, etc.)
- Stub or remove job control (`fg`, `bg`, `jobs`)
- Stub or remove terminal handling (`termios`, `tcgetattr`)
- `#[cfg(target_os = "wasi")]` fallbacks for platform-specific code
- Expose entry point: `pub fn shell_main(args: impl Iterator<Item=OsString>) -> i32`

**Escalate to Tier 3 (full fork) if patches are too invasive:** brush-shell likely uses `tokio` or `async-std` for its execution model. If ripping that out requires structural changes across many files (not just small `#[cfg]` stubs), maintain a full fork with a `wasi` branch. This is the expected outcome given the complexity of a bash-compatible shell.

**Integration as multicall command:**

```rust
// In dispatch.rs — brush-shell is aliased as both sh and bash
"sh" | "bash" => brush_shell::shell_main(args.into_iter()),
```

### 2.3 Child Process Support

The shell MUST be able to spawn child processes. This is how pipelines, command substitution, and subshells work. brush-shell uses `std::process::Command` internally to execute external commands — in our patched Rust stdlib, this routes to `host_process.proc_spawn`, which spawns a new Worker running the WASM binary.

**How the full execution flow works:**

```
User code:
  os.exec("ls -la | grep foo | wc -l")

JS host (wasm-os.ts):
  → spawns Worker with: command="sh", args=["-c", "ls -la | grep foo | wc -l"]

WASM Worker:
  → dispatch("sh", ["-c", "ls -la | grep foo | wc -l"])
  → brush-shell parses the command into a pipeline AST

brush-shell evaluator:
  1. Creates pipes:
     - pipe_a = fd_pipe()   // ls stdout → grep stdin
     - pipe_b = fd_pipe()   // grep stdout → wc stdin

  2. Spawns child for each pipeline stage:
     - proc_spawn("coreutils.wasm", ["ls", "-la"])
         with stdout = pipe_a.write_fd
     - proc_spawn("coreutils.wasm", ["grep", "foo"])
         with stdin = pipe_a.read_fd, stdout = pipe_b.write_fd
     - proc_spawn("coreutils.wasm", ["wc", "-l"])
         with stdin = pipe_b.read_fd

  3. Waits for all children:
     - proc_waitpid(pid_ls)
     - proc_waitpid(pid_grep)
     - proc_waitpid(pid_wc)

  4. Returns last stage's exit code
```

**Each `proc_spawn` call:**
- Goes through our patched `std::process::Command`
- Calls the `host_process.proc_spawn` WASI import
- The JS host receives this, spawns a new Worker with the WASM binary
- The new Worker runs `dispatch("ls", ["-la"])` (or grep, wc, etc.)
- Ring buffers (SharedArrayBuffer) connect the pipe FDs between Workers
- `proc_waitpid` blocks via `Atomics.wait` until the child exits

**For simple commands (no pipes):**

brush-shell can optimize by calling `dispatch::run()` directly within the same WASM process, avoiding a Worker round-trip. This requires a small patch to brush-shell's command execution path to check if the command exists in the multicall dispatch table before falling back to `std::process::Command`.

```rust
// In brush-shell's command executor (patched)
fn execute_simple_command(&self, cmd: &str, args: &[OsString]) -> i32 {
    // Fast path: dispatch in-process if it's a multicall command
    if is_multicall_command(cmd) {
        return dispatch::run(cmd, args.to_vec());
    }
    // Slow path: spawn child process (pipelines, background, etc.)
    std::process::Command::new(cmd).args(args).status()...
}
```

**For command substitution (`$(...)`):**
- brush-shell spawns a child process, captures its stdout
- Same mechanism: `proc_spawn` + `fd_pipe` + `proc_waitpid`
- stdout is read from the pipe fd after the child exits

**For subshells (`(...)`):**
- brush-shell spawns a child process running `sh -c "inner commands"`
- The child gets a copy of the environment but changes don't propagate back

### 2.4 Shell Builtins (Must Be In-Shell)

These commands cannot be external — they modify shell state:

| Builtin | What it does |
|---------|-------------|
| `cd` | Change working directory (affects all subsequent commands) |
| `export` | Set/modify environment variables |
| `unset` | Remove environment variables |
| `readonly` | Mark variables as read-only |
| `alias` / `unalias` | Manage command aliases |
| `set` | Set shell options |
| `shift` | Shift positional parameters |
| `source` / `.` | Execute file in current shell context |
| `exec` | Replace current process |
| `eval` | Execute string as command |
| `read` | Read from stdin into variables |
| `test` / `[` / `[[` | Conditional evaluation (can be external, but faster as builtin) |
| `echo` | Can be external, but commonly a builtin for performance |
| `true` / `false` | Can be external, but commonly builtins |
| `type` / `command` / `which` | Query command resolution |
| `exit` | Exit shell |
| `return` | Return from function |
| `break` / `continue` | Loop control |
| `trap` | Signal/exit handlers |
| `history` | Command history |
| `help` | Built-in help |
| `clear` | Clear terminal (if supported) |
| `time` | Time command execution |

### 2.5 Host Layer Changes

**Files deleted:**
- `host/src/shell.ts` (1,825 lines) — entirely replaced by Rust shell

**Files simplified:**
- `host/src/wasm-os.ts` — `exec()` becomes: spawn shell Worker with `["-c", command]`, wait for exit, return result. No more AST parsing or evaluation in JS.
- `host/src/pipeline.ts` — Pipeline orchestration logic moves into the Rust shell. The JS `PipelineOrchestrator` may still be needed for the host-side Worker spawning that `proc_spawn` triggers, but the command-level orchestration (which stages to run, how to connect them) is now in Rust.

**Files unchanged:**
- `host/src/wasi-polyfill.ts` — still needed (WASI syscall translation)
- `host/src/vfs.ts` — still needed (in-memory filesystem)
- `host/src/process.ts` — still needed (Worker spawning, Atomics sync)
- `host/src/ring-buffer.ts` — still needed (inter-Worker pipes)
- `host/src/worker-adapter.ts` — still needed (browser/Node abstraction)
- `host/src/worker-entry.ts` — still needed (WASM bootstrap)
- `host/src/fd-table.ts` — still needed (FD management)
- `host/src/user.ts` — still needed (user identity)

**Net JS reduction:** ~2,000+ lines removed, host layer drops from ~6,864 to ~5,000 lines.

### 2.6 What Stays in TypeScript

The following MUST remain in JavaScript because they depend on browser/Node.js APIs:

| Component | Lines | Why it stays |
|-----------|-------|-------------|
| `wasi-polyfill.ts` | 1,630 | VFS dependency, `Date.now()`, `crypto.getRandomValues()` |
| `process.ts` | 857 | Worker threads, Atomics, WASM instantiation |
| `vfs.ts` | 688 | Snapshot/merge architecture, JSON serialization across WASM boundary |
| `fd-table.ts` | 398 | Tightly coupled to WASI polyfill |
| `pipeline.ts` | 292 | Worker spawning, `Promise.all`, SharedArrayBuffer creation |
| `worker-entry.ts` | 242 | `WebAssembly.instantiate()`, host import construction |
| `worker-entry.browser.ts` | 212 | Browser-specific WASM init |
| `ring-buffer.ts` | 190 | JavaScript `Atomics` API |
| `worker-adapter.ts` | 188 | Browser/Node Worker duality |
| `user.ts` | 175 | Small, integrated with FD table |
| `wasm-os.ts` | 159 | Public API entry point |
| `index.ts` | 8 | Module export |

These are all host-runtime concerns — Worker management, SharedArrayBuffer, Atomics, WASM instantiation, browser/Node compatibility. Pure computation (parsing, evaluation) moves to Rust; host glue stays in JS.

---

## 3. Dependency Integration Pattern

All crate integrations follow a three-tier pattern, escalating as needed. The guiding principle is: **never reimplement CLI arg parsing**. If a crate already has a command-line interface, use it — patch or fork to expose the entry point, don't wrap its library internals with custom arg parsing.

### 3.1 Tier 1 — Direct Dependency

Crate already compiles for `wasm32-wasip1` and exposes `uumain()` or equivalent entry point. Just add to `Cargo.toml` and wire in dispatch.

**Examples:** All currently-working `uu_*` crates (base64, basename, comm, cut, etc.), `awk-rs`, `jaq-core`.

### 3.2 Tier 2 — `cargo vendor` + `.patch`

Crate doesn't compile for WASI out of the box, or doesn't expose a library entry point. Vendor the source, apply small `.patch` files to fix WASI incompatibilities and/or expose the `main` function as a callable entry point.

**This is the default for most tools.** The patch is typically:
- A few lines to stub signals, terminal handling, or mmap
- A `pub fn` wrapper around `main` so we can call it from the dispatch table
- `#[cfg(target_os = "wasi")]` fallbacks for platform-specific code

**Workflow:**
```
cargo vendor vendor/
scripts/patch-vendor.sh        # applies patches/crates/*/*.patch
cargo build --frozen ...       # build with vendored+patched sources
```

**Convention:**
- Patch files: `patches/crates/<crate-name>/0001-description.patch`
- `vendor/` is gitignored — only `.patch` files are committed
- Patches must apply against the crates.io published layout (what `cargo vendor` produces)

**Examples:** `uu_cat`, `uu_head`, `uu_ls`, `uu_sort`, ripgrep, `uu_sed`.

### 3.3 Tier 3 — Full Fork

Crate requires changes too extensive or invasive for `.patch` files — e.g., ripping out an async runtime, rewriting the process execution model, stubbing out an entire subsystem. Maintain a fork under our org with a `wasi` branch.

**When to escalate from Tier 2 to Tier 3:**
- Patches exceed ~500 lines or touch > 20 files
- Changes are structural (not just `#[cfg]` fallbacks) — e.g., replacing tokio with synchronous execution
- Patches conflict with each other or create maintenance nightmares across version bumps
- The crate's architecture fundamentally assumes capabilities WASI doesn't have (signals, async I/O, process groups)

**Convention:**
- Fork lives at `github.com/<our-org>/<crate-name>` with a `wasi` branch
- Reference via git dependency in `Cargo.toml`: `brush-shell = { git = "...", branch = "wasi" }`
- Keep the `wasi` branch rebased on upstream releases where practical
- Document what changed and why in a `WASI.md` in the fork

**Expected forks:** `brush-shell` (see Section 2.2).

### 3.4 C-Link via wasi-sdk (special case)

For tools with no Rust equivalent. Compile C source with wasi-sdk, link into binary via `build.rs`. Rename `main` → `<tool>_main` to avoid symbol conflict.

**Examples:** SQLite amalgamation (public domain).

### 3.5 Why No "Library Sub-Crates + Wrapper" Tier

Some crates (e.g., ripgrep) publish library sub-crates (`grep-regex`, `grep-searcher`, `grep-printer`). In theory, we could write a thin CLI wrapper using these libraries. In practice, this means re-implementing argument parsing and CLI behavior — which is exactly what the upstream binary already does. It's less work and more correct to vendor+patch the binary crate and expose its `main` as a library entry point. This keeps us on the upstream's CLI behavior with zero divergence.

### 3.5 Files to Create

| File | Purpose |
|------|---------|
| `wasmcore/.cargo/config.toml` | Tell Cargo to use `vendor/` |
| `wasmcore/scripts/patch-vendor.sh` | Apply crate patches to vendored sources |
| `wasmcore/patches/crates/` | Directory for crate patches (initially empty) |
| `wasmcore/.gitignore` update | Add `vendor/` |
| `wasmcore/Makefile` update | Add `vendor` and `patch-vendor` targets |

---

## 4. Custom Implementation Replacements

### 4.1 grep/rg → ripgrep (vendor+patch)

**Current:** `grep.rs` (444 lines, ~70% complete). Missing recursive search, context lines (-A/-B/-C), color output, binary file handling.

**Replacement:** Vendor+patch ripgrep (Tier 2). Expose its `main` as a callable entry point. Build without PCRE2 (`--no-default-features`), disable mmap.

**Patches needed:**
- Expose entry: `pub fn rg_main(args: impl Iterator<Item=OsString>) -> i32`
- Disable mmap (not available in WASI): feature gate or `#[cfg(target_os = "wasi")]` fallback to buffered I/O
- Stub terminal width detection (used for `--color` and column formatting)

**Dispatch:**
- `"rg" => ripgrep::rg_main(args.into_iter())` — ripgrep's native CLI
- `"grep" | "egrep" | "fgrep"` — ripgrep supports POSIX grep behavior via `--pcre2` flags and BRE/ERE mode. If ripgrep's POSIX compatibility is sufficient, wire these to ripgrep with appropriate default flags. If not, keep a minimal POSIX `grep` shim that translates POSIX flags to ripgrep equivalents.

**License:** MIT/Unlicense. Confirmed compatible.

**What gets deleted:** All of `grep.rs` (444 lines) once ripgrep handles both `rg` and `grep` dispatch.

### 4.2 sed → uutils/sed

**Current:** `sed.rs` (942 lines, ~65% complete). Missing hold space (h/H/g/G/x), labels/branching (: b t), read/write (r/w), extended addresses.

**Replacement:** `uutils/sed` (Tier 1 or 3).

**Integration approach:**
1. Add `uu_sed` as git dependency (pin to specific rev):
   ```toml
   uu_sed = { git = "https://github.com/uutils/sed", rev = "<pin>" }
   ```
2. Update dispatch: `"sed" => uu_sed::uumain(args.into_iter())`
3. Build for `wasm32-wasip1`. If compilation fails, vendor+patch (Tier 3).

**License:** uutils/sed is MIT. Confirmed compatible.

**What gets deleted:** Entire `sed.rs` (942 lines), `mod sed;` from `main.rs`.

### 4.3 find → Enhanced Custom Implementation

**Current:** `find.rs` (540 lines, ~50% complete). Missing -exec, -mtime, -size, -perm, -delete, -prune.

**Why not fd-find:** fd's CLI (`fd PATTERN [PATH]`) is incompatible with POSIX `find PATH [EXPRESSION]`. Different tool entirely.

**Enhancement plan:**
1. Add `-exec CMD {} \;` and `-exec CMD {} +` — use `std::process::Command` (routes to `proc_spawn`)
2. Add `-mtime N` — compare `metadata.modified()` against current time (`+N` older, `-N` newer)
3. Add `-size N` — compare `metadata.len()` (`Nc` bytes, `Nk` KiB, `NM` MiB, `+N` larger, `-N` smaller)
4. Add `-perm mode` — compare against VFS mode bits
5. Add `-delete` — call `std::fs::remove_file` or `std::fs::remove_dir`
6. Add `-prune` — skip directory subtree

**Optionally:** Use `ignore` crate (MIT/Unlicense) for directory walking to get `.gitignore` support and better performance.

**What gets modified:** `find.rs` expanded from ~540 to ~800 lines with new predicates.

### 4.4 Builtins → uutils via Vendor+Patch

**Current:** `builtins.rs` (1,207 lines) contains 22 minimal implementations. Most are 40–60% complete — missing important flags, formatting options, and POSIX compliance.

**Replacement:** Use patched uutils crate versions for each command. The uutils crates currently fail to compile for WASI because of platform-specific features in `uucore` (mode, entries, fsext, perms). The vendor+patch approach lets us fix these with small surgical patches.

**uucore patches needed (apply once, unlock many crates):**

| Feature | Patch | Unlocks |
|---------|-------|---------|
| `mode` | Stub `libc::umask` → return `0o022`; stub `libc::chmod` → WASI fd ops | `uu_chmod`, `uu_cp`, `uu_install`, `uu_mkdir` |
| `entries` | Implement `getpwuid`/`getpwnam` via `host_user.getpwuid` | `uu_stat`, `uu_id`, `uu_csplit` |
| `fsext` | Stub `statfs`/`statvfs` → reasonable defaults | `uu_df`, `uu_du` |
| `perms` | Stub `chown`/`chgrp` as no-ops (single-user system) | `uu_chgrp`, `uu_chown` |

**Per-crate patches needed:**

| Crate | Issue | Patch |
|-------|-------|-------|
| `uu_cat` | `platform::is_unsafe_overwrite` uses Unix-specific stat | Add `#[cfg(target_os = "wasi")]` fallback |
| `uu_head` | File-watching backend uses inotify | Disable file-watching for WASI |
| `uu_tail` | Same file-watching issue as head | Disable file-watching for WASI |
| `uu_sort` | Uses `mmap` for large files | Disable mmap, use buffered I/O |
| `uu_ls` | Complex filesystem operations, color | Add WASI stat fallbacks |
| `uu_cp` | Uses `sendfile`/`copy_file_range` | Fall back to buffered copy |
| `uu_mv` | Uses `rename` with cross-device fallback | Simplify for VFS |
| `uu_rm` | Uses `openat` for safe removal | Fall back to simple unlink |
| `uu_stat` | Platform-specific stat fields | Stub missing fields |

**Commands to migrate from builtins.rs to uutils:**

| Command | Current (builtin) | Target (uutils) | Priority |
|---------|-------------------|------------------|----------|
| cat | basic, no flags | full GNU cat | high |
| chmod | numeric only | symbolic + numeric | high |
| cp | basic copy | recursive, -a, -p, -r | high |
| dd | minimal | full block device ops | medium |
| head | -n only | -c, -q, -v | high |
| ln | basic | -s, -f, -r | medium |
| ls | -a only | -l, -R, -S, -t, --color | high |
| mkdir | basic | -p, -m | medium |
| mktemp | basic | -d, -p, -t, --suffix | medium |
| mv | basic | -f, -i, -n | medium |
| rm | basic | -r, -f, -i | high |
| sleep | busy-wait | proper (with host callback) | medium |
| sort | -r, -n, -u only | -k, -t, -f, -s, -M | high |
| stat | minimal | -c format, -f, -L | medium |
| tac | basic | -s separator | low |
| tail | -n only | -c, -f, -q, -v | high |
| test/[ | core ops | -nt, -ot, complex nesting | medium |
| touch | basic | -a, -m, -t, -d, -r | medium |
| logname | hardcoded "nobody" | use configured user | low |
| pathchk | basic | full POSIX | low |
| tsort | basic | full | low |
| whoami | basic | adequate as-is | low |

**What gets deleted:** Most of `builtins.rs` (~1,000 lines). Keep only commands that don't have uutils equivalents or are too simple to warrant a crate (`spawn-test`, and any remaining stubs).

---

## 5. New Tools — just-bash Parity

See `docs/compatibility-matrix.md` for the complete status of all commands. This section covers the 19 commands currently missing.

### 5.1 Tier 1 — Trivial Builtins (no new dependencies)

#### `rev` — Reverse Lines
- Read lines, reverse chars (UTF-8 aware), print. ~20 lines.
- API: `rev [file ...]`

#### `strings` — Find Printable Strings
- Scan binary files for printable ASCII runs >= 4 chars.
- API: `strings [-a] [-n min-len] [-t {d,o,x}] [file ...]`
- ~40 lines.

#### `column` — Columnate Lists
- Format stdin into columns. Table mode (`-t`) splits on delimiter, computes column widths, pads.
- API: `column [-t] [-s sep] [-o output-sep] [file ...]`
- ~50 lines.

### 5.2 Tier 2 — Small Builtins

#### `du` — Disk Usage
- Recursive `fs::metadata` walk, sum sizes.
- API: `du [-s] [-h] [-a] [-c] [-d depth] [path ...]`
- Replace current stub in dispatch.rs.
- ~80 lines. No new deps.

#### `expr` — Expression Evaluation
- Recursive-descent parser for POSIX `expr` grammar.
- Why not `uu_expr`: depends on `onig` (C regex library, WASM-incompatible).
- Operators: `|`, `&`, `=`, `!=`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `%`, `:`.
- Uses `regex` crate (already a dependency) for `:` operator.
- ~120 lines.

#### `file` — File Type Detection
- Magic byte detection + text/binary heuristic + extension fallback.
- API: `file [-b] [-i] [-L] [file ...]`
- **New dep:** `infer` crate (MIT, ~30KB, pure Rust). Covers ~100 file types via magic bytes.
- ~60 lines.

#### `tree` — Directory Tree Display
- Recursive walk with box-drawing characters.
- API: `tree [-a] [-d] [-L level] [-I pattern] [--noreport] [directory ...]`
- Reuse glob-to-regex from `find.rs` for `-I`.
- ~80 lines. No new deps.

#### `split` — Split Files
- Try `uu_split` first (Tier 1). If WASI-incompatible, custom builtin.
- API: `split [-l lines] [-b bytes] [-n chunks] [-a suffix-len] [file [prefix]]`
- ~60 lines if custom. No new deps.

### 5.3 Tier 3 — Library Wrappers

#### `rg` — ripgrep
- Fork ripgrep, expose main as library entry (Tier 3: vendor+patch).
- Build without PCRE2, disable mmap.
- **Deps:** `grep-regex`, `grep-searcher`, `grep-printer`, `grep-cli` (all MIT/Unlicense).
- Estimated +200–400KB WASM.

#### `diff` — File Comparison
- Use `similar` crate for Myers diff algorithm.
- Implement unified (`-u`), context (`-c`), normal, and side-by-side (`-y`) output formats.
- API: `diff [-u] [-c] [-y] [-r] [-q] [-N] [-i] [-w] [-B] file1 file2`
- Exit codes: 0 (same), 1 (different), 2 (error).
- **New dep:** `similar` (MIT/Apache-2.0, pure Rust).
- ~200 lines. Estimated +50–80KB WASM.

#### `gzip` / `gunzip` / `zcat` — Compression
- Single implementation, behavior determined by `argv[0]`.
- Use `flate2` with `miniz_oxide` backend (pure Rust).
- API: `gzip [-d] [-c] [-k] [-f] [-1..9] [file ...]`
- **New dep:** `flate2` (MIT/Apache-2.0) with feature `rust_backend`.
- ~150 lines. Estimated +80–120KB WASM.

#### `tar` — Archive
- Use `tar` crate for archive read/write, chain with `flate2` for `-z`.
- API: `tar {-c|-x|-t} [-f archive] [-z] [-v] [-C dir] [--strip-components=N] [file ...]`
- **New dep:** `tar` (MIT/Apache-2.0, pure Rust). Shares `flate2` with gzip.
- ~120 lines. Estimated +40–60KB WASM.

#### `xargs` — Build and Execute Commands
- Read stdin items, build command invocations, execute via `proc_spawn`.
- API: `xargs [-0] [-n max-args] [-I replace-str] [-P max-procs] [-t] [-r] [command [args]]`
- Same shim pattern as `env`, `timeout`.
- ~100 lines. Uses `wasi-ext` (already present).

### 5.4 Tier 4 — Data Processing

#### `yq` — YAML/XML/TOML Processor
- Parse input format (auto-detect or `-p {yaml,xml,toml,json}`), convert to `serde_json::Value`, run through `jaq-core` filter engine (already linked), output in requested format.
- API: `yq [OPTIONS] <EXPRESSION> [file ...]` (mikefarah/yq compatible)
- **New deps:** `serde_yaml` (MIT/Apache-2.0), `quick-xml` (MIT), `toml` (MIT/Apache-2.0).
- ~200 lines. Estimated +150–250KB WASM.

#### `xan` — CSV Processor
- Fork `medialab/xan` (MIT) or `BurntSushi/xsv` (MIT/Unlicense), expose main as library entry.
- Subcommands: select, search, filter, sort, count, headers, frequency, slice, fmt, cat, join, stats, table.
- **New dep:** `xan` or `xsv` fork, `csv` (MIT/Unlicense).
- Estimated +200–300KB WASM.

### 5.4a Deferred — Not in Current Scope

The following tools require significant architectural work (C-link build pipeline, host network bridge) and are deferred to a future spec:

- **sqlite3** — Requires C-link via wasi-sdk (no pure-Rust SQLite exists). Needs custom VFS shim for WASI file I/O. Estimated +600–800KB WASM.
- **curl** — Requires a new `host_net` WASI extension module for network access. WASM cannot do sockets. Needs host-side `fetch()` bridge.
- **html-to-markdown** — Depends on curl for URL fetching. The `htmd` crate (MIT, pure Rust) would handle conversion, but the network bridge is the blocker.

---

## 6. Feature Flags

The multicall binary uses Cargo feature flags to control which tool groups are compiled in. All features are **enabled by default**. Consumers who need a smaller binary can disable features they don't need.

### 6.1 Cargo.toml Feature Configuration

```toml
[features]
default = ["core", "text", "checksums", "compression", "data", "shell"]

# Core file operations + system utilities
# cat, cp, ls, mkdir, mv, rm, stat, touch, ln, dd, chmod, du, ...
core = ["uu_cat", "uu_cp", "uu_ls", "uu_mkdir", "uu_mv", "uu_rm", ...]

# Text processing tools
# grep/rg, sed, awk, diff, head, tail, sort, cut, tr, uniq, wc, ...
text = ["dep:ripgrep", "dep:uu_sed", "dep:awk-rs", "dep:similar", ...]

# Checksum and encoding tools
# md5sum, sha256sum, base64, b2sum, cksum, ...
checksums = ["uu_md5sum", "uu_sha256sum", "uu_base64", "uu_b2sum", ...]

# Compression and archive tools
# gzip, gunzip, zcat, tar
compression = ["dep:flate2", "dep:tar"]

# Data processing tools
# jq, yq, xan
data = ["dep:jaq-core", "dep:serde_yaml", "dep:quick-xml", "dep:toml"]

# Shell (brush-shell)
# sh, bash
shell = ["dep:brush-shell"]
```

### 6.2 Dispatch Table Integration

The dispatch table uses `#[cfg(feature = "...")]` to conditionally compile command entries:

```rust
pub fn run(cmd: &str, args: Vec<OsString>) -> i32 {
    match cmd {
        #[cfg(feature = "core")]
        "cat" => uu_cat::uumain(args.into_iter()),

        #[cfg(feature = "text")]
        "grep" => ripgrep::rg_main(args.into_iter()),

        #[cfg(feature = "compression")]
        "gzip" | "gunzip" | "zcat" => gzip::gzip(args),

        #[cfg(feature = "shell")]
        "sh" | "bash" => brush_shell::shell_main(args.into_iter()),

        // Commands not behind a feature flag (always available)
        "true" => uu_true::uumain(args.into_iter()),
        "false" => uu_false::uumain(args.into_iter()),

        _ => {
            eprintln!("{}: command not found", cmd);
            127
        }
    }
}
```

### 6.3 Feature Flag Design Principles

- **Default = everything.** `cargo build` with no flags produces the full binary. This is the happy path.
- **Feature groups, not individual commands.** Flags control logical groups (core, text, compression), not individual tools. Nobody wants to toggle `uu_basename` independently.
- **Minimal commands are always on.** `true`, `false`, `echo`, `printf`, `test` — trivially small, universally needed, not worth gating.
- **Shell is a feature.** Consumers embedding wasmVM as a library may dispatch commands directly without a shell. The `shell` feature lets them opt out of brush-shell's binary size.
- **Feature flags only gate Cargo dependencies and dispatch entries.** No runtime feature detection. If a feature is compiled out, the command returns "command not found" — same as any unknown command.

---

## 7. Estimated Impact

| Metric | Current | After this spec |
|--------|---------|-----------------|
| Dispatch commands (functional) | 73 | 105+ |
| Stubs | 15 | 5–8 (WASM-impossible only) |
| Custom Rust LOC | ~3,100 (grep+sed+find+builtins) | ~500 (find enhanced + new builtins) |
| JS host LOC | ~6,864 | ~5,000 (shell.ts deleted) |
| New Rust crates | — | 8–10 |
| New C dependencies | 0 | 0 (sqlite3 deferred) |
| WASM binary size (full, est.) | 6.35 MB | 9–13 MB |
| WASM binary size (minimal, est.) | — | ~4 MB (core only, no shell/compression/data) |
| Host imports (new) | 0 | 0 (host_net deferred) |

Binary size stays well within the 25 MB target. Feature flags let consumers trade size for coverage.

---

## 7. Implementation Phases

### Phase 1 — Foundation (vendor+patch infrastructure)

**Goal:** Set up the vendor+patch build pipeline so all subsequent work can use it.

1. Create `wasmcore/.cargo/config.toml`, `scripts/patch-vendor.sh`, `patches/crates/`
2. Update `Makefile` with `vendor`, `patch-vendor`, and `patch-check` targets
3. Add `vendor/` to `.gitignore`
4. Verify: `make wasm` works with vendored dependencies (zero patches initially)
5. Update `CLAUDE.md` with dependency patching conventions

### Phase 2 — Rust Shell (brush-shell)

**Goal:** Replace the TypeScript shell with brush-shell compiled to WASM. This is the highest-risk, highest-value item — do it first so we discover blockers early and everything else builds on a working shell.

1. Attempt Tier 1: add brush-shell as direct dependency, try `wasm32-wasip1` build
2. If Tier 1 fails: vendor brush-shell, create WASI compatibility patches (stub signals, job control, terminal handling, async runtime)
3. If patches are too invasive (>500 lines, structural changes): escalate to Tier 3 full fork with `wasi` branch
4. Expose entry point: `pub fn shell_main(args) -> i32`
5. Add in-process dispatch optimization: check multicall table before falling back to `proc_spawn`
6. Wire in dispatch: `"sh" | "bash" => brush_shell::shell_main(args)`
7. Update `wasm-os.ts` to spawn shell Worker instead of parsing in JS
8. Delete `host/src/shell.ts`
9. Simplify `pipeline.ts` (remove shell-level orchestration)
10. Verify child process support: pipelines, command substitution, subshells all use `proc_spawn` + `fd_pipe` + `proc_waitpid`
11. Run full test suite — shell change affects everything

**Timebox:** If brush-shell isn't compiling for WASI within a few focused days, reassess before sinking more time.

### Phase 3 — Builtin Replacements (uutils via vendor+patch)

**Goal:** Replace the 22 minimal builtins with full uutils implementations.

1. Patch `uucore` for WASI (`mode`, `entries`, `fsext`, `perms` features)
2. Start with highest-value batch: `uu_cat`, `uu_head`, `uu_tail`, `uu_sort`, `uu_ls` — validate the patch workflow is smooth
3. Wire new crates in `dispatch.rs`, remove corresponding `builtins::` entries
4. Integration test each replaced command
5. Sweep remaining builtins: `cp`, `mv`, `rm`, `mkdir`, `chmod`, `stat`, `touch`, `ln`, `mktemp`, `dd`, `tac`
6. Delete replaced code from `builtins.rs`

### Phase 4 — grep and sed Replacement

**Goal:** Replace custom grep and sed with established crate implementations.

1. **grep/rg:** Vendor+patch ripgrep, expose main, wire as `rg`. Evaluate POSIX `grep` compatibility — if ripgrep can't cover BRE/ERE edge cases, keep a minimal POSIX shim. Delete `grep.rs` if fully replaced.
2. **sed:** Add `uu_sed` dep. If WASI-incompatible, vendor+patch. Replace dispatch entry. Delete `sed.rs`.
3. Integration test both replacements against existing test suite.

### Phase 5 — Trivial New Tools

**Goal:** Add the easy wins for just-bash parity.

1. Implement `rev`, `strings`, `column` in `builtins.rs` (or a new `extras.rs`)
2. Implement `du` (replace stub), `expr`, `file`, `tree`, `split`
3. Wire all in `dispatch.rs`
4. Update compatibility matrix

### Phase 6 — Compression and Archive

**Goal:** Add gzip/gunzip/zcat/tar — frequently used and dependency-free.

1. Add `flate2` (with `rust_backend`) and `tar` crate deps
2. Implement `gzip.rs` (single file, argv[0] determines mode)
3. Implement `tar.rs`
4. Wire `gzip`, `gunzip`, `zcat`, `tar` in dispatch

### Phase 7 — diff, rg, xargs

**Goal:** Add high-value tools that depend on infrastructure from earlier phases.

1. **diff:** Add `similar` dep, implement `diff.rs` with unified/context/normal output
2. **rg:** Vendor+patch ripgrep, expose main, wire in dispatch (may already be done in Phase 4)
3. **xargs:** Implement as shim using `proc_spawn`

### Phase 8 — Data Processing

**Goal:** Add yq, xan.

1. **yq:** Add `serde_yaml`, `quick-xml`, `toml` deps. Implement reusing `jaq-core` filter engine.
2. **xan:** Fork xsv/xan, vendor+patch, expose main

### Phase 9 — Feature Flags

**Goal:** Add Cargo feature flag system for modular builds.

1. Define feature groups in `multicall/Cargo.toml` (core, text, checksums, compression, data, shell)
2. Gate all dispatch entries with `#[cfg(feature = "...")]`
3. Gate all dependency declarations with `optional = true` + feature activation
4. Verify `cargo build --no-default-features --features core` produces a minimal binary
5. Verify `cargo build` (default features) produces the full binary
6. Document feature flags in README

### Phase 10 — Infrastructure Carryover

**Goal:** Address remaining items from post-MVP spec. Can be done in parallel with other phases.

Items detailed in Section 8.

---

## 8. Infrastructure (Carried from Post-MVP)

These items are independent of tool replacements and can be worked in parallel.

### 8.1 P0: Browser Subprocess Spawn Race Condition

**Problem:** `_spawnChild` in `process.ts` is async but called without await from `_procSpawn`. If WASM calls `proc_waitpid` immediately after `proc_spawn`, it blocks on a `SharedArrayBuffer` that will never be signaled.

**Fix:** Add a "ready" signal (`SharedArrayBuffer(4)`) to process table entries. Parent calls `Atomics.wait(readyBuffer, 0, 0)` after spawn. Child signals `Atomics.store(readyBuffer, 0, 1)` + `Atomics.notify()` after Worker is alive. Timeout: 5 seconds.

**Files:** `host/src/process.ts`

### 8.2 P0: VFS Changes Lost from Pipeline Stages

**Problem:** Only last stage's `vfsChanges` returned from pipelines. Intermediate stage writes (e.g., `tee output.txt`) are silently discarded.

**Fix:** Collect `vfsChanges` from every stage, merge sequentially (stage 1 first, then stage 2, etc.). Later stages overwrite earlier stages for same-path conflicts.

**Files:** `host/src/pipeline.ts`

### 8.3 P0: Pipe Race Condition in Inline Execution

**Problem:** `_executeInline` shares pipe buffers with mutable offsets between parent and child without synchronization.

**Fix:** Snapshot stdin data for inline child execution instead of sharing the pipe object.

**Files:** `host/src/process.ts`

### 8.4 P1: Fix `dup()` File Cursor Sharing

**Problem:** `dup(fd)` copies cursor value instead of sharing the same cursor. POSIX requires duped FDs to share the same file description (including offset).

**Fix:** Introduce `FileDescription` object with shared state and `refCount`. FD table entries point to `FileDescription` instead of storing cursor inline. `dup()` increments refCount on existing description.

**Files:** `host/src/fd-table.ts`

### 8.5 P2: wasm-opt and Makefile

**Problem:** `wasm-opt` not installed, optimization step skipped. `make host` not wired.

**Fix:** Add `wasm-opt-check` target, wire `host` target to `cd host && npm run build`, update `all` target.

**Files:** `wasmcore/Makefile`

### 8.6 P2: Process Table Cleanup

**Problem:** Process table entries leak if `waitpid` never called.

**Fix:** Add `Worker.onExit` handler marking processes as "zombie". Sweep zombies older than 60 seconds on each `proc_spawn`.

**Files:** `host/src/process.ts`

### 8.7 P2: FD Reclamation

**Problem:** `_nextFd` monotonically increases. Closed FDs never reused.

**Fix:** Maintain free list. On close, push FD to free list (if >= 3). On allocate, pop from free list first.

**Files:** `host/src/fd-table.ts`

### 8.8 P2: Expand Integration Tests

**Target:** 150+ new coreutils tests, 25+ subprocess tests. Test every functional command with at least one happy-path, one edge case, and one flags test.

**Files:** `host/test/coreutils.test.ts`, `host/test/subprocess.test.ts`

### 8.9 P3: sleep — Replace Busy-Wait

**Problem:** sleep uses `thread::yield_now()` busy loop.

**Fix:** Add `host_process.sleep_ms(ms)` import to wasi-ext. Host implements via `Atomics.wait(dummyBuffer, 0, 0, ms)`.

**Files:** `wasmcore/crates/wasi-ext/src/lib.rs`, `host/src/process.ts`, `wasmcore/crates/multicall/src/builtins.rs`

### 8.10 P3: Browser Worker ENOSYS

**Problem:** Stub `host_process` functions return `-1` instead of WASI errno `52` (ENOSYS).

**Fix:** Replace all `return -1` with `return 52` in stub functions.

**Files:** `host/src/worker-entry.browser.ts`

### 8.11 P3: Streaming I/O

**Problem:** Current API is entirely buffered (`exec()` returns complete stdout/stderr). No way to feed stdin incrementally or receive stdout while process runs.

**Fix:** Add `execStream()` returning a `StreamHandle` with `write()`, `closeStdin()`, `onStdout()`, `onStderr()`, `onExit()`, `kill()`, `wait()`. Uses SharedArrayBuffer + Atomics for stdin channel (same ring buffer pattern). Browser fallback: not available without SharedArrayBuffer.

**Files:** `host/src/wasm-os.ts`, `host/src/worker-entry.ts`, `host/src/wasi-polyfill.ts`

---

## 9. Success Criteria

This work is complete when:

1. **Shell:** TypeScript shell is deleted. Rust shell handles all parsing, evaluation, and command dispatch. All existing shell tests pass via the Rust implementation.
2. **Custom implementations:** `grep.rs` internals replaced with ripgrep libraries. `sed.rs` deleted (uutils/sed). `builtins.rs` reduced to < 200 lines (only WASM-specific stubs remain).
3. **just-bash parity:** All 76 `justBash: true` commands (minus python3, js-exec) are functional in dispatch table.
4. **Vendor+patch:** Build pipeline works: `cargo vendor` → `patch-vendor.sh` → `cargo build --frozen`.
5. **Compatibility matrix:** `docs/compatibility-matrix.md` shows all commands as `done` (except stubs for WASM-impossible operations and excluded runtimes).
6. **Infrastructure:** All P0 items fixed. All P1 items fixed. Test count exceeds 2,000.
7. **Binary size:** WASM binary < 15 MB (target 10–14 MB).
8. **JS host:** < 5,500 lines (down from ~6,864).

---

## Appendix A: Crate License Verification

Every dependency must be verified before import:

| Crate | License | Status |
|-------|---------|--------|
| `grep-regex` | MIT/Unlicense | OK |
| `grep-searcher` | MIT/Unlicense | OK |
| `grep-printer` | MIT/Unlicense | OK |
| `grep-cli` | MIT/Unlicense | OK |
| `uu_sed` (uutils/sed) | MIT | OK |
| `brush-shell` | MIT | OK |
| `similar` | MIT/Apache-2.0 | OK |
| `flate2` | MIT/Apache-2.0 | OK |
| `miniz_oxide` | MIT/Zlib/Apache-2.0 | OK |
| `tar` | MIT/Apache-2.0 | OK |
| `infer` | MIT | OK |
| `serde_yaml` | MIT/Apache-2.0 | OK |
| `quick-xml` | MIT | OK |
| `toml` | MIT/Apache-2.0 | OK |
| `htmd` | MIT | OK |
| `csv` | MIT/Unlicense | OK |
| `xan` | MIT | OK (verify before import) |
| `xsv` | MIT/Unlicense | OK |
| `ignore` | MIT/Unlicense | OK |
| SQLite | Public domain | OK |
| All `uu_*` crates | MIT | OK |
| `awk-rs` | MIT | OK |
| `jaq-core` / `jaq-std` | MIT/Apache-2.0 | OK |

---

## Appendix B: Files Changed Summary

**New files:**
- `wasmcore/vendor/brush-shell-*/` — brush-shell (vendored + patched for WASI)
- `wasmcore/.cargo/config.toml` — vendor configuration
- `wasmcore/scripts/patch-vendor.sh` — crate patching script
- `wasmcore/patches/crates/` — crate patch directory
- `docs/compatibility-matrix.md` — living compatibility document

**New source files in multicall:**
- `src/diff.rs` — diff implementation
- `src/gzip.rs` — gzip/gunzip/zcat
- `src/tar.rs` — tar implementation
- `src/yq.rs` — yq implementation
- `src/curl.rs` — curl CLI wrapper
- `src/html_to_md.rs` — html-to-markdown
- `src/extras.rs` — rev, strings, column, du, expr, file, tree, split, xargs

**Deleted files:**
- `host/src/shell.ts` — replaced by Rust shell
- `wasmcore/crates/multicall/src/sed.rs` — replaced by uutils/sed

**Heavily modified:**
- `wasmcore/crates/multicall/src/dispatch.rs` — new dispatch entries
- `wasmcore/crates/multicall/src/grep.rs` — internals replaced with ripgrep libs
- `wasmcore/crates/multicall/src/builtins.rs` — most entries removed (uutils replacements)
- `wasmcore/crates/multicall/src/find.rs` — enhanced with new predicates
- `wasmcore/crates/multicall/Cargo.toml` — many new dependencies
- `wasmcore/Makefile` — vendor+patch targets
- `host/src/wasm-os.ts` — simplified (shell spawn instead of JS parsing)
- `host/src/pipeline.ts` — simplified (less orchestration logic)
