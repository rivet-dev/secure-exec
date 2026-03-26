# kernel Specification

## Purpose
Define behavioral contracts for the kernel OS layer: VFS interface semantics, FD table lifecycle, process table management, device layer intercepts, pipe manager blocking/EOF, command registry resolution, and permission deny-by-default wrapping.

## Requirements

### Requirement: VFS Interface Semantics
The kernel VFS SHALL provide a POSIX-like filesystem interface with consistent error behavior across all implementations (InMemoryFileSystem, NodeFileSystem, TestFileSystem).

#### Scenario: Read file returns content as bytes
- **WHEN** a caller invokes `readFile(path)` on an existing file
- **THEN** the VFS MUST return the file content as `Uint8Array`

#### Scenario: Read non-existent file throws ENOENT
- **WHEN** a caller invokes `readFile(path)` on a path that does not exist
- **THEN** the VFS MUST throw an error with code `ENOENT`

#### Scenario: Write file creates or overwrites content
- **WHEN** a caller invokes `writeFile(path, content)` with bytes or string content
- **THEN** the VFS MUST create the file if absent or overwrite if present, and subsequent `readFile` MUST return the written content

#### Scenario: mkdir with recursive option creates intermediate directories
- **WHEN** a caller invokes `mkdir(path, { recursive: true })` where intermediate directories do not exist
- **THEN** the VFS MUST create all intermediate directories along the path

#### Scenario: removeFile deletes a file
- **WHEN** a caller invokes `removeFile(path)` on an existing regular file
- **THEN** the file MUST be deleted and subsequent `exists(path)` MUST return false

#### Scenario: removeFile defers inode data deletion while FDs remain open
- **WHEN** the last directory entry for a file is removed while one or more existing FDs still reference that inode
- **THEN** the pathname MUST disappear from directory listings and `exists(path)` MUST return false, but reads and writes through the already-open FDs MUST continue to operate until the last reference closes

#### Scenario: removeDir deletes a directory
- **WHEN** a caller invokes `removeDir(path)` on an existing empty directory
- **THEN** the directory MUST be deleted

#### Scenario: rename moves a file atomically within the VFS
- **WHEN** a caller invokes `rename(oldPath, newPath)`
- **THEN** the file MUST be accessible at `newPath` and MUST NOT exist at `oldPath`

#### Scenario: stat returns VirtualStat with correct metadata
- **WHEN** a caller invokes `stat(path)` on an existing file or directory
- **THEN** the VFS MUST return a `VirtualStat` with `isDirectory`, `isSymbolicLink`, `size`, `mode`, `ino`, `nlink`, `uid`, `gid`, and timestamp fields (`atime`, `mtime`, `ctime`, `birthtime` in milliseconds)

#### Scenario: symlink and readlink round-trip
- **WHEN** a caller invokes `symlink(target, linkPath)` followed by `readlink(linkPath)`
- **THEN** `readlink` MUST return the original `target` path

#### Scenario: lstat does not follow symlinks
- **WHEN** a caller invokes `lstat(path)` on a symlink
- **THEN** the returned `VirtualStat` MUST describe the symlink itself, with `isSymbolicLink` returning true

#### Scenario: link creates a hard link sharing content
- **WHEN** a caller invokes `link(oldPath, newPath)`
- **THEN** both paths MUST reference the same content, and `stat` for both MUST report `nlink >= 2`

#### Scenario: hard links share a stable inode number
- **WHEN** two directory entries refer to the same file through `link(oldPath, newPath)`
- **THEN** `stat(oldPath).ino` and `stat(newPath).ino` MUST be identical until the inode is deleted

#### Scenario: readDirWithTypes returns entries with type information
- **WHEN** a caller invokes `readDirWithTypes(path)` on a directory containing files and subdirectories
- **THEN** the VFS MUST return `VirtualDirEntry[]` where each entry has `name`, `isDirectory`, and `isSymbolicLink` fields

