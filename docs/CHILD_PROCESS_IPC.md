# Child Process IPC Architecture

When sandboxed Node.js spawns a child process, that child must run as a WASIX process
inside the same VM (sharing filesystem, etc.), not as a separate VM instance.

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Sandboxed Node.js (V8 Isolate)                                          │
│                                                                          │
│  spawn('ls', ['/'])                                                      │
│       │                                                                  │
│       ▼                                                                  │
│  child_process polyfill calls ctx.requestSpawn()                         │
└───────│──────────────────────────────────────────────────────────────────┘
        │
        ▼ Queues MSG_TYPE_SPAWN_REQUEST in OUTPUT_QUEUES

┌──────────────────────────────────────────────────────────────────────────┐
│  wasmer-js Scheduler                                                     │
│                                                                          │
│  - Queues spawn request for WASM to read                                 │
│  - Receives child output via host_exec_child_output syscall              │
│  - Calls Node callbacks (onChildStdout, onChildStderr, onChildExit)      │
└───────│──────────────────────────────────────────────────────────────────┘
        │
        ▼ WASM reads via host_exec_try_read

┌──────────────────────────────────────────────────────────────────────────┐
│  wasix-runtime (Rust WASM binary)                                        │
│                                                                          │
│  - Reads SPAWN_REQUEST message                                           │
│  - Spawns child using std::process::Command (WASIX)                      │
│  - Reads child stdout/stderr in event loop                               │
│  - Sends output back via host_exec_child_output syscall                  │
└───────│──────────────────────────────────────────────────────────────────┘
        │
        ▼ Child runs as WASIX process in same VM

┌──────────────────────────────────────────────────────────────────────────┐
│  Child Process (ls, cat, etc.)                                           │
│                                                                          │
│  - Runs inside same WASM VM                                              │
│  - Shares filesystem with parent                                         │
│  - stdout/stderr captured by wasix-runtime                               │
└──────────────────────────────────────────────────────────────────────────┘
```

## Message Types

### Node → WASM (via OUTPUT_QUEUES)

| Type | Value | Payload |
|------|-------|---------|
| SPAWN_REQUEST | 10 | JSON: {child_id, command, args, env, cwd} |
| SPAWN_STDIN | 11 | child_id (4 bytes) + data |
| SPAWN_CLOSE_STDIN | 12 | child_id (4 bytes) |
| SPAWN_KILL | 13 | child_id (4 bytes) + signal (4 bytes) |

### WASM → Node (via host_exec_child_output syscall)

| Type | Value | Payload |
|------|-------|---------|
| CHILD_STDOUT | 20 | child_id (4 bytes) + data |
| CHILD_STDERR | 21 | child_id (4 bytes) + data |
| CHILD_EXIT | 22 | child_id (4 bytes) + exit_code (4 bytes) |

## Implementation Checklist

### wasmer-js (scheduler)
- [ ] Add MSG_TYPE constants for spawn messages
- [ ] Add requestSpawn callback in create_host_exec_context
- [ ] Add onChildStdout, onChildStderr, onChildExit callbacks
- [ ] Add SchedulerMessage::HostExecChildOutput variant
- [ ] Handle HostExecChildOutput in execute()

### wasmer (syscalls)
- [ ] Add host_exec_child_output syscall
- [ ] Add to HostExec trait
- [ ] Register syscall

### wasix-runtime
- [ ] Add MSG_TYPE constants matching above
- [ ] Handle SPAWN_REQUEST in event loop
- [ ] Spawn child with std::process::Command
- [ ] Read child stdout/stderr non-blocking
- [ ] Call host_exec_child_output for output
- [ ] Handle child exit

### nanosandbox
- [ ] Update HostExecContext type
- [ ] Implement spawn callbacks
- [ ] Route child output to CommandExecutor

### sandboxed-node
- [ ] Update child_process polyfill to use new API
