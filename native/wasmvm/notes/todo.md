# wasmVM / WasmCore - Deferred TODO

Items we've identified but are deferring past the current work.

## VFS Consistency — Priority: MEDIUM
- Phase 1 uses a "snapshot and merge" model where each Worker gets a VFS snapshot and writes are collected/merged after execution
- Two pipeline stages writing to the same file will silently lose data
- **Later:** Detect conflicts at minimum; ideally use SharedArrayBuffer-backed VFS for real-time consistency (Phase 2 goal)

## Re-enable ~450 Skipped Integration Tests — Priority: HIGH
- US-005 skipped ~450 tests because brush-shell needed proc_spawn for external commands
- US-006 validated proc_spawn works — the blocker is resolved but the `skip` annotations were never removed
- Affected test files: coreutils.test.ts, gnu-compat.test.ts, awk.test.ts, sed.test.ts, find.test.ts, jq.test.ts, phase2-integration.test.ts, phase3-integration.test.ts, subprocess.test.ts, integration-pipeline.test.ts (pipe tests)
- **Fix:** Remove `skip` annotations, run tests, fix any that fail due to changed behavior

## US-006 Follow-ups

### /bin/ stub list drifts from dispatch table — Priority: MEDIUM
- `vfs.ts::_populateBin()` has a hardcoded list of ~100 command names that must match `dispatch.rs`
- Currently missing some dispatch commands (e.g. `chcon`, `runcon`, `chgrp`, `chown`, `kill`, `install`, etc.) — brush-shell returns 127 instead of their stub error messages
- **Fix:** Generate the list from the dispatch table — either emit a JSON manifest at build time from Rust, or have the WASM binary export a function that returns the supported command list

### Inline VFS sharing has no concurrency guard — Priority: LOW
- `process.ts` line ~486: inline children share the parent's VFS reference (`this._vfs`) instead of a snapshot
- Comment says "safe because inline execution is synchronous" — true today, but no assertion enforces this
- **Fix:** Add a guard (lock flag or assertion) that prevents concurrent inline executions on the same VFS

### Command substitution memory usage on large output — Priority: LOW
- brush-core patch runs substitution command synchronously then reads the full pipe output into memory
- Our in-memory pipes grow without bound (no deadlock), but a command substitution producing megabytes of output will buffer it all in RAM
- **Later:** Consider adding a size limit or warning for command substitution output

### uu_sort panics: std::thread::spawn not supported on WASI — Priority: HIGH
- `uu_sort` calls `std::thread::spawn` for parallel sorting, which panics on wasm32-wasip1
- This blocks `sort`, all pipelines using sort, and the parallel pipeline benchmark
- 10 tests skipped with reason (4 sort, 3 pipelines in gnu-compat, 1 integration-pipeline, 2 parallel-pipeline)
- **Fix:** Vendor-patch uu_sort to disable threading on WASI (use single-threaded fallback)

### uu_tac stdin read fails on WASI — Priority: MEDIUM
- `tac` returns "tac-error-read-error" when reading from stdin pipe
- 1 test skipped with reason
- **Fix:** Investigate and vendor-patch uu_tac stdin handling for WASI

### uu_readlink returns empty output on WASI — Priority: MEDIUM
- `readlink` exits with code 1 and empty output on WASI VFS symlinks
- 1 test skipped with reason
- **Fix:** Investigate VFS symlink support completeness for readlink

### chmod returns ENOSYS on WASI — Priority: LOW
- WASI has no `chmod` syscall — `uu_chmod` returns "Function not implemented"
- 2 tests skipped with reason (gnu-compat + phase2-integration)
- **Fix:** Implement VFS-level permission changes (map mode bits to read-only/read-write)

## Explore busybox-wasm project — Priority: MEDIUM
- There is an existing `busybox-wasm` project that compiles BusyBox to WebAssembly
- Investigate: what commands does it support, how does it handle WASI limitations, what's the binary size, does it run in browsers?
- Evaluate whether any of their approach (build pipeline, WASI shims, command coverage) is useful for wasmVM
- Key questions: Is it maintained? Does it use wasm32-wasip1 or Emscripten? How does it handle process spawning / pipes? What license?
- Compare their command coverage against our compatibility matrix — identify any gaps we should close or commands we're over-engineering
- Document findings in `notes/research/`

## Spec Cleanup — Priority: LOW
- Appendix B references `comparison-matrix.jsx` — actual location should be `notes/misc/comparison-matrix.jsx`; update spec reference

## Review `env` and `timeout` Command Implementation — Priority: LOW
- env and timeout are currently custom shim commands using wasi-ext proc_spawn
- Review whether the uutils versions can work as-is once the std patches for process spawning are in place
- **Later:** After std patches land, test `uu_env` and `uu_timeout` directly before writing shims; only shim what's actually broken

## Deferred Tool Work (removed from active PRD, do later)

