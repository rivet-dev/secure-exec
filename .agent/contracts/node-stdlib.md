# node-stdlib Specification

## Purpose
Define Node stdlib compatibility behavior including module resolution boundaries, support tiers, and deterministic fallback errors.
## Requirements
### Requirement: Third-Party Packages Must Not Be Shimmed in Require Resolution
The require system MUST NOT contain inline stubs or shims for third-party npm packages. Packages that are not Node.js built-in modules SHALL resolve exclusively through sandboxed `node_modules` filesystem resolution.

#### Scenario: Sandboxed code requires a third-party package with no shim
- **WHEN** sandboxed code calls `require('chalk')` or `require('supports-color')`
- **THEN** the require system MUST attempt filesystem resolution from sandboxed `node_modules` and MUST NOT return a hardcoded stub

#### Scenario: Third-party package is missing from sandboxed dependencies
- **WHEN** sandboxed code requires a third-party package not present in sandboxed `node_modules`
- **THEN** the require system MUST throw a standard "Cannot find module" error

### Requirement: Node Built-in Modules With Polyfills Must Use Standard Polyfills
When `node-stdlib-browser` provides a polyfill for a Node built-in module, the require system MUST load that polyfill through the standard polyfill loader rather than returning a custom inline stub.

#### Scenario: Require resolves tty through polyfill loader
- **WHEN** sandboxed code calls `require('tty')`
- **THEN** the require system MUST load `tty-browserify` via the polyfill loader, not a hand-rolled stub

#### Scenario: Require resolves constants through polyfill loader
- **WHEN** sandboxed code calls `require('constants')`
- **THEN** the require system MUST load `constants-browserify` via the polyfill loader, not a hand-rolled stub

### Requirement: Node Built-in Modules Without Polyfills Use Explicit Stubs
Node built-in modules that have no `node-stdlib-browser` polyfill and no bridge implementation SHALL be handled by pre-registered stub entries in the module cache, not by inline conditionals in the require function body.

#### Scenario: v8 module resolves from pre-registered cache
- **WHEN** sandboxed code calls `require('v8')`
- **THEN** the module MUST resolve from a pre-populated `_moduleCache` entry set during isolate setup

#### Scenario: v8 stub provides expected API surface
- **WHEN** sandboxed code accesses `require('v8').getHeapStatistics()`
- **THEN** the stub MUST return a plausible heap statistics object without throwing

### Requirement: Polyfill Gaps Are Addressed by a Named Patch Layer
Known gaps in `node-stdlib-browser` polyfills (missing methods, incorrect behavior) SHALL be fixed by a dedicated patch function applied after polyfill evaluation, not by inline conditional blocks scattered in the require function.

#### Scenario: util polyfill receives formatWithOptions patch
- **WHEN** the `util` polyfill is loaded and lacks `formatWithOptions`
- **THEN** the patch layer MUST add a `formatWithOptions` implementation that delegates to `util.format`

#### Scenario: url polyfill receives relative file URL patch
- **WHEN** the `url` polyfill is loaded
- **THEN** the patch layer MUST wrap `URL` to handle relative `file:` URLs (e.g., `file:.`) by falling back to `process.cwd()` as base

#### Scenario: path polyfill receives win32/posix and resolve patches
- **WHEN** the `path` polyfill is loaded
- **THEN** the patch layer MUST ensure `path.win32` and `path.posix` exist and MUST wrap `path.resolve` to prepend `process.cwd()` when no absolute path argument is provided

#### Scenario: Unpatched module passes through unchanged
- **WHEN** a polyfill module has no known gaps (e.g., `events`, `buffer`)
- **THEN** the patch layer MUST return the polyfill exports unmodified

### Requirement: Every Core Module Has an Explicit Support Tier
Every Node.js core module referenced in the stdlib compatibility matrix SHALL be classified into exactly one of five tiers: Bridge, Polyfill, Stub, Deferred, or Unsupported.

#### Scenario: New module referenced in compatibility matrix
- **WHEN** a Node.js core module is added to or already exists in the compatibility matrix
- **THEN** it MUST carry an explicit tier classification with defined runtime behavior

#### Scenario: Module tier is queried by a contributor
- **WHEN** a contributor checks the compatibility matrix for a module's support level
- **THEN** the tier, supported API surface, and runtime behavior for unsupported APIs MUST be clearly documented

### Requirement: Deterministic Errors for Unsupported APIs
APIs classified as unsupported within any tier MUST throw a descriptive error following the format `"<module>.<api> is not supported in sandbox"` rather than returning `undefined` or silently failing.

