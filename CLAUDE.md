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
- **no hardcoded monorepo/pnpm paths** — NEVER resolve dependencies at runtime using hardcoded relative paths into `node_modules/.pnpm/` or monorepo-relative `../../../node_modules/` walks; use `createRequire(import.meta.url).resolve("pkg/path")` or standard Node module resolution instead
- **no phantom transitive dependencies** — if published runtime code calls `require.resolve("foo")` or `import("foo")`, `foo` MUST be declared in that package's `dependencies` (not just available transitively in the monorepo)
- **`files` array must cover all runtime references** — if compiled `dist/` code resolves paths outside `dist/` at runtime (e.g., `../src/polyfills/`), those directories MUST be listed in the `"files"` array; verify with `pnpm pack --json` or `npm pack --dry-run` before publishing

## Testing Policy

- NEVER mock external services in tests — use real implementations (Docker containers for databases/services, real HTTP servers for network tests, real binaries for CLI tool tests)
- tests that validate sandbox behavior MUST run code through the secure-exec sandbox (NodeRuntime/proc.exec()), never directly on the host
- CLI tool tests (Pi, Claude Code, OpenCode) must execute inside the sandbox: Pi runs as JS in the VM, Claude Code and OpenCode spawn their binaries via the sandbox's child_process.spawn bridge
- for host-binary CLI/SDK regressions (Claude Code, OpenCode), pair the sandbox `child_process.spawn()` probe with a direct `kernel.spawn()` control for the same binary command; if direct kernel command routing works but sandboxed spawn hangs, the blocker is in the Node child_process bridge path rather than the tool binary, provider config, or HostBinaryDriver mount
- sandbox `child_process.spawn()` does not yet honor `stdio` option semantics for host-binary commands, so headless CLI tests that need EOF on stdin should explicitly call `child.stdin.end()` instead of assuming `stdio: ['ignore', ...]` will close it
- real-provider CLI/SDK tool-integration tests must stay opt-in via an explicit env flag and load credentials at runtime from exported env vars or `~/misc/env.txt`; never commit secrets or replace the live provider path with a mock redirect when the story requires real traffic
- real-provider NodeRuntime CLI/tool tests that need a mutable temp worktree must pair `moduleAccess` with a real host-backed base filesystem such as `new NodeFileSystem()`; `moduleAccess` alone makes projected packages readable but leaves sandbox tools unable to touch `/tmp` working files
- e2e-docker fixtures connect to real Docker containers (Postgres, MySQL, Redis, SSH/SFTP) — skip gracefully via `skipUnlessDocker()` when Docker is unavailable
- interactive/PTY tests must use `kernel.openShell()` with `@xterm/headless`, not host PTY via `script -qefc`
- before fixing a reported runtime, CLI, SDK, or PTY bug, first reproduce the broken state and capture the exact visible output (stdout, stderr, event payloads, or terminal screen) in a regression or work note; do not start by guessing at the fix
- host-side upstream Node bootstrap probes must run in isolated child Node processes with `--expose-internals`; replaying `internal/bootstrap/node` can trip native asserts (for example `async_wrap.setupHooks`) and kill the current test worker if run inline
- terminal-output and PTY-rendering bugs must use snapshot-style assertions against exact strings or exact screen contents under fixed rows/cols, not loose substring checks
- if expected terminal behavior is unclear, run the same flow on the host as a control and compare the sandbox transcript/screen against that host output before deciding what to fix
- be liberal with structured debug logging for complex interactive or long-running sessions so later manual repros can be diagnosed from artifacts instead of memory
- debug logging for complex sessions should go to a separate sink that does not contaminate stdout/stderr protocol output; prefer structured `pino` logs with enough context to reconstruct process lifecycle, PTY events, command routing, and failures, while redacting secrets
- kernel blocking-I/O regressions should be proven through `packages/core/test/kernel/kernel-integration.test.ts` using real process-owned FDs via `KernelInterface` (`fdWrite`, `flock`, `fdPollWait`) rather than only manager-level unit tests
- inode-lifetime/deferred-unlink kernel integration tests must use `InMemoryFileSystem` (or another inode-aware VFS) and await the kernel's POSIX-dir bootstrap; the default `createTestKernel()` `TestFileSystem` does not exercise inode-backed FD lifetime semantics
- kernel signal-handler regressions should use a real spawned PID plus `KernelInterface.processTable` / `KernelInterface.socketTable`; unit `ProcessTable` coverage alone does not prove pending delivery or `SA_RESTART` behavior through the live kernel
- socket-table unit tests that call `listen()` or other host-visible network operations must provide an explicit `networkCheck` fixture; bare `new SocketTable()` now models deny-by-default networking and will reject listener setup with `EACCES`
- kernel UDP transport stories should include a real `packages/secure-exec/tests/kernel/` case that builds a `createKernel()` instance with `createNodeHostNetworkAdapter()` and real `node:dgram` peers; socket-table unit tests alone do not prove host-backed datagram routing
- socket option/flag stories should pair `packages/core/test/kernel/` coverage with a real `packages/secure-exec/tests/kernel/` case across TCP, AF_UNIX, and UDP; when proving host-backed option replay, wrap `createNodeHostNetworkAdapter()` and record `HostSocket.setOption()` calls instead of relying on public `@secure-exec/core` exports for `SOL_SOCKET`/`TCP_NODELAY`/`MSG_*` constants
- `/proc/self` coverage must run through a process-scoped runtime such as `kernel.spawn('node', ...)` or `createProcessScopedFileSystem`; raw kernel `vfs` calls have no caller PID context and cannot prove live `/proc/self` behavior

