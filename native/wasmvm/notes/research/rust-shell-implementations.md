# Rust Shell Implementations — Exhaustive Survey

**Date:** 2026-03-16
**Purpose:** Evaluate whether an existing Rust shell crate could replace or supplement the hand-rolled TypeScript shell in wasmVM.

---

## Context

wasmVM currently implements its shell (tokenizer, parser, evaluator) in TypeScript (`wasmcore/host/src/shell.ts`). The post-MVP spec calls for adding command substitution, here-documents, case/esac, arithmetic expansion, tilde expansion, and more. The question: could we use an existing Rust shell implementation instead of building all this by hand?

### Key Constraint

The shell in wasmVM must orchestrate Web Workers — it spawns child processes, wires up SharedArrayBuffers for pipes, manages the process table. WASI has no fork/exec. Any shell running inside WASM cannot spawn processes directly; it must call back to the JS host. This means:

- A **parser** compiled to WASM is straightforward and valuable
- An **evaluator** compiled to WASM needs its execution backend replaced with wasmVM's Worker-based dispatch
- A **full shell binary** inside the multicall doesn't work without the host doing all the actual execution anyway

---

## Tier 1: Serious, Actively Maintained

### brush (Bo(u)rn(e) RUsty SHell)

- **Repo:** https://github.com/reubeno/brush
- **Crates:** `brush-shell`, `brush-core`, `brush-parser`, `brush-interactive`
- **Compliance:** POSIX sh: Yes. Bash: Yes (primary goal, ~1400 bash compatibility tests)
- **Library use:** Yes — `brush-core` is embeddable via `brush_core::Shell`
- **Actively maintained:** Very active, v0.3.x on crates.io (2026)
- **WASM feasibility:** Difficult. Depends on `tokio` and `nix` (Unix syscalls). `brush-parser` alone may compile but `brush-core` would need major surgery to strip Unix-specific deps.
- **Assessment:** Most complete Rust bash implementation. Best candidate if bash-level compatibility is needed, but WASM compilation requires significant work.

### yash-rs (Yet Another Shell - Rust)

- **Repo:** https://github.com/magicant/yash-rs
- **Crates:** `yash-syntax`, `yash-semantics`, `yash-env`, `yash-cli`, `yash-prompt`, `yash-quote`
- **Compliance:** POSIX sh: Yes (primary goal, extended POSIX). Bash: No.
- **Library use:** Yes — `yash-syntax` is a standalone POSIX shell parser. Well-decomposed crate architecture.
- **Actively maintained:** Yes. `yash-cli` updated Feb 2026, `yash-syntax` updated Nov 2025.
- **WASM feasibility:** `yash-syntax` (parser only) is likely WASM-compilable — pure parsing logic. `yash-env` and `yash-semantics` depend on Unix process/signal/fd APIs.
- **Assessment:** Best decomposed architecture of any Rust shell. `yash-syntax` alone is a strong candidate for a POSIX shell parser library.

### flash

- **Repo:** https://github.com/raphamorim/flash
- **Crate:** `flash`
- **Compliance:** POSIX sh: Yes. Bash: Partial.
- **Library use:** Yes — designed as a library for parsing, formatting, and interpreting shell scripts.
- **Actively maintained:** Yes, active development.
- **WASM feasibility:** **Already compiles to WASM.** Has a live WASM playground at raphamorim.io/flash.
- **Assessment:** Inspired by mvdan/sh (Go). Parser + formatter + interpreter. Experimental but actively developed. The fact that it already runs in WASM makes it the most immediately relevant project for wasmVM.

### rusty_bash / Sushi Shell

- **Repo:** https://github.com/shellgei/rusty_bash
- **Compliance:** POSIX sh: Partial. Bash: Yes (primary goal — bash clone).
- **Library use:** No — standalone binary only.
- **Actively maintained:** Yes (shellgei group). Passed 27 of 84 bash test scripts.
- **WASM feasibility:** Unknown, likely difficult due to process management.
- **Assessment:** Not usable as a library. Educational bash clone.

---

## Tier 2: Published Crates, Varying Completeness

### rush-sh

