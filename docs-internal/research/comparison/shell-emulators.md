# Shell Emulators Comparison

A comparison of JavaScript/TypeScript shell parsing and execution implementations relevant to providing shell capabilities in sandboxed environments.

## Tools

### just-bash

**What it is:** A sibling project that implements a full AST-based bash interpreter in TypeScript. Includes 70+ built-in commands (coreutils), a complete shell grammar parser, and support for pipes, redirects, variables, control flow, and more.

**Architecture:** Source → Lexer → Parser → AST → Interpreter. The parser produces a typed AST (pipelines, commands, redirects, assignments, loops, conditionals, functions). The interpreter walks the AST and dispatches to built-in command implementations or external command handlers. All I/O goes through a virtual filesystem abstraction.

**Built-in commands (70+):** cat, ls, grep, sed, awk, find, sort, uniq, wc, head, tail, echo, printf, test, expr, cut, tr, paste, join, comm, diff, patch, tar, gzip, gunzip, chmod, chown, mkdir, rmdir, cp, mv, rm, ln, touch, date, env, export, unset, read, sleep, tee, xargs, basename, dirname, realpath, pwd, cd, pushd, popd, which, type, alias, unalias, true, false, yes, seq, bc, md5sum, sha256sum, base64, uname, whoami, id, hostname, kill, ps, nohup, timeout, and more.

**Shell features:** Pipelines (`|`), redirects (`>`, `>>`, `<`, `2>&1`), command substitution (`$(cmd)`), process substitution, here-docs, here-strings, variables, parameter expansion (`${var:-default}`), arithmetic (`$((expr))`), globbing (`*`, `?`, `[...]`), brace expansion, for/while/until loops, if/elif/else, case statements, functions, traps, subshells, background jobs (`&`), and logical operators (`&&`, `||`).

**Test suite:** 358 test files covering individual commands, shell features, and integration scenarios.

**Strengths:**
- Most complete JavaScript bash implementation available
- Full AST — can analyze, transform, and execute shell code
- 70+ commands means most shell scripts work without external binaries
- Pure TypeScript — runs in browser and Node.js
- Virtual filesystem abstraction — works with any storage backend
- Comprehensive test suite (358 files)
- Streaming I/O model (pipes work correctly)

**Weaknesses:**
- Not 100% POSIX-compliant (pragmatic subset)
- Some bash-specific features may be missing (e.g., coprocesses, complete job control)
- Performance is slower than native bash (interpreted in JS)
- Large codebase — adds significant bundle size
- Complex edge cases in parameter expansion and quoting
- No support for running real binaries (everything must be a built-in or handled by the host)

---

### bash-parser

**What it is:** A JavaScript parser for bash syntax that produces an AST. Parse-only — does not include an interpreter or execution engine.

**Architecture:** Lexer → Parser → AST. Uses a PEG-like grammar to parse bash source into a structured AST. The AST represents commands, pipelines, redirects, and other shell constructs as JSON-serializable objects.

**Strengths:**
- Focused on parsing correctness
- Clean AST output suitable for analysis or custom interpretation
- Can be used to build custom shell interpreters
- Relatively small and focused codebase
- Good for static analysis of shell scripts

**Weaknesses:**
- **No execution** — parse only, no interpreter included
- Must build your own interpreter on top of the AST
- Incomplete support for all bash syntax (some edge cases missing)
- Not actively maintained (last meaningful update years ago)
- AST format is non-standard — no tooling ecosystem around it
- Missing support for newer bash features

---

### bash-emulator

**What it is:** A basic browser-based shell emulator that provides a minimal shell experience for web terminals. Implements a small set of commands and basic shell syntax.

**Architecture:** Simple command-line parser → command dispatcher. Commands are registered as functions that receive arguments and return output. No formal AST — the parser splits on spaces and pipes with basic quoting support.

**Built-in commands:** echo, cat, ls, cd, pwd, mkdir, rm, cp, mv, touch, head, tail, grep, clear, help, and a few others (~20 total).

