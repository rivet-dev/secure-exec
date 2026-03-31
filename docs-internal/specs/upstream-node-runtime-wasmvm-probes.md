# Upstream Node Runtime WasmVM Backend Probes

Date: 2026-03-30

Status: US-002 probe note

## Scope

These probes validate backend-only operations through the normal WasmVM command path.

They do prove:

- filesystem bottom-half operations can run through the existing WasmVM/VFS path
- TCP socket client and server operations can run through the existing WasmVM/kernel socket path
- DNS lookup success and expected failure paths can run through the existing WasmVM host-net path

They do not prove:

- `module_wrap`
- `contextify`
- JS wrapper identity
- callback/event delivery semantics for `tcp_wrap` / `stream_wrap`

## Probe Surface

Probe binaries:

- `native/wasmvm/c/programs/fs_probe.c`
- `native/wasmvm/c/programs/tcp_echo.c`
- `native/wasmvm/c/programs/tcp_server.c`
- `native/wasmvm/c/programs/dns_probe.c`

Focused test harness:

- `packages/wasmvm/test/upstream-node-backend-probes.test.ts`

Build path:

- `make -C native/wasmvm/c sysroot`
- `make -C native/wasmvm/c programs`

That uses the normal WasmVM-targeted C toolchain and command artifact path. No one-off runtime or custom compiler path is involved.

## Findings

| Area | Probe | Result | Notes |
| --- | --- | --- | --- |
| Filesystem | `fs_probe` | Passes | `open`, `read`, `write`, `stat`, `readdir`, and `realpath` all work against the kernel-backed sandbox VFS. |
| TCP client | `tcp_echo` | Passes | `connect`, `send`, `recv`, and `close` work against a host Node echo server. |
| TCP server | `tcp_server` | Passes | `bind`, `listen`, `accept`, `recv`, `send`, and `close` work when driven through the kernel socket table loopback path. |
| DNS | `dns_probe` | Passes | `localhost` resolves to `127.0.0.1`, and a reserved `.invalid` hostname takes the expected failure path. |
| TTY/raw mode | none yet | Blocked | The kernel already has PTY termios state, but WasmVM C programs still cannot call `tcgetattr`/`tcsetattr` or query terminal size through the current WasmVM ABI. |

## TTY Raw-Mode Blocker

The blocker is specific and bounded:

1. `packages/core` already implements PTY termios behavior, including canonical mode, raw mode, echo, and signal settings.
2. `native/wasmvm/crates/wasi-ext/src/lib.rs` does not currently expose `tcgetattr`, `tcsetattr`, or terminal-size imports for C/Wasm programs.
3. There is no matching wasi-libc patch in `native/wasmvm/patches/wasi-libc/` that routes libc termios calls into those host imports.

That means a standalone C raw-mode probe would not be testing the real intended path yet. The follow-up is to add the missing WasmVM host imports plus the libc wiring, then add a real raw-mode probe on top of that path.

## Interpretation

The low-level backend operations needed for a narrow `fs`-first runtime plan fit the existing WasmVM path cleanly for:

- VFS-backed file/path operations
- TCP socket client/server operations
- DNS lookup success and expected error handling

TTY/raw-mode is not disproven, but it still needs ABI and libc plumbing before it can be probed honestly.