- **Repo:** https://github.com/drewwalton19216801/rush-sh
- **Crate:** `rush-sh`
- **Compliance:** POSIX sh: Yes (claims IEEE Std 1003.1-2008). Bash: No.
- **Library use:** Unclear — published as a crate but primarily a binary.
- **Actively maintained:** Appears active.
- **WASM feasibility:** Unknown.
- **Assessment:** Claims 32 builtins, arithmetic expansion, signal handling. Solo project, maturity uncertain.

### rash-shell

- **Repo:** https://github.com/absurdhero/rash-shell
- **Crate:** `rash-shell`
- **Compliance:** POSIX sh: Yes (inspired by dash, grammar based on POSIX standard). Bash: No.
- **Library use:** No.
- **Actively maintained:** No — last update ~2019.
- **WASM feasibility:** Uses LALRPOP parser generator (WASM-friendly). Evaluator likely uses Unix APIs.
- **Assessment:** Dash-inspired. Abandoned.

### oursh

- **Repo:** https://github.com/nixpulvis/oursh
- **Crate:** `oursh`
- **Compliance:** POSIX sh: Partial (LALRPOP POSIX grammar). Bash: No.
- **Library use:** Published as a crate with library modules.
- **Actively maintained:** Minimal, last significant activity ~2023.
- **WASM feasibility:** Depends on `termios`/`libc` — not WASM-friendly.
- **Assessment:** Interesting "hashlang" polyglot architecture. Not production-ready.

---

## Tier 3: Small / Educational / Inactive

| Project | Compliance | Library? | Active? | Notes |
|---------|-----------|----------|---------|-------|
| **rushell** (hiking90) | Partial POSIX | No | Low | Forked from nsh |
| **nsh** (nuta) | Partial POSIX + bash | No | Alpha | Fish-like UX |
| **rush** (moturus) | Partial POSIX | No | Low | Designed for portability, minimal deps |
| **rush** (ashpil) | POSIX sh ("Rust dash") | No | No | Educational |
| **cicada** (mitnk) | Partial, no scripting | No | Moderate | Interactive only, not a script interpreter |
| **rust-shell** (skylerberg) | Partial | No | No | Learning project |
| **smallsh** (loganintech) | Minimal | No | No | Tiny educational |

---

## Not Shell Interpreters (Related Tools)

| Project | What It Is | Relevance |
|---------|-----------|-----------|
| **ion-shell** (Redox OS) | Custom shell language, NOT POSIX | Not suitable |
| **nushell** | Structured data shell, NOT POSIX | Not suitable |
| **fish** (Rust rewrite) | Not POSIX | Not suitable |
| **shrs** | Framework for building custom shells | Not an interpreter |
| **tree-sitter-bash** | Incremental parser for syntax highlighting | Parser only, no evaluation, produces CST not AST |
| **shellish_parse** | Simple shell-like line parser (quoting, word splitting) | Too simple — no pipes, redirects, control flow |
| **bashrs** (paiml) | Rust-to-shell transpiler | Wrong direction |
| **mystsh** | Predecessor of flash (same author) | Use flash instead |

---

## Summary: Classification by Compliance

### POSIX sh compliant:

1. **yash-rs** — best parser library architecture
2. **flash** — already compiles to WASM
3. **rush-sh** — claims full compliance, solo project
4. **rash-shell** — dash-inspired, abandoned

### Bash compliant:

1. **brush** — most complete, ~1400 test cases
2. **rusty_bash** — bash clone, binary only

### Custom language (not POSIX):

- ion, nushell, fish, shrs

---

## Recommendation for wasmVM

### Best Option: flash

- Already proven to compile to WASM
- POSIX sh compliant with partial bash support
- Designed as a library (parser + formatter + interpreter)
- Actively maintained
- Inspired by mvdan/sh, which is the gold standard for Go shell parsing

**Action:** Evaluate whether flash's interpreter can have its command execution backend replaced with wasmVM's Worker-based dispatch. If so, this could replace the entire hand-rolled shell in `shell.ts`.

### Fallback Option: yash-syntax (parser only)

- Best-decomposed POSIX shell parser as a standalone library
- Likely compiles to WASM (pure parsing, no Unix deps)
- Pair with wasmVM's existing TypeScript evaluator

**Action:** If flash doesn't work out, use `yash-syntax` for parsing and keep the TypeScript evaluator.

### Long-term Option: brush-parser

- If bash-level compatibility becomes a requirement
- Would need to verify WASM compilation
- More complex than yash-syntax but covers bash extensions