### POSIX Conformance Test Integrity

- **no test-only workarounds** — if a C override fixes broken libc behavior (fcntl, realloc, strfmon, etc.), it MUST go in the patched sysroot (`native/wasmvm/patches/wasi-libc/`) so all WASM programs get the fix; never link overrides only into test binaries — that inflates conformance numbers while real users still hit the bug
- **never replace upstream test source files** — if an os-test `.c` file fails due to a platform difference (e.g. `sizeof(long)`), exclude it via `os-test-exclusions.json` with the real reason; do not swap in a rewritten version that changes what the test validates
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
  - **mismatch-preserving verification**: if the control path currently fails, keep the host-vs-sandbox check and assert the concrete mismatch (`stderr`, exit code, missing bytes) instead of deleting the test or replacing it with another same-code-path loopback check
  - **known-test-vector validation**: for crypto, validate against NIST/RFC test vectors — not just round-trip verification
  - **error object snapshot testing**: for ERR_* codes, snapshot-test full error objects (code, message, constructor) against Node.js — not just check `.code` exists
  - **host-side assertion verification**: periodically run assert-heavy conformance tests through host Node.js to verify the assert polyfill isn't masking failures
- for kernel-consolidation stories, tests that instantiate `createDefaultNetworkAdapter()` or `useDefaultNetwork` are legacy compatibility coverage only; completion claims must be backed by `createNodeRuntime()` mounted into a real `Kernel`
- never inflate conformance numbers — if a test self-skips (exits 0 without testing anything), mark it `vacuous-skip` in expectations.json, not as a real pass
- reserve `category: "vacuous-skip"` for `expected: "pass"` self-skips only; if a vendored file stays `expected: "skip"` because behavior is still broken, keep a real failure category like `implementation-gap` so report category totals stay honest
- every entry in `expectations.json` must have a specific, verifiable reason — no vague "fails in sandbox" reasons
- every non-pass conformance expectation must also resolve to exactly one implementation-intent bucket (`implementable`, `will-not-implement`, or `cannot-implement`) via the shared classifier in `packages/secure-exec/tests/node-conformance/expectation-utils.ts`; keep the generated report aligned with that breakdown
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

## Dev Shell

- `packages/dev-shell/` is the canonical interactive sandbox for manual validation of the runtime surface
- VERY IMPORTANT: the dev shell must never use host-backed command overrides or host-binary fallbacks for manual validation; if a tool is present there, it must run through the sandbox-native runtime path
- if a tested tool does not yet have a real sandbox-native path, leave it unavailable in the dev shell and track the gap instead of silently routing to the host
- when adding a new tested CLI tool or runtime surface, update `packages/dev-shell/` in the same change so developers can reproduce and inspect it interactively inside the sandbox
- keep the dev shell honest with focused end-to-end coverage, including at least one interactive PTY/TUI path that runs entirely inside the sandbox