#### Scenario: InMemoryFileSystem directory listings include self and parent entries
- **WHEN** a caller invokes `readDir(path)` or `readDirWithTypes(path)` against an `InMemoryFileSystem` directory
- **THEN** the listing MUST begin with `.` and `..`, and for `/` the `..` entry MUST refer back to the root directory

#### Scenario: chmod updates file permissions
- **WHEN** a caller invokes `chmod(path, mode)` on an existing file
- **THEN** subsequent `stat(path)` MUST reflect the updated `mode`

#### Scenario: truncate reduces file to specified length
- **WHEN** a caller invokes `truncate(path, length)` where length is less than current file size
- **THEN** subsequent `readFile(path)` MUST return content of exactly `length` bytes

### Requirement: FD Table Open/Close/Dup/Dup2/Fork Lifecycle
The kernel FD table SHALL manage per-process file descriptor allocation with reference-counted FileDescriptions and correct inheritance semantics.

#### Scenario: Open allocates the lowest available FD
- **WHEN** a process opens a file via `fdOpen(pid, path, flags)`
- **THEN** the FD table MUST allocate and return the lowest available file descriptor number

#### Scenario: Open with O_CREAT|O_EXCL rejects existing paths
- **WHEN** a process opens an already-existing path with `O_CREAT | O_EXCL`
- **THEN** `fdOpen` MUST fail with `EEXIST` before allocating a new FD

#### Scenario: Open with O_TRUNC truncates at open time
- **WHEN** a process opens an existing regular file with `O_TRUNC`
- **THEN** the file contents MUST be truncated to zero bytes before subsequent reads or writes through the returned FD

#### Scenario: Open with O_TRUNC|O_CREAT materializes an empty file
- **WHEN** a process opens a missing path with `O_TRUNC | O_CREAT`
- **THEN** the kernel MUST create an empty regular file during `fdOpen`

#### Scenario: Close decrements reference count and releases FD
- **WHEN** a process closes an FD via `fdClose(pid, fd)`
- **THEN** the FD entry MUST be removed from the process table and the underlying FileDescription's `refCount` MUST be decremented

#### Scenario: Close last reference cleans up FileDescription
- **WHEN** the last FD referencing a FileDescription is closed (refCount reaches 0)
- **THEN** the FileDescription MUST be eligible for cleanup

#### Scenario: Close last reference releases deferred-unlink inode data
- **WHEN** the last FD referencing an already-unlinked inode is closed
- **THEN** the kernel MUST release the inode's retained file data so no hidden data remains after the final close

#### Scenario: Dup creates a new FD sharing the same FileDescription
- **WHEN** a process duplicates an FD via `fdDup(pid, fd)`
- **THEN** a new FD MUST be allocated pointing to the same FileDescription, and the FileDescription's `refCount` MUST be incremented

#### Scenario: Dup2 redirects target FD to source FileDescription
- **WHEN** a process invokes `fdDup2(pid, oldFd, newFd)` and `newFd` is already open
- **THEN** `newFd` MUST be closed first, then reassigned to share `oldFd`'s FileDescription with `refCount` incremented

#### Scenario: Dup2 with same source and target is a no-op
- **WHEN** a process invokes `fdDup2(pid, fd, fd)` where oldFd equals newFd
- **THEN** the operation MUST succeed without closing or modifying the FD

#### Scenario: Fork copies the entire FD table to child process
- **WHEN** a process forks via `fork(parentPid, childPid)`
- **THEN** the child MUST receive a copy of all parent FD entries, each sharing the same FileDescription objects with `refCount` incremented for every inherited FD

#### Scenario: Stdio FDs 0, 1, 2 are pre-allocated
- **WHEN** a new FD table is created via `create(pid)` or `createWithStdio(pid, ...)`
- **THEN** FDs 0 (stdin), 1 (stdout), and 2 (stderr) MUST be pre-allocated before any user open calls