### xan/xsv CSV processor — Priority: LOW
- Was US-021 in tool-completeness PRD, removed to focus on stability
- Fork `medialab/xan` (MIT) or `BurntSushi/xsv` (MIT/Unlicense), vendor+patch, expose main
- Subcommands: select, search, filter, sort, count, headers, frequency, slice, fmt, cat, join, stats, table
- Estimated +200–300KB WASM

### find -exec, -mtime, -size enhancements — Priority: LOW
- Was US-022 in tool-completeness PRD, removed to focus on stability
- find -exec CMD {} \; and -exec CMD {} + (via proc_spawn)
- find -mtime N (+N older, -N newer), -size N (Nc bytes, Nk KiB), -delete, -prune
- Current find.rs (~540 lines) works for basic operations; enhancements are nice-to-have

### Cargo feature flags for modular builds — Priority: LOW
- Was US-023 in tool-completeness PRD, removed to focus on stability
- Feature groups: core, text, checksums, compression, data, shell — all default on
- Gate dispatch entries with #[cfg(feature = "...")], deps with optional = true
- Enables minimal ~4MB binary (core only) vs full ~9MB
- Not needed until binary size is a concern for consumers

## Feature Parity Verification — Priority: LOW
- **BusyBox:** Compare our command list against BusyBox's applet list and identify any gaps
- **just-bash:** Compare against just-bash's ~70 command implementations and ensure we cover everything they offer
- **Later:** Build a comparison matrix and document any intentional omissions with rationale

## Implementation Quality Issues (identified 2026-03-16)

### HIGH: `rg` compatibility matrix shows "done" but US-011 is not passed
- `docs/compatibility-matrix.md:69` marks rg as "done" with note "ripgrep-compatible (regex crate engine, US-011)"
- US-011 in prd.json is `passes: false` — the acceptance criteria call for vendored ripgrep, not a custom reimplementation
- What exists is an 836-line custom `rg.rs` using the `regex` crate — missing `.gitignore` support, limited type definitions, simplified glob matching, no multiline, no PCRE2 equivalent
- **Fix:** Change compat matrix status from `done` to `custom` for rg, or complete US-011 with actual ripgrep

### HIGH: `sleep` busy-wait burns 100% CPU
- `builtins.rs:38` — `while start.elapsed() < duration { std::thread::yield_now(); }`
- Any `sleep N` pegs a CPU core for N seconds
- Tracked by US-025 (`passes: false`) but worth noting as a usability hazard if current code ships
- **Fix:** US-025 adds `host_process.sleep_ms` backed by `Atomics.wait`

### MEDIUM: `path_open()` swallows VFS errors as ENOENT
- `wasi-polyfill.ts:782-786` — when creating a file with O_CREAT, any VFS exception maps to ENOENT
- Every other path operation correctly uses `vfsErrorToErrno()`. This one doesn't.
- **Fix:** Replace bare `catch { return ERRNO_ENOENT; }` with `catch (e) { return vfsErrorToErrno(e); }`

### MEDIUM: `fd_readdir()` silently truncates filenames
- `wasi-polyfill.ts:1115-1119` — if a directory entry name doesn't fit in remaining buffer, it writes a truncated name without indication
- Callers read corrupted filenames, breaking `ls`, `find`, `readdir()` on dirs with long names
- **Fix:** Write only complete dirent entries; if header fits but name doesn't, skip the entry

### MEDIUM: Bash compatibility table not updated after US-006
- `docs/compatibility-matrix.md:268-291` marks pipes, redirects, variables, command substitution, subshells, etc. all as "planned"
- US-006 validated these all work — the table hasn't been updated since US-005
- **Fix:** Change status from "planned" to "done" for all features validated in US-006

### MEDIUM: Compatibility matrix summary counts are off
- Text Processing shows 24 done but `rg` should be `custom` (23 done, 3 custom)
- Summary row totals should be recalculated after rg status fix
- **Fix:** Recalculate after correcting rg status

### LOW: VFS `_inoToPath()` is O(n) BFS
- `vfs.ts:309-329` — does full inode tree BFS to reverse-lookup a path from an inode number
- Called during symlink resolution, which happens on every file operation through symlinks
- On VFS with thousands of files (post tar extraction), this becomes a bottleneck
- **Fix:** Maintain a reverse lookup map (ino → path) alongside forward entries

### LOW: `poll_oneoff` fires immediately for all subscriptions
- Clock subscriptions report completion instantly without waiting (hence the busy-wait sleep workaround)
- FD_READ/FD_WRITE subscriptions always report ready immediately without checking actual fd state
- Means `read -t TIMEOUT` in brush-shell won't work, and any I/O multiplexing is broken
- Related to US-025 but broader — poll_oneoff needs real implementation for Phase 2

### LOW: Tests with no assertions in process.test.ts
- `process.test.ts:532-546` — `setModule` and `setVfs` tests have zero assertions, pass vacuously
- **Fix:** Add assertions that verify the setter actually stored the value (or test indirectly via proc_spawn behavior)

