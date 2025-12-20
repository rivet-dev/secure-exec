# WASIX Bash Builtin Exit Code Bug

## Summary

When using `bash -c "command"` in WASIX, all **builtin commands** return exit code 45 (ENOEXEC) instead of their actual exit code. External commands work correctly.

## Affected

- Package: `sharrattj/bash` (wasmer registry)
- Affects: `bash -c` and `sh -c` with any builtin command
- Does NOT affect: External commands via PATH or absolute path

## Symptoms

```bash
# Builtins - ALL return exit code 45
bash -c "echo hello"      # stdout: hello, exit: 45 ✗
bash -c "true"            # exit: 45 ✗
bash -c "false"           # exit: 45 ✗
bash -c "exit 0"          # exit: 45 ✗
bash -c "exit 42"         # exit: 45 ✗
bash -c "pwd"             # stdout: /, exit: 45 ✗
bash -c "printf 'hi\n'"   # stdout: hi, exit: 45 ✗

# External commands - work correctly
bash -c "/bin/echo hello" # stdout: hello, exit: 0 ✓
bash -c "/bin/true"       # exit: 0 ✓
bash -c "/bin/false"      # exit: 1 ✓
bash -c "ls /"            # stdout: bin..., exit: 0 ✓
```

## Exit Code 45 Meaning

In WASIX errno definitions, 45 = `ENOEXEC` ("Executable file format error").

See: https://wasmerio.github.io/wasmer/crates/doc/wasmer_wasix_types/wasi/bindings/enum.Errno.html

## Root Cause

Unknown. The bug is in the WASIX bash package, not in our code. The command output is correct (stdout/stderr work), but the exit code propagation is broken for builtins when using `-c` flag.

Note: Interactive bash (via stdin) works correctly - exit codes are proper.

## Impact on nanosandbox

- `child_process.exec()` uses `spawn("bash", ["-c", command])` internally
- This means exec() always reports an error (code 45) even on successful commands
- The stdout/stderr are still correct
- Workaround: Use `spawn()` with external commands directly

## Workarounds

1. **Use spawn() with direct commands** (not bash -c):
   ```js
   spawn('echo', ['hello'])  // Works, exit code 0
   spawn('ls', ['/'])        // Works, exit code 0
   ```

2. **Use absolute paths in bash -c**:
   ```js
   spawn('bash', ['-c', '/bin/echo hello'])  // Works, exit code 0
   ```

3. **Accept incorrect exit codes** for exec() and only check stdout/stderr

## Test Files

- `tests/debug-builtins.test.ts` - Demonstrates the issue
- `tests/debug-path2.test.ts` - Shows absolute path workaround

## Status

- **Open** - Waiting for fix in `sharrattj/bash` package
- Consider filing issue at wasmer registry or bash package repo
