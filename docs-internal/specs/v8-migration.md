# Spec: Migrate from isolated-vm to V8 Runtime Driver

## Status

Proposed

## Motivation

The `ralph/v8-runtime` PR landed on main, introducing a new V8-based runtime
driver (`@secure-exec/v8`) that replaces isolated-vm as the execution engine.
The isolated-vm code path in `packages/secure-exec-node/` is now marked
`@deprecated` but still functional.

The `ralph/cli-tool-sandbox-tests` branch added significant bridge
functionality (net/TLS sockets, crypto extensions, sync module resolution,
ESM star export deconfliction, CLI tool tests) — all written against the
isolated-vm code path. These features need to be ported to the V8 driver
before isolated-vm can be removed.

## Current state

### V8 driver (on main)
- `packages/runtime/node/src/driver.ts` — `createNodeRuntime()` factory
- `packages/secure-exec-node/src/bridge-handlers.ts` — exists but minimal
- Kernel integration via `RuntimeDriver` interface
- Memory limits, module access, network adapter plumbing
- Missing: all bridge refs (fs, child_process, network, crypto, net/TLS, PTY)

### isolated-vm driver (deprecated, still works)
- `packages/secure-exec-node/src/bridge-setup.ts` — 1,800+ lines, ~60 `ivm.Reference` calls
- `packages/secure-exec-node/src/execution-driver.ts` — driver wrapper
- `packages/secure-exec-node/src/isolate-bootstrap.ts` — deps/budget state
- `packages/secure-exec-node/src/isolate.ts` — isolate creation
- `packages/secure-exec-node/src/execution.ts` — execution loop
- `packages/secure-exec-node/src/execution-lifecycle.ts` — lifecycle hooks
- `packages/secure-exec-node/src/esm-compiler.ts` — ESM compilation + `deconflictStarExports`

### Features on cli-tool-sandbox-tests branch needing porting
- Net/TLS socket bridge (5 bridge refs + NetworkAdapter extensions)
- Crypto: pbkdf2, scrypt, stateful cipheriv sessions, sign/verify, subtle.deriveBits/deriveKey
- Sync module resolution (resolveModuleSync, loadFileSync, sandboxToHostPath)
- ESM star export deconfliction
- PTY setRawMode callback
- Polyfill patches (zlib constants, Buffer proto, stream prototype chain, Response.body, FormData)
- 16 CLI tool test files (~10K LOC)

## Migration sections

### Section 1: Port core bridge refs to V8 driver

Port the foundational bridge references from `bridge-setup.ts` into
`bridge-handlers.ts` (or equivalent) using the V8 driver's API pattern.

**What to port:**
- Console refs (log, error) with output byte budgets
- Timer ref (scheduleTimer) with maxTimers enforcement
- Crypto randomness refs (cryptoRandomFill, cryptoRandomUuid)
- Crypto hash/hmac refs (cryptoHashDigest, cryptoHmacDigest)

**Pattern change:**
```typescript
// isolated-vm (old)
const ref = new ivm.Reference((arg: string) => { ... });
await jail.set("_bridgeKey", ref);

// V8 driver (new) — determine the equivalent pattern from bridge-handlers.ts
// Likely: register handler functions that the V8 context can call
```

**Acceptance criteria:**
- Console output flows through V8 driver with byte budgets
- Timers work with maxTimers enforcement
- `crypto.getRandomValues()` and `crypto.randomUUID()` work
- `crypto.createHash()` and `crypto.createHmac()` work
- Existing test-suite tests pass on V8 driver

### Section 2: Port filesystem bridge to V8 driver

**What to port:**
- readFile, writeFile, readFileBinary, writeFileBinary
- readDir, mkdir, rmdir, exists, stat, lstat
- unlink, rename, chmod, chown, link, symlink, readlink
- truncate, utimes
- `fs.promises.open()` FileHandle stub

**Acceptance criteria:**
- All project-matrix fixtures pass on V8 driver
- fs bridge tests pass

### Section 3: Port child_process bridge to V8 driver

**What to port:**
- spawnStart (async spawn with session management)
- stdinWrite, stdinClose, kill
- spawnSync (synchronous execution)
- Dangerous env var stripping (LD_PRELOAD, NODE_OPTIONS, etc.)