## GitHub Issues

- when fixing a bug or implementation gap tracked by a GitHub issue, close the issue in the same PR using `gh issue close <number> --comment "Fixed in <commit-hash>"`
- when removing a test from `os-test-exclusions.json` or `libc-test-exclusions.json` because the fix landed, close the linked issue
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
- **All WASM command source code (Rust crates and C programs) has been moved to the agent-os-registry repo at `~/agent-os-registry/`** (GitHub: `rivet-dev/agent-os-registry`). The `native/wasmvm/` directory in this repo is the original copy and should no longer be the primary source for building commands. Build from the registry instead: `cd ~/agent-os-registry && make build-wasm`.
- the WasmVM runtime driver (`packages/wasmvm/`) still lives in this repo. It loads and executes WASM binaries but does not contain command source code.
- tests gated behind `skipIf(!hasWasmBinaries)` or `skipUnlessWasmBuilt()` will skip locally if binaries aren't built
- the `native/wasmvm/` directory remains for reference and WASI host import definitions (`crates/wasi-ext/`), patches (`patches/`), and the C sysroot build

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
- upstream Node asset sync is driven by `scripts/sync-node-upstream-assets.ts`; always export builtin assets from the pinned git ref recorded in `packages/nodejs/assets/upstream-node/VERSION.json`, not from a dirty working tree or a hand-picked file subset
- upstream runtime asset readers should resolve `packages/nodejs/assets/upstream-node/**` relative to `import.meta.url` from `packages/nodejs/src/upstream/`; that keeps the same loader working from source tests and built `dist/` output without monorepo-specific path logic
- the packaged upstream fs backend helper resolves `packages/nodejs/assets/upstream-node-backend/node_fs_backend`, not `native/wasmvm/c/build` at runtime; after changing `native/wasmvm/c/programs/node_fs_backend.c`, rebuild with `make -C native/wasmvm/c build/node_fs_backend` and refresh the packaged asset copy before validating the Node first-light path
- host-backed `VirtualStat` adapters that feed Wasm filestat packing must truncate `atimeMs`/`mtimeMs`/`ctimeMs`/`birthtimeMs` to integer milliseconds; fractional Node host timestamps make the Wasm `BigInt(...)` filestat writer fail on vendored `fs.stat()` paths
- inside the vendored upstream bootstrap runner, callback-style fs first-light should do backend work synchronously and deliver `FSReqCallback.oncomplete` on a microtask; relying on helper-process async `close` events there can leave the runner stuck waiting for `__secureExecDone()`
- replacement-runtime public wrappers should only wait for `__secureExecDone()` when the evaluated source actually opts into that handshake; keep the dedicated fs-first-light helpers in always-wait mode, but plain `node -e` smoke paths must exit without the callback
- vendored `fs.promises` and stream bring-up still imports `internal/fs/watchers` for shared symbols even when `fs.watch()` itself stays deferred, so the bootstrap runner must wrap host `internalBinding('fs_event_wrap').FSEvent` in a fresh subclass before loading vendored watchers; redefining the legacy `owner` alias on the host prototype aborts unrelated promises/stream coverage
- vendored `net` bring-up in the exposed-internals bootstrap runner must do the same legacy-alias trick for `internalBinding('tcp_wrap').TCP`; hand `lib/net.js` a fresh subclass before it defines `TCP.prototype.owner`, or module initialization aborts before any socket work starts
- async replacement-runtime `node -e` payloads that rely on timer or socket callbacks cannot stay inside the reduced `internal/main/eval_string` path; keep the bootstrap proof there for synchronous smoke tests, but run `process.__secureExecDone()` payloads in a post-bootstrap CommonJS wrapper and, for `require('net')`, hand that wrapper a host-context compiled copy of vendored `lib/net.js` so host-owned handle lifecycle and loopback callbacks can drain
- vendored `vm` first-light should stay opt-in like other public builtins; when the helper-child runner enables `--experimental-vm-modules`, patch `require('vm')` with `Module`, `SourceTextModule`, and `SyntheticModule` from vendored `internal/vm/module` the same way upstream `internal/process/pre_execution` does, or ESM vm-module proofs will fail even though `module_wrap` is available
- vendored `http` / `https` first-light in that same exposed-internals runner must keep the whole HTTP family on the host side together: host-context compile `http`, `https`, `_http_agent`, `_http_client`, `_http_common`, `_http_incoming`, `_http_outgoing`, `_http_server`, and vendored `internal/http`; mixing pinned upstream `http.js` with host `_http_*` helpers or host `internal/http` breaks helpers like `getGlobalAgent()` and stalls client/server round-trips
- upstream builtin `compileFunction()` wrapper parameters must stay aligned with Node's `src/builtin_info.h` categories: `internal/bootstrap/realm` gets `(process, getLinkedBinding, getInternalBinding, primordials)`, other `internal/bootstrap/*` and `internal/main/*` get `(process, require, internalBinding, primordials)`, `internal/per_context/*` gets `(exports, primordials, privateSymbols, perIsolateSymbols)`, and other builtins use the CommonJS-style wrapper
- the internal upstream bootstrap bring-up runner uses a dedicated `node --expose-internals` child and must keep user stdout/stderr inside its JSON result instead of leaking them onto the parent process streams; vendored `internal/*` assets are the thing under test there, while public builtins still fall back to host `node:` modules until fs-first-light replaces that temporary escape hatch
- public `createNodeRuntimeDriverFactory()` / `createNodeRuntime()` must stay on `NodeExecutionDriver` / `secure-exec-v8` until the upstream loader itself can run inside the V8 session; the helper-child runtime in `packages/nodejs/src/upstream/bootstrap-execution.ts` is internal-only bring-up infrastructure and should only be used by direct upstream probes/tests
- nested upstream bootstrap children must strip inherited `NODE_CHANNEL_FD` / `NODE_UNIQUE_ID` and use an explicit env flag to opt into live-stdio IPC mode; relying on `process.send` detection alone breaks the buffered JSON runner under forked test workers like Vitest
- replacement-runtime file entrypoints that originate from the sandbox VFS must stage a minimal dependency closure into a temporary host tree: copy the entry file, recursively copy only relative `require()` / `import` targets, and copy the nearest `package.json` files; do not snapshot an entire top-level subtree like `/test`, because module overlays can contain unrelated unsupported assets such as native addons
- when the helper-child file-entry path runs vendored `internal/modules/cjs/loader`, keep its loader-phase `internalBinding('fs')` on the host binding instead of the fs first-light backend shim; the backend-backed `fs` story is for public `fs` parity, but the module loader still needs the fuller host binding semantics to resolve package metadata and directory entries cleanly
- WHATWG globals that sandbox code touches before any bridge module loads (`TextDecoder`, `TextEncoder`, `Event`, `CustomEvent`, `EventTarget`) must be fixed in both bootstrap layers and `packages/nodejs/src/bridge/polyfills.ts`; bridge-only fixes do not change the globals seen by direct `runtime.run()` / `runtime.exec()` code
- bridged `fetch()` request serialization must normalize `Headers` instances before crossing the JSON bridge; passing the host a raw `Headers` object silently drops auth and SDK-specific headers because it stringifies to `{}`
- sandbox stdout/stderr write bridges must preserve Node's callback semantics even for empty writes like `process.stdout.write('', cb)`; headless CLI tools use that zero-byte callback as a flush barrier before clean exit
- exec-mode scripts that depend on bridge-delivered child-process/stdio callbacks must keep the same `Execute` alive on `_waitForActiveHandles()`; once the native V8 session returns from `Execute`, later `StreamEvent` messages sent to that idle session thread are ignored
- When a builtin or `internal/*` module needs sandbox-specific behavior but still has to work through CommonJS `require()`, add it under `packages/nodejs/src/polyfills/` and register it in `packages/nodejs/src/polyfills.ts` `CUSTOM_POLYFILL_ENTRY_POINTS`; that keeps esbuild bundling it to CJS instead of letting the isolate loader choke on raw ESM `export` syntax
- vendored fs abort tests deep-freeze option bags via `common.mustNotMutateObjectDeep()`, so sandbox `AbortSignal` state must live outside writable instance properties; freezing `{ signal }` must not break later `controller.abort()`
- vendored `common.mustNotMutateObjectDeep()` helpers must skip populated typed-array/DataView instances; `Object.freeze(new Uint8Array([1]))` throws before the runtime under test executes, which turns option-bag immutability coverage into a harness failure
- when adding bridge globals that the sandbox calls with `.apply(..., { result: { promise: true } })`, register them in the native V8 async bridge list in `native/v8-runtime/src/session.rs`; otherwise the `_loadPolyfill` shim can turn a supposed async wait into a synchronous deadlock
- bridged `net.Server.listen()` must make `server.address()` readable immediately after `listen()` returns, even before the `'listening'` callback, because vendored Node tests read ephemeral ports synchronously
- bridged Unix path sockets (`server.listen(path)`, `net.connect(path)`) must route through kernel `AF_UNIX`, not TCP validation, and `readableAll` / `writableAll` listener options must update the VFS socket-file mode bits that `fs.statSync()` observes
- bridged `net.Socket.setTimeout()` must match Node validation codes (`ERR_INVALID_ARG_TYPE`, `ERR_OUT_OF_RANGE`) and any timeout timer created for an unrefed socket must also be unrefed so it cannot keep the runtime alive by itself
- standalone `NodeExecutionDriver` should always provision an internal `SocketTable` for loopback routing, but it must only attach `createNodeHostNetworkAdapter()` when `SystemDriver.network` is explicitly configured; omitted network capability must not silently re-enable host TCP access
- bridged `dgram.Socket` loopback semantics depend on both layers: the isolate bridge must implicitly bind unbound sender sockets before `send()`, and the kernel UDP path must rewrite wildcard local addresses (`0.0.0.0` / `::`) to concrete loopback source addresses so `rinfo.address` matches Node on self-send/echo tests
- bridged `dgram.Socket` buffer-size options must be cached until `bind()` completes; Node expects unbound `get*BufferSize()` / `set*BufferSize()` calls to throw `ERR_SOCKET_BUFFER_SIZE` with `EBADF`, so eager pre-bind application hides the real error path
- `packages/wasmvm/src/driver.ts` prefers `packages/wasmvm/dist/kernel-worker.js` when no sibling `src/kernel-worker.js` exists, so edits to `packages/wasmvm/src/kernel-worker.ts` are not authoritative until `pnpm --filter @secure-exec/wasmvm build` refreshes the worker bundle
- bridged `http2` server streams must start paused on the host and only resume when sandbox code opts into flow (`req.on('data')`, `req.resume()`, or `stream.resume()`); otherwise the host consumes DATA frames too early, sends WINDOW_UPDATE unexpectedly, and hides paused flow-control / pipeline regressions
- vendored `http2` nghttp2 error-path tests patch `internal/test/binding` `Http2Stream.prototype.respond`; keep that shim wired to the same bridge-facing `Http2Stream` / `internal/http2/util`.`NghttpError` constructors the runtime uses, or the tests stop exercising the real wrapper logic
- bridge exports that userland constructs with `new` must be assigned as constructable function properties, not object-literal method shorthands; shorthand methods like `createReadStream() {}` are not constructable and vendored fs coverage calls `new fs.createReadStream(...)`
- `/proc/sys/kernel/hostname` conformance hits both kernel-backed and standalone NodeRuntime paths; a procfs fix that only lands in the kernel layer still leaves `createTestNodeRuntime()` fs/FileHandle coverage red
- require-transformed ESM must not rely on the CommonJS wrapper's `__filename` / `__dirname` parameter names; keep wrapper internals on private names, synthesize local CJS bindings only for plain CommonJS sources, and compute transformed `import.meta.url` from `pathToFileURL(__secureExecFilename).href`
- `ModuleAccessFileSystem` must treat host-absolute package asset paths derived from `import.meta.url`, `__filename`, or `realpath()` as part of the same read-only projected `node_modules` closure when they canonicalize inside the configured overlay; Pi and similar SDKs walk to sibling `package.json`/README/theme assets that way
- `ModuleAccessFileSystem` also has to include pnpm virtual-store dependency symlink targets reachable from projected packages; package-internal `imports` like Chalk's `#ansi-styles` resolve into those sibling `.pnpm/*/node_modules/*` targets rather than staying under the top-level package root

