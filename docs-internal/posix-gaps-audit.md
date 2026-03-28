# POSIX Implementation Gaps Audit

> Adversarial review of the WasmVM POSIX implementation. Goal: identify what breaks when real software runs unmodified.
>
> os-test conformance: 3347/3350 (99.9%) — but os-test only covers C library functions, not kernel/runtime behavior.
>
> Each claim was verified by independent adversarial agents reading the actual source code.

## WILL_BREAK — Real software fails

All 11 claims verified TRUE against source code.

| # | Issue | What breaks | Where | Verified |
|---|-------|-------------|-------|----------|
| 1 | **No server sockets** (bind/listen/accept) | nginx, Express, Redis, Postgres, any daemon | wasi-ext has no bind/listen/accept imports; 0008-sockets.patch is client-only | TRUE |
| 2 | **No Unix domain sockets** (AF_UNIX) | docker.sock, ssh-agent, systemd socket activation | net_connect takes "host:port" string, no AF_UNIX path | TRUE |
| 3 | **O_EXCL not checked in fdOpen** | Atomic lock file creation (SQLite, Make, pkg managers) | kernel.ts fdOpen only handles O_CREAT; O_EXCL stored but never checked | TRUE |
| 4 | **O_TRUNC not applied in kernel fdOpen** | Shell `>` redirect, log rotation, any "w" mode open | kernel.ts fdOpen never truncates; Node bridge does but WasmVM kernel doesn't | TRUE |
| 5 | **readdir missing "." and ".."** | tar, find, shell globbing, POSIX compliance | in-memory-fs.ts listDirEntries never synthesizes "." or ".." | TRUE |
| 6 | **Blocking flock() returns EAGAIN immediately** | File-based locks (databases, build tools) | file-lock.ts:61 comment: "Blocking not implemented — treat as EAGAIN" | TRUE |
| 7 | **Pipe write EAGAIN without O_NONBLOCK** | Large pipelines (`tar \| gzip \| aws s3 cp`) | pipe-manager.ts:107 throws EAGAIN on full buffer; no retry in fd_write handler | TRUE |
| 8 | **Unlink open file doesn't defer delete** | Temp file pattern (create, unlink, keep writing) | in-memory-fs.ts removeFile unconditionally deletes; no refcount check | TRUE |
| 9 | **No signal handlers** (sigaction/signal) | Servers, databases, graceful shutdown | No sigaction syscall; signals delivered by default actions only | TRUE |
| 10 | **WASM can't be interrupted mid-compute** | Ctrl+C during tight loops hangs | Tight loops bypass Atomics.wait; worker.terminate() is hard kill | TRUE |
| 11 | **All inodes are 0** | Hard link detection, backup tools, `find -inum` | in-memory-fs.ts lines 156,172,332 hardcode ino:0; no inode allocator | TRUE |

## TOO_THIN — Works for simple cases, breaks complex ones

Fact-check found 4 claims were FALSE or EXAGGERATED.