**Acceptance criteria:**
- `child_process.spawn()`, `exec()`, `execSync()` work
- Exit code propagation works
- Signal delivery works
- npm install and npx exec tests pass

### Section 4: Port network bridge to V8 driver

**What to port:**
- networkFetch (fetch proxy)
- networkDnsLookup
- networkHttpRequest (full HTTP client with headers, body, status)
- networkHttpServerListen / networkHttpServerClose
- upgradeSocketWrite / upgradeSocketEnd / upgradeSocketDestroy

**Acceptance criteria:**
- HTTP client requests work (fetch, http.request)
- HTTP server creation works
- DNS lookup works
- WebSocket upgrade path works

### Section 5: Port net/TLS socket bridge to V8 driver

This is new functionality from the cli-tool-sandbox-tests branch.

**What to port:**
- netSocketConnect (TCP connection with per-connect callbacks)
- netSocketWrite, netSocketEnd, netSocketDestroy
- netSocketUpgradeTls (TLS upgrade for existing TCP sockets)
- netSocketDispatch (event dispatch: connect, data, end, error, close, secureConnect)
- PTY setRawMode callback

**Acceptance criteria:**
- pg library connects to Postgres through sandbox (SCRAM-SHA-256 auth)
- mysql2 connects to MySQL through sandbox
- ioredis connects to Redis through sandbox
- ssh2 connects via SSH and SFTP through sandbox
- TLS upgrade works (pg SSL, SSH key exchange)
- All e2e-docker fixtures pass

### Section 6: Port crypto extensions to V8 driver

**What to port:**
- pbkdf2 (key derivation)
- scrypt (key derivation)
- createCipheriv / createDecipheriv (one-shot encrypt/decrypt)
- Stateful cipher sessions (create, update, final — for streaming AES-GCM)
- sign / verify (RSA/Ed25519 signatures)
- generateKeyPairSync
- subtle.deriveBits (PBKDF2, HKDF)
- subtle.deriveKey (PBKDF2)
- timingSafeEqual

**Acceptance criteria:**
- Postgres SCRAM-SHA-256 auth works (needs pbkdf2, subtle.deriveBits)
- SSH key-based auth works (needs sign/verify)
- SSH data encryption works (needs stateful cipheriv)
- jsonwebtoken package works
- bcryptjs package works

### Section 7: Port sync module resolution to V8 driver

**What to port:**
- resolveModuleSync — Node.js `require.resolve()` fallback for applySync contexts
- loadFileSync — synchronous file reading for applySync contexts
- sandboxToHostPath — translate sandbox `/root/node_modules/` paths to host paths
- JS-side resolution cache (`_resolveCache`)

**Why this exists:** `applySyncPromise` cannot run nested inside `applySync`
contexts (e.g., when `require()` is called from a net socket data callback
dispatched via `applySync`). The sync refs provide a fallback that always works.

**Acceptance criteria:**
- Module loading works inside net socket data callbacks
- pnpm transitive dependencies resolve correctly
- Module resolution cache prevents repeated bridge calls

### Section 8: Port ESM compiler additions to V8 driver

**What to port:**
- `deconflictStarExports()` function — resolves conflicting `export *` names
  across multiple ESM modules. V8 throws on conflicts; Node.js makes them
  ambiguous. This transforms source to use explicit named re-exports.
- `import.meta.url` polyfill — isolated-vm doesn't set it; replaced with
  `file://` URL in ESM source

**Acceptance criteria:**
- Pi's dependency chain loads without "conflicting star exports" errors
- ESM modules have correct `import.meta.url` values
- Dynamic `import()` works (transformed to `__dynamicImport()`)

### Section 9: Port polyfill patches to V8 driver

**What to port (in require-setup.ts — these are runtime-agnostic):**
- zlib constants object (`result.constants` with Z_* values + mode constants)
- Buffer prototype methods (utf8Slice, latin1Slice, base64Slice, etc.)
- Buffer.kStringMaxLength, Buffer.constants
- TextDecoder encoding widening (ascii, latin1, utf-16le → utf-8)
- stream prototype chain fix (Readable.prototype → Stream.prototype)
- util.formatWithOptions stub
- FormData stub class
- Response.body with ReadableStream-like getReader()
- Headers.append() method
- http2.constants object

