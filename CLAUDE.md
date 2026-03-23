## Brand

- primary accent color: #38BDF8 (bright sky blue), light variant: #7DD3FC
- secondary accent color: #CC0000 (red), light variant: #FF3333
- website: https://secureexec.dev
- docs: https://secureexec.dev/docs
- GitHub: https://github.com/rivet-dev/secure-exec
- GitHub org is `rivet-dev` — NEVER use `anthropics` or any other org in GitHub URLs for this repo
- the docs slug for Node.js compatibility is `nodejs-compatibility` (not `node-compatability` or other variants)

## NPM Packages

- every publishable package must include a `README.md` with the standard format: title, tagline, and links to website, docs, and GitHub
- if `package.json` has a `"files"` array, `"README.md"` must be listed in it

## Testing Policy

- NEVER mock external services in tests — use real implementations (Docker containers for databases/services, real HTTP servers for network tests, real binaries for CLI tool tests)
- tests that validate sandbox behavior MUST run code through the secure-exec sandbox (NodeRuntime/proc.exec()), never directly on the host
- CLI tool tests (Pi, Claude Code, OpenCode) must execute inside the sandbox: Pi runs as JS in the VM, Claude Code and OpenCode spawn their binaries via the sandbox's child_process.spawn bridge
- e2e-docker fixtures connect to real Docker containers (Postgres, MySQL, Redis, SSH/SFTP) — skip gracefully via `skipUnlessDocker()` when Docker is unavailable
- interactive/PTY tests must use `kernel.openShell()` with `@xterm/headless`, not host PTY via `script -qefc`

### POSIX Conformance Test Integrity

- **no test-only workarounds** — if a C override fixes broken libc behavior (fcntl, realloc, strfmon, etc.), it MUST go in the patched sysroot (`native/wasmvm/patches/wasi-libc/`) so all WASM programs get the fix; never link overrides only into test binaries — that inflates conformance numbers while real users still hit the bug
- **never replace upstream test source files** — if an os-test `.c` file fails due to a platform difference (e.g. `sizeof(long)`), exclude it via `posix-exclusions.json` with the real reason; do not swap in a rewritten version that changes what the test validates
- **kernel behavior belongs in the kernel, not the test runner** — if a test requires runtime state (POSIX directories like `/tmp`, `/usr`, device nodes, etc.), implement it in the kernel/device-layer so all users get it; the test runner should not create kernel state that real users won't have
- **no suite-specific VFS special-casing** — the test runner must not branch on suite name to inject different filesystem state; if a test needs files to exist, either the kernel should provide them or the test should be excluded
- **categorize exclusions honestly** — if a failure is fixable with a patch or build flag, it's `implementation-gap`, not `wasm-limitation`; reserve `wasm-limitation` for things genuinely impossible in wasm32-wasip1 (no 80-bit long double, no fork, no mmap)

## Tooling

- use pnpm, vitest, and tsc for type checks
- use turbo for builds
- keep timeouts under 1 minute and avoid running full test suites unless necessary
- use one-line Conventional Commit messages; never add any co-authors (including agents)
- never mark work complete until typechecks pass and all tests pass in the current turn; if they fail, report the failing command and first concrete error
- always add or update tests that cover plausible exploit/abuse paths introduced by each feature or behavior change
- treat host memory buildup and CPU amplification as critical risks; avoid unbounded buffering/work (for example, default in-memory log buffering)
- check GitHub Actions test/typecheck status per commit to identify when a failure first appeared
- do not use `contract` in test filenames; use names like `suite`, `behavior`, `parity`, `integration`, or `policy` instead

## GitHub Issues

- when fixing a bug or implementation gap tracked by a GitHub issue, close the issue in the same PR using `gh issue close <number> --comment "Fixed in <commit-hash>"`
- when removing a test from `posix-exclusions.json` because the fix landed, close the linked issue
- do not leave resolved issues open — verify with `gh issue view <number>` if unsure

## Tool Integration Policy

- NEVER implement a from-scratch reimplementation of a tool when the PRD specifies using an existing upstream project (e.g., codex, curl, git, make)
- always fork, vendor, or depend on the real upstream source — do not build a "stub" or "demo" binary that fakes the tool's behavior
- if the upstream cannot compile or link for the target, document the specific blockers and leave the story as failing — do not mark it passing with a placeholder
- the PRD and story notes define which upstream project to use; follow them exactly unless explicitly told otherwise

## C Library Vendoring Policy