## Virtual Kernel Architecture

- **all sandbox I/O routes through the virtual kernel** — user code never touches the host OS directly
- the kernel provides: VFS (virtual file system), process table (spawn/signals/exit), network stack (TCP/HTTP/DNS/UDP), and a deny-by-default permissions engine
- **network calls are kernel-mediated**: `http.createServer()` registers a virtual listener in the kernel's network stack; `http.request()` to localhost routes through the kernel without real TCP — the kernel connects virtual server to virtual client directly; external requests go through the host adapter after permission checks
- kernel network deny-by-default is enforced in `packages/core/src/kernel/socket-table.ts`, so `KernelImpl` must pass `options.permissions?.network` into `SocketTable` and external socket paths must call `checkNetworkPermission()` unconditionally; loopback exemptions belong in the routing branch, not in global permission bypasses
- `AF_UNIX` sockets are local IPC, not host networking: `SocketTable` bind/listen/connect for path sockets must stay fully in-kernel, bypass `permissions.network`, and only use the VFS/listener registry for reachability and socket-file state
- kernel-owned `SocketTable` instances must validate owner PIDs against the shared process table at allocation time; only standalone/internal socket tables should omit that validator
- when kernel `bind()` assigns an internal ephemeral port for `port: 0`, preserve that original ephemeral intent on the socket so external host-backed listeners can still call the host adapter with `port: 0` and then rewrite `localAddr` to the real host-assigned port
- **the VFS is not the host file system** — files written by sandbox code live in the VFS (ChunkedVFS by default); host filesystem is accessible only through explicit read-only overlays (e.g., `node_modules`) configured by the embedder
- the default in-memory VFS is `ChunkedVFS(InMemoryMetadataStore + InMemoryBlockStore)` created via `createInMemoryFileSystem()` from `@secure-exec/core`. The old monolithic `InMemoryFileSystem` class was removed.
- deferred unlink must stay inode-backed: once a pathname is removed, new path lookups must fail immediately, but existing FDs must keep working through `FileDescription.inode` until the last reference closes
- `KernelInterface.fdOpen()` is synchronous, so open-time file semantics (`O_CREAT`, `O_EXCL`, `O_TRUNC`) must go through sync-capable VFS hooks threaded through the device and permission wrappers — do not move those checks into async read/write paths
- **embedders provide host adapters** that implement actual I/O — a Node.js embedder provides real `fs` and `net`; a browser embedder provides `fetch`-based networking and no file system; sandbox code doesn't know which adapter backs the kernel
- when implementing new I/O features (e.g., UDP, TCP servers, fs.watch), they MUST route through the kernel — never bypass it to hit the host directly
- see `docs/nodejs-compatibility.mdx` for the architecture diagram

