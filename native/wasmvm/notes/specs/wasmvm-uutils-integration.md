# wasmVM/WasmCore: uutils Ecosystem Integration

## Technical Specification v1.0

**Date:** March 16, 2026
**Status:** Draft
**Companion to:** `wasmvm-tool-completeness.md` (v2.0)

---

## 1. Overview

This spec covers the integration of tools from the broader [uutils](https://github.com/uutils) GitHub organization — beyond the coreutils crates we already use — into the wasmVM multicall binary. The goal is to **replace custom implementations with upstream uutils equivalents** and **add new commands** using established uutils projects rather than writing from scratch.

### 1.1 What This Changes from `wasmvm-tool-completeness.md`

The tool-completeness spec (v2.0) planned several custom implementations and third-party crate wrappers. This spec supersedes those decisions where a uutils equivalent exists:

| Command(s) | v2.0 Plan | This Spec | Rationale |
|-------------|-----------|-----------|-----------|
| `find`, `xargs` | Custom `find.rs` enhancement + custom `xargs` shim | **uutils/findutils** | POSIX-compatible CLI (unlike fd), includes both find and xargs, actively maintained |
| `diff`, `cmp` | `similar` crate wrapper | **uutils/diffutils** | Full GNU diff CLI, unified/context/normal/side-by-side output, `cmp`/`diff3`/`sdiff` included for free |
| `sed` | uutils/sed | **uutils/sed** (unchanged) | Same plan, confirmed viable |
| `rev` | Custom ~20-line builtin | **uutils/util-linux `rev`** | Why write when upstream exists |
| `cal` | Not planned | **uutils/util-linux `cal`** | Commonly expected Unix command |
| `rename` | Not planned | **uutils/util-linux `rename`** | Batch file rename utility |
| `column` | Custom ~50-line builtin | Keep custom | Not available in any uutils repo |
| `tree` | Custom ~80-line builtin | Keep custom | Not available in any uutils repo |

### 1.2 uutils Organization — Full Inventory

| Repository | Commands | crates.io | License | WASM Viable | This Spec |
|------------|----------|-----------|---------|-------------|-----------|
| **uutils/coreutils** | 100+ (`cat`, `ls`, `cp`, ...) | `uu_*` (individual crates) | MIT | Partial (with patches) | Already integrated (40+ crates) |
| **uutils/sed** | `sed` | `sed` v0.1.1 | MIT | Yes | **Integrate** (Section 3) |
| **uutils/findutils** | `find`, `xargs` | `findutils` v0.8.0 | MIT | Yes | **Integrate** (Section 4) |
| **uutils/diffutils** | `diff`, `cmp`, `diff3`, `sdiff` | `diffutils` v0.5.0 | MIT/Apache-2.0 | Yes | **Integrate** (Section 5) |
| **uutils/util-linux** | 50+ system utilities | `util-linux` | MIT | Partial | **Cherry-pick** (Section 6) |
| **uutils/procps** | `ps`, `top`, `watch`, `free`, ... | `procps` | MIT | No (`/proc` required) | **Excluded** |
| **uutils/hostname** | `hostname` | — | MIT | Maybe | **Skip** (stub adequate) |
| **uutils/bsdutils** | BSD utilities | — | MIT | Unknown | **Skip** (low priority) |

---

## 2. Integration Pattern

All uutils standalone repos (sed, findutils, diffutils, util-linux) are **binary-only** — they do not expose a `uumain()` library entry point like the coreutils `uu_*` crates do. Integration requires the **vendor+patch** approach (Tier 2) from `wasmvm-tool-completeness.md` Section 3.2:

1. `cargo vendor` downloads the crate source
2. A `.patch` file exposes the binary's `main` as a callable `pub fn` entry point
3. A second `.patch` stubs any WASI-incompatible code (signals, mmap, terminal, etc.)
4. The multicall dispatch table calls the exposed entry point

### 2.1 Standard Entry Point Patch

Each binary crate gets a patch that wraps `main()` as a library-callable function:

```rust
// Added by patch: pub fn entry point for multicall integration
pub fn uumain(args: impl IntoIterator<Item = std::ffi::OsString>) -> i32 {
    let args: Vec<OsString> = args.collect();
    // Call the crate's internal main logic with the provided args
    // (exact implementation varies per crate)
    match run(args) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{}", e);
            1
        }
    }
}
```

### 2.2 Monolith vs. Individual Crates

Unlike uutils/coreutils (which publishes `uu_cat`, `uu_ls`, etc. as individual crates), the standalone repos are monolithic:

- `findutils` = one crate containing `find` + `xargs` + `locate` + `updatedb`
- `diffutils` = one crate containing `diff` + `cmp` + `diff3` + `sdiff`

This means we vendor and patch one crate but get multiple commands. The entry point patch needs to expose a separate function per command (e.g., `find_main()`, `xargs_main()`, `diff_main()`, `cmp_main()`).

---

## 3. uutils/sed — Replace `sed.rs`

**Current state:** Custom `sed.rs` (942 lines, ~65% complete). Missing hold space, labels/branching, read/write, extended addresses.

**Replacement:** `sed` crate v0.1.1 from uutils/sed.

### 3.1 Integration

**Tier:** 2 (vendor+patch). The crate is binary-only.

**Patches needed:**
1. **Entry point** — expose `pub fn sed_main(args) -> i32` wrapping the internal CLI logic
2. **WASI compat** — TBD after build attempt. The crate is pure Rust with standard library dependencies; may compile as-is after the entry point patch.

**Dispatch:**
```rust
"sed" => uu_sed::sed_main(args.into_iter()),
```

**What gets deleted:** `wasmcore/crates/multicall/src/sed.rs` (942 lines), `mod sed;` from `main.rs`.

### 3.2 Verification

```bash
echo "hello world" | sed 's/hello/goodbye/'    # → goodbye world
echo -e "a\nb\nc" | sed -n '2p'                 # → b
echo "foo" | sed 'y/fo/FO/'                     # → FOO
sed -i 's/old/new/g' file.txt                   # in-place edit
```

---

## 4. uutils/findutils — Replace `find.rs` + Add `xargs`

**Current state:**
- `find.rs` (540 lines, ~50% complete). Missing `-exec`, `-mtime`, `-size`, `-perm`, `-delete`, `-prune`.
- `xargs` not implemented (was planned as custom shim).

**Replacement:** `findutils` crate v0.8.0 from uutils/findutils.

### 4.1 Why This Changes the Plan

The tool-completeness spec kept custom `find.rs` because fd-find has an incompatible CLI. But uutils/findutils implements **POSIX `find`** with the standard `find PATH [EXPRESSION]` interface — exactly what we need. It also includes `xargs`, which we were going to write from scratch.

### 4.2 Integration

**Tier:** 2 (vendor+patch). The crate is a monolith binary.

**Patches needed:**
1. **Entry points** — expose `pub fn find_main(args) -> i32` and `pub fn xargs_main(args) -> i32`
2. **WASI compat** — `xargs` spawns subprocesses; needs `std::process::Command` which routes to `proc_spawn` via our patched stdlib. `find -exec` has the same requirement.
3. **Exclude `locate`/`updatedb`** — These depend on a database file and aren't useful in WASM. Gate them behind a feature or just don't wire them in dispatch.

**Dispatch:**
```rust
"find" => uu_findutils::find_main(args.into_iter()),
"xargs" => uu_findutils::xargs_main(args.into_iter()),
```

**What gets deleted:** `wasmcore/crates/multicall/src/find.rs` (540 lines), `mod find;` from `main.rs`.

### 4.3 Commands Gained

| Command | Status Change | Notes |
|---------|--------------|-------|
| `find` | custom → done | Full POSIX find with `-exec`, `-mtime`, `-size`, `-perm`, etc. |
| `xargs` | missing → done | Full POSIX xargs with `-0`, `-I`, `-n`, `-P` |

### 4.4 Verification

```bash
find . -name "*.rs" -type f                      # basic find
find /tmp -mtime +7 -delete                      # find with predicates
find . -name "*.log" -exec rm {} \;              # find -exec
echo -e "a\nb\nc" | xargs echo                   # basic xargs
find . -name "*.txt" -print0 | xargs -0 wc -l   # find | xargs pipeline
```

---

## 5. uutils/diffutils — Add `diff`, `cmp`, `diff3`, `sdiff`

**Current state:** `diff` listed as missing in compatibility matrix, planned as `similar` crate wrapper. `cmp`, `diff3`, `sdiff` not planned at all.

**Replacement:** `diffutils` crate v0.5.0 from uutils/diffutils. This gives us four commands instead of one, with full GNU diff compatibility instead of a custom wrapper.

### 5.1 Why This Is Better Than `similar`

The tool-completeness spec planned a ~200-line custom `diff.rs` using the `similar` crate for Myers diff. uutils/diffutils gives us:

- Full GNU diff CLI compatibility (not just unified output)
- `cmp` (byte-by-byte comparison)
- `diff3` (three-way merge)
- `sdiff` (side-by-side diff with merge support)
- Tested against GNU diffutils test suite
- Zero custom CLI parsing to maintain

### 5.2 Integration

**Tier:** 2 (vendor+patch).

**Patches needed:**
1. **Entry points** — expose `pub fn diff_main(args) -> i32`, `pub fn cmp_main(args) -> i32`, `pub fn diff3_main(args) -> i32`, `pub fn sdiff_main(args) -> i32`
2. **WASI compat** — Pure Rust, likely minimal patches needed.

**Dispatch:**
```rust
"diff" => uu_diffutils::diff_main(args.into_iter()),
"cmp" => uu_diffutils::cmp_main(args.into_iter()),
"diff3" => uu_diffutils::diff3_main(args.into_iter()),
"sdiff" => uu_diffutils::sdiff_main(args.into_iter()),
```

### 5.3 Commands Gained

| Command | Status Change | Notes |
|---------|--------------|-------|
| `diff` | missing → done | Unified, context, normal, side-by-side, recursive |
| `cmp` | not planned → done | Byte-by-byte file comparison |
| `diff3` | not planned → done | Three-way file merge |
| `sdiff` | not planned → done | Side-by-side diff with interactive merge |

### 5.4 Dependencies Removed

The `similar` crate is no longer needed as a direct dependency. Remove from the planned dependency list.

### 5.5 Verification

```bash
diff file1.txt file2.txt                         # normal diff
diff -u file1.txt file2.txt                      # unified diff
diff -r dir1/ dir2/                              # recursive diff
cmp file1.txt file2.txt                          # byte comparison
diff3 mine.txt base.txt yours.txt                # three-way merge
sdiff file1.txt file2.txt                        # side-by-side
```

---

## 6. uutils/util-linux — Cherry-Pick Individual Commands

uutils/util-linux implements 50+ system utilities. Most are heavy system tools (disk partitioning, login management, process scheduling) that make no sense in WASM. But a few are pure-computation utilities we can cherry-pick.

### 6.1 Viable Commands

| Command | Description | Currently | Value |
|---------|-------------|-----------|-------|
| `rev` | Reverse lines of input | Planned as ~20-line custom builtin | Low — trivial either way |
| `cal` | Display calendar | Not planned | Medium — commonly expected |
| `rename` | Batch rename files | Not planned | Low — niche but useful |
| `hardlink` | Find and link duplicate files | Not planned | Low |
| `getopt` | Parse command-line options | Not planned | Medium — useful for shell scripts |
| `mcookie` | Generate random hex string | Not planned | Low |
| `column` | Columnate output | Planned as ~50-line custom builtin | Medium |

### 6.2 Integration Approach

uutils/util-linux uses the same `uu_*` crate structure as coreutils. Each command is in `src/uu/<name>/`. However, unlike coreutils, individual commands are NOT published as separate crates on crates.io.

**Options:**
1. **Vendor the monolith, patch to expose per-command entry points.** Heavyweight — pulls in all 50+ commands' dependencies even if we only want 3-4.
2. **Copy the specific command source files into our codebase.** Lightweight — just grab the ~100-200 lines per command. They're MIT-licensed.
3. **Keep custom builtins for the trivial ones.** `rev` (20 lines), `column` (50 lines) — not worth the vendoring machinery.

**Recommendation:** Option 3 for `rev` and `column` (trivially small). Option 2 for `cal` (more complex, benefits from upstream implementation). Skip the rest unless demand arises.

### 6.3 `cal` — Calendar Display

The most valuable util-linux command for our use case. Displays a month or year calendar.

**Integration:** Copy source from `uutils/util-linux/src/uu/cal/` into our codebase as `multicall/src/cal.rs`. Adapt to our build (remove uucore macro dependencies, wire into dispatch).

**Dispatch:**
```rust
"cal" => cal::cal(args),
```

**API:** `cal [-1] [-3] [-y] [-m month] [-j] [[[day] month] year]`

### 6.4 Commands NOT Viable in WASM

Everything else in util-linux depends on:
- `/proc` filesystem access (`dmesg`, `lscpu`, `lsmem`, `lsns`)
- Block device operations (`blkid`, `mkswap`, `fdisk`)
- Process scheduling (`chrt`, `ionice`, `renice`, `taskset`)
- User/session management (`su`, `login`, `getty`)
- Terminal control (`setterm`)
- Network IPC (`ipcmk`, `ipcrm`)
- Filesystem mounting (`mount`, `umount`, `findmnt`)

These are excluded from scope.

---

## 7. uutils/procps — Excluded

All procps commands (`ps`, `top`, `free`, `watch`, `vmstat`, etc.) require:
- `/proc` filesystem for process/memory/CPU info
- `sysconf()` and other system calls unavailable in WASI
- Real-time system monitoring that doesn't apply to a WASM sandbox

**Exception considered:** `watch` (run command repeatedly) could theoretically work in WASM since it just re-executes a command on a timer. However, it depends on terminal control (`ncurses`-style screen updates) which is unavailable. A stripped-down `watch` that just prints output repeatedly is trivial to write as a custom builtin if needed.

**Decision:** Exclude entirely. Add `watch` to `notes/todo.md` as a future consideration if there's demand.

---

## 8. Impact on Compatibility Matrix

### 8.1 Status Changes

| Command | Old Status | New Status | Implementation |
|---------|-----------|------------|----------------|
| `sed` | custom | done | uutils/sed (vendor+patch) |
| `find` | custom | done | uutils/findutils (vendor+patch) |
| `xargs` | missing | done | uutils/findutils (vendor+patch) |
| `diff` | missing | done | uutils/diffutils (vendor+patch) |
| `cmp` | — | done | uutils/diffutils (vendor+patch) |
| `diff3` | — | done | uutils/diffutils (vendor+patch) |
| `sdiff` | — | done | uutils/diffutils (vendor+patch) |
| `cal` | — | done | source copy from uutils/util-linux |

### 8.2 Updated Summary

After this spec, compared to v2.0:

| Metric | v2.0 Plan | After This Spec |
|--------|-----------|-----------------|
| Custom code deleted | ~1,480 lines (sed.rs only) | ~2,020 lines (sed.rs + find.rs) |
| Custom code written | ~200 lines (diff.rs) + ~100 lines (xargs shim) + ~100 lines (find enhancements) | ~0 lines (all replaced by upstream) |
| Commands gained for free | 0 | 4 (`cmp`, `diff3`, `sdiff`, `cal`) |
| Third-party deps avoided | 0 | 1 (`similar` crate no longer needed) |
| uutils crates integrated | 40+ (coreutils only) | 40+ coreutils + sed + findutils + diffutils |

### 8.3 New Compatibility Matrix Entries

Add to `docs/compatibility-matrix.md`:

```markdown
## File Comparison

| Command | just-bash | Status | Implementation | Target |
|---------|-----------|--------|----------------|--------|
| diff | yes | done | uutils/diffutils | — |
| cmp | — | done | uutils/diffutils | — |
| diff3 | — | done | uutils/diffutils | — |
| sdiff | — | done | uutils/diffutils | — |

## Calendar / Date

| Command | just-bash | Status | Implementation | Target |
|---------|-----------|--------|----------------|--------|
| cal | — | done | uutils/util-linux (source copy) | — |
```

Update existing entries:
```markdown
| find | yes | done | uutils/findutils | — |
| xargs | yes | done | uutils/findutils | — |
| sed | yes | done | uutils/sed | — |
```

---

## 9. Implementation Order

### Phase A — sed (lowest risk, already planned)

1. Vendor `sed` crate v0.1.1
2. Patch: expose `sed_main()` entry point
3. Build for `wasm32-wasip1`, fix any WASI compat issues
4. Wire in dispatch, delete `sed.rs`
5. Run sed integration tests

### Phase B — diffutils (no existing code to replace, pure addition)

1. Vendor `diffutils` crate v0.5.0
2. Patch: expose `diff_main()`, `cmp_main()`, `diff3_main()`, `sdiff_main()` entry points
3. Build for `wasm32-wasip1`
4. Wire all four commands in dispatch
5. Write integration tests for diff, cmp

### Phase C — findutils (replaces existing custom code)

1. Vendor `findutils` crate v0.8.0
2. Patch: expose `find_main()`, `xargs_main()` entry points
3. Build for `wasm32-wasip1` — `xargs` needs `proc_spawn` to work, so this depends on subprocess support being validated
4. Wire in dispatch, delete `find.rs`
5. Run find integration tests, write xargs tests

### Phase D — cal (small, low priority)

1. Copy `cal` source from uutils/util-linux
2. Adapt to build without uucore macros
3. Wire in dispatch
4. Write basic test

---

## 10. Dependency Changes

### 10.1 New Cargo.toml Entries

```toml
# uutils/sed (vendor+patch for entry point)
# Vendored — see patches/crates/sed/

# uutils/findutils (vendor+patch for entry points)
# Vendored — see patches/crates/findutils/

# uutils/diffutils (vendor+patch for entry points)
# Vendored — see patches/crates/diffutils/
```

Since these are vendored crates, they appear in `vendor/` (gitignored) and are configured via `.cargo/config.toml`, not explicitly in `Cargo.toml`.

### 10.2 Dependencies Removed

| Dependency | Was Planned For | Replaced By |
|------------|----------------|-------------|
| `similar` | Custom diff wrapper | uutils/diffutils |

### 10.3 License Verification

| Crate | License | Compatible |
|-------|---------|------------|
| `sed` v0.1.1 | MIT | Yes |
| `findutils` v0.8.0 | MIT | Yes |
| `diffutils` v0.5.0 | MIT / Apache-2.0 | Yes |

All uutils projects are MIT-licensed, which is Apache-2.0 compatible.

---

## 11. Risks and Mitigations

### 11.1 Binary-only crates (no `uumain`)

**Risk:** sed, findutils, and diffutils don't expose library entry points. The patch to add them could be non-trivial if `main()` does complex initialization.

**Mitigation:** All three follow a standard pattern: parse args → execute → return exit code. The entry point patch wraps this cleanly. If a crate's `main()` calls `std::process::exit()` instead of returning, the patch needs to catch that — but this is a common, well-understood fix.

### 11.2 WASI compilation failures

**Risk:** These crates haven't been tested on `wasm32-wasip1`. They may use platform-specific APIs.

**Mitigation:** All three are pure Rust with minimal system dependencies. The vendor+patch approach lets us fix any issues with small surgical patches. Known risk areas:
- `find`/`xargs` (findutils): Process spawning → routes through our patched stdlib
- `diff` (diffutils): File I/O only → should work as-is
- `sed`: Text processing only → should work as-is

### 11.3 Monolith crate bloat

**Risk:** Vendoring `findutils` pulls in `locate`/`updatedb` code we don't need.

**Mitigation:** Dead code elimination by the compiler. If `find_main()` and `xargs_main()` are the only entry points called, the linker won't include `locate`/`updatedb` code. Verify with binary size comparison.

### 11.4 Upstream version drift

**Risk:** Our patches may break when upstream releases new versions.

**Mitigation:** Pin to specific versions in `Cargo.toml`. The patches are small (entry point exposure + WASI stubs) and unlikely to conflict with upstream changes. Version bumps are a manual but infrequent operation.

---

## 12. Files Changed

**New patch files:**
- `patches/crates/sed/0001-expose-entry-point.patch`
- `patches/crates/sed/0002-wasi-compat.patch` (if needed)
- `patches/crates/findutils/0001-expose-entry-points.patch`
- `patches/crates/findutils/0002-wasi-compat.patch` (if needed)
- `patches/crates/diffutils/0001-expose-entry-points.patch`
- `patches/crates/diffutils/0002-wasi-compat.patch` (if needed)

**New source files:**
- `wasmcore/crates/multicall/src/cal.rs` — copied from uutils/util-linux

**Deleted source files:**
- `wasmcore/crates/multicall/src/sed.rs` (942 lines)
- `wasmcore/crates/multicall/src/find.rs` (540 lines)

**Modified files:**
- `wasmcore/crates/multicall/Cargo.toml` — add vendored crate deps, remove `similar`
- `wasmcore/crates/multicall/src/dispatch.rs` — update dispatch entries
- `wasmcore/crates/multicall/src/main.rs` — remove `mod sed;`, `mod find;`, add `mod cal;`
- `docs/compatibility-matrix.md` — update statuses, add new commands

---

## 13. Success Criteria

1. `echo "hello" | sed 's/hello/world/'` outputs `world` (uutils/sed working)
2. `find . -name "*.rs" -type f` returns matching files (uutils/findutils working)
3. `echo "a" | xargs echo prefix` outputs `prefix a` (xargs working via proc_spawn)
4. `diff file1 file2` outputs correct unified diff (uutils/diffutils working)
5. `cmp file1 file2` correctly reports identical/different (diffutils cmp working)
6. `cal` displays current month calendar (util-linux cal working)
7. `sed.rs` and `find.rs` deleted from codebase
8. All existing integration tests pass
9. Binary size increase < 1 MB from new uutils crates