#### Scenario: FD cursor is shared across duplicated descriptors
- **WHEN** two FDs share a FileDescription (via dup or fork) and one advances the cursor via seek or read
- **THEN** both FDs MUST observe the updated cursor position since they share the same FileDescription

#### Scenario: closeAll releases all FDs on process exit
- **WHEN** a process exits and `closeAll()` is invoked on its FD table
- **THEN** all FDs MUST be closed and all FileDescription refCounts MUST be decremented

### Requirement: Advisory flock Semantics
The kernel SHALL provide advisory `flock()` semantics per file description, including blocking waits and cleanup on last close.

#### Scenario: Exclusive flock blocks until the prior holder unlocks
- **WHEN** process A holds `LOCK_EX` on a file and process B calls `flock(fd, LOCK_EX)` on the same file without `LOCK_NB`
- **THEN** process B MUST remain blocked until process A releases the lock, after which process B acquires it

#### Scenario: Non-blocking flock returns EAGAIN on conflict
- **WHEN** a conflicting advisory lock is already held and a caller uses `LOCK_NB`
- **THEN** `flock()` MUST fail immediately with `EAGAIN`

#### Scenario: flock waiters are served in FIFO order
- **WHEN** multiple callers are queued waiting for the same file lock
- **THEN** unlock MUST wake the next waiter in FIFO order so lock ownership advances predictably

#### Scenario: Last file description close releases flock state
- **WHEN** the final FD referencing a locked file description is closed or the owning process exits
- **THEN** the lock MUST be released and the next queued waiter MUST be eligible to acquire it

### Requirement: Process Table Register/Waitpid/Kill/Zombie Cleanup
The kernel process table SHALL manage process lifecycle with atomic PID allocation, signal delivery, and time-bounded zombie cleanup.

#### Scenario: allocatePid returns monotonically increasing PIDs
- **WHEN** the process table allocates PIDs via `allocatePid()`
- **THEN** each returned PID MUST be strictly greater than any previously allocated PID

#### Scenario: Register creates a running process entry
- **WHEN** a process is registered via `register(pid, driver, command, args, ctx, driverProcess)`
- **THEN** `get(pid)` MUST return a ProcessEntry with `status: "running"` and `exitCode: null`

#### Scenario: markExited transitions process to exited state
- **WHEN** `markExited(pid, exitCode)` is called on a running process
- **THEN** the process entry MUST transition to `status: "exited"` with the provided `exitCode` and `exitTime` set to the current timestamp

#### Scenario: waitpid resolves when process exits
- **WHEN** a caller invokes `waitpid(pid)` on a running process that later exits with code 0
- **THEN** the returned Promise MUST resolve with `{ pid, status: 0 }`

#### Scenario: waitpid on already-exited process resolves immediately
- **WHEN** a caller invokes `waitpid(pid)` on a process that has already exited
- **THEN** the Promise MUST resolve immediately with the recorded exit status

#### Scenario: kill sends signal to running process via driver
- **WHEN** a caller invokes `kill(pid, signal)` on a running process
- **THEN** the kernel MUST route the signal through `driverProcess.kill(signal)` on the process's DriverProcess handle

#### Scenario: kill on exited process is a no-op or throws
- **WHEN** a caller invokes `kill(pid, signal)` on a process with `status: "exited"`
- **THEN** the kernel MUST NOT attempt to deliver the signal to the driver

#### Scenario: Zombie processes are cleaned up after TTL
- **WHEN** a process exits and transitions to zombie state
- **THEN** the process entry MUST be cleaned up (removed from the table) after a bounded TTL (60 seconds)

#### Scenario: getppid returns parent PID
- **WHEN** a child process was spawned by a parent process
- **THEN** `getppid(childPid)` MUST return the parent's PID

#### Scenario: terminateAll sends SIGTERM to all running processes
- **WHEN** `terminateAll()` is invoked during kernel dispose
- **THEN** all running processes MUST receive SIGTERM, and after a bounded grace period, remaining processes MUST be force-cleaned