## Virtual Filesystem (VFS) Architecture

The VFS uses a layered chunked architecture: `VirtualFileSystem` (kernel interface) is implemented by `ChunkedVFS`, which composes `FsMetadataStore` (directory tree, inodes, chunk mapping) + `FsBlockStore` (dumb key-value blob store).

- **ChunkedVFS** (`packages/core/src/vfs/chunked-vfs.ts`): composes a metadata store and block store into a full `VirtualFileSystem`. Created via `createChunkedVfs(options)`.
- **Tiered storage**: files <= `inlineThreshold` (default 64 KB) are stored inline in the metadata store. Larger files are split into fixed-size chunks (default 4 MB) in the block store. Automatic promotion/demotion when files cross the threshold.
- **Per-inode async mutex**: prevents interleaved read-modify-write corruption on concurrent async operations (pwrite, writeFile, truncate, removeFile, rename). Read-only ops (pread, readFile, stat) do not acquire the mutex.
- **Optional write buffering**: when `writeBuffering: true`, pwrite buffers dirty chunks in memory and flushes on fsync or auto-flush interval. Reads always see buffered data.
- **Optional versioning**: when `versioning: true`, block keys include a random ID to avoid overwrites. Exposes `createVersion`, `listVersions`, `restoreVersion`, `pruneVersions` API.
- **Block key format**: `{ino}/{chunkIndex}` (or `{ino}/{chunkIndex}/{randomId}` with versioning).