| # | Issue | What breaks | Verified | Notes |
|---|-------|-------------|----------|-------|
| 12 | **O_NONBLOCK not settable via fcntl F_SETFL** | Async I/O, event loops | ~~TRUE~~ **FALSE** | WasmVM fcntl.c DOES implement F_SETFL via __wasi_fd_fdstat_set_flags; only Node kernel lacks it |
| 13 | **PIPE_BUF atomicity not guaranteed** | Concurrent pipe writers | ~~TRUE~~ **FALSE** | JS is single-threaded — all pipe writes are atomic by definition; no interleaving possible |
| 14 | **pread/pwrite load entire file into memory** | Large file random access | ~~TRUE~~ **FALSE** | It's an InMemoryFS — files are already in memory; pread just slices a view. This is by design, not a bug |
| 15 | **/dev/ptmx stub** (doesn't allocate real PTY) | `script`, PTY-allocation | ~~TRUE~~ **FALSE** | Real PtyManager exists with full master/slave pairs, line discipline, and signal delivery. /dev/ptmx device-layer entry is VFS stub but PTY allocation happens via kernel ioctl |
| 16 | **poll() timeout -1 capped to 30s** | Event loops expecting indefinite blocking | **TRUE** | driver.ts:1098 hardcodes `timeout < 0 ? 30000 : timeout` |
| 17 | **No UDP sockets** | ping, DNS raw queries, DHCP | **TRUE** | SOCK_DGRAM accepted but silently creates TCP socket stub |
| 18 | **Socket send/recv ignore flags** (MSG_PEEK, MSG_DONTWAIT) | Protocol libraries | **TRUE** | Flags passed via RPC but never used in driver handlers |
| 19 | **setsockopt not implemented** (SO_REUSEADDR, TCP_NODELAY) | Port reuse, latency tuning | **TRUE** | kernel-worker.ts returns ENOSYS unconditionally |
| 20 | **Hard links don't increment nlink** | `ls -l`, backup dedup tools | **TRUE** | hardLinks Map tracked but stat always returns nlink:1 |
| 21 | **pthread_cond/barrier/rwlock/once not patched** | Python GIL, any C++ std::thread code | **TRUE** | Only mutex/key/attr patched; cond/barrier/rwlock/once use unpatched musl stubs that assume futex |
| 22 | **No iconv()** | Character set conversion | ~~TRUE~~ **FALSE** | musl's iconv IS compiled into wasi-libc; iconv.h available; charset support limited but present |
| 23 | **Timezone limited to UTC** | Locale-aware time formatting | **TRUE** | musl timezone code ifdef'd out for WASI; no tzdata in VFS; localtime returns UTC |
| 24 | **fcntl cloexec tracking limited to 256 FDs** | Programs with many open files | **TRUE** | fcntl.c:32 MAX_FDS=256; FDs >= 256 get EBADF |

## MISSING — Not implemented at all

Fact-check found several claims EXAGGERATED — the C interfaces exist but fail at WASI syscall layer (ENOSYS). The distinction matters: programs that check for availability at link time will succeed; programs that check at runtime will get clean errors.

| # | Issue | Verified | Notes |
|---|-------|----------|-------|
| 25 | No fork() | **EXAGGERATED** | fork() callable via musl but returns ENOSYS from WASI layer |
| 26 | No epoll | **EXAGGERATED** | epoll stubs exist in musl; fail with ENOSYS at SYS_epoll_create1 |
| 27 | No named pipes (mkfifo) | **EXAGGERATED** | mkfifo/mknod exist; fail with ENOSYS at SYS_mknodat |
| 28 | No shared memory | **EXAGGERATED** | shm_open/shmget exist; fail with ENOSYS at syscall layer |
| 29 | No /proc population | **TRUE** | /proc directory created but empty; no self/exe/cpuinfo |
| 30 | No mmap | **EXAGGERATED** | mmap available via `-lwasi-emulated-mman` emulation layer |

## What works well

- Text processing pipelines (grep, sed, awk, jq, sort)
- Shell scripting (bash 5.x compatible via brush-shell)
- Build systems (make with subcommand spawning)
- HTTP/HTTPS clients (curl, wget, git clone, npm install)
- Interactive terminals (real PTY with line discipline, Ctrl+C for children)
- File I/O basics (read, write, create, delete, rename)
- Cross-runtime process spawning (WasmVM <-> Node <-> Python)
- SQLite (single-threaded, file-based)
- iconv (character set conversion via musl)
- Full PTY allocation with master/slave pairs and signal delivery
- O_NONBLOCK settable via fcntl F_SETFL in WasmVM

## Corrected honest claim

> "POSIX shell scripts, text processing tools, and HTTP clients run unmodified. Server sockets (bind/listen/accept), custom signal handlers, and true multi-threading are not supported. Most POSIX C interfaces exist and link correctly but several kernel-level operations (O_EXCL, O_TRUNC, readdir ./.. , blocking flock, deferred unlink) are missing and will break programs that depend on them."

## Severity summary

- **11 confirmed WILL_BREAK** issues (all verified true)
- **9 confirmed TOO_THIN** issues (4 original claims debunked as false)
- **1 confirmed MISSING** issue (5 original claims were exaggerated — interfaces exist, ENOSYS at runtime)
- **4 claims were FALSE** (O_NONBLOCK works, PIPE_BUF atomic in JS, pread fine for InMemoryFS, real PTY exists)
- **1 claim was FALSE** (iconv exists in musl)
- **5 claims were EXAGGERATED** (fork/epoll/mkfifo/shm/mmap exist as C stubs returning ENOSYS)