#### Scenario: listProcesses returns introspection snapshot
- **WHEN** `listProcesses()` is invoked
- **THEN** it MUST return a Map of PID to ProcessInfo containing `pid`, `ppid`, `driver`, `command`, `status`, and `exitCode` for every registered process

### Requirement: Kernel TimerTable Ownership And Process Cleanup
The kernel SHALL expose a shared timer table so runtimes can enforce per-process timer budgets and clear timer ownership on process exit.

#### Scenario: TimerTable is exposed to runtimes
- **WHEN** a runtime receives a kernel interface in a kernel-mediated environment
- **THEN** it MUST be able to access the shared `timerTable` for per-process timer allocation and cleanup

#### Scenario: Process exit clears kernel-owned timers
- **WHEN** a process exits through the kernel process lifecycle
- **THEN** any timers owned by that PID MUST be removed from the kernel `TimerTable`

### Requirement: Device Layer Intercepts and EPERM Rules
The kernel device layer SHALL transparently intercept `/dev/*` paths with fixed device semantics, pass non-device paths through to the underlying VFS, and deny mutation operations on devices.

#### Scenario: /dev/null read returns empty
- **WHEN** a read operation targets `/dev/null`
- **THEN** the device layer MUST return 0 bytes (empty Uint8Array)

#### Scenario: /dev/null write discards data
- **WHEN** a write operation targets `/dev/null`
- **THEN** the device layer MUST accept and discard the data without error

#### Scenario: /dev/zero read returns zero-filled bytes
- **WHEN** a read operation targets `/dev/zero`
- **THEN** the device layer MUST return a buffer of zero bytes (up to 4096 bytes)

#### Scenario: /dev/urandom read returns random bytes
- **WHEN** a read operation targets `/dev/urandom`
- **THEN** the device layer MUST return a buffer of random bytes (up to 4096 bytes) sourced from `crypto.getRandomValues` or a fallback

#### Scenario: Device stat returns fixed inode numbers
- **WHEN** `stat()` is called on a device path (e.g., `/dev/null`, `/dev/zero`, `/dev/urandom`)
- **THEN** the device layer MUST return a VirtualStat with a fixed inode number in the `0xffff_000X` range

#### Scenario: Remove or rename on device path throws EPERM
- **WHEN** a caller invokes `removeFile`, `removeDir`, or `rename` on a `/dev/*` path
- **THEN** the device layer MUST throw an error with code `EPERM`

#### Scenario: Link on device path throws EPERM
- **WHEN** a caller invokes `link` targeting a `/dev/*` path
- **THEN** the device layer MUST throw an error with code `EPERM`

#### Scenario: chmod/chown/utimes on device paths are no-ops
- **WHEN** a caller invokes `chmod`, `chown`, or `utimes` on a `/dev/*` path
- **THEN** the device layer MUST succeed silently without modifying any state

#### Scenario: /dev directory listing returns standard entries
- **WHEN** `readDir("/dev")` or `readDirWithTypes("/dev")` is called
- **THEN** the device layer MUST return standard device entries (`null`, `zero`, `urandom`, `stdin`, `stdout`, `stderr`)

#### Scenario: Non-device paths pass through to underlying VFS
- **WHEN** any filesystem operation targets a path outside `/dev/`
- **THEN** the device layer MUST delegate the operation to the underlying VFS without interception

### Requirement: Proc Filesystem Introspection
The kernel SHALL expose a read-only `/proc` pseudo-filesystem backed by live process and FD table state so runtimes can inspect `/proc/<pid>` consistently, while process-scoped runtime adapters resolve `/proc/self` to the caller PID.

#### Scenario: /proc root lists self and running PIDs
- **WHEN** a caller invokes `readDir("/proc")`
- **THEN** the listing MUST include a `self` entry and directory entries for every PID currently tracked by the kernel process table