### Available implementations

- **InMemoryMetadataStore** (`packages/core/src/vfs/memory-metadata.ts`): pure JS Map-based. For ephemeral VMs and tests.
- **SqliteMetadataStore** (`packages/core/src/vfs/sqlite-metadata.ts`): SQLite-backed via `better-sqlite3`. Supports versioning. Constructor accepts `{ dbPath }` where `:memory:` creates an in-memory database.
- **InMemoryBlockStore** (`packages/core/src/vfs/memory-block-store.ts`): pure JS Map-based.
- **HostBlockStore** (`packages/core/src/vfs/host-block-store.ts`): persists blocks as files on the host filesystem. For local dev environments.
- **S3BlockStore** (in agent-os `packages/fs-s3/`): S3-compatible object storage. Server-side copy support.

### Kernel VFS integration

- The kernel delegates `pwrite` to the VFS interface instead of doing read-modify-write internally.
- The kernel calls `vfs.fsync?.(path)` fire-and-forget in `releaseDescriptionInode` when the last FD for a file is closed.
- All kernel I/O goes through the `VirtualFileSystem` interface only. The old `InMemoryFileSystem`-specific fast paths (`readFileByInode`, `preadByInode`, `writeFileByInode`, `statByInode`) and `rawInMemoryFs` field were removed.
- `fdOpen` is synchronous. Open-time semantics (`O_CREAT`, `O_EXCL`, `O_TRUNC`) use `prepareOpenSync` on the VFS for sync-capable handling.