#### Scenario: Calling an unsupported API within a bridged module
- **WHEN** sandboxed code calls `fs.watch()` (a known-unsupported API in the fs bridge)
- **THEN** the call MUST throw an error with message matching `"fs.watch is not supported in sandbox"`

#### Scenario: Calling any method on an unsupported module
- **WHEN** sandboxed code requires an unsupported (Tier 5) module and calls a method on it
- **THEN** the method call MUST throw an error indicating the module is not supported in sandbox

### Requirement: Deferred Modules Provide Stub Objects
Modules classified as Deferred (Tier 4) SHALL be requireable without error, returning a stub object whose methods throw descriptive errors on invocation.

#### Scenario: Requiring a deferred module
- **WHEN** sandboxed code calls `require("net")`
- **THEN** the call MUST succeed and return a stub object

#### Scenario: Calling a method on a deferred module stub
- **WHEN** sandboxed code calls `require("net").createConnection()`
- **THEN** the call MUST throw an error indicating the API is not yet supported

### Requirement: Unsupported Modules Throw on Require
Modules classified as Unsupported (Tier 5) SHALL throw immediately when required, indicating they will not be implemented.

#### Scenario: Requiring an unsupported module
- **WHEN** sandboxed code calls `require("cluster")`
- **THEN** the call MUST throw an error indicating the module is not supported in sandbox

### Requirement: fs Missing API Classification
The following `fs` watcher APIs SHALL be classified as Deferred with deterministic error behavior: `watch`, `watchFile`, and `fs/promises.watch`. The sandbox VFS/kernel has no inotify/kqueue/FSEvents-equivalent primitive, so these APIs MUST fail fast instead of hanging while waiting for events that can never arrive. The APIs `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes`, `access`, and `realpath` SHALL be documented as implemented (Bridge tier), delegating to the VFS with permission checks.

#### Scenario: Calling a deferred fs API
- **WHEN** sandboxed code calls `fs.watch()`
- **THEN** the call MUST throw `"fs.watch is not supported in sandbox — use polling"`

#### Scenario: Calling deferred watcher APIs through fs/promises
- **WHEN** sandboxed code iterates `require("fs/promises").watch(...)`
- **THEN** the iterator MUST reject with `"fs.promises.watch is not supported in sandbox — use polling"`
- **AND** it MUST preserve Node-compatible `ERR_INVALID_ARG_TYPE`, `ERR_INVALID_ARG_VALUE`, and `AbortError` validation behavior before the deferred unsupported error path

#### Scenario: Calling an implemented fs API previously listed as missing
- **WHEN** sandboxed code calls `fs.access("/some/path", callback)`
- **THEN** the call MUST execute normally via the fs bridge without error

### Requirement: fs Validation Paths Preserve Node ERR_* Shapes
Bridge-provided `fs` APIs SHALL throw Node-compatible validation errors before asynchronous dispatch when the argument contract is violated.

#### Scenario: Callback-style fs API is missing or given a non-function callback
- **WHEN** sandboxed code calls callback-style APIs such as `fs.open()`, `fs.close()`, `fs.exists()`, `fs.stat()`, or `fs.mkdtemp()` without a valid callback
- **THEN** the bridge MUST throw `ERR_INVALID_ARG_TYPE` synchronously instead of returning a Promise or reporting the validation failure through the callback

#### Scenario: fs validation rejects invalid encodings and numeric option types
- **WHEN** sandboxed code passes an invalid encoding to `fs.readFile*()`, `fs.readdir*()`, `fs.readlink*()`, `fs.writeFile*()`, `fs.appendFile*()`, `fs.realpath*()`, `fs.mkdtemp*()`, `fs.ReadStream()`, `fs.WriteStream()`, or `fs.watch()`
- **THEN** the bridge MUST throw `ERR_INVALID_ARG_VALUE`
- **AND** invalid numeric `start` / `end` stream options or fd/path argument types MUST throw `ERR_INVALID_ARG_TYPE` or `ERR_OUT_OF_RANGE` with Node-compatible names

### Requirement: child_process.fork Is Permanently Unsupported
`child_process.fork()` SHALL be classified as Unsupported and MUST throw a deterministic error explaining that IPC across the isolate boundary is not supported.

#### Scenario: Calling fork
- **WHEN** sandboxed code calls `require("child_process").fork("script.js")`
- **THEN** the call MUST throw an error matching `"child_process.fork is not supported in sandbox"`