#### Scenario: /proc/<pid>/fd lists live file descriptors
- **WHEN** a caller invokes `readDir("/proc/<pid>/fd")` for a live process
- **THEN** the listing MUST contain the process's currently open FD numbers from the kernel FD table

#### Scenario: /proc/<pid>/fd/<n> resolves to the underlying description path
- **WHEN** a caller invokes `readlink("/proc/<pid>/fd/<n>")` for an open FD
- **THEN** the kernel MUST return the backing file description path for that FD

#### Scenario: /proc/<pid>/cwd and exe expose process metadata
- **WHEN** a caller reads `/proc/<pid>/cwd` or `/proc/<pid>/exe`
- **THEN** the kernel MUST expose the process working directory and executable path for that PID

#### Scenario: /proc/<pid>/environ exposes NUL-delimited environment entries
- **WHEN** a caller reads `/proc/<pid>/environ`
- **THEN** the kernel MUST return the process environment as `KEY=value` entries delimited by `\0`, or an empty file when the process environment is empty

#### Scenario: /proc paths are read-only
- **WHEN** a caller invokes a mutating filesystem operation against `/proc` or any `/proc/...` path
- **THEN** the kernel MUST reject the operation with `EPERM`

#### Scenario: Process-scoped runtimes resolve /proc/self to the caller PID
- **WHEN** sandboxed code in a process-scoped runtime accesses `/proc/self/...`
- **THEN** the runtime-facing VFS MUST resolve that path as `/proc/<current_pid>/...` before delegating into the shared kernel proc filesystem

### Requirement: Pipe Manager Blocking Read/EOF/Drain
The kernel pipe manager SHALL provide buffered unidirectional pipes with blocking read semantics and proper EOF signaling on write-end closure.

#### Scenario: createPipe returns paired read and write ends
- **WHEN** `createPipe()` is invoked
- **THEN** the pipe manager MUST return `{ read, write }` PipeEnd objects with distinct FileDescriptions and `FILETYPE_PIPE` filetype

#### Scenario: Write delivers data to blocked reader
- **WHEN** data is written to a pipe's write end and a reader is blocked waiting
- **THEN** the data MUST be delivered directly to the waiting reader without buffering

#### Scenario: Write buffers data when no reader is waiting
- **WHEN** data is written to a pipe's write end and no reader is currently blocked
- **THEN** the data MUST be buffered in the pipe state for later reads

#### Scenario: Read returns buffered data immediately
- **WHEN** a read is performed on a pipe's read end and data is available in the buffer
- **THEN** the read MUST return the buffered data immediately without blocking

#### Scenario: Read blocks when buffer is empty and write end is open
- **WHEN** a read is performed on a pipe's read end with an empty buffer and the write end is still open
- **THEN** the read MUST block (return a pending Promise) until data is written or the write end is closed

#### Scenario: Blocking write waits when the pipe buffer is full
- **WHEN** a blocking write reaches `MAX_PIPE_BUFFER_BYTES` buffered data while the read end remains open
- **THEN** the write MUST suspend until a reader drains capacity or the pipe closes, rather than growing the buffer without bound

#### Scenario: Pipe reads wake one blocked writer after draining capacity
- **WHEN** a read consumes buffered pipe data while one or more writers are blocked on buffer capacity
- **THEN** the pipe manager MUST wake the next blocked writer so it can continue writing in FIFO order

#### Scenario: Non-blocking pipe write returns EAGAIN on a full buffer
- **WHEN** a pipe write end has `O_NONBLOCK` set and a write finds no remaining buffer capacity
- **THEN** the write MUST fail immediately with `EAGAIN`

#### Scenario: Blocking pipe writes preserve partial progress
- **WHEN** only part of a blocking write fits before the pipe buffer becomes full
- **THEN** the pipe manager MUST commit the bytes that fit, then block for the remainder until more capacity is available