- NEVER commit third-party C library source code directly into this repo
- **unmodified upstream libraries** (sqlite3, zlib, minizip, cJSON, etc.) must be downloaded at build time from their official release URLs — add a Makefile target in `native/wasmvm/c/Makefile` under `fetch-libs`
- **modified libraries** (e.g., libcurl with WASI patches) must live in a fork under the `rivet-dev` GitHub org (e.g., `rivet-dev/secure-exec-curl`) — the Makefile downloads from the fork's archive URL
- all downloaded library sources go in `native/wasmvm/c/libs/` which is gitignored — they are fetched by `make fetch-libs` and cached in `native/wasmvm/c/.cache/`
- when adding a new C library dependency: (1) add its download URL and Makefile target to `fetch-libs`, (2) add `libs/<name>` to the appropriate `.gitignore`, (3) if WASI modifications are needed, create a `rivet-dev/secure-exec-<name>` fork first
- existing forks: `rivet-dev/secure-exec-curl` (libcurl with `wasi_tls.c` and `wasi_stubs.c`)

## WASM Binary

- the goal for WasmVM is full POSIX compliance 1:1 — every command, syscall, and shell behavior should match a real Linux system exactly
- WasmVM and Python are experimental surfaces in this repo
- all docs for WasmVM, Python, or other experimental runtime features must live under the `Experimental` section of the docs navigation, not the main getting-started/reference sections
- the WasmVM runtime requires standalone WASM binaries in `native/wasmvm/target/wasm32-wasip1/release/commands/`
- build them locally: `cd native/wasmvm && make wasm` (requires Rust nightly + wasm32-wasip1 target + rust-src component + wasm-opt/binaryen)
- the Rust toolchain is pinned in `native/wasmvm/rust-toolchain.toml` — rustup will auto-install it
- CI builds the binaries before tests; a CI-only guard test in `packages/wasmvm/test/driver.test.ts` fails if they're missing
- tests gated behind `skipIf(!hasWasmBinaries)` or `skipUnlessWasmBuilt()` will skip locally if binaries aren't built
- see `native/wasmvm/CLAUDE.md` for full build details and architecture

## WasmVM Syscall Coverage

- every function in the `host_process` and `host_user` import modules (declared in `native/wasmvm/crates/wasi-ext/src/lib.rs`) must have at least one C parity test exercising it through libc
- when adding a new host import, add a matching test case to `native/wasmvm/c/programs/syscall_coverage.c` and its parity test in `packages/wasmvm/test/c-parity.test.ts`
- the canonical source of truth for import signatures is `native/wasmvm/crates/wasi-ext/src/lib.rs` — C patches and JS host implementations must match exactly
- C patches in `native/wasmvm/patches/wasi-libc/` must be kept in sync with wasi-ext — ABI drift between C, Rust, and JS is a P0 bug
- permission tier enforcement must cover ALL write/spawn/kill/pipe/dup operations — audit `packages/wasmvm/src/kernel-worker.ts` when adding new syscalls
- `PATCHED_PROGRAMS` in `native/wasmvm/c/Makefile` must include all programs that use `host_process` or `host_user` imports (programs linking the patched sysroot)

## Terminology

- use `docs-internal/glossary.md` for canonical definitions of isolate, runtime, bridge, and driver

## Node Architecture

- read `docs-internal/arch/overview.md` for the component map (NodeRuntime, RuntimeDriver, NodeDriver, NodeExecutionDriver, ModuleAccessFileSystem, Permissions)
- keep it up to date when adding, removing, or significantly changing components

## Contracts (CRITICAL)

- `.agent/contracts/` contains behavioral contracts — these are the authoritative source of truth for runtime, bridge, permissions, stdlib, and governance requirements
- ALWAYS read relevant contracts before implementing changes in contracted areas (runtime, bridge, permissions, stdlib, test structure, documentation)
- when a change modifies contracted behavior, update the relevant contract in the same PR so contract changes are reviewed alongside code changes
- for secure-exec runtime behavior, target Node.js semantics as close to 1:1 as practical
- any intentional deviation from Node.js behavior must be explicitly documented in the relevant contract and reflected in compatibility/friction docs
- track development friction in `docs-internal/friction.md` (mark resolved items with fix notes)
- see `.agent/contracts/README.md` for the full contract index

## Shell & Process Behavior (POSIX compliance)