**Note:** These patches live in `require-setup.ts` which is part of
`@secure-exec/core`'s isolate-runtime bundle. They should work regardless of
execution engine since they patch module exports, not the bridge API. Verify
they still apply in the V8 driver's module loading path.

**Acceptance criteria:**
- ssh2 works (needs zlib.constants, Buffer proto methods, stateful cipher)
- Pi SDK loads (needs FormData, Response.body, Headers.append)
- All project-matrix fixtures still pass

### Section 10: Migrate CLI tool tests to V8 driver

**What to migrate:**
- 16 test files in `packages/secure-exec/tests/cli-tools/`
- Tests use `createTestNodeRuntime()` which currently creates an isolated-vm driver
- Need to verify tests work when `createTestNodeRuntime()` returns a V8 driver

**Test categories:**
- Pi: SDK (6 tests), headless binary (5), interactive (5), tool-use (5), multi-turn (3)
- Claude Code: SDK (6), headless binary (8), interactive (6), tool-use (6)
- OpenCode: headless binary (9), interactive (5)
- Agentic: npm install (5), npx exec (5), dev server lifecycle (5)

**Acceptance criteria:**
- All previously-passing CLI tool tests pass on V8 driver
- Tests that were skipping (PTY blockers) remain skipping with same reasons
- No isolated-vm imports in test files

### Section 11: Remove isolated-vm

**What to delete:**
- `packages/secure-exec-node/src/isolate.ts`
- `packages/secure-exec-node/src/execution.ts`
- `packages/secure-exec-node/src/execution-lifecycle.ts`
- Deprecated functions in `packages/secure-exec-node/src/bridge-setup.ts`
- Legacy type stubs (`LegacyContext`, `LegacyReference`, `LegacyModule`)
- `isolated-vm` from `package.json` dependencies
- `ivm` imports from all files

**What to keep (runtime-agnostic):**
- `bridge-contract.ts` — bridge key constants
- `require-setup.ts` — polyfill patches
- `esm-compiler.ts` — if ESM compilation logic is reusable
- `bridge-setup.ts` utility functions (`emitConsoleEvent`, `stripDangerousEnv`, `createProcessConfigForExecution`)

**Acceptance criteria:**
- `grep -r "isolated-vm" packages/` returns nothing
- `grep -r "import ivm" packages/` returns nothing
- All tests pass
- Typecheck passes
- `pnpm install` no longer downloads isolated-vm native addon

## Ordering and dependencies

```
Section 1 (core bridge)
  └─> Section 2 (fs bridge)
  └─> Section 3 (child_process bridge)
  └─> Section 4 (network bridge)
        └─> Section 5 (net/TLS bridge)
  └─> Section 6 (crypto)
  └─> Section 7 (sync module resolution)
  └─> Section 8 (ESM compiler)
  └─> Section 9 (polyfill patches — verify only)
  └─> Section 10 (test migration — after all bridges ported)
        └─> Section 11 (remove isolated-vm — after all tests pass)
```

Sections 2-8 can be done in parallel after Section 1.
Section 9 is verification-only (patches are runtime-agnostic).
Section 10 requires all bridge sections complete.
Section 11 is the final cleanup.

## Risks

### V8 driver API differences
The V8 driver may have a fundamentally different bridge API than isolated-vm's
`ivm.Reference` + `applySync`/`applySyncPromise` pattern. Need to understand
the V8 bridge-handlers.ts pattern before porting.

### Sync context limitations
The sync module resolution (Section 7) exists because `applySyncPromise` can't
nest inside `applySync`. The V8 driver may handle this differently — need to
verify whether the same limitation exists.

### Native addon removal
isolated-vm is a native addon (~100MB compiled). Removing it eliminates a
build dependency and speeds up install. But if any code accidentally still
imports it, the error will be a missing module at runtime, not a type error.

### Test coverage gaps
The V8 driver may have subtle behavioral differences from isolated-vm
(e.g., different error messages, different module evaluation order, different
garbage collection timing). The test suite should catch these but watch for
flaky tests during migration.