#### Scenario: Read returns null (EOF) when write end is closed and buffer is empty
- **WHEN** a read is performed on a pipe's read end after the write end has been closed and the buffer is drained
- **THEN** the read MUST return `null` signaling EOF

#### Scenario: Closing write end notifies all blocked readers with EOF
- **WHEN** the write end of a pipe is closed and readers are blocked waiting for data
- **THEN** all blocked readers MUST be notified with `null` (EOF)

#### Scenario: Closing the read end wakes blocked writers with EPIPE
- **WHEN** writers are blocked waiting for pipe capacity and the read end is closed
- **THEN** those writers MUST wake and fail with `EPIPE`

#### Scenario: Pipes work across runtime drivers
- **WHEN** a pipe connects a process in one runtime driver (e.g., WasmVM) to a process in another (e.g., Node)
- **THEN** data MUST flow through the kernel pipe manager transparently, with the same blocking/EOF semantics

#### Scenario: createPipeFDs installs both ends in process FD table
- **WHEN** `createPipeFDs(fdTable)` is invoked
- **THEN** the pipe manager MUST create a pipe and install both read and write FileDescriptions as FDs in the specified FD table, returning `{ readFd, writeFd }`

### Requirement: Socket Blocking Waits Respect Signal Handlers
The kernel socket table SHALL allow blocking accept/recv waits to observe delivered signals so POSIX-style syscall interruption semantics can be enforced.

#### Scenario: sigaction registration preserves mask and flags
- **WHEN** a runtime registers a caught signal disposition with a signal mask and `SA_*` flags
- **THEN** the kernel MUST retain the handler, blocked-signal mask, and raw flag bits so later delivery and wait-restart behavior observes the same metadata

#### Scenario: SA_RESETHAND resets a caught handler after first delivery
- **WHEN** a process delivers a caught signal whose registered handler includes `SA_RESETHAND`
- **THEN** the kernel MUST invoke that handler once and reset the disposition to `SIG_DFL` before any subsequent delivery of the same signal

#### Scenario: recv interrupted without SA_RESTART returns EINTR
- **WHEN** a process is blocked in a socket `recv` wait and a caught signal is delivered whose handler does not include `SA_RESTART`
- **THEN** the wait MUST reject with `EINTR`

#### Scenario: recv interrupted with SA_RESTART resumes waiting
- **WHEN** a process is blocked in a socket `recv` wait and a caught signal is delivered whose handler includes `SA_RESTART`
- **THEN** the wait MUST resume transparently until data arrives or EOF occurs

### Requirement: Non-blocking Socket Operations Return Immediate Status
The kernel socket table SHALL respect per-socket non-blocking mode for read, accept, and external connect operations.

#### Scenario: recv on a non-blocking socket returns EAGAIN when empty
- **WHEN** `recv` is called on a socket whose `nonBlocking` flag is set and no data or EOF is available
- **THEN** the call MUST fail immediately with `EAGAIN`

#### Scenario: accept on a non-blocking listening socket returns EAGAIN when backlog is empty
- **WHEN** `accept` is called on a listening socket whose `nonBlocking` flag is set and there are no queued connections
- **THEN** the call MUST fail immediately with `EAGAIN`

#### Scenario: external connect on a non-blocking socket returns EINPROGRESS
- **WHEN** `connect` is called on a non-blocking socket for an external address routed through the host adapter
- **THEN** the call MUST fail immediately with `EINPROGRESS` while the host-side connection continues asynchronously

#### Scenario: accept interrupted with SA_RESTART resumes waiting
- **WHEN** a process is blocked in a socket `accept` wait and a caught signal is delivered whose handler includes `SA_RESTART`
- **THEN** the wait MUST resume transparently until a connection is available

### Requirement: Socket Bind and Listen Preserve Bounded Listener State
The kernel socket table SHALL reserve listener ports deterministically for loopback routing while keeping pending connection queues bounded.