## VFS Conformance Test Suites

Three conformance test suites are exported from `@secure-exec/core` for external VFS implementations to validate against:

- **VFS conformance** (`packages/core/src/test/vfs-conformance.ts`): tests the full `VirtualFileSystem` contract. Register with `defineVfsConformanceTests({ name, createFs, cleanup, capabilities })`. Capability flags gate optional test groups: `symlinks`, `hardLinks`, `permissions`, `utimes`, `truncate`, `pread`, `pwrite`, `mkdir`, `removeDir`, `fsync`, `copy`, `readDirStat`.
- **Block store conformance** (`packages/core/src/test/block-store-conformance.ts`): tests the `FsBlockStore` contract. Register with `defineBlockStoreTests({ name, createStore, capabilities })`. Capability flag: `copy`.
- **Metadata store conformance** (`packages/core/src/test/metadata-store-conformance.ts`): tests the `FsMetadataStore` contract. Register with `defineMetadataStoreTests({ name, createStore, capabilities })`. Capability flag: `versioning`.

Test registration files go in `packages/core/test/vfs/`. Use small thresholds (e.g., 256 bytes inline, 1024 bytes chunk) for fast edge case tests.

## Code Transformation Policy

- NEVER use regex-based source code transformation for JavaScript/TypeScript (e.g., converting ESM to CJS, rewriting imports, extracting exports)
- regex transformers break on multi-line syntax, code inside strings/comments/template literals, and edge cases like `import X, { a } from 'Y'` — these bugs are subtle and hard to catch
- instead, use proper tooling: `es-module-lexer` / `cjs-module-lexer` (the same WASM-based lexers Node.js uses), or run the transformation inside the V8 isolate where the JS engine handles parsing correctly
- if a source transformation is needed at the bridge/host level, prefer a battle-tested library over hand-rolled regex
- the V8 runtime already has dual-mode execution (`execute_script` for CJS, `execute_module` for ESM) — lean on V8's native module system rather than pre-transforming source on the host side
- existing regex-based transforms (e.g., `convertEsmToCjs`, `transformDynamicImport`, `isESM`) are known technical debt and should be replaced; when `require()` compatibility needs `import.meta.url`, inject an internal file-URL helper instead of rewriting to the wrapper `__filename`


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
