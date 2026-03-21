# C Shell Implementations Compiled to WASM

**Date:** 2026-03-16
**Purpose:** Evaluate whether existing C shell implementations (dash, bash) can be compiled to WASM for use in wasmVM.

---

## Prior Art

### wasix-org/dash

- **Repo:** https://github.com/wasix-org/dash
- **What:** Dash (Debian Almquist Shell) compiled to WebAssembly using WASIX.
- **Compliance:** Full POSIX sh.
- **Blocker for wasmVM:** Requires WASIX (Wasmer's proprietary POSIX extension to WASI). wasmVM explicitly avoids Wasmer/WASIX dependencies.

### CoWasm / dash-wasm (sagemathinc)

- **Repo:** https://github.com/sagemathinc/cowasm
- **What:** Dash compiled to WASM using Zig's clang/LLVM cross-compilation. Part of the CoWasm project (BSD coreutils + dash in WASM).
- **Compliance:** Full POSIX sh (it's real dash).
- **Blocker for wasmVM:** Adds Zig toolchain dependency. Different build system from wasmVM's Rust/cargo workflow. Integration with wasmVM's VFS and process model would require custom WASI polyfills.

### bash-wasm (Wasmer)

- **What:** Full bash compiled to WASM, available at webassembly.sh.
- **Compliance:** Full bash.
- **Blocker for wasmVM:** Requires WASIX. Bash is large and complex. Same Wasmer dependency problem.

---

## Fundamental Problem: WASI Has No fork/exec

The core issue with putting any shell (C or Rust) inside WASM:

1. **WASI intentionally omits `fork()`, `exec()`, and `posix_spawn()`** — these are OS process abstractions that don't fit the WASM sandbox model.
2. WASIX (Wasmer's extension) fakes these, but ties you to Wasmer's runtime.
3. A shell running inside WASM cannot create child processes. It would need to call back to the JS host for every command spawn via custom WASI imports.
4. At that point, the shell in WASM is just a parser/evaluator that forwards all execution to JS — the same architecture wasmVM already has, but with extra FFI overhead and a C dependency.

---

## Could We Statically Link C Code Into the Multicall Binary?

Theoretically possible but impractical:

### The approach would be:

1. Take dash source (~100KB of C)
2. Compile it with `clang --target=wasm32-wasip1` (or via `cc` crate in Rust build script)
3. Link the resulting `.o` files into the Rust multicall binary
4. Expose dash functions via `extern "C"` FFI from Rust

### Problems:

1. **dash assumes fork/exec everywhere.** The `exec.c` module calls `fork()` to run each command. You'd have to gut the entire execution backend and replace it with calls to wasmVM's host-provided `proc_spawn` WASI import. This is essentially rewriting half of dash.

2. **dash assumes a real filesystem.** It calls `open()`, `read()`, `stat()` etc. on real paths. wasmVM's VFS provides these via WASI polyfills, so this part might work — but dash's internal path handling, glob expansion, and redirection all assume direct fd manipulation that may not map cleanly.

3. **Mixed C/Rust WASM builds are fragile.** The `wasm32-wasip1` target has limited C library support. You'd need `wasi-sdk` for the C side, and linking Rust + C object files targeting WASM is possible but adds significant build complexity.

4. **Binary size.** dash itself is small (~100KB), but pulling in `wasi-libc` for the C side adds bulk and potential conflicts with Rust's `std` patches.

5. **Maintenance burden.** Any bug in the C-to-WASM integration layer would be extremely hard to debug. You'd be maintaining a custom fork of dash with a gutted execution backend, compiled through a mixed C/Rust WASM toolchain.

---

## Verdict

Compiling C shells to WASM is proven to work (CoWasm, wasix-org/dash), but every existing approach either:

- Depends on WASIX/Wasmer (violates wasmVM constraints), or
- Requires gutting the execution backend anyway (at which point you've done the same work as building an evaluator from scratch, but in C instead of TypeScript/Rust)

**A Rust shell library (like flash) that already targets WASM is a much cleaner path** than trying to wrangle C shell code into the wasmVM architecture.
