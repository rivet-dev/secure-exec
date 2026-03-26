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

### Node.js Conformance Test Integrity

- conformance tests live in `packages/secure-exec/tests/node-conformance/` — they are vendored upstream Node.js v22.14.0 test/parallel/ tests run through the sandbox
- vendored Node conformance helper shims live in `packages/secure-exec/tests/node-conformance/common/`; if a WPT-derived vendored test fails on a missing `../common/*` helper, add the minimal harness/shim there instead of rewriting the vendored test file
- `docs-internal/nodejs-compat-roadmap.md` tracks every non-passing test with its fix category and resolution
- when implementing bridge/polyfill features where both sides go through our code (e.g., loopback HTTP server + client), prevent overfitting:
  - **wire-level snapshot tests**: capture raw protocol bytes and compare against known-good captures from real Node.js
  - **project-matrix cross-validation**: add a project-matrix fixture (`tests/projects/`) using a real npm package that exercises the feature — the matrix compares sandbox output to host Node.js
  - **real-server control tests**: for network features, maintain tests that hit real external endpoints (not loopback) to validate the client independently of the server
  - **known-test-vector validation**: for crypto, validate against NIST/RFC test vectors — not just round-trip verification
  - **error object snapshot testing**: for ERR_* codes, snapshot-test full error objects (code, message, constructor) against Node.js — not just check `.code` exists
  - **host-side assertion verification**: periodically run assert-heavy conformance tests through host Node.js to verify the assert polyfill isn't masking failures
- never inflate conformance numbers — if a test self-skips (exits 0 without testing anything), mark it `vacuous-skip` in expectations.json, not as a real pass
- every entry in `expectations.json` must have a specific, verifiable reason — no vague "fails in sandbox" reasons
- when rerunning a single expected-fail conformance file through `runner.test.ts`, a green Vitest result only means the expectation still matches; only the explicit `now passes! Remove its expectation` failure proves the vendored test itself now passes and the entry is stale
- before deleting explicit `pass` overrides behind a negated glob, rerun the exact promoted vendored files through a direct `createTestNodeRuntime()` harness or another no-expectation path; broad module cleanup can still hide stale passes
- after changing expectations.json or adding/removing test files, regenerate both the JSON report and docs page: `pnpm tsx scripts/generate-node-conformance-report.ts`
- the script produces `packages/secure-exec/tests/node-conformance/conformance-report.json` (machine-readable) and `docs/nodejs-conformance-report.mdx` (docs page) — commit both
- to run the actual conformance suite: `pnpm vitest run packages/secure-exec/tests/node-conformance/runner.test.ts`
- raw `net.connect()` traffic to sandbox `http.createServer()` is implemented entirely in `packages/nodejs/src/bridge/network.ts`; when fixing loopback HTTP behavior, re-run the vendored pipeline/transfer files (`test-http-get-pipeline-problem.js`, `test-http-pipeline-requests-connection-leak.js`, `test-http-transfer-encoding-*.js`, `test-http-chunked-304.js`) because they all exercise the same parser/serializer path
- For callback-style `fs` bridge methods, do Node-style argument validation before entering the callback/error-delivery wrapper; otherwise invalid args that should throw synchronously get converted into callback errors or Promise returns and vendored fs validation coverage goes red

## Tooling

- use pnpm, vitest, and tsc for type checks
- use turbo for builds
- after changing `packages/core/isolate-runtime/src/inject/require-setup.ts` or Node bridge code that regenerates the isolate bundle, rebuild in this order: `pnpm --filter @secure-exec/nodejs build` then `pnpm --filter @secure-exec/core build`; the conformance runner executes built `dist` output, not just source files
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
- WasmVM `host_net` socket option payloads cross the worker RPC boundary as little-endian byte buffers; decode/encode them in `packages/wasmvm/src/driver.ts` and keep `packages/wasmvm/src/kernel-worker.ts` as a thin memory marshal layer

## Terminology

- use `docs-internal/glossary.md` for canonical definitions of isolate, runtime, bridge, and driver

## Node Architecture

