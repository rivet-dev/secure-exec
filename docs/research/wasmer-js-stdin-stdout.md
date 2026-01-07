# wasmer-js stdin/stdout Architecture

## Overview

This document describes how stdin/stdout streaming works in wasmer-js and nanosandbox, based on research done to enable interactive shell support.

## wasmer-js Terminal Modes

The wasmer-js SDK has different terminal modes defined in `src/wasmer.rs`:

### NonInteractive Mode
- Used when stdin data is provided upfront (e.g., `{ stdin: "echo hello" }`)
- Creates a `StaticFile` from the stdin data
- `instance.stdin` is `None` - no streaming input possible
- Good for: running commands with known input

### Streaming Mode (NEW)
- Used when no stdin data is provided
- Creates a `Pipe` for stdin that can be written to
- `instance.stdin` is a `WritableStream`
- `instance.stdout` is a `ReadableStream`
- Sets `connected_to_tty(true)` so programs think they're in a terminal

### Interactive Mode (DISABLED/REMOVED)
- Was previously used for TTY support
- Had race condition bugs that caused hangs
- Code has been removed in favor of Streaming mode

## Key Code Locations

### wasmer-js (`~/misc/wasmer-js`)

**`src/wasmer.rs`**:
- `setup_tty()` - Determines which terminal mode to use
- `configure_runner()` - Configures the WASI runner with stdin/stdout
- `TerminalMode` enum - Defines available modes
- `Command::run()` - Entry point for running commands

**`src/streams.rs`**:
- `input_pipe()` - Creates a Pipe + WritableStream pair for stdin
- `output_pipe()` - Creates a Pipe + ReadableStream pair for stdout

### nanosandbox (`packages/nanosandbox`)

**`src/vm/index.ts`**:
- `ProcessImpl` class - Wraps wasmer-js Instance for streaming I/O
- `spawn()` function - Creates a Process with streaming stdin/stdout

## Data Flow

```
Terminal stdin → proc.writeStdin() → instance.stdin (WritableStream)
                                          ↓
                                    WritableStream writer
                                          ↓
                                    wasmer-js Pipe
                                          ↓
                                    WASM process stdin
                                          ↓
                                    Program (bash, etc.)
                                          ↓
                                    WASM process stdout
                                          ↓
                                    wasmer-js Pipe
                                          ↓
                                    ReadableStream reader
                                          ↓
                        instance.stdout (ReadableStream)
                                          ↓
                              readStdoutLoop() buffers data
                                          ↓
                              proc.readStdout() returns buffer
                                          ↓
                              Terminal prints to stdout
```

## ProcessImpl Implementation Details

The `ProcessImpl` class manages streaming I/O with these key behaviors:

1. **Constructor**: Gets stdin writer from `instance.stdin` if available

2. **writeStdin(data)**: Encodes string to Uint8Array and writes to stdin stream

3. **closeStdin()**: Closes the stdin writer, signaling EOF to the process

4. **readStdout()**:
   - Lazily starts `readStdoutLoop()` on first call
   - Returns buffered data and clears buffer
   - Does NOT block waiting for data

5. **readStdoutLoop()** (background):
   - Reads from stdout stream in a loop
   - Pushes chunks to `stdoutBuffer`
   - Exits when stream closes (process exits)

6. **wait()**:
   - If reading started: waits for `readLoopPromise` to complete, returns buffered data
   - If not started: calls `instance.wait()` which consumes streams directly

## Important Findings

### Race Condition Fix
The original `wait()` method tried to read from the stdout reader even when `readStdoutLoop()` was already reading from it. This caused a race condition where data could be lost. Fixed by having `wait()` simply await `readLoopPromise` instead of trying to read.

### Timing Issue
When using streaming mode, the terminal's stdout poll loop may not get data before `wait()` returns. Solution: print `result.stdout` after `wait()` returns to catch any remaining buffered data.

### TTY Detection
Setting `runtime.set_connected_to_tty(true)` makes bash think it's in an interactive terminal. This is necessary for bash to:
- Show prompts
- Enable line editing features
- Run in interactive mode

## Critical Bug Fix: Array Reference

When buffering stream data, DO NOT reassign the buffer array:

```typescript
// WRONG - creates new array, readStreamLoop still pushes to old reference
this.stdoutBuffer = [];

// CORRECT - clears array while keeping same reference
this.stdoutBuffer.length = 0;
```

## Bash Prompt and Input Echo

Bash sends the prompt and input echo to **stderr**, not stdout:
- Prompt (`bash-dist# `) → stderr
- Input echo (characters typed) → stderr
- Command output → stdout

This means the terminal must stream both stdout AND stderr to display properly.

## Current Limitations

1. **Slight output interleaving**: stdout/stderr may be slightly out of order
2. **No line editing**: Arrow keys, backspace work in bash but display may be off
3. **No signal handling**: Ctrl+C is handled by Node.js, not passed to WASM
4. **TERM=dumb**: No color or advanced terminal features

## Future Work

- Implement proper PTY (pseudo-terminal) support in wasmer-js
- Add xterm.js integration for web-based terminal
- Support terminal resize (SIGWINCH)
- Pass terminal capabilities via TERM environment variable