- the interactive shell (brush-shell via WasmVM) and kernel process model must match POSIX behavior unless explicitly documented otherwise
- `node -e <code>` must produce stdout/stderr visible to the user, both through `kernel.exec()` and in the interactive shell PTY — identical to running `node -e` on a real Linux terminal
- `node -e <invalid>` must display the error (SyntaxError/ReferenceError) on stderr, not silently swallow it
- commands that only read stdin when stdin is a TTY (e.g. `tree`, `cat` with no args) must not hang when run from the shell; commands must detect whether stdin is a real data source vs an empty pipe/PTY
- Ctrl+C (SIGINT) must interrupt the foreground process group within 1 second, matching POSIX `isig` + `VINTR` behavior — this applies to all runtimes (WasmVM, Node, Python)
- signal delivery through the PTY line discipline → kernel process table → driver kill() chain must be end-to-end tested
- when adding or fixing process/signal/PTY behavior, always verify against the equivalent behavior on a real Linux system

## Compatibility Project-Matrix Policy

- compatibility fixtures live under `packages/secure-exec/tests/projects/` and MUST be black-box Node projects (`package.json` + source entrypoint)
- fixtures MUST stay sandbox-blind: no sandbox-only branches, no sandbox-specific entrypoints, and no runtime tailoring in fixture code
- secure-exec runtime MUST stay fixture-opaque: no behavior branches by fixture name/path/test marker
- the matrix runs each fixture in host Node and secure-exec and compares normalized `code`, `stdout`, and `stderr`
- no known-mismatch classification is allowed; parity mismatches stay failing until runtime/bridge behavior is fixed

## Tested Package Tracking

- the Tested Packages section in `docs/nodejs-compatibility.mdx` lists all packages validated via the project-matrix test suite
- when adding a new project-matrix fixture, add the package to the Tested Packages table
- when removing a fixture, remove the package from the table
- the table links to GitHub Issues for requesting new packages to be tracked

## Test Structure

- `tests/test-suite/{node,python}.test.ts` are integration suite drivers; `tests/test-suite/{node,python}/` hold the shared suite definitions
- test suites test generic runtime functionality with any pluggable SystemDriver (exec, run, stdio, env, filesystem, network, timeouts, log buffering); prefer adding tests here because they run against all environments (node, browser, python)
- `tests/runtime-driver/` tests behavior specific to a single runtime driver (e.g. Node-only `memoryLimit`/`timingMitigation`, Python-only warm state or `secure_exec` hooks) that cannot be expressed through the shared suite context
- within `test-suite/{node,python}/`, files are named by domain (e.g. `runtime.ts`, `network.ts`)

## Comment Pattern

Follow the style in `packages/secure-exec/src/index.ts`.

- use short phase comments above logical blocks
- explain intent/why, not obvious mechanics
- keep comments concise and consistent (`Set up`, `Transform`, `Wait for`, `Get`)
- comment tricky ordering/invariants; skip noise
- add inline comments and doc comments when behavior is non-obvious, especially where runtime/bridge/driver pieces depend on each other

## Landing Page & README Sync

- `README.md` mirrors the landing page (`packages/website/src/pages/index.astro` and its components) 1:1 in content and structure
- when updating the landing page (hero copy, features, benchmarks, comparison, FAQ, or CTA), update `README.md` to match
- when updating `README.md`, update the landing page to match
- the landing page section order is: Hero → Code Example → Why Secure Exec (features) → Benchmarks → Secure Exec vs. Sandboxes → FAQ → CTA → Footer

## Documentation

- WasmVM and Python docs are experimental docs and must stay grouped under the `Experimental` section in `docs/docs.json`
- docs pages that must stay current with API changes:
  - `docs/quickstart.mdx` — update when core setup flow changes
  - `docs/api-reference.mdx` — update when any public export signature changes
  - `docs/runtimes/node.mdx` — update when NodeRuntime options/behavior changes
  - `docs/runtimes/python.mdx` — update when PythonRuntime options/behavior changes
  - `docs/system-drivers/node.mdx` — update when createNodeDriver options change
  - `docs/system-drivers/browser.mdx` — update when createBrowserDriver options change
  - `docs/nodejs-compatibility.mdx` — update when bridge, polyfill, or stub implementations change; keep the Tested Packages section current when adding or removing project-matrix fixtures
  - `docs/cloudflare-workers-comparison.mdx` — update when secure-exec capabilities change; bump "Last updated" date
  - `docs/posix-compatibility.md` — update when kernel, WasmVM, Node bridge, or Python bridge behavior changes for any POSIX-relevant feature (signals, pipes, FDs, process model, TTY, VFS)
  - `docs/wasmvm/supported-commands.md` — update when adding, removing, or changing status of WasmVM commands; keep summary counts current

## Backlog Tracking

- `docs-internal/todo.md` is the active backlog — keep it up to date when completing tasks
- when adding new work, add it to todo.md
- when completing work, mark items done in todo.md

## Skills

- create project skills in `.claude/skills/`
- expose Claude-managed skills to Codex via symlinks in `.codex/skills/`
