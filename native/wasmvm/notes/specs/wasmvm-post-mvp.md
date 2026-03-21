# wasmVM/WasmCore: Post-MVP Hardening & Completeness Spec

> **SUPERSEDED** — This spec has been replaced by `wasmvm-tool-completeness.md` (v2.0).
> Kept for historical reference only. See v2.0 Section 1.1 for disposition of each item.

## Technical Specification v1.1

**Date:** March 16, 2026
**Status:** Superseded
**Predecessor:** `wasmvm-mvp.md` (v1.0)
**Successor:** `wasmvm-tool-completeness.md` (v2.0)

---

## 1. Overview

This spec covers all issues, gaps, and missing features identified during the post-MVP audit of the wasmVM/WasmCore implementation. It is organized into work phases by priority: P0 (critical correctness), P1 (high-impact correctness/completeness), P2 (moderate gaps), and P3 (polish). Each item includes the problem, affected files, root cause, and implementation plan.

The MVP implementation is solid — well-architected, mostly correct, and significantly under size targets (6.35 MB vs 25 MB limit). This spec addresses the remaining issues to bring it to production quality.

### 1.1 Current State Summary

| Metric | Value |
|--------|-------|
| WASM binary size | 6.35 MB (unoptimized, no wasm-opt) |
| Commands wired | 88 (73 functional + 15 stubs) |
| JS host LOC | ~5,900 lines across 13 modules |
| Rust LOC | ~4,500 lines across 15 files |
| Test files | 24 |
| Test cases | ~1,500 |
| Std patches | 4 (~290 lines) |

---

## 2. P0 — Critical Fixes

These items break core functionality or cause silent data loss. Must be fixed before any other work.

### 2.1 Browser Subprocess Spawning Race Condition

**Problem:** `_spawnChild` in `process.js` is `async` but called without `await` from `_procSpawn`. The process table entry is created before the Worker actually exists. If WASM calls `proc_waitpid` immediately after `proc_spawn`, it calls `Atomics.wait` on a `SharedArrayBuffer` that will never be signaled because the child Worker hasn't started yet.

**Affected files:**
- `host/src/process.js` (~line 461, `_spawnChild` method)
- `host/src/process.js` (~line 262, `_procSpawn` return path)

**Root cause:** The browser code path uses `async/await` to dynamically import or construct Workers, but the WASI import function (`proc_spawn`) is synchronous — it runs inside a WASM call stack and cannot await a promise.

**Implementation plan:**

1. Add a "ready" signal to the process table entry using a second `SharedArrayBuffer(4)`:
   ```
   processTable entry: {
     worker: Worker | null,
     readyBuffer: SharedArrayBuffer(4),  // [ready: i32]
     waitBuffer: SharedArrayBuffer(8),   // [exitCode: i32, done: i32]
     ...
   }
   ```

2. In `_spawnChild` (async path), after the Worker is fully constructed and has acknowledged its first message, write `1` to `readyBuffer[0]` and call `Atomics.notify(readyBuffer, 0)`.

3. In `_procSpawn`, after creating the process table entry and calling `_spawnChild`, call `Atomics.wait(readyBuffer, 0, 0)` to block until the child Worker signals readiness.

4. This ensures `proc_spawn` only returns a PID after the child Worker is alive and has its message handler installed.

5. Add a timeout (5 seconds) to the `Atomics.wait` on the ready buffer. If the timeout fires, clean up the process table entry and return `ERRNO_TIMEDOUT` to WASM.

**Tests to add:**
- Browser-simulated async spawn with immediate `waitpid`
- Spawn timeout when Worker fails to initialize
- Rapid sequential spawns (spawn → waitpid → spawn → waitpid)

---

### 2.2 VFS Changes Lost from Intermediate Pipeline Stages

**Problem:** In both parallel and sequential pipeline execution, only the last stage's `vfsChanges` are returned. If an intermediate stage (e.g., `tee output.txt` in `cat file | tee output.txt | wc -c`) writes to the VFS, those writes are silently discarded.

**Affected files:**
- `host/src/pipeline.js` (~line 147, parallel mode return)
- `host/src/pipeline.js` (~line 187, sequential mode return)

**Root cause:** The pipeline orchestrator collects results from all stages but only extracts `vfsChanges` from the final stage's result object.

**Implementation plan:**

1. In both parallel and sequential execution paths, collect `vfsChanges` from every stage into an ordered array.

2. After all stages complete, merge VFS changes sequentially (stage 1 first, stage 2 second, etc.) into the parent VFS. This preserves causal ordering — later stages overwrite earlier stages if they touch the same file, which matches Unix pipeline semantics.

3. The merge operation for each stage:
   ```javascript
   for (const stage of stageResults) {
     if (stage.vfsChanges) {
       for (const change of stage.vfsChanges) {
         switch (change.type) {
           case 'write': vfs.writeFile(change.path, change.data); break;
           case 'mkdir': vfs.mkdirp(change.path); break;
           case 'unlink': vfs.unlink(change.path); break;
           case 'rename': vfs.rename(change.from, change.to); break;
         }
       }
     }
   }
   ```

4. Return the merged VFS state (not just last stage's changes) in the pipeline result.

5. Document that concurrent writes to the same file from parallel stages follow "last stage wins" semantics, which is consistent with the existing snapshot-and-merge model.

**Tests to add:**
- Pipeline where intermediate stage writes a file: `echo hello | tee /tmp/out | wc -c` then verify `/tmp/out` exists
- Pipeline where multiple stages write different files
- Pipeline where two stages write the same file (verify last-stage-wins)

---

### 2.3 Pipe Race Condition — Unsynchronized Shared Offsets

**Problem:** In `_executeInline`, parent and child processes share pipe buffer objects with `readOffset` and `writeOffset` properties. Both sides read and mutate these offsets without synchronization. If the JS engine interleaves operations (or in future multi-threaded scenarios), data is lost or duplicated.

**Affected files:**
- `host/src/process.js` (~lines 298-383, `_executeInline` function)

**Root cause:** Pipe buffers use plain JavaScript objects with mutable numeric properties. There is no atomic access or mutex protecting offset mutations.

**Implementation plan:**

1. For inline (same-thread) execution, the race is currently theoretical because JS is single-threaded. However, the code is still incorrect because `_executeInline` reads from a pipe that the parent may later also read from, causing double-consumption.

2. Fix by giving the child process its own copy of stdin data when executing inline:
   ```javascript
   // Instead of sharing the pipe object, snapshot the data
   const stdinData = pipe.buffer.slice(pipe.readOffset, pipe.writeOffset);
   // Pass stdinData as the child's stdin, not the shared pipe
   ```

3. For cross-Worker pipe buffers (already using `SharedArrayBuffer` ring buffers in parallel mode), verify that the ring buffer implementation correctly uses `Atomics.load` and `Atomics.store` for position tracking. The current `ring-buffer.js` already does this correctly for the parallel path.

4. Add assertions that a pipe's read end is only consumed by one reader. If two readers attempt to read the same pipe, throw an error rather than silently corrupting data.

**Tests to add:**
- Inline execution where parent and child both have access to the same pipe
- Verify child's stdin consumption doesn't affect parent's pipe state
- Assertion fires if two readers attach to the same pipe read end

---

## 3. P1 — High-Impact Fixes

### 3.1 Fix `dup()` File Cursor Sharing

**Problem:** POSIX requires that `dup(fd)` creates a new file descriptor that shares the same underlying file description, including the file offset (cursor). The current implementation copies the cursor value, creating independent cursors.

**Affected files:**
- `host/src/fd-table.js` (~lines 209-210)

**Root cause:** The FD table stores cursor position per-FD rather than per-file-description.

**Implementation plan:**

1. Introduce a `FileDescription` object that holds shared state:
   ```javascript
   class FileDescription {
     constructor(inode, cursor, flags) {
       this.inode = inode;
       this.cursor = cursor;
       this.flags = flags;
       this.refCount = 1;
     }
   }
   ```

2. Each FD table entry points to a `FileDescription` instead of storing cursor/flags inline.

3. `dup()` and `dup2()` increment `refCount` on the existing `FileDescription` and create a new FD entry pointing to the same object.

4. `close()` decrements `refCount`. When it hits 0, the `FileDescription` is freed.

5. `open()` creates a new `FileDescription` with `refCount = 1`.

6. `fd_seek` and `fd_tell` operate on the `FileDescription`'s cursor, so all FDs sharing the same description see the same position.

7. Update `wasi-polyfill.js` to use the FD table's shared cursor via `FileDescription`.

**Tests to add:**
- `dup(fd)` then seek on original → verify duped fd's cursor moved
- `dup2(fd, newfd)` shares cursor
- Close one fd, other fd still works
- Close both fds, verify file description freed

---

### 3.2 Fix sed Case-Insensitive Flag

**Problem:** The `i`/`I` flag on sed substitution commands (e.g., `s/hello/world/i`) is parsed but never applied to the regex pattern.

**Affected files:**
- `wasmcore/crates/multicall/src/sed.rs` (~line 499, flag parsing section)

**Root cause:** The flag parser records the `i` flag but the regex compilation step doesn't prepend `(?i)` to the pattern.

**Implementation plan:**

1. In the substitution command handler, after parsing flags, check if `case_insensitive` is true.

2. If true, wrap the pattern with `(?i)`:
   ```rust
   let pattern = if case_insensitive {
       format!("(?i){}", pattern)
   } else {
       pattern.to_string()
   };
   ```

3. Apply the same treatment to address patterns that use the `I` flag (e.g., `/pattern/I`).

**Tests to add (Rust unit tests):**
- `s/hello/world/i` matches "HELLO", "Hello", "hElLo"
- `s/hello/world/gi` replaces all case-insensitive matches
- `/hello/Id` deletes lines matching case-insensitively
- Case-sensitive remains default when flag absent

---

### 3.3 Implement Command Substitution in Shell

**Problem:** Neither backtick `` `...` `` nor `$(...)` syntax is supported. This breaks common patterns like `VAR=$(echo hello)`, `files=$(find . -name "*.txt")`, and `echo "Today is $(date)"`.

**Affected files:**
- `host/src/shell.js` (tokenizer, parser, and evaluator)

**Root cause:** Not implemented in the MVP.

**Implementation plan:**

1. **Tokenizer changes:**
   - Detect `$(` and scan forward, tracking nested parenthesis depth, until the matching `)`.
   - Detect opening backtick `` ` `` and scan forward until closing backtick (handling `\`` escapes).
   - Emit a `COMMAND_SUB` token containing the inner command string.
   - Inside double quotes, also detect and emit `COMMAND_SUB` tokens (command substitution is active inside double quotes).

