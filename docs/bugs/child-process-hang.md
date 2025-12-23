# Child Process Implementation Status

## Summary

The child_process implementation for sandboxed-node -> wasix has a **blocking bug** that prevents it from working. Tests timeout because the WASM execution hangs after calling `host_exec_start`.

## What Works

1. **bash commands** - Native WASIX commands (bash, echo, etc.) work correctly
2. **host_exec message passing** - The HostExecStart message IS sent to the scheduler
3. **NodeProcess execution** - The sandboxed V8 isolate runs and completes successfully
4. **Session management** - Session IDs are generated and tracked correctly

## What Doesn't Work

1. **node commands timeout** - After host_exec_start returns, the WASM doesn't continue execution
2. **host_exec_poll never called** - The WASM should poll for results but never does
3. **No WASM debug output** - eprintln! from wasix-runtime never appears

## Technical Analysis

### Flow That Should Happen

```
wasix-runtime (WASM) calls host_exec_start syscall
  -> wasmer-wasix host_exec_start handler
    -> __asyncify (blocks until async work completes)
      -> HostExecImpl::host_exec_start sends message and returns immediately
    -> __asyncify returns with session_id
  -> syscall returns to WASM
wasix-runtime continues to run_event_loop()
  -> calls host_exec_poll in a loop
  -> receives stdout/stderr/exit from NodeProcess
```

### What Actually Happens

```
wasix-runtime (WASM) calls host_exec_start syscall
  -> wasmer-wasix host_exec_start handler
    -> [DEBUG] "STEP1+2 called" appears
    -> HostExecImpl::host_exec_start runs and sends message
    -> Scheduler receives HostExecStart and calls hostExecHandler
    -> NodeProcess runs and completes with exit_code
  -> [BLOCKED] WASM execution doesn't continue
  -> [NO OUTPUT] wasix-runtime debug logs never appear
  -> Test times out
```

### Key Evidence

From test output:
```
### STEP1+2 called                                    <- from HostExecImpl::host_exec_start
[host_exec] command=node args=["--version"]          <- from JS hostExecHandler
[scheduler] Promise resolved with exit_code=1        <- NodeProcess completed
[scheduler] pending read for session 0: None         <- No pending read (WASM never polled)
```

Missing output that should appear:
- `[wasix-shim] MAIN ENTRY` - wasix-runtime main()
- `[wasix-shim] Session started: 0` - after host_exec_start returns
- Any host_exec_poll/host_exec_try_read syscall activity

### Potential Root Causes

1. **__asyncify not returning properly** - The async blocking mechanism in wasmer-wasix may not be returning control to WASM correctly in the wasmer-js context

2. **WASM thread yield issue** - When the async future completes, the WASM thread may not be properly resumed

3. **Console output buffering** - The WASM's stderr may be buffered and never flushed (but this wouldn't explain the hang)

4. **Worker thread state** - The Web Worker running the WASM may be in an incorrect state after __asyncify

## Related Files

- `/home/nathan/misc/wasmer-js/src/runtime.rs` - HostExecImpl with host_exec_start
- `/home/nathan/misc/wasmer/lib/wasix/src/syscalls/wasix/host_exec_start.rs` - syscall handler
- `/home/nathan/misc/wasmer/lib/wasix/src/syscalls/mod.rs` - __asyncify implementation
- `/home/nathan/libsandbox/packages/nanosandbox/wasix-runtime/src/main.rs` - WASM shim

## Test Commands

```bash
# Run the debug test
cd /home/nathan/libsandbox/packages/nanosandbox
npm run test -- --run -t "stderr from node"

# Run all child_process tests (will timeout)
npm run test -- --run tests/node-child-process.test.ts
```

## Next Steps

1. Investigate `__asyncify` / `InlineWaker::block_on` in wasmer-wasix for JS target
2. Check how the WebAssembly thread is resumed after async work completes
3. Add debugging to the syscall return path to see where execution stops
4. Consider filing an issue on wasmer-js for async syscall handling bugs
