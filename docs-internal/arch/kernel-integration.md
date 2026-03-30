# Kernel Architecture & WasmVM Integration

> Spec for restructuring secure-exec into a kernel-based OS with pluggable runtime drivers, and migrating the WasmVM (formerly SEOS) codebase into the monorepo.

**Status:** Draft
**Date:** 2026-03-16
**Supersedes:** SEOS `notes/specs/seos-mvp.md`, `notes/specs/seos-tool-completeness.md`

---

## Table of Contents

1. [Goals](#1-goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Kernel Design](#4-kernel-design)
5. [OS Layer](#5-os-layer)
6. [Runtime Driver Interface](#6-runtime-driver-interface)
7. [WasmVM Runtime](#7-wasmvm-runtime)
8. [Node Runtime](#8-node-runtime)
9. [Python Runtime](#9-python-runtime)
10. [Consumer API](#10-consumer-api)
11. [VFS Expansion](#11-vfs-expansion)
12. [Migration Plan](#12-migration-plan)
13. [Complete Final Project Structure](#13-complete-final-project-structure)
14. [Implementation Phases](#14-implementation-phases)
15. [Deferred Work](#15-deferred-work)

---

## 1. Goals

1. **Unified OS kernel** — A single kernel provides VFS, FD table, process table, device nodes, pipes, command registry, and permissions. All runtimes share the same kernel instance.

2. **Pluggable runtimes** — WasmVM (Unix commands), Node (V8 isolate), and Python (Pyodide) are runtime drivers that mount into the kernel. Each registers the commands it provides.

3. **Consistent behavior** — `cat /tmp/foo.txt` produces the same result whether executed from WasmVM, a Node script, or a Python script. All three runtimes see the same filesystem, FD table, and process table.

4. **Single monorepo** — The entire WasmVM codebase (Rust multicall binary, TypeScript host, patches, stubs, tests, docs, notes, scripts) merges into the secure-exec monorepo.

5. **Mount API** — Consumers create a kernel, mount the runtimes they need, and execute commands. Unused runtimes are not initialized.

---

## 2. Architecture Overview

```
                         Consumer API
                     createKernel() + mount()
                              │
                    ┌─────────┴─────────┐
                    │      Kernel        │
                    │  ┌──────────────┐  │
                    │  │ VFS          │  │  ← POSIX-complete virtual filesystem
                    │  │ FD Table     │  │  ← Per-PID file descriptors, shared cursors
                    │  │ Process Table│  │  ← PIDs, parent-child, waitpid, signals
                    │  │ Device Layer │  │  ← /dev/null, /dev/stdin, /dev/stdout, /dev/stderr
                    │  │ Pipe Manager │  │  ← Cross-runtime pipes (SharedArrayBuffer)
                    │  │ Command Reg. │  │  ← Command name → runtime driver routing
                    │  │ Permissions  │  │  ← Deny-by-default access control
                    │  └──────────────┘  │
                    └─────────┬──────────┘
                              │
               ┌──────────────┼──────────────┐
               │              │              │
          ┌────┴────┐   ┌────┴────┐   ┌─────┴─────┐
          │ WasmVM  │   │  Node   │   │  Python   │
          │ Runtime │   │ Runtime │   │  Runtime  │
          │         │   │         │   │           │
          │ WASM    │   │ V8      │   │ Pyodide   │
          │ multicall│  │ isolate │   │ worker    │
          │ binary  │   │         │   │           │
          └─────────┘   └─────────┘   └───────────┘
           sh, bash,     node, npm,    python, pip
           grep, sed,    npx
           cat, ls, ...
```

### Key Principle

The kernel is the OS. Runtimes are execution engines. The kernel owns all shared state. Runtimes make "syscalls" to the kernel for filesystem, process, pipe, and FD operations.

### Communication Model

All kernel operations run on the **main thread** (the event loop). Each runtime's processes run in their own execution context:

| Runtime | Execution Context | Sync Mechanism |
|---------|------------------|----------------|
| WasmVM  | Web Worker (WASM instance) | SharedArrayBuffer + Atomics.wait |
| Node    | V8 Isolate | Reference (applySyncPromise) |
| Python  | Node Worker (Pyodide) | Worker postMessage |

The main thread services all runtimes via the event loop. When a WasmVM Worker needs a file, it posts a message and blocks on `Atomics.wait`. The main thread handles the request and calls `Atomics.notify`. When a V8 isolate needs a file, the Reference suspends the isolate, the main thread resolves the promise, and the isolate resumes. No dedicated kernel worker needed.

---

## 3. Monorepo Structure

### Target Layout

```
secure-exec/                           ← monorepo root
├── packages/
│   ├── kernel/                        ← NEW: OS kernel (core types + implementation)
│   │   ├── src/
│   │   │   ├── index.ts              ← Public exports
│   │   │   ├── types.ts             ← Kernel, RuntimeDriver, ProcessContext interfaces
│   │   │   ├── kernel.ts            ← Kernel class implementation
│   │   │   ├── vfs.ts               ← VirtualFileSystem interface (POSIX-complete)
│   │   │   ├── fd-table.ts          ← Per-PID FD table, shared FileDescriptions
│   │   │   ├── process-table.ts     ← PID allocation, parent-child, waitpid, signals
│   │   │   ├── device-layer.ts      ← /dev/null, /dev/stdin, /dev/stdout, /dev/stderr
│   │   │   ├── pipe-manager.ts      ← Cross-runtime pipe creation & management
│   │   │   ├── command-registry.ts  ← Command name → driver routing, PATH resolution
│   │   │   └── permissions.ts       ← Permission checking (deny-by-default)
│   │   ├── test/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── os/                            ← NEW: Platform-specific implementations
│   │   ├── node/                     ← Node.js platform adapter
│   │   │   ├── src/
│   │   │   │   ├── filesystem.ts    ← NodeFileSystem (wraps node:fs)
│   │   │   │   ├── worker.ts        ← node:worker_threads adapter
│   │   │   │   └── index.ts
│   │   │   └── package.json
│   │   └── browser/                  ← Browser platform adapter
│   │       ├── src/
│   │       │   ├── filesystem.ts    ← InMemoryFileSystem, OpfsFileSystem
│   │       │   ├── worker.ts        ← Web Worker adapter
│   │       │   └── index.ts
│   │       └── package.json
│   │
│   ├── runtime/
│   │   ├── node/                     ← EXISTING (reorganized from packages/secure-exec)
│   │   │   ├── src/
│   │   │   │   ├── driver.ts        ← createNodeRuntime() → RuntimeDriver
│   │   │   │   ├── execution-driver.ts ← V8 isolate lifecycle
│   │   │   │   ├── bridge/          ← Node.js API polyfills inside isolate
│   │   │   │   │   ├── fs.ts
│   │   │   │   │   ├── child-process.ts
│   │   │   │   │   ├── process.ts
│   │   │   │   │   ├── network.ts
│   │   │   │   │   ├── os.ts
│   │   │   │   │   ├── module.ts
│   │   │   │   │   └── active-handles.ts
│   │   │   │   ├── bridge-contract.ts
│   │   │   │   └── module-access.ts
│   │   │   ├── test/
│   │   │   └── package.json
│   │   │
│   │   ├── python/                   ← EXISTING (reorganized from packages/secure-exec)
│   │   │   ├── src/
│   │   │   │   ├── driver.ts        ← createPythonRuntime() → RuntimeDriver
│   │   │   │   └── pyodide-worker.ts
│   │   │   ├── test/
│   │   │   └── package.json
│   │   │
│   │   └── wasmvm/                   ← NEW: migrated from ~/seos
│   │       ├── src/                  ← TypeScript host (thinned WASI-to-kernel translation)
│   │       │   ├── driver.ts        ← createWasmVmRuntime() → RuntimeDriver
│   │       │   ├── wasi-polyfill.ts ← WASI syscalls → kernel calls (thinned)
│   │       │   ├── worker-entry.ts  ← Worker bootstrap for WASM execution
│   │       │   ├── worker-entry.browser.ts
│   │       │   └── ring-buffer.ts   ← Internal WASM-to-WASM optimization
│   │       ├── test/                ← All TypeScript tests from wasmcore/host/test/
│   │       ├── package.json
│   │       └── tsconfig.json
│   │
│   ├── secure-exec/                  ← EXISTING: top-level convenience package
│   │   ├── src/
│   │   │   └── index.ts            ← Re-exports kernel + all runtimes + all OS adapters
│   │   └── package.json
│   │
│   ├── typescript/       ← EXISTING: TypeScript compiler tools
│   ├── playground/                   ← EXISTING: web demo
│   └── website/                      ← EXISTING: docs site
│
├── wasmvm/                            ← NEW: Rust workspace (migrated from ~/seos/wasmcore)
│   ├── Cargo.toml                    ← Workspace: multicall, shims, wasi-ext
│   ├── Cargo.lock
│   ├── rust-toolchain.toml           ← nightly-2026-03-01, target wasm32-wasip1
│   ├── Makefile                      ← Build orchestration
│   ├── .cargo/config.toml            ← Vendor source replacement
│   ├── crates/
│   │   ├── multicall/                ← Main WASM binary (90+ commands)
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   │       ├── main.rs          ← wasm_main() entry point
│   │   │       ├── dispatch.rs      ← Command routing
│   │   │       ├── builtins.rs      ← Built-in command implementations
│   │   │       ├── find.rs, grep.rs, rg.rs, awk.rs, jq.rs, ...
│   │   │       └── ...
│   │   ├── shims/                    ← Subprocess command stubs (env, timeout, xargs, ...)
│   │   └── wasi-ext/                 ← Custom WASI import bindings
│   ├── stubs/                        ← WASM-incompatible dependency replacements
│   │   ├── ctrlc/                    ← Signal handling no-op
│   │   ├── hostname/                 ← Returns "wasm-host"
│   │   └── uucore/                   ← WASI-compatible uutils core subset
│   ├── patches/
│   │   ├── 0001-wasi-process-spawn.patch
│   │   ├── 0002-wasi-pipe-support.patch
│   │   ├── 0002-wasi-fd-dup.patch
│   │   ├── 0003-wasi-user-group.patch
│   │   ├── 0004-wasi-isatty.patch
│   │   ├── 0005-wasi-temp-dir.patch
│   │   └── crates/                   ← 16+ crate-level patches
│   ├── scripts/
│   │   ├── patch-std.sh              ← Patches Rust std for WASI
│   │   └── patch-vendor.sh           ← Applies crate patches
│   └── vendor/                       ← .gitignored, generated by cargo vendor
│
├── docs/                              ← EXISTING: public documentation
│   ├── compatibility-matrix.md       ← Migrated from ~/seos/docs/
│   ├── prior-art.md                  ← Migrated from ~/seos/docs/
│   └── ... (existing secure-exec docs)
│
├── docs-internal/                     ← EXISTING: internal documentation
│   ├── arch/
│   │   ├── kernel-integration.md    ← THIS SPEC
│   │   ├── overview.md              ← Existing architecture overview
│   │   └── active-handles.md
│   ├── research/                     ← Existing + migrated from ~/seos/notes/research/
│   │   ├── js-vs-wasm-os-layer.md
│   │   ├── shell-architecture-options.md
│   │   ├── brush-wasm-integration.md
│   │   └── ... (existing secure-exec research)
│   ├── specs/                        ← Migrated from ~/seos/notes/specs/
│   │   ├── wasmvm-mvp.md
│   │   ├── wasmvm-post-mvp.md
│   │   └── wasmvm-tool-completeness.md
│   ├── todo.md                       ← Existing + merged from ~/seos/notes/todo.md
│   ├── friction.md                   ← Existing
│   └── glossary.md                   ← Existing
│
├── .agent/contracts/                  ← EXISTING: behavioral contracts
├── CLAUDE.md                          ← Merged from both repos
├── prd.json                           ← Migrated from ~/seos/prd.json
├── progress.txt                       ← Migrated from ~/seos/progress.txt
├── turbo.json                         ← Updated with new packages
├── pnpm-workspace.yaml               ← Updated with new packages
└── package.json                       ← Root workspace
```

### Workspace Configuration

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'packages/os/*'
  - 'packages/runtime/*'
```

---

## 4. Kernel Design

The kernel is the shared OS layer. It is platform-agnostic (no Node.js or browser APIs — those come from the OS layer).

### 4.1 Core Types

```typescript
// packages/kernel/src/types.ts

interface KernelOptions {
  filesystem: VirtualFileSystem;     // Provided by os/node or os/browser
  permissions?: Permissions;          // Deny-by-default
  env?: Record<string, string>;      // Initial environment variables
  cwd?: string;                      // Initial working directory (default: /home/user)
}

interface Kernel {
  // Lifecycle
  mount(driver: RuntimeDriver): void;
  dispose(): Promise<void>;

  // Execution (high-level — always goes through shell)
  // Equivalent to: spawn('sh', ['-c', command])
  // Throws if no shell is mounted (e.g. no WasmVM runtime)
  // Use spawn() directly for shell-less kernels
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  // Process spawning (low-level — no shell interpretation)
  spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess;

  // Filesystem access (convenience wrappers over VFS)
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<VirtualStat>;
  exists(path: string): Promise<boolean>;

  // Introspection
  readonly commands: ReadonlyMap<string, string>;  // command → driver name
  readonly processes: ReadonlyMap<number, ProcessInfo>;
}

interface ExecOptions {
  env?: Record<string, string>;
  cwd?: string;
  stdin?: string | Uint8Array;
  timeout?: number;
  onStdout?: (data: Uint8Array) => void;
  onStderr?: (data: Uint8Array) => void;
}

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SpawnOptions extends ExecOptions {
  stdio?: 'pipe' | 'inherit';
}

interface ManagedProcess {
  pid: number;
  writeStdin(data: Uint8Array | string): void;
  closeStdin(): void;
  kill(signal?: number): void;
  wait(): Promise<number>;
  readonly exitCode: number | null;
}
```

### 4.2 Runtime Driver Interface

```typescript
// packages/kernel/src/types.ts

interface RuntimeDriver {
  /** Driver name (e.g. 'wasmvm', 'node', 'python') */
  name: string;

  /** Commands this driver handles */
  commands: string[];

  /**
   * Called when the driver is mounted to the kernel.
   * Use this to initialize resources (compile WASM, load Pyodide, etc.)
   */
  init(kernel: KernelInterface): Promise<void>;

  /**
   * Spawn a process for the given command.
   * The kernel has already resolved the command to this driver.
   */
  spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess;

  /** Cleanup resources */
  dispose(): Promise<void>;
}

interface ProcessContext {
  pid: number;
  ppid: number;
  env: Record<string, string>;
  cwd: string;
  fds: { stdin: number; stdout: number; stderr: number };
}

interface DriverProcess {
  /** Called by kernel when data is written to this process's stdin FD */
  writeStdin(data: Uint8Array): void;
  closeStdin(): void;

  /** Called by kernel to terminate the process */
  kill(signal: number): void;

  /** Resolves with exit code when process completes */
  wait(): Promise<number>;

  /** Callbacks for the driver to push data to the kernel */
  onStdout: ((data: Uint8Array) => void) | null;
  onStderr: ((data: Uint8Array) => void) | null;
  onExit: ((code: number) => void) | null;
}

/**
 * Interface the kernel exposes TO drivers.
 * Drivers call these methods for kernel services (filesystem, process spawning, etc.)
 */
interface KernelInterface {
  // VFS operations (for drivers that need filesystem access)
  vfs: VirtualFileSystem;

  // FD operations (per-PID)
  fdOpen(pid: number, path: string, flags: number, mode?: number): number;
  fdRead(pid: number, fd: number, length: number): Uint8Array;
  fdWrite(pid: number, fd: number, data: Uint8Array): number;
  fdClose(pid: number, fd: number): void;
  fdSeek(pid: number, fd: number, offset: bigint, whence: number): bigint;
  fdDup(pid: number, fd: number): number;
  fdDup2(pid: number, oldFd: number, newFd: number): void;
  fdStat(pid: number, fd: number): FDStat;

  // Process operations
  spawn(command: string, args: string[], ctx: Partial<ProcessContext>): ManagedProcess;
  waitpid(pid: number, options?: number): Promise<{ pid: number; status: number }>;
  kill(pid: number, signal: number): void;
  getpid(pid: number): number;
  getppid(pid: number): number;

  // Pipe operations
  pipe(): { readFd: number; writeFd: number };

  // Environment
  getenv(pid: number): Record<string, string>;
  getcwd(pid: number): string;
}
```

### 4.3 FD Table

Moves from WasmVM's `fd-table.ts` to the kernel. Becomes per-PID with shared file descriptions.

```typescript
// packages/kernel/src/fd-table.ts

interface FileDescription {
  id: number;
  path: string;
  cursor: bigint;
  flags: number;        // O_RDONLY, O_WRONLY, O_RDWR, O_APPEND, etc.
  refCount: number;     // Shared across dup'd FDs
}

interface FDEntry {
  fd: number;
  description: FileDescription;  // Shared reference
  rights: bigint;                // WASI-compatible capability bits
  filetype: number;              // Regular file, directory, device, pipe, etc.
}
```

Key behaviors:
- **Per-PID**: Each process has its own FD number → FDEntry mapping
- **Shared FileDescriptions**: `dup(fd)` creates a new FDEntry pointing to the same FileDescription (shared cursor)
- **Inheritance**: When a process spawns a child, the child gets copies of the parent's FD table, sharing the same FileDescriptions
- **Standard FDs**: FD 0 (stdin), 1 (stdout), 2 (stderr) are pre-allocated per process
- **Pipe FDs**: Kernel creates pipe FDs that connect two processes

### 4.4 Process Table

Moves from WasmVM's `process.ts` to the kernel. Becomes universal across all runtimes.

```typescript
// packages/kernel/src/process-table.ts

interface ProcessEntry {
  pid: number;
  ppid: number;
  driver: string;          // 'wasmvm', 'node', 'python'
  command: string;         // 'grep', 'node', 'python'
  args: string[];
  status: 'running' | 'stopped' | 'exited';
  exitCode: number | null;
  exitTime: number | null;
  env: Record<string, string>;
  cwd: string;
  driverProcess: DriverProcess;  // Handle to the runtime's process object
}
```

Key behaviors:
- **PID allocation**: Sequential, shared across all runtimes (PID 1 might be a WasmVM process, PID 2 a Node process)
- **waitpid**: Works cross-runtime. A WasmVM shell can `waitpid` on a Node child process.
- **Signals**: `kill(pid, signal)` routes to the appropriate driver's `kill()` method
- **Zombie cleanup**: Exited processes kept for `ZOMBIE_TTL_MS` (60s), then reaped

### 4.5 Device Layer

Moves from WasmVM's VFS device nodes to a kernel wrapper that intercepts path operations before they reach the VFS backend.

```typescript
// packages/kernel/src/device-layer.ts

// Intercepts these paths:
// /dev/null    → read returns EOF, write discards
// /dev/zero    → read returns zeros
// /dev/stdin   → read from process FD 0
// /dev/stdout  → write to process FD 1
// /dev/stderr  → write to process FD 2
// /dev/urandom → read returns crypto random bytes
// /dev/fd/N    → alias for FD N
```

The device layer wraps the VFS. When `path_open("/dev/null", ...)` is called, the device layer handles it directly without touching the VFS backend. All other paths pass through to the VFS.

### 4.6 Command Registry

Moves from WasmVM's `/bin` stub population to the kernel.

```typescript
// packages/kernel/src/command-registry.ts

interface CommandRegistry {
  /** Register a driver's commands */
  register(driver: RuntimeDriver): void;

  /** Resolve a command name to a driver */
  resolve(command: string): RuntimeDriver | null;

  /** List all registered commands */
  list(): Map<string, string>;  // command → driver name

  /** Populate /bin in the VFS with entries for all registered commands */
  populateBin(vfs: VirtualFileSystem): Promise<void>;
}
```

When a runtime calls `spawn("grep", ...)`, the kernel's command registry resolves `grep` → WasmVM driver, then delegates to that driver's `spawn()` method.

The registry also populates `/bin` in the VFS so that shell PATH lookup (`stat("/bin/grep")`) succeeds. This is how brush-shell finds commands.

### 4.7 Pipe Manager

Moves from WasmVM's `ring-buffer.ts` and `process.ts` pipe handling to the kernel.

```typescript
// packages/kernel/src/pipe-manager.ts

interface Pipe {
  id: number;
  readFd: number;      // FD number (in the reading process)
  writeFd: number;     // FD number (in the writing process)
  readerPid: number;
  writerPid: number;
  buffer: SharedArrayBuffer | ArrayBuffer;  // Platform-dependent
  closed: { read: boolean; write: boolean };
}
```

Key behaviors:
- **Cross-runtime pipes**: A WasmVM process can pipe to a Node process. The kernel creates the pipe and routes data.
- **SharedArrayBuffer pipes**: Used when both endpoints are in Workers (WasmVM ↔ WasmVM). Ring buffer with Atomics for zero-copy streaming.
- **Buffered pipes**: Used when one endpoint is in a V8 isolate or Pyodide worker. Data buffered in kernel, pushed via callbacks.
- **EOF propagation**: When the writer closes their end, the reader gets EOF on next read.

### 4.8 Permissions

Existing secure-exec permissions model becomes part of the kernel. All kernel operations check permissions before executing.

The existing `wrapFileSystem`, `wrapNetworkAdapter`, `wrapCommandExecutor` functions from `shared/permissions.ts` move to the kernel and are applied at the kernel level, not per-driver.

---

## 5. OS Layer

The OS layer provides platform-specific implementations of abstractions the kernel needs.

### 5.1 os/node

```typescript
// packages/os/node/src/index.ts

export { NodeFileSystem } from './filesystem';    // wraps node:fs/promises
export { NodeWorkerAdapter } from './worker';     // wraps node:worker_threads
```

`NodeFileSystem` implements `VirtualFileSystem` by delegating to `node:fs/promises`. When the kernel is created with a `NodeFileSystem`, file operations go to the real host filesystem (sandboxed by permissions).

`NodeWorkerAdapter` wraps `node:worker_threads` for spawning Workers (used by WasmVM runtime for WASM process execution).

### 5.2 os/browser

```typescript
// packages/os/browser/src/index.ts

export { InMemoryFileSystem } from './filesystem';  // Map-based in-memory VFS
export { OpfsFileSystem } from './filesystem';       // Origin Private File System
export { BrowserWorkerAdapter } from './worker';     // wraps Web Worker API
```

`InMemoryFileSystem` is a pure-JS in-memory filesystem (migrated from existing `shared/in-memory-fs.ts`, expanded with POSIX operations).

`BrowserWorkerAdapter` wraps the Web Worker API. Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers for SharedArrayBuffer support.

---

## 6. Runtime Driver Interface

Each runtime implements the `RuntimeDriver` interface from Section 4.2. The kernel treats all runtimes identically — it doesn't know or care whether a command runs in WASM, V8, or Pyodide.

### Lifecycle

1. **Creation**: `createWasmVmRuntime(options)` / `createNodeRuntime()` / `createPythonRuntime()`
2. **Mount**: `kernel.mount(driver)` — kernel calls `driver.init(kernelInterface)`, registers driver's commands
3. **Execution**: Kernel routes `spawn("grep", ...)` → WasmVM driver, `spawn("node", ...)` → Node driver
4. **Disposal**: `kernel.dispose()` calls `driver.dispose()` on all mounted drivers

### Command Conflict Resolution

If two drivers register the same command name, the last-mounted driver wins. This allows overriding:

```typescript
kernel.mount(createWasmVmRuntime());  // registers 'node' as a stub
kernel.mount(createNodeRuntime());     // overrides 'node' with real V8 runtime
```

---

## 7. WasmVM Runtime

### What Stays in WasmVM

| Component | Reason |
|-----------|--------|
| WASI polyfill (thinned) | Translates WASI syscalls → kernel calls via SharedArrayBuffer |
| WASM binary (multicall) | The compiled Rust binary containing 90+ commands |
| Worker entry | Bootstrap code that runs in a Web Worker, instantiates WASM |
| Ring buffer | Internal optimization for WASM-to-WASM pipeline stages |
| All Rust code | `crates/`, `stubs/`, `patches/`, `Makefile`, `Cargo.toml`, etc. |

### What Moves to the Kernel

| Component | Destination |
|-----------|-------------|
| VFS (`vfs.ts`) | **Removed** — kernel VFS is source of truth |
| FD table (`fd-table.ts`) | `kernel/fd-table.ts` |
| Process table (from `process.ts`) | `kernel/process-table.ts` |
| Device nodes (from `vfs.ts`) | `kernel/device-layer.ts` |
| /bin stub population (from `vfs.ts`) | `kernel/command-registry.ts` |
| Pipeline orchestrator (`pipeline.ts`) | **Removed** — kernel coordinates cross-runtime pipelines |
| Worker adapter (`worker-adapter.ts`) | `os/node/worker.ts` + `os/browser/worker.ts` |
| User manager (`user.ts`) | `kernel/` (user/group identity is OS-level) |
| PipeBuffer/RingBuffer for IPC | `kernel/pipe-manager.ts` (cross-runtime pipes) |

### WASM Import Ownership

The WASM binary expects three import modules: `wasi_snapshot_preview1`, `host_process`, and `host_user`. **WasmVM owns the construction of all three.** The kernel does not know about WASI import signatures or WASM memory layout. WasmVM's worker-entry builds the import objects, and each function internally translates to a kernel call via SharedArrayBuffer+Atomics. This keeps the kernel runtime-agnostic — it exposes generic syscall methods (`fdRead`, `spawn`, `waitpid`, `pipe`), and WasmVM handles the WASM-specific glue.

### Thinned WASI Polyfill

The WASI polyfill becomes a translation layer. Each WASI syscall serializes its arguments, sends a request to the kernel (main thread) via SharedArrayBuffer, blocks on `Atomics.wait`, and deserializes the result.

Before (current — does everything locally):
```typescript
fd_read(fd, iovs) {
  const entry = this.fdTable.get(fd);           // local FD table
  const data = this.vfs.readFile(entry.path);   // local VFS
  // copy data into WASM memory at iov offsets
}
```

After (kernel-backed):
```typescript
fd_read(fd, iovs) {
  const result = this.kernelCall('fd_read', { pid: this.pid, fd, length });
  // result contains data from kernel
  // copy into WASM memory at iov offsets
}
```

Where `kernelCall` is:
```typescript
kernelCall(method, args) {
  // Write method + args to SharedArrayBuffer request region
  writeRequest(this.sab, method, args);
  // Notify main thread
  Atomics.notify(this.controlView, CONTROL_REQUEST, 1);
  // Block until main thread responds
  Atomics.wait(this.controlView, CONTROL_RESPONSE, 0);
  // Read result from SharedArrayBuffer response region
  return readResponse(this.sab);
}
```

### WasmVM Driver Implementation

```typescript
// packages/runtime/wasmvm/src/driver.ts

interface WasmVmRuntimeOptions {
  wasmBinary?: Uint8Array;         // Pre-loaded binary
  wasmUrl?: string | URL;          // URL to fetch binary from
}

function createWasmVmRuntime(options?: WasmVmRuntimeOptions): RuntimeDriver {
  return {
    name: 'wasmvm',
    commands: [
      'sh', 'bash',                              // Shell (brush-shell)
      'cat', 'echo', 'ls', 'cp', 'mv', 'rm',    // Coreutils (90+ commands)
      'grep', 'sed', 'awk', 'find',              // Text processing
      'jq', 'yq',                                // Data processing
      // ... all commands from dispatch.rs
    ],

    async init(kernel: KernelInterface) {
      // Compile WASM module (one-time cost)
      this.module = await WebAssembly.compile(wasmBinary);
      this.kernel = kernel;
    },

    spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
      // Create Worker, pass WASM module + kernel SAB channel
      // Worker instantiates WASM with thinned WASI polyfill
      // WASI polyfill makes kernel calls for all file/process operations
    },

    async dispose() {
      // Terminate any running Workers
    }
  };
}
```

---

## 8. Node Runtime

The existing V8 isolate runtime, reorganized as a `RuntimeDriver`.

### Changes

- **Bridge child_process**: `spawn()` / `exec()` now route through the kernel's command registry instead of the host's `child_process`. When sandboxed Node code calls `child_process.spawn('grep', [...])`, the bridge calls `kernel.spawn('grep', [...])` which routes to the WasmVM driver.

- **Bridge fs**: File operations route through the kernel's VFS (which is already the bridge VFS). No change needed if the kernel wraps the same `VirtualFileSystem` instance.

- **Bridge process**: `process.stdin`, `process.stdout`, `process.stderr` map to the kernel's FD table entries for this process's PID.

### Node Driver Implementation

```typescript
// packages/runtime/node/src/driver.ts

function createNodeRuntime(): RuntimeDriver {
  return {
    name: 'node',
    commands: ['node', 'npm', 'npx'],

    async init(kernel: KernelInterface) {
      this.kernel = kernel;
    },

    spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
      // Create V8 isolate (existing NodeExecutionDriver logic)
      // Inject bridge globals that delegate to kernel
      // Run user code in isolate
    },

    async dispose() {
      // Dispose isolates
    }
  };
}
```

---

## 9. Python Runtime

The existing Pyodide runtime, reorganized as a `RuntimeDriver`.

### Changes

- **subprocess**: Python's `subprocess.run(['grep', ...])` routes through the kernel's command registry.
- **File I/O**: Python's `open()` / `os.*` route through the kernel's VFS.

### Python Driver Implementation

```typescript
// packages/runtime/python/src/driver.ts

function createPythonRuntime(): RuntimeDriver {
  return {
    name: 'python',
    commands: ['python', 'python3', 'pip', 'pip3'],

    async init(kernel: KernelInterface) {
      this.kernel = kernel;
      // Pre-load Pyodide (optional, can lazy-load on first spawn)
    },

    spawn(command: string, args: string[], ctx: ProcessContext): DriverProcess {
      // Create Pyodide worker
      // Configure Python's sys.stdin/stdout/stderr to use kernel FDs
      // Run Python code
    },

    async dispose() {
      // Terminate Pyodide workers
    }
  };
}
```

---

## 10. Consumer API

### Simple Usage

```typescript
import { createKernel, createWasmVmRuntime, createNodeRuntime, createPythonRuntime } from 'secure-exec';

const kernel = createKernel({
  filesystem: createInMemoryFileSystem(),
  permissions: allowAll,
  env: { HOME: '/home/user', PATH: '/bin:/usr/bin' },
});

// Mount the runtimes you need
kernel.mount(createWasmVmRuntime());
kernel.mount(createNodeRuntime());
kernel.mount(createPythonRuntime());

// Execute commands (goes through brush-shell)
const result = await kernel.exec('echo hello | grep hello');
console.log(result);  // { exitCode: 0, stdout: 'hello\n', stderr: '' }

// Cross-runtime pipelines
await kernel.exec('ls -la | python -c "import sys; print(len(sys.stdin.readlines()))"');

// Direct process spawning
const proc = kernel.spawn('node', ['-e', 'console.log(1+1)']);
await proc.wait();

// Filesystem access
await kernel.writeFile('/tmp/data.txt', 'hello world');
const data = await kernel.readFile('/tmp/data.txt');

// Cleanup
await kernel.dispose();
```

### Minimal Usage (WasmVM only)

```typescript
import { createKernel, createWasmVmRuntime } from 'secure-exec';

const kernel = createKernel({ filesystem: createInMemoryFileSystem() });
kernel.mount(createWasmVmRuntime());

const result = await kernel.exec('echo hello');
```

### Node.js Backend (Real Filesystem)

```typescript
import { createKernel, createNodeFileSystem, createWasmVmRuntime } from 'secure-exec';

const kernel = createKernel({
  filesystem: createNodeFileSystem({ root: '/sandbox' }),
  permissions: {
    fs: (req) => ({ allow: req.path.startsWith('/sandbox') }),
    childProcess: (req) => ({ allow: true }),
  },
});

kernel.mount(createWasmVmRuntime());
kernel.mount(createNodeRuntime());

// This reads from the real host filesystem (sandboxed to /sandbox)
await kernel.exec('cat /sandbox/input.txt | grep "pattern" > /sandbox/output.txt');
```

---

## 11. VFS Expansion

The kernel's `VirtualFileSystem` interface must be expanded to cover POSIX operations that WasmVM's WASI polyfill needs.

### Current Interface (secure-exec)

```typescript
interface VirtualFileSystem {
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  readDir(path: string): Promise<string[]>;
  readDirWithTypes(path: string): Promise<VirtualDirEntry[]>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  createDir(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<VirtualStat>;
  removeFile(path: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
}
```

### Expanded Interface (needed for POSIX)

```typescript
interface VirtualFileSystem {
  // --- Existing ---
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  readDir(path: string): Promise<string[]>;
  readDirWithTypes(path: string): Promise<VirtualDirEntry[]>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  createDir(path: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<VirtualStat>;
  removeFile(path: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;

  // --- NEW: Symlinks ---
  symlink(target: string, linkPath: string): Promise<void>;
  readlink(path: string): Promise<string>;
  lstat(path: string): Promise<VirtualStat>;           // stat without following symlinks

  // --- NEW: Links ---
  link(oldPath: string, newPath: string): Promise<void>;

  // --- NEW: Permissions & Metadata ---
  chmod(path: string, mode: number): Promise<void>;
  chown(path: string, uid: number, gid: number): Promise<void>;
  utimes(path: string, atime: number, mtime: number): Promise<void>;
  truncate(path: string, length: number): Promise<void>;
}

interface VirtualStat {
  mode: number;
  size: number;
  isDirectory: boolean;
  isSymbolicLink: boolean;         // NEW
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  ino: number;                     // NEW: inode number
  nlink: number;                   // NEW: hard link count
  uid: number;                     // NEW
  gid: number;                     // NEW
}
```

### Implementation Priority

| Method | Priority | Reason |
|--------|----------|--------|
| `lstat` | HIGH | WASI `path_filestat_get` with no-follow flag |
| `symlink`, `readlink` | HIGH | Many Unix tools use symlinks |
| `chmod` | MEDIUM | `chmod` command, file permission checks |
| `truncate` | MEDIUM | `O_TRUNC` flag in path_open, `>` redirect |
| `utimes` | MEDIUM | `touch` command |
| `link` | LOW | Hard links rarely used in sandbox contexts |
| `chown` | LOW | Single-user sandbox, usually no-op |

---

## 12. Migration Plan

### 12.1 Files Moving from ~/seos to ~/secure-exec-1

#### Rust workspace → `wasmvm/`

| Source | Destination |
|--------|-------------|
| `wasmcore/Cargo.toml` | `wasmvm/Cargo.toml` |
| `wasmcore/Cargo.lock` | `wasmvm/Cargo.lock` |
| `wasmcore/rust-toolchain.toml` | `wasmvm/rust-toolchain.toml` |
| `wasmcore/Makefile` | `wasmvm/Makefile` |
| `wasmcore/.cargo/config.toml` | `wasmvm/.cargo/config.toml` |
| `wasmcore/crates/` | `wasmvm/crates/` |
| `wasmcore/stubs/` | `wasmvm/stubs/` |
| `wasmcore/patches/` | `wasmvm/patches/` |
| `wasmcore/scripts/` | `wasmvm/scripts/` |
| `wasmcore/.gitignore` | `wasmvm/.gitignore` |

#### TypeScript host → `packages/runtime/wasmvm/`

| Source | Destination |
|--------|-------------|
| `wasmcore/host/src/wasi-polyfill.ts` | `packages/runtime/wasmvm/src/wasi-polyfill.ts` |
| `wasmcore/host/src/worker-entry.ts` | `packages/runtime/wasmvm/src/worker-entry.ts` |
| `wasmcore/host/src/worker-entry.browser.ts` | `packages/runtime/wasmvm/src/worker-entry.browser.ts` |
| `wasmcore/host/src/ring-buffer.ts` | `packages/runtime/wasmvm/src/ring-buffer.ts` |
| `wasmcore/host/src/index.ts` | `packages/runtime/wasmvm/src/index.ts` (rewritten) |
| `wasmcore/host/src/wasm-os.ts` | **Removed** — replaced by kernel |
| `wasmcore/host/src/vfs.ts` | **Removed** — kernel VFS is source of truth |
| `wasmcore/host/src/fd-table.ts` | `packages/kernel/src/fd-table.ts` (adapted) |
| `wasmcore/host/src/process.ts` | `packages/kernel/src/process-table.ts` (adapted) |
| `wasmcore/host/src/pipeline.ts` | **Removed** — kernel coordinates pipelines |
| `wasmcore/host/src/worker-adapter.ts` | `packages/os/node/` + `packages/os/browser/` (split) |
| `wasmcore/host/src/user.ts` | `packages/kernel/src/user.ts` (adapted) |
| `wasmcore/host/test/` | `packages/runtime/wasmvm/test/` |
| `wasmcore/host/package.json` | `packages/runtime/wasmvm/package.json` (adapted) |
| `wasmcore/host/tsconfig.json` | `packages/runtime/wasmvm/tsconfig.json` (adapted) |

#### WasmVM-specific documentation → `wasmvm/`

WasmVM internal docs stay with WasmVM. Only cross-project docs go to the top level.

| Source | Destination |
|--------|-------------|
| `notes/specs/*.md` | `wasmvm/notes/specs/` |
| `notes/research/*.md` | `wasmvm/notes/research/` |
| `notes/todo.md` | `wasmvm/notes/todo.md` |
| `notes/mvp-blockers.md` | `wasmvm/notes/mvp-blockers.md` |
| `notes/friction/` | `wasmvm/notes/friction/` |
| `notes/misc/` | `wasmvm/notes/misc/` |
| `prd.json` | `wasmvm/prd.json` |
| `progress.txt` | `wasmvm/progress.txt` |

#### Cross-project documentation → top-level `docs/`

| Source | Destination |
|--------|-------------|
| `docs/compatibility-matrix.md` | `docs/compatibility-matrix.md` |
| `docs/prior-art.md` | `docs/prior-art.md` |

#### Root files

| Source | Destination |
|--------|-------------|
| `CLAUDE.md` | Split: WasmVM-specific → `wasmvm/CLAUDE.md`, project-wide → root `CLAUDE.md` |
| `scripts/ralph/` | `wasmvm/scripts/ralph/` |
| `.gitignore` | Merge WasmVM entries into root `.gitignore` |

### 12.2 CLAUDE.md Strategy — Two Files

**Root `CLAUDE.md`** (project-wide):
1. Secure-exec project overview (existing)
2. Architecture — kernel + runtime driver model (new, from this spec)
3. Kernel conventions — VFS is bridge source of truth, FD table is universal, etc.
4. License requirements (Apache-2.0 compatible only — applies to all packages)
5. Monorepo conventions — deferred items, agent contracts, docs structure
6. Pointer to `.agent/contracts/` (existing)

**`wasmvm/CLAUDE.md`** (WasmVM-specific):
1. WasmVM overview — BusyBox-style WASM multicall binary
2. Build instructions — `wasm32-wasip1`, nightly Rust, `-Z build-std`
3. Key decisions — brush-shell, uutils/sed, awk-rs, ripgrep, jaq, custom find
4. Dependency patching — three-tier: direct dep → vendor+patch → full fork
5. Why not native WASM runtimes/Component Model
6. Naming — `wasmvm/crates/`, `wasmvm/stubs/`, `wasmvm/patches/`
7. Deferred items → `wasmvm/notes/todo.md`

### 12.3 Turbo + Workspace Updates

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'packages/os/*'
  - 'packages/runtime/*'
```

`turbo.json` additions:
```json
{
  "tasks": {
    "build:wasm": {
      "dependsOn": [],
      "inputs": ["wasmvm/**/*.rs", "wasmvm/Cargo.toml", "wasmvm/patches/**"],
      "outputs": ["wasmvm/target/wasm32-wasip1/release/multicall.opt.wasm"]
    }
  }
}
```

Root `.gitignore` additions:
```
wasmvm/target/
wasmvm/vendor/
```

### 12.4 Cleanup

- **Delete `packages/reserve/wasmvm/`** — placeholder replaced by real implementation at `packages/runtime/wasmvm/`
- **Delete `packages/sandboxed-node/`** — empty placeholder, not needed

### 12.5 Existing Test Suites

All existing secure-exec tests (`packages/secure-exec/tests/`) must keep passing through every phase. The top-level `secure-exec` package re-exports everything, so the public API (`NodeRuntime`, `PythonRuntime`, `createNodeDriver`, etc.) doesn't change even as internals are reorganized.

WasmVM tests (`packages/runtime/wasmvm/test/`) must also pass. During Phase 1, they run against the unchanged `WasmOS` class. During Phase 2+, they run against the kernel-backed driver.

---

## 13. Complete Final Project Structure

```
secure-exec/                                    ← monorepo root
│
├── CLAUDE.md                                   ← Project-wide instructions (kernel arch, license, conventions)
├── package.json                                ← Root workspace config
├── pnpm-workspace.yaml                         ← Workspace: packages/*, packages/os/*, packages/runtime/*
├── turbo.json                                  ← Build orchestration (includes build:wasm task)
├── .gitignore                                  ← Includes wasmvm/target/, wasmvm/vendor/
│
├── prd.json                                   ← Ralph PRD (user stories for current work)
├── progress.txt                               ← Ralph progress log
├── scripts/
│   └── ralph/                                 ← Ralph automation
│       ├── ralph.sh                           ← Agent loop runner
│       ├── CLAUDE.md                          ← Agent prompt
│       └── archive/                           ← Archived PRDs from previous runs
│
├── .agent/
│   └── contracts/                              ← EXISTING: behavioral contracts
│       ├── README.md
│       ├── runtime-driver-integration-testing.md
│       ├── node-runtime.md
│       ├── node-bridge.md
│       ├── node-permissions.md
│       ├── node-stdlib.md
│       └── ...
│
├── wasmvm/                                     ← MIGRATED: Rust workspace (from ~/seos/wasmcore)
│   ├── CLAUDE.md                               ← WasmVM-specific instructions (build, deps, patching)
│   ├── Cargo.toml                              ← Workspace definition
│   ├── Cargo.lock
│   ├── rust-toolchain.toml                     ← nightly-2026-03-01, target wasm32-wasip1
│   ├── Makefile                                ← Build: make wasm, make wasm-opt
│   ├── .cargo/
│   │   └── config.toml                         ← Vendor source replacement
│   ├── .gitignore                              ← target/, vendor/
│   │
│   ├── crates/
│   │   ├── multicall/                          ← Main WASM binary
│   │   │   ├── Cargo.toml                      ← 64+ dependencies
│   │   │   └── src/
│   │   │       ├── main.rs                     ← wasm_main() entry point
│   │   │       ├── dispatch.rs                 ← Command routing (sh, bash, 90+ commands)
│   │   │       ├── builtins.rs                 ← Built-in implementations
│   │   │       ├── find.rs, grep.rs, rg.rs, awk.rs, jq.rs, ...
│   │   │       └── ...
│   │   ├── shims/                              ← Subprocess stubs (env, timeout, xargs)
│   │   │   ├── Cargo.toml
│   │   │   └── src/
│   │   └── wasi-ext/                           ← Custom WASI import bindings
│   │       ├── Cargo.toml
│   │       └── src/lib.rs                      ← host_process, host_user definitions
│   │
│   ├── stubs/                                  ← WASM-incompatible dependency replacements
│   │   ├── ctrlc/                              ← Signal handling no-op
│   │   ├── hostname/                           ← Returns "wasm-host"
│   │   └── uucore/                             ← WASI-compatible uutils core subset
│   │
│   ├── patches/
│   │   ├── 0001-wasi-process-spawn.patch       ← Rust std patches
│   │   ├── 0002-wasi-pipe-support.patch
│   │   ├── 0002-wasi-fd-dup.patch
│   │   ├── 0003-wasi-user-group.patch
│   │   ├── 0004-wasi-isatty.patch
│   │   ├── 0005-wasi-temp-dir.patch
│   │   └── crates/                             ← 16+ crate-level patches
│   │       ├── brush-core/
│   │       ├── uu_cat/, uu_chmod/, uu_cp/, ...
│   │       └── sed/
│   │
│   ├── scripts/
│   │   ├── patch-std.sh                        ← Patches Rust std for WASI
│   │   ├── patch-vendor.sh                     ← Applies crate patches
│   │   └── test-gnu.sh
│   │
│   ├── notes/                                  ← MIGRATED: WasmVM internal docs
│   │   ├── todo.md                             ← Deferred work items
│   │   ├── mvp-blockers.md                     ← What must work before shipping
│   │   ├── specs/
│   │   │   ├── wasmvm-mvp.md
│   │   │   ├── wasmvm-post-mvp.md
│   │   │   ├── wasmvm-tool-completeness.md
│   │   │   └── seos-uutils-integration.md
│   │   ├── research/
│   │   │   ├── js-vs-wasm-os-layer.md
│   │   │   ├── shell-architecture-options.md
│   │   │   ├── brush-wasm-integration.md
│   │   │   ├── rust-shell-implementations.md
│   │   │   └── c-shells-to-wasm.md
│   │   ├── friction/
│   │   └── misc/
│   │
│   └── vendor/                                 ← .gitignored, generated by cargo vendor
│
├── packages/
│   │
│   ├── kernel/                                 ← NEW: OS kernel
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                        ← Public exports
│   │   │   ├── types.ts                        ← Kernel, RuntimeDriver, ProcessContext
│   │   │   ├── kernel.ts                       ← Kernel class (createKernel, mount, exec, spawn)
│   │   │   ├── vfs.ts                          ← VirtualFileSystem interface (POSIX-complete)
│   │   │   ├── fd-table.ts                     ← Per-PID FD table, shared FileDescriptions
│   │   │   ├── process-table.ts                ← PIDs, parent-child, waitpid, signals
│   │   │   ├── device-layer.ts                 ← /dev/null, /dev/stdin, /dev/stdout, /dev/stderr
│   │   │   ├── pipe-manager.ts                 ← Cross-runtime pipes
│   │   │   ├── command-registry.ts             ← Command name → driver routing, PATH, /bin population
│   │   │   ├── permissions.ts                  ← Deny-by-default access control
│   │   │   └── user.ts                         ← User/group identity (uid, gid, getpwuid)
│   │   └── test/
│   │       ├── fd-table.test.ts
│   │       ├── process-table.test.ts
│   │       ├── device-layer.test.ts
│   │       ├── command-registry.test.ts
│   │       └── pipe-manager.test.ts
│   │
│   ├── os/
│   │   ├── node/                               ← Node.js platform adapter
│   │   │   ├── package.json
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── filesystem.ts               ← NodeFileSystem (wraps node:fs)
│   │   │   │   └── worker.ts                   ← node:worker_threads adapter
│   │   │   └── test/
│   │   │
│   │   └── browser/                            ← Browser platform adapter
│   │       ├── package.json
│   │       ├── src/
│   │       │   ├── index.ts
│   │       │   ├── filesystem.ts               ← InMemoryFileSystem, OpfsFileSystem
│   │       │   └── worker.ts                   ← Web Worker adapter
│   │       └── test/
│   │
│   ├── runtime/
│   │   ├── node/                               ← REORGANIZED: Node.js V8 isolate runtime
│   │   │   ├── package.json
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── driver.ts                   ← createNodeRuntime() → RuntimeDriver
│   │   │   │   ├── execution-driver.ts         ← V8 isolate lifecycle
│   │   │   │   ├── module-resolver.ts
│   │   │   │   ├── module-access.ts
│   │   │   │   ├── bridge-contract.ts
│   │   │   │   └── bridge/                     ← Node.js API polyfills inside V8 isolate
│   │   │   │       ├── index.ts
│   │   │   │       ├── fs.ts
│   │   │   │       ├── child-process.ts        ← MODIFIED: routes through kernel command registry
│   │   │   │       ├── process.ts
│   │   │   │       ├── network.ts
│   │   │   │       ├── os.ts
│   │   │   │       ├── module.ts
│   │   │   │       └── active-handles.ts
│   │   │   ├── isolate-runtime/                ← Static scripts compiled into isolate
│   │   │   └── test/
│   │   │
│   │   ├── python/                             ← REORGANIZED: Python Pyodide runtime
│   │   │   ├── package.json
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── driver.ts                   ← createPythonRuntime() → RuntimeDriver
│   │   │   │   └── pyodide-worker.ts
│   │   │   └── test/
│   │   │
│   │   └── wasmvm/                             ← NEW: WasmVM WASM runtime (migrated from ~/seos)
│   │       ├── package.json
│   │       ├── tsconfig.json
│   │       ├── src/
│   │       │   ├── index.ts                    ← Public exports
│   │       │   ├── driver.ts                   ← createWasmVmRuntime() → RuntimeDriver
│   │       │   ├── wasi-polyfill.ts            ← WASI syscalls → kernel calls (thinned)
│   │       │   ├── worker-entry.ts             ← Node.js worker bootstrap
│   │       │   ├── worker-entry.browser.ts     ← Browser worker bootstrap
│   │       │   └── ring-buffer.ts              ← WASM-to-WASM pipe optimization
│   │       └── test/                           ← MIGRATED: all tests from wasmcore/host/test/
│   │           ├── coreutils.test.ts
│   │           ├── gnu-compat.test.ts
│   │           ├── awk.test.ts
│   │           ├── sed.test.ts
│   │           ├── find.test.ts
│   │           ├── jq.test.ts
│   │           ├── grep.test.ts
│   │           ├── subprocess.test.ts
│   │           ├── integration-pipeline.test.ts
│   │           ├── phase2-integration.test.ts
│   │           ├── phase3-integration.test.ts
│   │           ├── wasi-polyfill.test.ts
│   │           ├── ring-buffer.test.ts
│   │           ├── wasm-os.test.ts
│   │           └── fixtures/
│   │
│   ├── secure-exec/                            ← EXISTING: top-level convenience package
│   │   ├── package.json
│   │   ├── src/
│   │   │   └── index.ts                        ← Re-exports: kernel, all runtimes, all OS adapters
│   │   └── test/                               ← EXISTING: integration tests (must keep passing)
│   │       ├── test-suite/
│   │       ├── runtime-driver/
│   │       ├── project-matrix/
│   │       └── types/
│   │
│   ├── typescript/                 ← EXISTING: TypeScript compiler tools
│   ├── playground/                             ← EXISTING: web demo
│   └── website/                                ← EXISTING: docs site
│
├── docs/                                       ← Public documentation
│   ├── compatibility-matrix.md                 ← MIGRATED from ~/seos/docs/
│   ├── prior-art.md                            ← MIGRATED from ~/seos/docs/
│   ├── api-reference.mdx                       ← EXISTING
│   ├── architecture.mdx                        ← EXISTING (updated for kernel model)
│   ├── quickstart.mdx                          ← EXISTING
│   ├── security-model.mdx                      ← EXISTING
│   └── ...
│
├── docs-internal/                              ← Internal documentation
│   ├── arch/
│   │   ├── kernel-integration.md               ← THIS SPEC
│   │   ├── overview.md                         ← EXISTING (updated for kernel model)
│   │   └── active-handles.md                   ← EXISTING
│   ├── research/                               ← EXISTING secure-exec research
│   │   ├── comparison/
│   │   └── ...
│   ├── todo.md                                 ← EXISTING secure-exec backlog
│   ├── friction.md                             ← EXISTING
│   ├── glossary.md                             ← EXISTING (add kernel terminology)
│   └── attack-vectors.md                       ← EXISTING
│
└── examples/                                   ← EXISTING
    ├── hono/
    ├── just-bash/
    └── shared/
```

---

## 14. Implementation Phases

### Phase 1: Migration (no architectural changes, no renames)

Move all WasmVM files into the secure-exec monorepo. Preserve the existing standalone `WasmOS` API temporarily. Ensure the WASM binary builds and all existing tests pass in the new location.

**Deliverables:**
- [ ] `wasmvm/` directory with all Rust code, building successfully
- [ ] `packages/runtime/wasmvm/` with existing TypeScript host (unchanged)
- [ ] All docs/notes migrated to correct locations
- [ ] `CLAUDE.md` merged
- [ ] `.gitignore`, `turbo.json`, `pnpm-workspace.yaml` updated
- [ ] All existing WasmVM tests passing
- [ ] All existing secure-exec tests passing

### Phase 2: Kernel extraction

Extract kernel components from WasmVM and secure-exec into `packages/kernel/`. Both WasmVM and the existing Node/Python runtimes begin using the kernel.

**Deliverables:**
- [ ] `packages/kernel/` with VFS interface, FD table, process table, device layer, command registry, pipe manager
- [ ] VFS interface expanded with POSIX operations (Section 11)
- [ ] `InMemoryFileSystem` expanded to implement full VFS interface
- [ ] WasmVM's `vfs.ts` deleted — WASI polyfill delegates to kernel VFS
- [ ] WasmVM's FD table logic moved to kernel
- [ ] WasmVM's process table logic moved to kernel
- [ ] WasmVM's device node logic moved to kernel device layer
- [ ] WasmVM's `/bin` population moved to kernel command registry
- [ ] WasmVM's `pipeline.ts` deleted — kernel coordinates pipelines

### Phase 3: OS layer + runtime drivers

Extract platform-specific code into `packages/os/`, refactor all runtimes to implement `RuntimeDriver` interface, implement `createKernel()` + `mount()` API.

**Deliverables:**
- [ ] `packages/os/node/` with `NodeFileSystem`, `NodeWorkerAdapter`
- [ ] `packages/os/browser/` with `InMemoryFileSystem`, `BrowserWorkerAdapter`
- [ ] `createWasmVmRuntime()` → `RuntimeDriver`
- [ ] `createNodeRuntime()` → `RuntimeDriver`
- [ ] `createPythonRuntime()` → `RuntimeDriver`
- [ ] `createKernel()` + `kernel.mount()` + `kernel.exec()` working end-to-end
- [ ] Cross-runtime command execution (e.g., `kernel.exec('echo hello')` via WasmVM)
- [ ] Node bridge `child_process.spawn` routing through kernel command registry

### Phase 4: Cross-runtime integration

Full cross-runtime pipelines, shared FD inheritance, signal forwarding.

**Deliverables:**
- [ ] Cross-runtime pipes: `echo hello | node -e "..."` works
- [ ] Cross-runtime pipes: `cat file | python -c "..."` works
- [ ] FD inheritance: child processes inherit parent's FD table
- [ ] Signal forwarding: `kill(pid, SIGTERM)` works across runtimes
- [ ] `kernel.exec()` matches MVP blocker #3 requirements (headless e2e)

### Phase 5: Contract assessment

Assess all behavioral changes introduced by the kernel architecture against existing contracts in `.agent/contracts/`. Create new contracts for the kernel and update existing contracts to reflect the kernel-mediated execution model.

**Deliverables:**
- [ ] New `kernel` contract covering kernel behavioral requirements (VFS interface, FD table semantics, process table lifecycle, device layer intercepts, pipe manager blocking/EOF, command registry resolution, permission deny-by-default)
- [ ] New `kernel-runtime-driver` contract covering RuntimeDriver interface requirements, mount/dispose lifecycle, spawn/kill contract, and command registration rules
- [ ] `node-runtime` contract updated: execution now goes through kernel mount + spawn, not standalone driver construction
- [ ] `node-bridge` contract updated: `child_process.spawn` routes through kernel command registry instead of host `child_process`
- [ ] `node-permissions` contract updated: permissions now enforced at kernel level via `wrapFileSystem()`; document interaction between kernel permissions and existing secure-exec permission wrappers
- [ ] `runtime-driver-integration-testing` contract updated: test infrastructure must support kernel-aware TestContext with mounted drivers
- [ ] `runtime-driver-test-suite-structure` contract updated: add kernel test patterns (kernel unit tests in `packages/kernel/test/`, cross-runtime integration tests)
- [ ] `compatibility-governance` contract updated: cross-runtime parity requirements (same VFS/FD/process state across WasmVM, Node, Python)

---

## 15. Deferred Work

These items are identified but not part of this spec. Track in `docs-internal/todo.md`.

### PTY Support (MVP Blocker #4)
- `kernel.openPty()` API for bidirectional terminal
- xterm.js compatible (ANSI escape sequences)
- Raw mode, resize support (TIOCGWINSZ / SIGWINCH)
- Ctrl-C generates SIGINT
- Requires kernel-level terminal discipline layer

### Performance: Read-Ahead Buffering
- Every `fd_read` from WasmVM is a cross-worker roundtrip (post message → Atomics.wait → response)
- Biggest room for optimization: read-ahead buffering (fetch 64KB chunks, serve small reads from local cache)
- Measure before optimizing — may be acceptable for MVP

### NodeFileSystem Sandboxing
- `NodeFileSystem` currently delegates to real `node:fs` — needs path sandboxing to prevent escaping the sandbox root
- Permissions layer handles this, but defense-in-depth suggests `NodeFileSystem` should also enforce a root boundary

### WASM Binary Lazy Loading
- Currently the WASM binary must be provided at runtime creation
- Could lazy-load from a CDN or bundled asset on first command execution
- Not needed for MVP — binary is bundled with the package