- read `docs-internal/arch/overview.md` for the component map (NodeRuntime, RuntimeDriver, NodeDriver, NodeExecutionDriver, ModuleAccessFileSystem, Permissions)
- keep it up to date when adding, removing, or significantly changing components
- keep host bootstrap polyfills in `packages/nodejs/src/execution-driver.ts` aligned with isolate bootstrap polyfills in `packages/core/isolate-runtime/src/inject/require-setup.ts`; drift in shared globals like `AbortController` causes sandbox-only behavior gaps that source-level tests can miss
- vendored fs abort tests deep-freeze option bags via `common.mustNotMutateObjectDeep()`, so sandbox `AbortSignal` state must live outside writable instance properties; freezing `{ signal }` must not break later `controller.abort()`
- vendored `common.mustNotMutateObjectDeep()` helpers must skip populated typed-array/DataView instances; `Object.freeze(new Uint8Array([1]))` throws before the runtime under test executes, which turns option-bag immutability coverage into a harness failure
- when adding bridge globals that the sandbox calls with `.apply(..., { result: { promise: true } })`, register them in the native V8 async bridge list in `native/v8-runtime/src/session.rs`; otherwise the `_loadPolyfill` shim can turn a supposed async wait into a synchronous deadlock
- bridged `net.Server.listen()` must make `server.address()` readable immediately after `listen()` returns, even before the `'listening'` callback, because vendored Node tests read ephemeral ports synchronously
- bridged Unix path sockets (`server.listen(path)`, `net.connect(path)`) must route through kernel `AF_UNIX`, not TCP validation, and `readableAll` / `writableAll` listener options must update the VFS socket-file mode bits that `fs.statSync()` observes
- bridged `net.Socket.setTimeout()` must match Node validation codes (`ERR_INVALID_ARG_TYPE`, `ERR_OUT_OF_RANGE`) and any timeout timer created for an unrefed socket must also be unrefed so it cannot keep the runtime alive by itself
- bridged `dgram.Socket` loopback semantics depend on both layers: the isolate bridge must implicitly bind unbound sender sockets before `send()`, and the kernel UDP path must rewrite wildcard local addresses (`0.0.0.0` / `::`) to concrete loopback source addresses so `rinfo.address` matches Node on self-send/echo tests
- bridged `dgram.Socket` buffer-size options must be cached until `bind()` completes; Node expects unbound `get*BufferSize()` / `set*BufferSize()` calls to throw `ERR_SOCKET_BUFFER_SIZE` with `EBADF`, so eager pre-bind application hides the real error path
- bridged `http2` server streams must start paused on the host and only resume when sandbox code opts into flow (`req.on('data')`, `req.resume()`, or `stream.resume()`); otherwise the host consumes DATA frames too early, sends WINDOW_UPDATE unexpectedly, and hides paused flow-control / pipeline regressions
- bridge exports that userland constructs with `new` must be assigned as constructable function properties, not object-literal method shorthands; shorthand methods like `createReadStream() {}` are not constructable and vendored fs coverage calls `new fs.createReadStream(...)`
- `/proc/sys/kernel/hostname` conformance hits both kernel-backed and standalone NodeRuntime paths; a procfs fix that only lands in the kernel layer still leaves `createTestNodeRuntime()` fs/FileHandle coverage red

## Virtual Kernel Architecture

- **all sandbox I/O routes through the virtual kernel** — user code never touches the host OS directly
- the kernel provides: VFS (virtual file system), process table (spawn/signals/exit), network stack (TCP/HTTP/DNS/UDP), and a deny-by-default permissions engine
- **network calls are kernel-mediated**: `http.createServer()` registers a virtual listener in the kernel's network stack; `http.request()` to localhost routes through the kernel without real TCP — the kernel connects virtual server to virtual client directly; external requests go through the host adapter after permission checks
- when kernel `bind()` assigns an internal ephemeral port for `port: 0`, preserve that original ephemeral intent on the socket so external host-backed listeners can still call the host adapter with `port: 0` and then rewrite `localAddr` to the real host-assigned port
- **the VFS is not the host file system** — files written by sandbox code live in the VFS (in-memory by default); host filesystem is accessible only through explicit read-only overlays (e.g., `node_modules`) configured by the embedder
- when the kernel uses `InMemoryFileSystem`, rebind it to the shared `kernel.inodeTable` before wrapping it with devices/permissions; deferred-unlink FD I/O must use inode-based helpers on the raw in-memory FS, not pathname lookups
- deferred unlink must stay inode-backed: once a pathname is removed, new path lookups must fail immediately, but existing FDs must keep working through `FileDescription.inode` until the last reference closes
- `KernelInterface.fdOpen()` is synchronous, so open-time file semantics (`O_CREAT`, `O_EXCL`, `O_TRUNC`) must go through sync-capable VFS hooks threaded through the device and permission wrappers — do not move those checks into async read/write paths
- **embedders provide host adapters** that implement actual I/O — a Node.js embedder provides real `fs` and `net`; a browser embedder provides `fetch`-based networking and no file system; sandbox code doesn't know which adapter backs the kernel
- when implementing new I/O features (e.g., UDP, TCP servers, fs.watch), they MUST route through the kernel — never bypass it to hit the host directly
- see `docs/nodejs-compatibility.mdx` for the architecture diagram

## Code Transformation Policy

- NEVER use regex-based source code transformation for JavaScript/TypeScript (e.g., converting ESM to CJS, rewriting imports, extracting exports)
- regex transformers break on multi-line syntax, code inside strings/comments/template literals, and edge cases like `import X, { a } from 'Y'` — these bugs are subtle and hard to catch
- instead, use proper tooling: `es-module-lexer` / `cjs-module-lexer` (the same WASM-based lexers Node.js uses), or run the transformation inside the V8 isolate where the JS engine handles parsing correctly
- if a source transformation is needed at the bridge/host level, prefer a battle-tested library over hand-rolled regex
- the V8 runtime already has dual-mode execution (`execute_script` for CJS, `execute_module` for ESM) — lean on V8's native module system rather than pre-transforming source on the host side
- existing regex-based transforms (e.g., `convertEsmToCjs`, `transformDynamicImport`, `isESM`) are known technical debt and should be replaced


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
- blocking pipe writes must preserve partial progress and wait for new capacity via the kernel wait path; wake blocked writers from both read drains and read-end closes so pipe writes never hang after the consumer disappears
- Ctrl+C (SIGINT) must interrupt the foreground process group within 1 second, matching POSIX `isig` + `VINTR` behavior — this applies to all runtimes (WasmVM, Node, Python)
- PTY bulk writes in raw mode must still apply `icrnl` atomically before buffer-limit checks; oversized writes must fail with `EAGAIN` without partially buffering input
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

- all public-facing docs (quickstart, guides, API reference, landing page, README) must focus on the **Node.js runtime** as the primary and default experience — do not lead with WasmVM, kernel internals, or multi-runtime concepts
- code examples in docs should use the `NodeRuntime` API (`runtime.run()`, `runtime.exec()`) as the default path; the kernel API (`createKernel`, `kernel.spawn()`) is for advanced multi-process use cases and should be presented as secondary
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
