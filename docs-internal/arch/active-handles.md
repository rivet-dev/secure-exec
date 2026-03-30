# Active Handles: Keeping the Sandbox Alive for Async Operations

## Problem

The sandboxed Node.js environment uses V8 isolates to run JavaScript code. Unlike real Node.js, the V8 isolate does not have an event loop. Code runs synchronously and the sandbox exits immediately when the script finishes executing.

This causes problems with async APIs that use callbacks:

```javascript
const { spawn } = require('child_process');
const child = spawn('echo', ['hello']);

child.stdout.on('data', (data) => {
    console.log('output:', data.toString());  // Never fires!
});

child.on('close', (code) => {
    console.log('exit code:', code);  // Never fires!
});

// Script finishes here, sandbox exits immediately
// Child process runs but callbacks never fire
```

## Why This Happens

In real Node.js:
1. Script sets up event handlers
2. Script finishes synchronous execution
3. Event loop keeps running while there are "active handles" (child processes, timers, sockets)
4. Callbacks fire as events occur
5. Process exits when no more active handles remain

In the V8 isolate:
1. Script sets up event handlers
2. Script finishes synchronous execution
3. `exec()` returns immediately - no event loop
4. V8 context is released
5. Callbacks can never fire

The lifecycle globals are intentionally immutable so sandboxed code cannot replace `_registerHandle`, `_unregisterHandle`, or `_waitForActiveHandles` and bypass runtime completion handling.
They are exposed through the shared helper policy in `packages/secure-exec/src/shared/global-exposure.ts`, which is also used for other custom runtime/bridge globals.

## Solution: Active Handle Tracking

We implement a simple handle tracking mechanism that mimics Node.js's ref counting:

```javascript
// Global state
const _activeHandles = new Map();  // id -> description
let _waitResolvers = [];

// Register a handle (keeps sandbox alive)
const _registerHandle = (id, description) => {
    _activeHandles.set(id, description);
};

// Unregister a handle (allows sandbox to exit if no handles remain)
const _unregisterHandle = (id) => {
    _activeHandles.delete(id);
    if (_activeHandles.size === 0) {
        _waitResolvers.forEach(r => r());
        _waitResolvers = [];
    }
};

// Wait for all handles to complete
const _waitForActiveHandles = () => {
    if (_activeHandles.size === 0) return Promise.resolve();
    return new Promise(resolve => _waitResolvers.push(resolve));
};

// Debug: see what's still active
const _getActiveHandles = () => {
    return Array.from(_activeHandles.entries());
};

exposeCustomGlobal("_registerHandle", _registerHandle);
exposeCustomGlobal("_unregisterHandle", _unregisterHandle);
exposeCustomGlobal("_waitForActiveHandles", _waitForActiveHandles);
exposeCustomGlobal("_getActiveHandles", _getActiveHandles);
```

Active-handle bindings are listed in the canonical custom-global inventory (`NODE_CUSTOM_GLOBAL_INVENTORY`) in `packages/secure-exec/src/shared/global-exposure.ts`, alongside mutable runtime-state exceptions and stdlib-compatibility exclusions.

The `exec()` method in secure-exec automatically awaits `_waitForActiveHandles()` after running user code:

```typescript
// Run user's script
await script.run(context);

// Wait for any async handles (child processes, etc.) to complete
await context.eval('_waitForActiveHandles()', { promise: true });
```

## Usage in Bridges

### Child Process

```javascript
// On spawn
const handleId = `child:${sessionId}`;
_registerHandle(handleId, `child_process: ${command} ${args.join(' ')}`);

// On exit
_unregisterHandle(handleId);
```

### Timers (if needed)

```javascript
// setTimeout
const handleId = `timer:${timerId}`;
_registerHandle(handleId, `setTimeout: ${delay}ms`);

// When timer fires or is cleared
_unregisterHandle(handleId);
```

## Debugging

If the sandbox seems to hang, you can check what handles are still active:

```javascript
console.log('Active handles:', _getActiveHandles());
```

This will show something like:
```
Active handles: [
    ['child:1', 'child_process: echo hello world'],
    ['child:2', 'child_process: ls -la']
]
```

## Comparison with Node.js

| Feature | Node.js | secure-exec |
|---------|---------|----------------|
| Event loop | Built-in libuv | None (V8 isolate) |
| Handle tracking | Automatic via libuv | Manual via `_registerHandle` |
| `ref()`/`unref()` | Per-handle methods | Not implemented (all handles keep alive) |
| Debugging | `process._getActiveHandles()` | `_getActiveHandles()` |

## Limitations

1. **No `unref()` support**: In Node.js, you can call `handle.unref()` to allow the process to exit even if the handle is active. We don't support this - all registered handles keep the sandbox alive.

2. **Manual registration**: Bridges must explicitly register/unregister handles. Forgetting to unregister will cause the sandbox to hang.

3. **No timeout**: If a handle never completes, the sandbox hangs forever. Consider adding a timeout in `exec()` if this becomes a problem.