2. **Parser changes:**
   - In word parsing, when a `COMMAND_SUB` token is encountered, create a `CommandSubstitution` AST node containing a recursively parsed command list.
   - `CommandSubstitution` nodes can appear anywhere a word fragment can appear (standalone, inside double-quoted strings, etc.).

3. **Evaluator changes:**
   - When evaluating a `CommandSubstitution` node:
     a. Recursively evaluate the inner command list using the same pipeline execution path.
     b. Capture the stdout of the inner command.
     c. Strip trailing newlines (POSIX behavior).
     d. Substitute the result into the current word.
   - Handle nested command substitutions: `$(echo $(echo hello))`.

4. **Edge cases:**
   - Empty substitution: `$()` → empty string
   - Substitution with newlines: `$(printf "a\nb\nc")` → `"a b c"` (newlines become spaces in unquoted context) or `"a\nb\nc"` (preserved in quoted context)
   - Exit code: `$?` reflects the exit code of the last command substitution if it was the most recent command

5. **Nesting depth limit:** Cap at 16 levels to prevent stack overflow.

**Tests to add:**
- `echo $(echo hello)` → `hello`
- `VAR=$(echo world); echo "hello $VAR"` → `hello world`
- `echo "$(echo hello) $(echo world)"` → `hello world`
- Nested: `echo $(echo $(echo deep))` → `deep`
- Backtick form: `` echo `echo hello` `` → `hello`
- Trailing newline stripping: `echo "$(printf "hello\n\n\n")"` → `hello`
- Exit code propagation
- Empty substitution

---

### 3.4 Add Timeouts to All `Atomics.wait` Calls

**Problem:** `Atomics.wait` calls in the ring buffer and process manager have no timeout. A deadlocked or crashed peer causes the waiting thread to block forever with no recovery.

**Affected files:**
- `host/src/ring-buffer.js` (~lines 70, 150)
- `host/src/process.js` (~line 539)

**Implementation plan:**

1. Add a configurable timeout (default: 30 seconds) to all `Atomics.wait` calls:
   ```javascript
   const result = Atomics.wait(buffer, index, expected, TIMEOUT_MS);
   if (result === 'timed-out') {
     throw new Error(`Operation timed out after ${TIMEOUT_MS}ms`);
   }
   ```

2. For ring buffer reads/writes, use a shorter timeout (5 seconds) in a retry loop. After 3 consecutive timeouts (15 seconds total), give up and return an error.

3. For `proc_waitpid`, use a longer timeout (60 seconds) but allow configuration via options:
   ```javascript
   new ProcessManager({ waitTimeout: 60000 })
   ```

4. When a timeout fires:
   - Ring buffer: close the buffer and signal EOF to the peer
   - `waitpid`: write exit code 137 (SIGKILL) to the wait buffer and clean up the process entry

5. Log timeout events to stderr for debugging.

**Tests to add:**
- Ring buffer writer timeout when reader is dead
- Ring buffer reader timeout when writer is dead
- `waitpid` timeout when child hangs
- Verify cleanup happens after timeout

---

### 3.5 Replace String-Based Error Matching with Structured Errors

**Problem:** The WASI polyfill maps VFS errors to errno codes by matching error message strings (e.g., `e.message.includes('EEXIST')`). This is fragile and breaks if VFS changes error messages.

**Affected files:**
- `host/src/wasi-polyfill.js` (~lines 733-737 and throughout)
- `host/src/vfs.js` (error throwing)

**Implementation plan:**

1. Define a `VfsError` class in `vfs.js`:
   ```javascript
   class VfsError extends Error {
     constructor(code, message) {
       super(message);
       this.code = code; // e.g., 'ENOENT', 'EEXIST', 'ENOTDIR'
     }
   }
   ```

2. Update all `throw new Error(...)` calls in `vfs.js` to throw `VfsError` with a code property.

3. In `wasi-polyfill.js`, replace string matching with code checking:
   ```javascript
   catch (e) {
     if (e instanceof VfsError) {
       return ERRNO_MAP[e.code] || ERRNO_IO;
     }
     return ERRNO_IO;
   }
   ```

4. Define the errno mapping table once:
   ```javascript
   const ERRNO_MAP = {
     ENOENT: 44,
     EEXIST: 20,
     ENOTDIR: 54,
     EISDIR: 31,
     ENOTEMPTY: 55,
     EACCES: 2,
     EBADF: 8,
     EINVAL: 28,
   };
   ```

**Tests to add:**
- VfsError instances carry correct codes
- WASI polyfill maps each VfsError code to correct errno
- Unknown error codes map to EIO

---

## 4. P2 — Medium-Priority Improvements

### 4.1 Unlock More uutils Commands (Target: 100+)

**Problem:** Only 88 commands are wired, 15 of which are stubs. The spec targets 100+. The blockers are uucore features that use platform-specific code.

**Affected files:**
- `wasmcore/stubs/uucore/src/lib/features/mode.rs` (needs `umask` WASI stub)
- `wasmcore/stubs/uucore/src/lib/features/entries.rs` (needs user db WASI stub)
- `wasmcore/stubs/uucore/src/lib/features/fsext.rs` (needs fs stats WASI stub)
- `wasmcore/stubs/uucore/src/lib/features/perms.rs` (needs permissions WASI stub)
- `wasmcore/crates/multicall/Cargo.toml` (add new uu_* deps)
- `wasmcore/crates/multicall/src/dispatch.rs` (add dispatch entries)

**Implementation plan:**

1. **Patch uucore `mode` feature** for WASI:
   - Stub `libc::umask` to return `0o022`
   - Stub `libc::chmod` to call VFS chmod via WASI fd operations
   - This unblocks: `uu_chmod`, `uu_cp`, `uu_install`, `uu_mkdir`

