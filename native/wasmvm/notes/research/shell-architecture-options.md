# Shell Architecture Options for wasmVM

**Date:** 2026-03-16
**Purpose:** Compare architectural approaches for the wasmVM shell implementation.

---

## Option A: Keep Current TypeScript Shell (Status Quo)

**How it works:** Hand-rolled tokenizer, parser, and evaluator in `wasmcore/host/src/shell.ts`. All shell logic runs on the JS host side.

**Pros:**
- Already exists and works for the MVP feature set
- Full control over the execution model — directly spawns Workers, wires SharedArrayBuffers, manages process table
- No FFI boundary between shell logic and host APIs
- Simple build — no additional Rust/WASM dependencies

**Cons:**
- Every POSIX shell feature (command substitution, here-docs, case/esac, arithmetic, tilde expansion, parameter expansion, etc.) must be implemented by hand
- Risk of subtle POSIX non-compliance
- No existing test suite to validate against

**Effort:** Medium-high per feature (each one is a mini-project)

---

## Option B: Rust Parser (WASM) + TypeScript Evaluator (Host)

**How it works:** Use an existing Rust POSIX shell parser crate (yash-syntax, brush-parser, or flash's parser) compiled into the WASM binary. The parser runs inside WASM and returns an AST. The TypeScript evaluator on the host side walks the AST and dispatches commands.

**Candidate parsers:**
- `yash-syntax` — best standalone POSIX parser library, well-decomposed
- `brush-parser` — bash-level parsing, may have heavier deps
- `flash` parser — already proven in WASM

**Pros:**
- Battle-tested parsing of the full POSIX shell grammar (and potentially bash)
- Don't have to implement tokenizer/parser for every shell feature
- Evaluator stays on the host where it has direct access to Workers and process management
- Parser is the hardest part to get right — leveraging existing work here is high-value

**Cons:**
- FFI boundary between WASM parser and JS evaluator — need to serialize/deserialize ASTs across the boundary
- Adds to WASM binary size
- Two languages for one subsystem (Rust parser, TS evaluator)
- Still need to write the evaluator for each feature (but evaluation is simpler than parsing)

**Effort:** Medium upfront (integration), low per feature after that

---

## Option C: Full Rust Shell in WASM (flash)

**How it works:** Embed flash (or similar) as both parser and interpreter inside the WASM binary. Flash's command execution is replaced with calls to wasmVM's host-provided WASI imports (`proc_spawn`, etc.). The shell runs entirely in WASM; the host just handles process lifecycle.

**Pros:**
- Potentially get a near-complete POSIX shell "for free"
- Single language for the shell implementation
- flash already compiles to WASM
- Could validate against POSIX shell test suites

**Cons:**
- flash's interpreter assumes it can execute commands directly — replacing its execution backend with wasmVM's Worker-based dispatch is non-trivial
- flash is experimental and may have gaps
- Debugging shell issues requires working in the WASM/Rust layer rather than the more accessible TS layer
- All shell I/O (stdin/stdout/stderr, redirections) must cross the WASM-host boundary
- Tight coupling to flash's internal architecture — if the project changes direction or stalls, we're stuck maintaining a fork

**Effort:** High upfront (execution backend replacement), potentially low ongoing if it works

---

## Option D: Shell Binary Inside Multicall (What Was Originally Asked)

**How it works:** Include a full shell (dash compiled from C, or a Rust shell) as a command in the multicall binary. The shell runs as a Worker process like any other command. When it needs to run a sub-command, it calls back to the host.

**Pros:**
- Conceptually simple — shell is "just another command"
- Could theoretically use real dash/bash source

**Cons:**
- **Circular dependency:** The shell needs to spawn other commands, but it's running inside a Worker. It would need to call the host to spawn more Workers, then wait for them. The host is already doing this — so the shell in WASM is just adding an indirection layer.
- fork/exec doesn't exist in WASI — the shell can't run commands without host help
- Every pipe, redirect, and process wait requires crossing the WASM-host FFI boundary
- For C shells: requires gutting the execution backend (fork/exec → host calls), essentially rewriting half the shell
- More complex than any other option with no clear benefit

**Assessment:** Not recommended. This adds complexity without solving any problem that the other options don't solve better.

---

## Recommendation

**Short term (post-MVP):** Option A — continue building out the TypeScript shell. The remaining features (here-docs, case/esac, arithmetic, tilde expansion) are well-scoped and the current architecture works.

**Medium term:** Evaluate Option B — specifically, investigate whether `yash-syntax` or flash's parser compiles cleanly to `wasm32-wasip1` and whether the AST can be efficiently passed to the JS host. If the parser integration is clean, migrate the tokenizer/parser to Rust while keeping the evaluator in TypeScript. This gives you a battle-tested POSIX parser with full control over execution.

**Long term (if bash compatibility becomes a requirement):** Option C — embed flash or brush as a full shell, with a custom execution backend. Only worth the effort if users need bash scripting beyond basic POSIX sh.