**Strengths:**
- Simple and easy to understand
- Small bundle size
- Easy to extend with custom commands
- Good for basic terminal UI demos
- Browser-friendly

**Weaknesses:**
- Very limited shell syntax (no variables, loops, conditionals, functions)
- Minimal command set (~20 vs just-bash's 70+)
- No formal parser — breaks on complex quoting or nesting
- No pipeline support (or very basic)
- No redirects, command substitution, or parameter expansion
- Not suitable for running real shell scripts
- Not actively maintained

---

### mvdan-sh (sh)

**What it is:** A Go-based shell parser, formatter, and interpreter. Supports POSIX shell, bash, and mksh syntax. Available as a Go library and CLI tools (`shfmt`, `gosh`).

**Architecture:** Written in Go with a proper recursive-descent parser. Produces a Go AST (typed syntax tree) that can be inspected, formatted, or interpreted. The interpreter (`interp` package) can execute parsed scripts with pluggable handlers for command execution, file operations, and environment.

**Strengths:**
- Excellent POSIX and bash compliance (actively maintained by Daniel Martí)
- `shfmt` is the standard shell formatter used widely in CI/CD
- Full interpreter with extensible handlers
- Strong typing and error handling (Go)
- Well-tested against bash/POSIX test suites
- Can be compiled to WASM for browser use

**Weaknesses:**
- Written in Go — not native JavaScript/TypeScript
- WASM compilation adds ~2-5MB to bundle
- Go <-> JavaScript interop is clunky (syscall/js bridge)
- Interpreter performance in WASM is slower than native Go
- Not designed as a library for JavaScript embedding
- The Go AST types don't map cleanly to JavaScript consumption
- WASM version has limited filesystem/OS integration

---

## Comparison Table

| Feature | just-bash | bash-parser | bash-emulator | mvdan-sh |
|---|---|---|---|---|
| **Language** | TypeScript | JavaScript | JavaScript | Go (WASM optional) |
| **Parsing** | Full AST | Full AST | Basic split | Full AST |
| **Execution** | Yes (interpreter) | No | Yes (basic) | Yes (interpreter) |
| **Built-in commands** | 70+ | N/A | ~20 | Extensible |
| **Pipelines** | Yes | Yes (parse) | Basic | Yes |
| **Redirects** | Yes | Yes (parse) | No | Yes |
| **Variables / expansion** | Yes | Yes (parse) | No | Yes |
| **Control flow** | Yes | Yes (parse) | No | Yes |
| **Functions** | Yes | Yes (parse) | No | Yes |
| **Globbing** | Yes | Yes (parse) | No | Yes |
| **POSIX compliance** | Pragmatic subset | Partial parse | Minimal | High |
| **Browser support** | Yes (native) | Yes (native) | Yes (native) | Yes (via WASM) |
| **Bundle size impact** | Large | Small | Small | Large (WASM) |
| **Test coverage** | 358 files | Limited | Minimal | Extensive |
| **Active maintenance** | Yes | No | No | Yes |

## Relevance to libsandbox

libsandbox needs shell execution for its `child_process` bridge (spawn, exec, execSync). The options for providing this are:

1. **Delegate to host**: The current approach — the `CommandExecutor` driver delegates shell commands to the host OS (Node driver) or stubs them (browser driver). Simple but requires the host to have a real shell.

2. **Embed just-bash**: Would enable full shell execution in both Node and browser without host dependencies. The 70+ built-in commands cover most scripting needs. The tradeoff is bundle size and the need to map just-bash's VirtualFS to libsandbox's driver filesystem.

3. **Use bash-parser + custom interpreter**: Maximum control over execution semantics, but requires building an interpreter from scratch — essentially rebuilding what just-bash already provides.

4. **WASM mvdan-sh**: Good POSIX compliance but the WASM overhead and Go interop complexity make it impractical for lightweight embedding.

For libsandbox's browser driver, integrating just-bash is the most practical path to shell support. The shared VirtualFS concept aligns well, and the pure-TypeScript implementation avoids WASM complexity. For the Node driver, delegating to the host shell remains the better option since native bash is available and faster.