#### Scenario: bind with port 0 assigns a kernel ephemeral port
- **WHEN** an internet-domain socket is bound with `port: 0` for kernel-managed routing
- **THEN** the socket MUST be assigned a free port in the ephemeral range and `localAddr.port` MUST reflect that assigned value instead of `0`

#### Scenario: loopback connect refuses when listener backlog is full
- **WHEN** a loopback `connect()` targets a listening socket whose pending backlog already reached the configured `listen(backlog)` capacity
- **THEN** the connection MUST fail with `ECONNREFUSED` instead of growing the backlog without bound

### Requirement: Command Registry Resolution and /bin Population
The kernel command registry SHALL map command names to runtime drivers and populate `/bin` stubs for shell PATH-based resolution.

#### Scenario: Register adds driver commands to the registry
- **WHEN** `register(driver)` is called with a RuntimeDriver whose `commands` array contains `["grep", "sed", "awk"]`
- **THEN** all three commands MUST be resolvable via `resolve(command)` returning that driver

#### Scenario: Last-registered driver wins on command conflicts
- **WHEN** two drivers register the same command name
- **THEN** `resolve(command)` MUST return the last-registered driver for that command

#### Scenario: Resolve returns null for unregistered commands
- **WHEN** `resolve(command)` is called with a command that no driver has registered
- **THEN** the registry MUST return `null`

#### Scenario: list returns all registered command-to-driver mappings
- **WHEN** `list()` is called after drivers are registered
- **THEN** it MUST return a Map of command names to driver names for all registered commands

#### Scenario: populateBin creates stub files for all commands
- **WHEN** `populateBin(vfs)` is called
- **THEN** the registry MUST create `/bin` directory (if absent) and write a stub file for each registered command so that shell PATH lookup can resolve them

### Requirement: Permission Deny-by-Default Wrapping
The kernel permission system SHALL wrap VFS and environment access with deny-by-default permission checks, failing closed when no permission is configured.

#### Scenario: No permission configured denies all operations
- **WHEN** a VFS is wrapped via `wrapFileSystem(fs, permissions)` with no `fs` permission check configured
- **THEN** all filesystem operations MUST be denied by default

#### Scenario: Allowed operation passes through to underlying VFS
- **WHEN** a VFS is wrapped with a permission check that returns `{ allow: true }` for a given operation
- **THEN** the operation MUST be delegated to the underlying VFS and return its result

#### Scenario: Denied operation throws permission error
- **WHEN** a VFS is wrapped and the permission check returns `{ allow: false, reason: "..." }` for a given operation
- **THEN** the operation MUST throw an error indicating permission denial with the provided reason

#### Scenario: filterEnv only returns allowed environment keys
- **WHEN** `filterEnv(env, permissions)` is called with an env permission check
- **THEN** only environment keys for which the permission check returns `{ allow: true }` MUST be included in the filtered result

#### Scenario: Permission checks receive correct operation metadata
- **WHEN** a permission-wrapped VFS operation is invoked (e.g., `readFile("/etc/passwd")`)
- **THEN** the permission check MUST receive an `FsAccessRequest` with the correct `op` (e.g., `"read"`) and `path`

#### Scenario: Network and child-process permissions follow deny-by-default
- **WHEN** network or child-process permission checks are configured
- **THEN** operations without explicit allowance MUST be denied, consistent with the fs permission model

#### Scenario: Kernel-created socket tables inherit deny-by-default network enforcement
- **WHEN** `createKernel({ permissions })` constructs the shared `SocketTable`
- **THEN** the socket table MUST enforce `permissions.network` for host-visible `listen`, external `connect`, external `send`, host-backed UDP `sendTo`, and host-backed listen/bind operations
- **AND** when `permissions.network` is missing those external socket operations MUST fail with `EACCES`
- **AND** loopback routing to kernel-owned listeners MUST remain allowed without a host-network allow rule

#### Scenario: Preset allowAll grants all operations
- **WHEN** `allowAll` permission preset is used
- **THEN** all filesystem, network, child-process, and env operations MUST be allowed
