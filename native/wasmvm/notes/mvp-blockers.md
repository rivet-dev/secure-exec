# MVP Blockers

What must work before shipping.

## 1. Rewrite OS implementation to use the system bridge
- The current JS host runtime (WASI polyfill, VFS, process manager, etc.) must be rewritten to use the system bridge interface
- The system bridge is the abstraction layer between wasmVM and the Secure Exec SDK — it provides the host-side capabilities (filesystem, process spawning, networking) that the WASM binary calls into
- This replaces the standalone JS host with a bridge-compatible implementation that the SDK can plug into
- Node and Python SDKs consume wasmVM through the system bridge, not by importing the JS host directly

## 2. Node + Python integration with WasmVM
- Node SDK: `npm install @wasmvm/core` pulls the package + WASM binary, basic usage works out of the box
- Python SDK: `pip install wasmvm` with equivalent API surface
- Both SDKs consume wasmVM through the system bridge (step 1), not by importing the JS host directly
- WasmVM abstraction: both SDKs instantiate the WASM binary via a shared VM interface that handles memory, imports, and lifecycle
- Basic usage works e2e in both languages: init, exec command, get back `{ stdout, stderr, exitCode }`, read/write VFS
- No native dependencies, no build step for consumers

## 3. Claude Code headless working e2e
- Claude Code can use wasmVM as its sandbox backend in headless (non-interactive) mode
- `exec()` API: send command string, get back `{ stdout, stderr, exitCode }`
- File operations: write files to VFS, read results back
- Pipelines, command substitution, environment variables all functional
- Error handling: timeouts, process crashes, OOM don't hang the host

## 4. Claude Code PTY working e2e
- Claude Code can use wasmVM as its sandbox backend in interactive (PTY) mode
- `openPty()` API: bidirectional terminal with stdin/stdout streaming
- xterm.js compatible: keystrokes in, ANSI escape sequences out
- Raw mode support: editors, less, top-like tools work
- Resize support: `TIOCGWINSZ` / `SIGWINCH` updates terminal dimensions
- Ctrl-C generates SIGINT (kills foreground process with exit code 130)