### Requirement: Crypto Is Stub Tier with Secure Randomness Contract
The `crypto` module SHALL be classified as Stub (Tier 3). `getRandomValues()` and `randomUUID()` MUST use host `node:crypto` cryptographically secure randomness when available, and MUST throw deterministic unsupported errors if secure host entropy cannot be obtained. `subtle.*` methods MUST throw unsupported errors.

#### Scenario: Documentation of crypto randomness contract
- **WHEN** a user or contributor reads the crypto section of the compatibility matrix
- **THEN** the entry MUST document host-backed secure randomness behavior for `getRandomValues()`/`randomUUID()` and MUST NOT claim `Math.random()`-backed entropy

#### Scenario: Host entropy unavailable for getRandomValues
- **WHEN** sandboxed code calls `crypto.getRandomValues(array)` and host secure entropy is unavailable
- **THEN** the call MUST throw a deterministic error indicating `crypto.getRandomValues` is not supported in sandbox

#### Scenario: Host entropy unavailable for randomUUID
- **WHEN** sandboxed code calls `crypto.randomUUID()` and host secure entropy is unavailable
- **THEN** the call MUST throw a deterministic error indicating `crypto.randomUUID` is not supported in sandbox

#### Scenario: Calling crypto.subtle.digest
- **WHEN** sandboxed code calls `crypto.subtle.digest("SHA-256", data)`
- **THEN** the call MUST delegate to host `node:crypto` and return an ArrayBuffer containing the hash

#### Scenario: crypto.subtle operations delegate to host
- **WHEN** sandboxed code calls any `crypto.subtle` method (digest, encrypt, decrypt, sign, verify, generateKey, importKey, exportKey)
- **THEN** the operation MUST delegate to host `node:crypto` via the `_cryptoSubtle` bridge ref
- **AND** all cryptographic material MUST be transferred as base64-encoded JSON across the isolate boundary
- **AND** CryptoKey objects in the sandbox MUST be opaque wrappers holding serialized key data

### Requirement: Unimplemented Module Tier Assignments
The following modules SHALL be classified as Deferred (Tier 4): `net`, `tls`, `readline`, `perf_hooks`, `async_hooks`, `worker_threads`, `diagnostics_channel`. The following modules SHALL be classified as Unsupported (Tier 5): `dgram`, `http2` (full), `cluster`, `wasi`, `inspector`, `repl`, `trace_events`, `domain`.

#### Scenario: Requiring a deferred unimplemented module
- **WHEN** sandboxed code calls `require("net")`
- **THEN** the call MUST return a stub object (Tier 4 behavior)

#### Scenario: Requiring an unsupported unimplemented module
- **WHEN** sandboxed code calls `require("cluster")`
- **THEN** the call MUST throw immediately (Tier 5 behavior)

### Requirement: Stale Documentation Entries Removed
The compatibility matrix MUST NOT contain entries for third-party modules that are no longer bridged or stubbed in code. Specifically, the `@hono/node-server` entry SHALL be removed.

#### Scenario: Third-party bridge is removed from code
- **WHEN** a third-party module bridge has been deleted from the codebase
- **THEN** its entry MUST be removed from the compatibility matrix in the same or next change

### Requirement: Builtin Resolver Helpers Return Builtin Identifiers
Builtin module resolution through helper APIs MUST return builtin identifiers directly instead of attempting filesystem lookup.

#### Scenario: require.resolve returns builtin id
- **WHEN** sandboxed code calls `require.resolve("fs")`
- **THEN** the call MUST succeed and return a builtin identifier for `fs` (for example `"fs"` or `"node:fs"`)

#### Scenario: createRequire resolve returns builtin id
- **WHEN** sandboxed code calls `createRequire("/app/entry.js").resolve("path")`
- **THEN** the call MUST succeed and return a builtin identifier for `path` (for example `"path"` or `"node:path"`)

### Requirement: Bridged Builtins Support ESM Default and Named Imports
For bridged built-in modules exposed to ESM, the runtime MUST provide both default export access and named-import access for supported APIs.

#### Scenario: fs named import is available in ESM
- **WHEN** sandboxed ESM code executes `import { readFileSync } from "node:fs"`
- **THEN** `readFileSync` MUST resolve to a callable function equivalent to `default.readFileSync`

#### Scenario: path named import is available in ESM
- **WHEN** sandboxed ESM code executes `import { sep } from "node:path"`
- **THEN** `sep` MUST resolve to the same value as `default.sep`