2. **Patch uucore `entries` feature** for WASI:
   - Implement `getpwuid`, `getpwnam`, `getgrgid`, `getgrnam` using `host_user.getpwuid`
   - Return synthetic entries for the configured user
   - This unblocks: `uu_csplit`, `uu_stat`, `uu_id`

3. **Patch uucore `fsext` feature** for WASI:
   - Stub `statfs`/`statvfs` to return reasonable defaults (block size 4096, total/free blocks based on VFS size)
   - This unblocks: `uu_df`, `uu_du`

4. **Patch uucore `perms` feature** for WASI:
   - Stub `chown`/`chgrp` as no-ops that succeed (single-user system)
   - This unblocks: `uu_chgrp`, `uu_chown`

5. **Add individual uu_* crate patches** for the ~30 crates with internal platform-specific code:
   - Priority targets: `uu_ln`, `uu_mv`, `uu_rm`, `uu_mkdir`, `uu_touch`, `uu_id`, `uu_groups`, `uu_hostname`, `uu_kill`, `uu_df`, `uu_du`, `uu_install`
   - Each crate needs a `#[cfg(target_os = "wasi")]` fallback for its platform-specific paths

6. **Convert stubs to real implementations** where possible — replace the 15 dispatch stubs with either uutils implementations or custom builtins.

7. **Target: 110+ commands** after all patches are in place.

**Tests to add:**
- Integration tests for each newly enabled command
- Verify each patched uucore feature compiles and runs

---

### 4.2 Add Comprehensive grep Integration Tests

**Problem:** No dedicated `grep.test.js` exists. grep coverage is limited to 2 tests in `phase3-integration.test.js`.

**Affected files:**
- New file: `host/test/grep.test.js`

**Implementation plan:**

Create `grep.test.js` with at minimum:

1. **Basic matching:** pattern matches, no match, multiple files
2. **Flags:** `-i` (case-insensitive), `-v` (invert), `-c` (count), `-l` (files-with-matches), `-L` (files-without-matches), `-n` (line numbers), `-w` (word match), `-x` (line match), `-q` (quiet), `-m` (max count)
3. **Pattern modes:** `-G` (BRE default), `-E` (ERE), `-F` (fixed string)
4. **Multiple patterns:** `-e pattern1 -e pattern2`
5. **Pattern file:** `-f patternfile`
6. **Pipe input:** `echo "hello world" | grep hello`
7. **Multi-file output:** filename prefix in output
8. **Exit codes:** 0 (match), 1 (no match), 2 (error)
9. **Edge cases:** empty pattern, empty input, binary-like data, very long lines

**Target:** 30+ test cases.

---

### 4.3 Expand Coreutils Integration Test Coverage

**Problem:** `coreutils.test.js` has only ~15 tests. Most of the 88 wired commands have zero integration tests with real WASM.

**Affected files:**
- `host/test/coreutils.test.js` (expand existing)
- `host/test/gnu-compat.test.js` (expand existing)

**Implementation plan:**

Add integration tests for every functional command, organized by category:

1. **File ops:** cat, cp, ln, ls, mkdir, mv, rm, rmdir, stat, touch, mktemp, dd, readlink, realpath, truncate, link, unlink, shred
2. **Text processing:** head, tail, sort, uniq, wc, cut, tr, paste, join, fold, expand, unexpand, nl, od, comm, fmt, tac, tsort
3. **Output:** echo, printf, tee, yes
4. **Checksums:** md5sum, sha1sum, sha256sum, sha512sum, b2sum, cksum, base32, base64
5. **Misc:** basename, dirname, date, env, expr, factor, false, true, seq, sleep, test, whoami, pwd, nproc, uname

Each command gets at minimum:
- One happy-path test
- One edge case or error test
- One test with common flags

**Target:** 150+ new test cases.

---

### 4.4 Expand Subprocess Tests

**Problem:** Only 7 tests for the entire subprocess lifecycle.

**Affected files:**
- `host/test/subprocess.test.js` (expand existing)

**Implementation plan:**

Add tests for:

1. **Error handling:** spawn nonexistent command, spawn with bad args
2. **Exit codes:** child returns 0, 1, 2, 127, 137
3. **Environment:** child inherits env, child gets modified env
4. **Pipes:** parent writes to child stdin, parent reads child stdout
5. **Timeout integration:** `timeout 1 sleep 10` kills after 1 second
6. **Concurrent spawns:** spawn 3 children, waitpid on each
7. **Nested spawns:** child spawns grandchild (currently limited to one level — test the error)
8. **Signal handling:** `proc_kill` terminates child, exit code 137

**Target:** 25+ new test cases.

---

### 4.5 Add Rust Unit Tests

**Problem:** Zero `#[test]` modules in any Rust source file. All testing is at the JS integration level.

**Affected files:**
- `wasmcore/crates/multicall/src/grep.rs`
- `wasmcore/crates/multicall/src/sed.rs`
- `wasmcore/crates/multicall/src/find.rs`
- `wasmcore/crates/multicall/src/builtins.rs`
- `wasmcore/crates/multicall/src/jq.rs`
- `wasmcore/crates/multicall/src/awk.rs`

**Implementation plan:**

Add `#[cfg(test)] mod tests { ... }` to each file:

1. **grep.rs:**
   - BRE/ERE/fixed pattern matching
   - Case-insensitive flag
   - Invert matching
   - Word/line matching
   - Multiple patterns
   - Target: 20+ unit tests

2. **sed.rs:**
   - Each command type: s, d, p, q, a, i, c, y, =, n
   - Address types: line number, regex, range, negation
   - Substitution flags: g, p, N, i
   - Grouped commands
   - Target: 25+ unit tests

3. **find.rs:**
   - Name/iname/path matching
   - Type filtering (d/f/l)
   - Empty predicate
   - Depth limits
   - Boolean logic (and, or, not, grouping)
   - Target: 15+ unit tests

4. **builtins.rs:**
   - Test each builtin's argument parsing and output (where testable without VFS)
   - Target: 10+ unit tests

Note: These tests compile and run on the host (`cargo test`, not WASM) since they test pure logic. Tests that require VFS interaction remain at the JS integration level.

---

### 4.6 Install wasm-opt and Wire Up `make host`

**Problem:** `wasm-opt` is not installed, so the optimization step is skipped. The `make host` target prints "not yet configured" even though the build works via npm.

**Affected files:**
- `wasmcore/Makefile`

**Implementation plan:**

1. Add `wasm-opt` installation to the build prerequisites or document it:
   ```makefile
   wasm-opt-check:
   	@command -v wasm-opt >/dev/null 2>&1 || \
   	  (echo "Installing wasm-opt..." && cargo install wasm-opt)
   ```

2. Update the `host` target to run the actual build:
   ```makefile
   host:
   	cd host && npm run build
   ```

3. Update `all` target to depend on both `wasm` and `host`.

---

### 4.7 Glob Expansion Symlink Loop Protection

**Problem:** The globstar (`**`) expansion in `shell.js` recursively traverses directories. If a symlink creates a cycle (e.g., `a/link -> ..`), the recursion can loop until stack overflow.

**Affected files:**
- `host/src/shell.js` (~lines 850-877, globstar expansion)

**Implementation plan:**

1. Track visited inodes during glob expansion:
   ```javascript
   _expandGlobstar(dir, pattern, visited = new Set()) {
     const stat = this._vfs.stat(dir);
     if (visited.has(stat.ino)) return []; // cycle detected
     visited.add(stat.ino);
     // ... existing recursion
   }
   ```

2. Cap recursion depth at 40 levels (matching VFS symlink resolution limit).

3. Pass `visited` set through recursive calls.

**Tests to add:**
- Glob expansion with symlink cycle doesn't hang
- Glob expansion with deep but non-cyclic symlinks works

---

### 4.8 Process Table Cleanup for Unchained Processes

**Problem:** Process table entries are only cleaned up in `waitpid`. If a process exits and `waitpid` is never called, the entry (including its Worker reference and SharedArrayBuffer) leaks forever.

**Affected files:**
- `host/src/process.js` (~lines 545-547)

**Implementation plan:**

1. Add a `Worker.onExit` / `worker.on('exit')` handler that marks the process as "zombie" when the child exits without being waited on.

2. Implement a periodic cleanup sweep (or on-demand when spawning new processes) that removes zombie entries older than 60 seconds:
   ```javascript
   _cleanupZombies() {
     const now = Date.now();
     for (const [pid, entry] of this._processTable) {
       if (entry.status !== null && (now - entry.exitTime) > 60000) {
         this._processTable.delete(pid);
       }
     }
   }
   ```

3. Call `_cleanupZombies()` at the start of each `_procSpawn`.

**Tests to add:**
- Spawn child, let it exit, don't call waitpid — verify cleanup after timeout
- Spawn many children without waiting — verify table doesn't grow unbounded

---

### 4.9 FD Reclamation

**Problem:** `_nextFd` in `fd-table.js` monotonically increases. Closed FDs are never reused.

**Affected files:**
- `host/src/fd-table.js` (~line 160)

**Implementation plan:**

1. Maintain a free list of closed FD numbers:
   ```javascript
   this._freeFds = [];
   ```

2. On `close(fd)`, push `fd` to the free list (if `fd >= 3`, don't reclaim stdio).

3. On `_allocateFd()`, pop from the free list first. If empty, use `_nextFd++`.

4. This ensures FD numbers stay small and bounded by the number of concurrently open descriptors.

**Tests to add:**
- Open and close 100 FDs, verify next open reuses a low number
- Stdio FDs (0, 1, 2) are never reclaimed

---

## 5. P3 — Polish & Feature Completeness

### 5.1 sleep() — Replace Busy-Wait with Host Callback

**Problem:** `sleep` in `builtins.rs` uses `thread::yield_now()` in a busy loop, wasting CPU.

**Affected files:**
- `wasmcore/crates/multicall/src/builtins.rs` (sleep function)
- `wasmcore/crates/wasi-ext/src/lib.rs` (new import)
- `host/src/wasi-polyfill.js` or `host/src/process.js` (host implementation)

**Implementation plan:**

1. Add a new host import `host_process.sleep_ms(milliseconds: u32) → errno` to `wasi-ext`.

2. Implement the host side using `Atomics.wait` on a dummy buffer:
   ```javascript
   sleep_ms(ms) {
     const buf = new Int32Array(new SharedArrayBuffer(4));
     Atomics.wait(buf, 0, 0, ms); // blocks for ms milliseconds
   }
   ```

3. In `builtins.rs`, replace the busy loop with `wasi_ext::sleep_ms((seconds * 1000.0) as u32)`.

4. Fallback: if `SharedArrayBuffer` is unavailable, keep the busy-wait path.

---

### 5.2 chmod() — Full POSIX Mode Bits

**Problem:** `chmod` uses `Permissions::set_readonly()` as a proxy. `chmod 755 file` doesn't actually set owner/group/other bits.

**Affected files:**
- `wasmcore/crates/multicall/src/builtins.rs` (chmod function)
- `host/src/vfs.js` (mode storage and enforcement)
- `host/src/wasi-polyfill.js` (pass mode to VFS)

**Implementation plan:**

1. VFS already stores `mode` in inode metadata. Update `chmod` in builtins.rs to parse octal and symbolic modes and pass the numeric mode via `std::fs::set_permissions`.

2. Add a `wasi-ext` import or use the existing WASI `path_filestat_set_times` pattern to set the mode:
   - Option A: Add `host_process.chmod(path_ptr, path_len, mode) → errno`
   - Option B: Use the VFS's existing mode field via `fd_filestat_set_times` with a mode extension

3. Parse symbolic modes (`u+x`, `go-w`, `a=rx`) in the Rust `chmod` builtin.

---

### 5.3 ls — Add Long Format (`-l`)

**Problem:** ls only supports `-a` and `-1`. `-l` is the most commonly used flag.

**Affected files:**
- `wasmcore/crates/multicall/src/builtins.rs` (ls function)

**Implementation plan:**

1. Add `-l` flag parsing.

2. For each entry, call `stat` and format output as:
   ```
   -rwxr-xr-x  1 user user  1234 Mar 16 12:00 filename
   ```

3. Mode string: convert numeric mode to `drwxrwxrwx` format.

4. User/group: use `host_user.getpwuid` for name resolution, fall back to numeric IDs.

5. Timestamps: format `mtime` as `Mon DD HH:MM` (current year) or `Mon DD  YYYY` (other years).

6. Also add `-R` (recursive) and basic color support via `--color=auto`.

---

### 5.4 Browser Worker-Entry — Return ENOSYS Instead of -1

**Problem:** Stub `host_process` functions in `worker-entry.browser.js` return `-1` instead of WASI errno `52` (ENOSYS).

**Affected files:**
- `host/src/worker-entry.browser.js` (~lines 49-56)

**Implementation plan:**

Replace all `return -1` with `return 52` (ENOSYS) in the stub host_process functions.

---

### 5.5 Fix `logname` — Use Configured User

**Problem:** Returns hardcoded `"nobody"` instead of the configured username.

**Affected files:**
- `wasmcore/crates/multicall/src/builtins.rs` (logname function)

**Implementation plan:**

Use `wasi_ext::getpwuid(wasi_ext::getuid()?)` to get the configured username, matching what `whoami` does.

---

### 5.6 Implement Here-Documents (`<<EOF`)

**Problem:** Shell parser doesn't support here-documents, which are common in multi-line scripts.

**Affected files:**
- `host/src/shell.js` (tokenizer and parser)

**Implementation plan:**

1. In the tokenizer, detect `<<` followed by a delimiter word (e.g., `EOF`).

2. Scan subsequent lines until a line matching the delimiter exactly is found.

3. Collect the intermediate lines as the here-document body.

4. If the delimiter is quoted (`<<'EOF'` or `<<"EOF"`), no variable expansion.
   If unquoted (`<<EOF`), apply variable expansion to the body.

5. `<<-` variant: strip leading tabs from body lines.

6. Create a `HereDoc` AST node that acts as stdin for the command.

7. During evaluation, provide the here-doc body as stdin to the command's pipeline stage.

**Tests to add:**
- Basic here-doc with variable expansion
- Quoted delimiter (no expansion)
- `<<-` tab stripping
- Here-doc with pipe: `cat <<EOF | wc -l`
- Empty here-doc

---

### 5.7 Implement Tilde Expansion

**Problem:** `~` and `~/path` don't expand to `$HOME`.

**Affected files:**
- `host/src/shell.js` (evaluator, word expansion)

**Implementation plan:**

1. During word expansion (before glob expansion), check if a word starts with `~`:
   - `~` or `~/...` → replace `~` with `$HOME`
   - `~user/...` → look up user's home directory (for MVP, only support `~` without username)

2. Only expand `~` at the beginning of a word, and only when unquoted.

**Tests to add:**
- `echo ~` → `/home/user`
- `echo ~/file` → `/home/user/file`
- `echo "~"` → `~` (no expansion inside quotes)

---

### 5.8 Implement `case`/`esac`

**Problem:** `case` statement is missing from the shell parser.

**Affected files:**
- `host/src/shell.js` (parser and evaluator)

**Implementation plan:**

1. Add `case`, `esac`, `in` as reserved words.

2. Parse `case WORD in PATTERN) COMMANDS ;; ... esac` syntax.

3. Create a `CaseStatement` AST node with:
   - `word`: the value being matched
   - `clauses`: array of `{ patterns: string[], body: CommandList }`

4. During evaluation:
   - Expand the case word.
   - For each clause, check if any pattern matches (using glob matching).
   - Execute the first matching clause's body.
   - `;;` terminates the clause. `;;&` (fall-through) is bash-specific — skip for now.

**Tests to add:**
- Basic case with literal patterns
- Case with glob patterns (`*.txt`)
- Case with multiple patterns per clause (`a|b|c)`)
- Default case `*)`)
- Case with variable expansion in word and patterns

---

### 5.9 Implement Arithmetic Expansion `$(( ))`

**Problem:** Arithmetic expansion is not supported.

**Affected files:**
- `host/src/shell.js` (tokenizer, parser, evaluator)

**Implementation plan:**

1. In the tokenizer, detect `$((` and scan forward tracking nested `((`/`))` until the matching `))`.

2. Emit an `ARITH_EXPANSION` token containing the expression.

3. In the evaluator, implement a simple arithmetic expression parser supporting:
   - Integer literals
   - Variable references (`$VAR` or bare `VAR`)
   - Operators: `+`, `-`, `*`, `/`, `%`, `**`
   - Comparisons: `<`, `>`, `<=`, `>=`, `==`, `!=`
   - Logical: `&&`, `||`, `!`
   - Bitwise: `&`, `|`, `^`, `~`, `<<`, `>>`
   - Ternary: `? :`
   - Parentheses for grouping
   - Assignment: `=`, `+=`, `-=`, etc.

4. All arithmetic is integer (truncate division).

5. Return the result as a string substituted into the word.

**Tests to add:**
- `echo $((1 + 2))` → `3`
- `echo $((10 / 3))` → `3`
- `echo $((VAR + 1))` with VAR=5 → `6`
- Nested: `echo $(($((2 + 3)) * 4))` → `20`
- Comparison: `echo $((5 > 3))` → `1`

---

### 5.10 find — Add `-exec`, `-mtime`, `-size` Predicates

**Problem:** find is missing commonly used predicates.

**Affected files:**
- `wasmcore/crates/multicall/src/find.rs`

**Implementation plan:**

1. **`-exec CMD {} \;`**: Execute a command for each match.
   - Parse `-exec` followed by arguments until `\;` or `+`.
   - For `\;` variant: replace `{}` with the matched path and execute via `std::process::Command`.
   - For `+` variant: collect all matches and execute once with all paths.
   - Requires subprocess support (std patches).

2. **`-mtime N`**: Match files by modification time.
   - Parse `+N` (older than N days), `-N` (newer than N days), `N` (exactly N days).
   - Compare file mtime against current time.

3. **`-size N`**: Match files by size.
   - Parse `Nc` (bytes), `Nk` (KiB), `NM` (MiB), `NG` (GiB).
   - Support `+N` (larger), `-N` (smaller).

4. **`-delete`**: Remove matched files.
   - Call `std::fs::remove_file` or `std::fs::remove_dir` as appropriate.

---

## 6. POSIX Compliance Roadmap

Features needed for full POSIX shell compliance (beyond what's covered above):

| Feature | Priority | Spec Section | Notes |
|---------|----------|--------------|-------|
| Command substitution `$(...)` | P1 | 3.3 above | Implementing now |
| Here-documents `<<EOF` | P3 | 5.6 above | Implementing now |
| Arithmetic expansion `$((...))` | P3 | 5.9 above | Implementing now |
| case/esac | P3 | 5.8 above | Implementing now |
| Tilde expansion | P3 | 5.7 above | Implementing now |
| Parameter expansion `${VAR%...}` | Future | — | Substring, prefix/suffix removal, default values |
| Brace expansion `{a,b,c}` | Future | — | Bash-specific, not POSIX |
| `set -e`, `set -x`, `set -o` | Future | — | Shell options |
| `trap` builtin | Future | — | Requires signal support |
| Background `&` and job control | Future | — | Requires async process model |
| `exec` builtin | Future | — | Replace current process |
| `eval` builtin | Future | — | Execute string as command |
| `read` builtin | Future | — | Read from stdin |
| `shift` builtin | Future | — | Shift positional parameters |
| `$@`, `$*`, `$#`, `$0` | Future | — | Positional parameters |
| `source` / `.` builtin | Future | — | Execute file in current shell |
| Coprocesses `|&` | Future | — | Bash-specific |
| Process substitution `<(...)` | Future | — | Bash-specific |

---

## 7. Implementation Order

Work should proceed in this order to maximize stability at each step:

### Phase A: Critical Fixes (P0)
1. Fix browser subprocess spawn race (2.1)
2. Fix VFS merge for pipeline stages (2.2)
3. Fix pipe race condition in inline execution (2.3)

### Phase B: High-Impact Fixes (P1)
4. Fix dup() cursor sharing (3.1)
5. Fix sed case-insensitive flag (3.2)
6. Implement command substitution (3.3)
7. Add Atomics.wait timeouts (3.4)
8. Replace string-based error matching (3.5)

### Phase C: Test Coverage
9. Add grep integration tests (4.2)
10. Expand coreutils integration tests (4.3)
11. Expand subprocess tests (4.4)
12. Add Rust unit tests (4.5)

### Phase D: Medium Improvements (P2)
13. Unlock more uutils commands (4.1)
14. Install wasm-opt, fix Makefile (4.6)
15. Glob symlink loop protection (4.7)
16. Process table cleanup (4.8)
17. FD reclamation (4.9)

### Phase E: Polish (P3)
18. sleep host callback (5.1)
19. chmod full mode bits (5.2)
20. ls -l (5.3)
21. Browser worker ENOSYS fix (5.4)
22. logname fix (5.5)
23. Here-documents (5.6)
24. Tilde expansion (5.7)
25. case/esac (5.8)
26. Arithmetic expansion (5.9)
27. find predicates (5.10)

---

## 8. Success Criteria

This work is complete when:

1. All P0 and P1 items are implemented and tested.
2. All P2 test coverage items are complete (grep, coreutils, subprocess, Rust unit tests).
3. The dispatch table contains 100+ functional commands (not stubs).
4. `wasm-opt` is integrated and produces an optimized binary.
5. The shell supports command substitution, here-documents, and arithmetic expansion.
6. No known deadlock paths exist (all `Atomics.wait` calls have timeouts).
7. VFS changes are correctly preserved across all pipeline stages.
8. Browser subprocess spawning works reliably.
9. All existing tests continue to pass.
10. Total test count exceeds 2,000 (up from ~1,500).

---

## 9. Streaming I/O

### 9.1 Current State

The current architecture is **entirely buffered**:

- `exec(command)` accepts a command string, runs it to completion, and returns `{ stdout, stderr, exitCode }` — all at once.
- Each Worker receives stdin as a complete `Uint8Array`, runs WASM synchronously, and posts back the complete stdout/stderr.
- The ring buffer (`ring-buffer.js`) provides inter-stage streaming for parallel pipelines, but this is internal — no public API exposes it.
- The WASI polyfill has `setStdinReader()` and `setStdoutWriter()` callback hooks, but they are only wired for parallel pipeline inter-stage communication, not user-facing I/O.

There is no way to:
- Feed stdin incrementally to a running process
- Receive stdout incrementally while a process runs
- Attach to a running process's streams after launch

### 9.2 Streaming Public API

Add a new `execStream()` method to `WasmOS` alongside the existing buffered `exec()`:

```javascript
interface StreamHandle {
  // Write data to the process's stdin. Returns a promise that resolves
  // when the data has been consumed (backpressure).
  write(data: string | Uint8Array): Promise<void>;

  // Signal EOF on stdin (close the write end).
  closeStdin(): void;

  // Event callbacks
  onStdout: (callback: (chunk: Uint8Array) => void) => void;
  onStderr: (callback: (chunk: Uint8Array) => void) => void;
  onExit: (callback: (exitCode: number) => void) => void;

  // Send signal to the process (SIGTERM, SIGKILL, SIGINT)
  kill(signal?: number): void;

  // Wait for process to exit. Returns exit code.
  wait(): Promise<number>;
}

class WasmOS {
  // Existing buffered API (unchanged)
  async exec(command: string): Promise<ExecResult>;

  // New streaming API
  execStream(command: string): StreamHandle;
}
```

**Affected files:**
- `host/src/wasm-os.js` — add `execStream()` method
- `host/src/index.js` — export new types

### 9.3 Long-Lived Worker Processes

The current model creates an ephemeral Worker per command execution. Streaming requires long-lived Workers that persist across multiple I/O rounds.

**Implementation plan:**

1. **Worker lifecycle change:** Instead of spawning a Worker, sending one message, and terminating it on response, keep the Worker alive across multiple stdin/stdout exchanges.

2. **Message protocol:** Define a structured message protocol between the main thread and Worker:
   ```
   Main → Worker:
     { type: 'start', command, args, env, vfsSnapshot, wasmModule }
     { type: 'stdin', data: Uint8Array }
     { type: 'stdin-eof' }
     { type: 'signal', signal: number }

   Worker → Main:
     { type: 'stdout', data: Uint8Array }
     { type: 'stderr', data: Uint8Array }
     { type: 'exit', exitCode: number, vfsChanges: [...] }
     { type: 'stdin-request' }  // WASM is blocked waiting for stdin
   ```

3. **WASM blocking on stdin read:** When the WASM process calls `fd_read(0, ...)` and there is no buffered stdin data, the Worker must pause WASM execution and request more data from the main thread. Two approaches:

   **Approach A — SharedArrayBuffer + Atomics (preferred for Node.js):**
   - Allocate a `SharedArrayBuffer` as the stdin channel.
   - When WASM reads stdin and the buffer is empty, the Worker calls `Atomics.wait()`.
   - When the main thread writes stdin data, it fills the shared buffer and calls `Atomics.notify()`.
   - This is synchronous from WASM's perspective — `fd_read` blocks and returns data.

   **Approach B — Exception-based suspension (browser fallback):**
   - When WASM reads stdin and no data is available, throw a special `StdinBlockedException`.
   - The Worker catches this exception, exits the WASM call stack, and posts `{ type: 'stdin-request' }` to the main thread.
   - When stdin data arrives (via `postMessage`), the Worker re-enters WASM by calling `_start()` again with the WASM instance's memory intact.
   - **Problem:** This requires the WASM program to be restartable from where it left off. Standard `_start()` re-runs from the beginning. This approach requires WASM stack switching or Asyncify, which we explicitly excluded.
   - **Mitigation:** Only use Approach A (SharedArrayBuffer). In browsers without SharedArrayBuffer, streaming I/O is not available — fall back to the existing buffered API.

4. **Stdout streaming:** Instead of buffering stdout chunks in an array, the Worker posts each `fd_write` chunk immediately to the main thread as a `{ type: 'stdout', data }` message. The main thread invokes the user's `onStdout` callback.

5. **Backpressure:** For SharedArrayBuffer stdin, the ring buffer naturally provides backpressure — `Atomics.wait` blocks when the buffer is full. For stdout, the Worker posts messages without blocking (fire-and-forget), relying on the main thread's event loop to drain them.

**Affected files:**
- `host/src/wasm-os.js` — `execStream()` implementation
- `host/src/worker-entry.js` — message protocol, long-lived mode
- `host/src/wasi-polyfill.js` — wire `setStdinReader`/`setStdoutWriter` for streaming
- `host/src/ring-buffer.js` — reuse for stdin/stdout channels
- `host/src/pipeline.js` — support streaming pipelines

### 9.4 Streaming Pipeline API

For pipelines, streaming changes how data flows:

```javascript
// Stream a pipeline — get a handle to the first stage's stdin
// and the last stage's stdout
const handle = os.execStream('sort | uniq -c | head -20');
handle.write('banana\n');
handle.write('apple\n');
handle.write('banana\n');
handle.closeStdin();
handle.onStdout((chunk) => console.log(new TextDecoder().decode(chunk)));
await handle.wait(); // → 0
```

The pipeline orchestrator spawns all stages, connects them via ring buffers (as today for parallel mode), and exposes the first stage's stdin and last stage's stdout to the user via the `StreamHandle`.

**Tests to add:**
- Stream stdin to a single command, receive stdout incrementally
- Stream stdin to a pipeline, receive final stdout
- Backpressure: write large data, verify no data loss
- EOF: close stdin, verify process exits
- Kill: send signal during streaming, verify cleanup
- Multiple concurrent streaming processes

---

## 10. PTY and Terminal Emulation

### 10.1 Overview

A pseudo-terminal (PTY) is a bidirectional channel between a terminal emulator (master side) and a process (slave side). The slave side behaves like a real terminal — it supports line editing, echo, signal generation (Ctrl-C → SIGINT), and ANSI escape sequence processing. The master side is what the user's terminal emulator (e.g., xterm.js) connects to.

wasmVM needs PTY support to:
1. Run interactive programs (editors, REPLs) that check `isatty()` and expect terminal behavior
2. Connect to xterm.js or other browser terminal emulators
3. Support line editing, raw mode, and ANSI escape sequences
4. Enable the terminal editor (section 11)

### 10.2 PTY Architecture

```
┌───────────────────────────────────────────────────┐
│  User Interface (xterm.js / terminal emulator)    │
│                                                    │
│  Writes keystrokes → PTY master                    │
│  Reads display data ← PTY master                   │
└───────────────┬───────────────────────────────────┘
                │ StreamHandle API (section 9.2)
┌───────────────▼───────────────────────────────────┐
│  PTY Master (JS host, in wasm-os.js)              │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  Terminal Discipline (termios emulation)      │ │
│  │                                               │ │
│  │  • Canonical mode: line buffering, echo       │ │
│  │  • Raw mode: pass-through, no echo            │ │
│  │  • Signal generation: Ctrl-C → SIGINT         │ │
│  │  • ANSI escape sequence processing            │ │
│  │  • Window size tracking (TIOCGWINSZ)          │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  stdin ring buffer ──→ Worker (slave side)         │
│  stdout ring buffer ←── Worker (slave side)        │
└───────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────┐
│  Worker (WASM process)                             │
│                                                    │
│  fd 0 (stdin)  ← reads from PTY slave              │
│  fd 1 (stdout) → writes to PTY slave               │
│  fd 2 (stderr) → writes to PTY slave               │
│  isatty(0/1/2) → returns 1 (is a terminal)        │
│                                                    │
│  Calls tcgetattr/tcsetattr via host_tty imports    │
└───────────────────────────────────────────────────┘
```

### 10.3 Public API — Opening a PTY

```javascript
interface PtyOptions {
  command?: string;       // Initial command (default: built-in shell)
  cols?: number;          // Terminal width (default: 80)
  rows?: number;          // Terminal height (default: 24)
  env?: Record<string, string>;
  cwd?: string;
}

interface PtyHandle extends StreamHandle {
  // Resize the terminal
  resize(cols: number, rows: number): void;

  // Get current terminal size
  getSize(): { cols: number, rows: number };
}

class WasmOS {
  // Open an interactive PTY session
  openPty(options?: PtyOptions): PtyHandle;
}
```

Usage with xterm.js:

```javascript
import { Terminal } from 'xterm';
import { WasmOS } from '@wasmvm/host';

const term = new Terminal({ cols: 80, rows: 24 });
term.open(document.getElementById('terminal'));

const os = new WasmOS({ wasmBinary });
await os.init();

const pty = os.openPty({ cols: 80, rows: 24 });

// Connect xterm.js to the PTY
term.onData((data) => pty.write(data));
pty.onStdout((chunk) => term.write(chunk));
pty.onExit((code) => term.write(`\r\nProcess exited with code ${code}\r\n`));

// Handle resize
term.onResize(({ cols, rows }) => pty.resize(cols, rows));
```

### 10.4 Terminal Discipline (termios Emulation)

Implement a `TerminalDiscipline` class in a new `host/src/pty.js` module:

```javascript
class TerminalDiscipline {
  constructor(options) {
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;

    // termios state
    this.iflag = ICRNL | IXON;           // input flags
    this.oflag = OPOST | ONLCR;          // output flags
    this.cflag = CS8 | CREAD;            // control flags
    this.lflag = ECHO | ICANON | ISIG;   // local flags
    this.cc = new Uint8Array(NCCS);       // control characters

    // Line buffer for canonical mode
    this._lineBuf = [];
    this._lineReady = false;
  }
}
```

**Modes:**

1. **Canonical mode (default, `ICANON` set):**
   - Input is line-buffered. Characters accumulate until Enter (or EOF).
   - Backspace erases the last character.
   - The WASM process's `fd_read` on stdin blocks until a complete line is available.
   - Echo is controlled by the `ECHO` flag.

2. **Raw mode (`ICANON` cleared):**
   - Every keystroke is immediately available to the WASM process.
   - No line buffering, no backspace processing.
   - Used by editors, `less`, `top`, etc.
   - Echo is typically also disabled in raw mode.

3. **Signal generation (`ISIG` set):**
   - Ctrl-C generates SIGINT (interrupt)
   - Ctrl-Z generates SIGTSTP (suspend — stub for now, no job control)
   - Ctrl-\ generates SIGQUIT (core dump — stub, treat as SIGTERM)
   - Ctrl-D generates EOF (end of input)

**Processing pipeline for input (master → slave):**

```
User keystroke
  → Signal check (ISIG): Ctrl-C → SIGINT, Ctrl-D → EOF
  → CR/NL translation (ICRNL): \r → \n
  → Echo (ECHO): write character back to master output
  → Canonical buffering (ICANON): buffer until \n, then release line
  → Deliver to slave stdin ring buffer
```

**Processing pipeline for output (slave → master):**

```
WASM fd_write on stdout/stderr
  → NL/CR translation (ONLCR): \n → \r\n
  → Deliver to master output (user's onStdout callback)
```

### 10.5 Custom Host Imports for TTY Control

Add a new `host_tty` WASM import module:

| Function | Signature | Description |
|----------|-----------|-------------|
| `tcgetattr` | `(fd, ret_termios_ptr, ret_termios_len) → errno` | Get terminal attributes |
| `tcsetattr` | `(fd, optional_actions, termios_ptr, termios_len) → errno` | Set terminal attributes |
| `tiocgwinsz` | `(fd, ret_cols, ret_rows) → errno` | Get window size |
| `tiocswinsz` | `(fd, cols, rows) → errno` | Set window size |

**Affected files:**
- NEW: `host/src/pty.js` — `TerminalDiscipline` class
- `host/src/wasm-os.js` — `openPty()` method
- `host/src/wasi-polyfill.js` — wire termios state into fd operations
- `host/src/user.js` — `isatty()` returns true for PTY fds
- `wasmcore/crates/wasi-ext/src/lib.rs` — add `host_tty` FFI bindings
- NEW: `wasmcore/patches/0005-wasi-termios.patch` — route `tcgetattr`/`tcsetattr` to host imports

### 10.6 termios Serialization

The termios struct is serialized as a flat byte buffer for transfer between WASM and JS:

```
Offset  Size  Field
0       4     iflag (u32)
4       4     oflag (u32)
8       4     cflag (u32)
12      4     lflag (u32)
16      32    cc[NCCS] (32 bytes, one per control character)
```

Total: 48 bytes.

The `tcgetattr` host import writes this 48-byte buffer into WASM linear memory. `tcsetattr` reads it from WASM memory and updates the `TerminalDiscipline` state.

### 10.7 SIGWINCH (Window Resize)

When the user calls `pty.resize(cols, rows)`:

1. Update `TerminalDiscipline.cols` and `TerminalDiscipline.rows`.
2. If the WASM process has registered a SIGWINCH handler (via the ctrlc-style signal stub), notify it.
3. For phase 1 of PTY support: programs that call `tiocgwinsz` will get the updated size on their next call. No async signal delivery.

### 10.8 /dev/tty

Add `/dev/tty` as a special device node in the VFS:

- Opening `/dev/tty` returns the controlling terminal's PTY slave.
- Reads from `/dev/tty` come from the PTY stdin (even if fd 0 has been redirected).
- Writes to `/dev/tty` go to the PTY stdout (even if fd 1 has been redirected).
- `isatty(fd)` returns true for fds opened on `/dev/tty`.

This is required by editors (kibi reads from `/dev/tty` directly) and interactive programs.

**Tests to add:**
- Open PTY, send keystrokes, receive output
- Canonical mode: line buffering, echo, backspace
- Raw mode: immediate character delivery, no echo
- Ctrl-C generates SIGINT (process exits with 130)
- Ctrl-D generates EOF
- Window size query returns correct dimensions
- Resize updates dimensions
- `/dev/tty` reads/writes work independently of stdin/stdout redirection
- xterm.js integration test (end-to-end)

---

## 11. Terminal Editor (sevi — wasmVM Vi)

### 11.1 Overview

Include a minimal vim-like terminal editor in the multicall binary. This enables interactive file editing within the wasmVM environment, which is essential for:
- AI agent workflows that need to edit files interactively
- Developer experience when using wasmVM as a terminal environment
- Feature parity with BusyBox (which includes `vi`)

### 11.2 Approach: Fork Kibi, Add Modal Editing

**Base:** [kibi](https://github.com/ilai-deutel/kibi) — a text editor in <= 1,024 lines of Rust.

**Why kibi:**
- Already compiles to `wasm32-wasip1` (CI-verified, has a dedicated `src/wasi.rs` platform module)
- Tiny footprint (~1,024 LOC, 2 dependencies: `unicode-width` + conditional `libc`)
- Direct ANSI escape code rendering (no ncurses, no crossterm, no termion)
- Handles terminal raw mode, window size detection, and `/dev/tty` reads on WASI
- Estimated WASM size impact: < 50 KB

**Why not other editors:**
- Helix, Amp, Ox, Smith, Zee — all depend on native terminal libraries (termion, crossterm, termbox) that are WASM-incompatible
- Ryvex — zero deps and vim-like but pre-release (2 GitHub stars), no WASI backend
- No existing Rust editor combines vim-style modal editing with WASM compatibility

### 11.3 Editor Name and Dispatch

The editor will be called `sevi` (wasmVM Vi) in the dispatch table, with aliases:

```rust
// In dispatch.rs
"vi"     => sevi::main(args),
"vim"    => sevi::main(args),
"sevi"   => sevi::main(args),
"editor" => sevi::main(args),
```

### 11.4 Implementation Plan

**Phase 1: Vendor and integrate kibi (nano-style)**

1. Vendor kibi source into `wasmcore/crates/sevi/`.
2. Adapt kibi's `main()` to work as a library function callable from the dispatch table.
3. Verify it compiles and runs in the wasmVM WASM environment.
4. Wire up PTY support (section 10) so the editor gets raw terminal I/O.
5. At this point we have a working nano-style editor.

**Phase 2: Add vim modal editing**

Rewrite kibi's `process_keypress` function to implement a modal state machine:

```rust
enum Mode {
    Normal,
    Insert,
    Command,
    Visual,
    Search,
}

struct Editor {
    mode: Mode,
    // ... existing kibi fields
}
```

**Normal mode keybindings:**

| Key | Action |
|-----|--------|
| `h`, `j`, `k`, `l` | Cursor movement (left, down, up, right) |
| `w`, `b`, `e` | Word forward, word back, end of word |
| `0`, `$` | Start/end of line |
| `gg`, `G` | Start/end of file |
| `i` | Enter insert mode at cursor |
| `I` | Enter insert mode at start of line |
| `a` | Enter insert mode after cursor |
| `A` | Enter insert mode at end of line |
| `o` | Open line below, enter insert mode |
| `O` | Open line above, enter insert mode |
| `x` | Delete character under cursor |
| `dd` | Delete current line |
| `yy` | Yank (copy) current line |
| `p` | Paste below |
| `P` | Paste above |
| `u` | Undo |
| `Ctrl-R` | Redo |
| `/` | Enter search mode (forward) |
| `?` | Enter search mode (backward) |
| `n`, `N` | Next/previous search match |
| `:` | Enter command mode |
| `v` | Enter visual mode |
| `V` | Enter visual line mode |

**Insert mode:**

| Key | Action |
|-----|--------|
| `Esc` | Return to normal mode |
| All other keys | Insert character at cursor |
| `Backspace` | Delete character before cursor |

**Command mode (`:` prefix):**

| Command | Action |
|---------|--------|
| `:w` | Write file |
| `:q` | Quit (fail if unsaved changes) |
| `:wq`, `:x` | Write and quit |
| `:q!` | Force quit (discard changes) |
| `:w filename` | Write to specific file |
| `:e filename` | Open file |
| `:set number` | Toggle line numbers |
| `:%s/old/new/g` | Search and replace |

**Visual mode:**

| Key | Action |
|-----|--------|
| `h`, `j`, `k`, `l` | Extend selection |
| `d` | Delete selection |
| `y` | Yank selection |
| `Esc` | Cancel selection |

### 11.5 Terminal I/O Integration

The editor requires raw terminal I/O (section 10):

1. On startup, call `tcsetattr` to enter raw mode (disable ICANON, ECHO, ISIG).
2. Read keystrokes byte-by-byte from `/dev/tty` (or fd 0 if it's a TTY).
3. Write ANSI escape sequences to stdout for screen rendering:
   - `\x1b[2J` — clear screen
   - `\x1b[H` — move cursor to home
   - `\x1b[{row};{col}H` — move cursor to position
   - `\x1b[K` — clear to end of line
   - `\x1b[7m` / `\x1b[m` — reverse video / reset (for status bar, selections)
4. Query terminal size via `tiocgwinsz` (falls back to cursor-probe method on WASI).
5. On exit, restore canonical mode via `tcsetattr`.

Kibi's existing WASI platform module (`wasi.rs`) already handles steps 2-4. The PTY layer (section 10) provides the host-side implementation.

### 11.6 Crate Structure

```
wasmcore/crates/sevi/
├── Cargo.toml
└── src/
    ├── lib.rs           # Entry point (adapted from kibi main)
    ├── editor.rs        # Core editor state and rendering
    ├── buffer.rs        # Text buffer (lines, insert, delete)
    ├── mode.rs          # Modal state machine (normal, insert, command, visual, search)
    ├── keymap.rs        # Key-to-action mapping per mode
    ├── terminal.rs      # ANSI escape code rendering
    ├── undo.rs          # Undo/redo stack
    ├── search.rs        # Search and replace
    └── syntax.rs        # Basic syntax highlighting (optional, phase 3)
```

Estimated size: ~2,000-2,500 lines of Rust (1,024 from kibi base + ~1,000-1,500 for modal editing).

### 11.7 Dependencies

- `unicode-width` (already in the tree via uutils)
- No new native dependencies
- No new WASM imports beyond `host_tty` (section 10.5)

Estimated WASM binary size impact: **< 100 KB** (conservative estimate including modal editing logic).

### 11.8 Tests

**Rust unit tests (in-crate):**
- Mode transitions (normal → insert → normal, normal → command → normal)
- Keymap resolution per mode
- Buffer operations (insert, delete line, yank, paste)
- Undo/redo stack
- Search pattern matching

**JS integration tests:**
- Open editor, type text, save file, verify VFS contents
- Open existing file, edit, save
- `:q!` discards changes
- Visual selection + delete
- Search and replace

---

## 12. Updated Implementation Order

Work should proceed in this order to maximize stability at each step:

### Phase A: Critical Fixes (P0)
1. Fix browser subprocess spawn race (2.1)
2. Fix VFS merge for pipeline stages (2.2)
3. Fix pipe race condition in inline execution (2.3)

### Phase B: High-Impact Fixes (P1)
4. Fix dup() cursor sharing (3.1)
5. Fix sed case-insensitive flag (3.2)
6. Implement command substitution (3.3)
7. Add Atomics.wait timeouts (3.4)
8. Replace string-based error matching (3.5)

### Phase C: Streaming I/O (section 9)
9. Implement StreamHandle and long-lived Worker protocol (9.2, 9.3)
10. Implement streaming stdin via SharedArrayBuffer (9.3)
11. Implement streaming stdout via postMessage (9.3)
12. Implement streaming pipeline API (9.4)

### Phase D: PTY Support (section 10)
13. Implement TerminalDiscipline (10.4)
14. Add host_tty WASM imports (10.5)
15. Implement canonical and raw mode (10.4)
16. Implement signal generation (Ctrl-C, Ctrl-D) (10.4)
17. Add /dev/tty VFS device (10.8)
18. Implement openPty() public API (10.3)
19. Wire SIGWINCH / resize (10.7)

### Phase E: Terminal Editor (section 11)
20. Vendor kibi, integrate into multicall binary (11.4 phase 1)
21. Verify raw terminal I/O via PTY layer (11.5)
22. Implement modal state machine (11.4 phase 2)
23. Implement normal mode keybindings (11.4)
24. Implement command mode (:w, :q, etc.) (11.4)
25. Implement visual mode (11.4)
26. Implement undo/redo (11.4)
27. Implement search and replace (11.4)

### Phase F: Test Coverage
28. Add grep integration tests (4.2)
29. Expand coreutils integration tests (4.3)
30. Expand subprocess tests (4.4)
31. Add Rust unit tests (4.5)
32. Add streaming I/O tests (9)
33. Add PTY tests (10)
34. Add editor tests (11.8)

### Phase G: Medium Improvements (P2)
35. Unlock more uutils commands (4.1)
36. Install wasm-opt, fix Makefile (4.6)
37. Glob symlink loop protection (4.7)
38. Process table cleanup (4.8)
39. FD reclamation (4.9)

### Phase H: Polish (P3)
40. sleep host callback (5.1)
41. chmod full mode bits (5.2)
42. ls -l (5.3)
43. Browser worker ENOSYS fix (5.4)
44. logname fix (5.5)
45. Here-documents (5.6)
46. Tilde expansion (5.7)
47. case/esac (5.8)
48. Arithmetic expansion (5.9)
49. find predicates (5.10)

---

## 13. Updated Success Criteria

This work is complete when:

1. All P0 and P1 items are implemented and tested.
2. All P2 test coverage items are complete (grep, coreutils, subprocess, Rust unit tests).
3. The dispatch table contains 100+ functional commands (not stubs).
4. `wasm-opt` is integrated and produces an optimized binary.
5. The shell supports command substitution, here-documents, and arithmetic expansion.
6. No known deadlock paths exist (all `Atomics.wait` calls have timeouts).
7. VFS changes are correctly preserved across all pipeline stages.
8. Browser subprocess spawning works reliably.
9. `execStream()` provides real-time stdin/stdout streaming to running processes.
10. `openPty()` provides a full PTY with canonical/raw mode, echo, and signal generation.
11. The `sevi` editor opens, edits, and saves files with vim-style modal keybindings.
12. An xterm.js terminal emulator can connect to `openPty()` and run interactive sessions.
13. All existing tests continue to pass.
14. Total test count exceeds 2,500 (up from ~1,500).

---

## Appendix A: Files Modified per Work Item

| Item | Files |
|------|-------|
| 2.1 Browser spawn | process.js |
| 2.2 VFS merge | pipeline.js |
| 2.3 Pipe race | process.js |
| 3.1 dup() cursor | fd-table.js, wasi-polyfill.js |
| 3.2 sed -i flag | sed.rs |
| 3.3 Command sub | shell.js |
| 3.4 Atomics timeout | ring-buffer.js, process.js |
| 3.5 Structured errors | vfs.js, wasi-polyfill.js |
| 4.1 More commands | uucore stubs, Cargo.toml, dispatch.rs |
| 4.2 grep tests | NEW: grep.test.js |
| 4.3 coreutils tests | coreutils.test.js, gnu-compat.test.js |
| 4.4 subprocess tests | subprocess.test.js |
| 4.5 Rust tests | grep.rs, sed.rs, find.rs, builtins.rs, jq.rs, awk.rs |
| 4.6 wasm-opt | Makefile |
| 4.7 Glob loops | shell.js |
| 4.8 Process cleanup | process.js |
| 4.9 FD reclaim | fd-table.js |
| 5.1 sleep | builtins.rs, wasi-ext lib.rs, process.js |
| 5.2 chmod | builtins.rs, vfs.js, wasi-polyfill.js |
| 5.3 ls -l | builtins.rs |
| 5.4 ENOSYS | worker-entry.browser.js |
| 5.5 logname | builtins.rs |
| 5.6 Here-docs | shell.js |
| 5.7 Tilde | shell.js |
| 5.8 case/esac | shell.js |
| 5.9 Arithmetic | shell.js |
| 5.10 find predicates | find.rs |
| 9.2 StreamHandle API | wasm-os.js, index.js |
| 9.3 Long-lived Workers | worker-entry.js, wasi-polyfill.js, ring-buffer.js |
| 9.4 Streaming pipelines | pipeline.js |
| 10.3 openPty() API | wasm-os.js |
| 10.4 TerminalDiscipline | NEW: pty.js |
| 10.5 host_tty imports | wasi-ext lib.rs, NEW: 0005-wasi-termios.patch |
| 10.8 /dev/tty | vfs.js, wasi-polyfill.js |
| 11 sevi editor | NEW: crates/sevi/*, dispatch.rs, Cargo.toml |
