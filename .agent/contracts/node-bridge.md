# node-bridge Specification

## Purpose
Define bridge boundary policy, third-party module boundaries, and capability expansion controls.
## Requirements
### Requirement: Bridge Scope Is Node Built-ins Only
Bridge implementations injected into isolated-vm MUST be limited to Node.js built-in modules and types compatible with `@types/node`.

#### Scenario: Bridge request targets a third-party package
- **WHEN** a proposed bridge module is not a Node.js built-in
- **THEN** the change MUST be rejected from the bridge layer and handled through normal sandboxed package resolution

### Requirement: Third-Party Modules Resolve from Sandboxed Dependencies
Third-party npm packages SHALL execute from sandboxed `node_modules` using normal runtime/module resolution behavior rather than bridge shims.

#### Scenario: Sandboxed app imports third-party server package
- **WHEN** sandboxed code imports a third-party package such as `@hono/node-server`
- **THEN** the package MUST resolve from sandboxed dependencies and MUST NOT rely on a host bridge shim for its primary runtime behavior

### Requirement: Capability Expansion Requires Explicit Approval
No new sandbox capability or host-exposed functionality MAY be added without explicit user approval and an agreed implementation plan, and implementation MUST pause until that approval is recorded.

#### Scenario: Change proposes new host-exposed API
- **WHEN** a proposal introduces a new sandbox capability beyond the current approved surface
- **THEN** implementation MUST pause until explicit approval and plan agreement are recorded

### Requirement: Active-Handle Bridge Globals Are Immutable
Bridge lifecycle globals used for active-handle tracking (`_registerHandle`, `_unregisterHandle`, `_waitForActiveHandles`) MUST be installed on `globalThis` as non-writable and non-configurable properties so sandbox code cannot replace runtime lifecycle hooks.

#### Scenario: Sandbox attempts to overwrite active-handle lifecycle hook
- **WHEN** sandboxed code assigns a new value to one of the active-handle lifecycle globals
- **THEN** the original bridge lifecycle function MUST remain installed and property descriptors MUST report `writable: false` and `configurable: false`

### Requirement: Prefer Standard Polyfills Over Custom Reimplementation
When a Node built-in compatibility layer exists in `node-stdlib-browser`, the project SHALL use that polyfill instead of introducing a custom replacement, unless a documented exception is approved.

#### Scenario: New built-in compatibility need is identified
- **WHEN** a Node built-in module requires browser/runtime compatibility support
- **THEN** maintainers MUST evaluate `node-stdlib-browser` first and only add custom behavior for explicitly documented gaps

### Requirement: Isolate Boundary Payload Transfers Are Size-Bounded
Bridge handlers that exchange serialized payloads between isolate and host MUST enforce maximum payload sizes before materializing or decoding untrusted data.

#### Scenario: Oversized binary read payload is rejected before host transfer
- **WHEN** `readFileBinaryRef` would return a base64 payload larger than the configured bridge transfer limit
- **THEN** the bridge MUST reject the request with a deterministic overflow error and MUST NOT return the oversized payload to the isolate

#### Scenario: Oversized binary write payload is rejected before decode
- **WHEN** `writeFileBinaryRef` receives a base64 payload larger than the configured bridge transfer limit
- **THEN** the bridge MUST reject the request before base64 decode and MUST NOT allocate a decoded buffer for the oversized payload

#### Scenario: Base64 transfer checks use encoded payload byte length
- **WHEN** the runtime evaluates payload size for `readFileBinaryRef` or `writeFileBinaryRef`
- **THEN** it MUST measure the serialized base64 payload byte length before decode and enforce limits on that encoded payload

#### Scenario: Bridge transfer uses configured payload limit when provided
- **WHEN** a host configures an in-range base64 transfer payload limit for the runtime
- **THEN** bridge-side `readFileBinaryRef` and `writeFileBinaryRef` enforcement MUST use the configured value instead of the default

### Requirement: Bridge Custom Globals MUST Be Immutable By Default
Bridge-defined custom globals that expose runtime control-plane behavior (for example dispatch hooks, bridge module handles, and lifecycle helpers) MUST be installed on `globalThis` with `writable: false` and `configurable: false` unless explicitly classified as required mutable runtime state.

#### Scenario: Bridge installs custom dispatch global
- **WHEN** the bridge exposes a non-stdlib dispatch/global hook used by runtime-host coordination
- **THEN** the property descriptor for that global MUST report `writable: false` and `configurable: false`

#### Scenario: Sandbox attempts to replace hardened bridge global
- **WHEN** sandboxed code assigns a new value to a hardened custom bridge global
- **THEN** the original bridge binding MUST remain installed

#### Scenario: Hardened bridge globals are fully enumerated
- **WHEN** bridge code exposes hardened custom globals
- **THEN** every hardened bridge global MUST be represented in the maintained custom-global inventory used for exhaustive descriptor regression tests

### Requirement: Node Stdlib Global Exposure MUST Preserve Compatibility Semantics
This hardening policy MUST NOT force Node stdlib globals to non-writable/non-configurable descriptors solely because they are globally exposed.

#### Scenario: Bridge exposes stdlib-compatible global
- **WHEN** bridge setup exposes a Node stdlib global surface (for example `process`, timers, `Buffer`, `URL`, `fetch`, or `console`)
- **THEN** the bridge MUST preserve Node-compatible behavior and MUST NOT require non-writable/non-configurable descriptors for that stdlib global due to this policy alone

### Requirement: WHATWG URL Bridge Preserves Node Validation And Scalar-Value Semantics
Bridge-provided `URL` and `URLSearchParams` globals SHALL preserve the Node-observable validation, coercion, and inspection behavior that vendored conformance tests assert.

#### Scenario: WHATWG URL validation preserves Node ERR_* metadata
- **WHEN** sandboxed code calls `new URL()`, `new URL("bad")`, detached `URLSearchParams` methods, or malformed `URLSearchParams` tuple constructors
- **THEN** the bridge MUST throw Node-compatible `TypeError` instances with the expected `ERR_MISSING_ARGS`, `ERR_INVALID_URL`, `ERR_INVALID_THIS`, `ERR_ARG_NOT_ITERABLE`, and `ERR_INVALID_TUPLE` codes

#### Scenario: WHATWG URL string inputs use scalar-value normalization
- **WHEN** sandboxed code passes strings with surrogate pairs or lone surrogates into `URL` / `URLSearchParams` constructors or setters
- **THEN** the bridge MUST apply string-hint coercion followed by USV-string normalization before handing values to the underlying implementation
- **AND** valid surrogate pairs MUST encode as UTF-8 scalar values while lone surrogates become U+FFFD

#### Scenario: WHATWG URL custom inspect hooks stay reachable through util.inspect
- **WHEN** sandboxed code calls `util.inspect(urlLike)` for bridged `URL`, `URLSearchParams`, or iterator instances, including negative-depth and nested-object cases
- **THEN** the bridge/runtime polyfill layer MUST continue to invoke the custom inspect hooks instead of falling back to plain `{}` output

### Requirement: Cryptographic Randomness Bridge Uses Host CSPRNG
Bridge-provided randomness for global `crypto` APIs MUST delegate to host `node:crypto` primitives and MUST NOT use isolate-local pseudo-random fallbacks such as `Math.random()`.

#### Scenario: getRandomValues uses host entropy
- **WHEN** sandboxed code calls `crypto.getRandomValues(typedArray)`
- **THEN** the bridge MUST fill the provided view using host cryptographic entropy equivalent to `node:crypto.randomFillSync`

#### Scenario: randomUUID uses host UUID generation
- **WHEN** sandboxed code calls `crypto.randomUUID()`
- **THEN** the bridge MUST return a UUID value generated by host `node:crypto` semantics

#### Scenario: Host entropy is unavailable
- **WHEN** host `node:crypto` randomness primitives are unavailable or fail
- **THEN** the bridge MUST throw a deterministic error matching the unsupported API format (`"<module>.<api> is not supported in sandbox"`) for the invoked randomness API and MUST NOT fall back to non-cryptographic randomness

### Requirement: Global WebCrypto Surface Matches The `crypto.webcrypto` Bridge
The bridge SHALL expose a single WebCrypto surface so global `crypto` APIs and `require('crypto').webcrypto` share the same object graph and constructor semantics.

#### Scenario: Sandboxed code compares global and module WebCrypto objects
- **WHEN** sandboxed code reads both `globalThis.crypto` and `require('crypto').webcrypto`
- **THEN** those references MUST point at the same WebCrypto object
- **AND** `crypto.subtle` MUST expose the same `SubtleCrypto` instance through both paths

#### Scenario: WebCrypto constructors stay non-user-constructible
- **WHEN** sandboxed code calls `new Crypto()`, `new SubtleCrypto()`, or `new CryptoKey()`
- **THEN** the bridge MUST throw a Node-compatible illegal-constructor `TypeError`
- **AND** prototype method receiver validation MUST reject detached calls with `ERR_INVALID_THIS`

### Requirement: Diffie-Hellman And ECDH Bridge Uses Host Node Crypto Objects
Bridge-provided `crypto` Diffie-Hellman and ECDH APIs SHALL delegate to host `node:crypto` objects so constructor validation, session state, encodings, and shared-secret derivation match Node.js semantics.

#### Scenario: Sandbox creates a Diffie-Hellman session
- **WHEN** sandboxed code calls `crypto.createDiffieHellman(...)`, `crypto.getDiffieHellman(...)`, or `crypto.createECDH(...)`
- **THEN** the bridge MUST construct the corresponding host `node:crypto` object
- **AND** subsequent method calls such as `generateKeys()`, `computeSecret()`, `getPublicKey()`, and `setPrivateKey()` MUST execute against that host object rather than an isolate-local reimplementation

#### Scenario: Sandbox uses stateless crypto.diffieHellman
- **WHEN** sandboxed code calls `crypto.diffieHellman({ privateKey, publicKey })`
- **THEN** the bridge MUST delegate to host `node:crypto.diffieHellman`
- **AND** the returned shared secret and thrown validation errors MUST preserve Node-compatible behavior

### Requirement: Crypto Stream Wrappers Preserve Transform Semantics And Validation Errors
Bridge-backed `crypto` hash and cipher wrappers SHALL remain compatible with Node stream semantics and MUST preserve Node-style validation error codes for callback-driven APIs.

#### Scenario: Sandbox hashes or encrypts data through stream piping
- **WHEN** sandboxed code uses `crypto.Hash`, `crypto.Cipheriv`, or `crypto.Decipheriv` as stream destinations or sources
- **THEN** those objects MUST be `stream.Transform` instances
- **AND** piping data through them MUST emit the same digest or ciphertext/plaintext bytes that the corresponding direct `update()`/`final()` calls would produce

#### Scenario: Sandbox calls pbkdf2 with invalid arguments
- **WHEN** sandboxed code calls `crypto.pbkdf2()` or `crypto.pbkdf2Sync()` with invalid callback, digest, password, salt, iteration, or key length arguments
- **THEN** the bridge MUST throw or surface Node-compatible `ERR_INVALID_ARG_TYPE` / `ERR_OUT_OF_RANGE` errors instead of plain untyped exceptions

### Requirement: Bridge FS Open Flag Translation Uses Named Constants
The bridge `fs` implementation MUST express string-flag translation using named open-flag constants (for example `O_WRONLY | O_CREAT | O_TRUNC`) aligned with Node `fs.constants` semantics, and MUST NOT rely on undocumented numeric literals.

#### Scenario: Write-truncate flags are composed from constants
- **WHEN** the bridge parses open flag strings such as `"w"` or `"w+"`
- **THEN** resulting numeric modes MUST be produced from named constant composition rather than hardcoded integers

#### Scenario: Append-exclusive flags remain deterministic
- **WHEN** the bridge parses append/exclusive flags such as `"ax"` and `"ax+"`
- **THEN** the bridge MUST return deterministic Node-compatible numeric modes and preserve existing error behavior for unknown flags

### Requirement: Bridge Filesystem Metadata Calls Preserve Metadata-Only Semantics
Bridge-exposed filesystem metadata calls (`exists`, `stat`, and typed directory listing paths) MUST preserve metadata-only semantics and MUST NOT trigger file-content reads solely to determine type or existence.

#### Scenario: Bridge stat does not read file body for metadata
- **WHEN** sandboxed code calls bridge `fs.stat` for a file path
- **THEN** bridge handling MUST obtain metadata without loading the file body into memory

#### Scenario: Bridge typed readdir avoids per-entry directory probing
- **WHEN** sandboxed code calls bridge `readdir` with typed entry expectations
- **THEN** bridge handling MUST return entry type information without a repeated `readDir` probe for each entry

### Requirement: AbortSignal Polyfills Preserve Frozen-Options Cancellation Semantics
Bridge/runtime `AbortController` and `AbortSignal` polyfills SHALL preserve Node-compatible cancellation behavior even when test helpers freeze the options bag and nested signal object.

#### Scenario: Sandboxed code aborts after freezing an options bag
- **WHEN** sandboxed code passes `{ signal }` through a deep-freeze helper such as the vendored conformance `common.mustNotMutateObjectDeep()` and later calls `controller.abort(reason)`
- **THEN** the abort operation MUST still succeed
- **AND** fs and network APIs observing that signal MUST surface a Node-compatible `AbortError` instead of throwing from signal state mutation

### Requirement: Standalone NodeRuntime FS Bridge Exposes Proc Hostname Parity
The standalone NodeRuntime filesystem bridge SHALL expose a readable `/proc/sys/kernel/hostname` pseudo-file so vendored Linux fs paths behave consistently outside the kernel-mounted proc layer.

#### Scenario: Sandboxed standalone runtime reads proc hostname
- **WHEN** sandboxed code in a standalone `NodeRuntime` calls `fs.readFile('/proc/sys/kernel/hostname')`, `fs.readFileSync('/proc/sys/kernel/hostname')`, or opens that path through `fs.promises.open()`
- **THEN** the bridge MUST return a non-empty hostname payload instead of `ENOENT`

### Requirement: Bridge Boundary Contracts SHALL Be Defined In A Canonical Shared Type Module
Bridge global keys and host/isolate boundary type contracts SHALL be defined in canonical shared type modules — bridge-contract types in `packages/nodejs/src/bridge-contract.ts` and global-exposure helpers in `packages/core/src/shared/global-exposure.ts` — and reused across host runtime setup and bridge modules.

#### Scenario: Host runtime injects bridge globals
- **WHEN** host runtime code wires bridge globals into the isolate
- **THEN** global key names MUST come from the canonical shared bridge contract constants rather than ad-hoc string literals

#### Scenario: Bridge module consumes host bridge globals
- **WHEN** a bridge module declares host-provided bridge globals
- **THEN** declaration shapes MUST reuse canonical shared contract types instead of redefining per-file ad-hoc reference interfaces

### Requirement: Child Process Spawn Routes Through Kernel Command Registry
When a kernel is available, bridge `child_process.spawn` and `child_process.exec` calls from sandboxed code SHALL route through the kernel command registry for command resolution and process lifecycle management.

#### Scenario: Bridge child_process.spawn resolves command through kernel
- **WHEN** sandboxed code calls `child_process.spawn(command, args)` in a kernel-mediated environment
- **THEN** the bridge MUST route the spawn request through `kernel.spawn(command, args, options)`, which resolves the command via the kernel command registry to the appropriate mounted RuntimeDriver

#### Scenario: Bridge child_process.exec routes through kernel shell
- **WHEN** sandboxed code calls `child_process.exec(command)` in a kernel-mediated environment
- **THEN** the bridge MUST route the execution through `kernel.exec(command, options)`, which spawns via the registered shell command (e.g., `sh -c command`)

#### Scenario: Unregistered command fails with command-not-found
- **WHEN** sandboxed code spawns a command that no mounted driver has registered
- **THEN** the bridge MUST propagate the kernel's command-not-found error rather than silently failing or attempting host-side resolution

#### Scenario: Process lifecycle is kernel-managed
- **WHEN** a child process is spawned through the bridge in a kernel-mediated environment
- **THEN** the process MUST be registered in the kernel process table with a PID, and kill/wait operations MUST route through the kernel process table rather than directly to the host OS

### Requirement: Bridge Global Key Registry SHALL Stay Consistent Across Runtime Layers
The bridge global key registry consumed by host runtime setup, bridge modules, and isolate runtime typing declarations SHALL remain consistent and covered by automated verification.

#### Scenario: Bridge key mismatch is introduced
- **WHEN** a change modifies host injection or bridge usage with a mismatched key name
- **THEN** automated verification MUST fail and report the key consistency violation

#### Scenario: New bridge global is introduced
- **WHEN** contributors add a new bridge global used by host/isolate boundary wiring
- **THEN** that global MUST be added to the canonical shared key registry and corresponding shared contract typing in the same change

#### Scenario: Native V8 bridge registries stay aligned with async and sync lifecycle hooks
- **WHEN** bridge modules depend on a host bridge global via async `.apply(..., { result: { promise: true } })` or sync `.applySync(...)` semantics
- **THEN** the native V8 bridge function registries MUST expose a matching callable shape for that global (or an equivalent tested shim), and automated verification MUST cover the registry alignment

### Requirement: Dispatch-Multiplexed Bridge Errors Preserve Structured Metadata
Bridge globals routed through the `_loadPolyfill` dispatch multiplexer SHALL preserve host error metadata needed for Node-compatible assertions.

#### Scenario: Host bridge throws typed crypto validation error
- **WHEN** a dispatch-multiplexed bridge handler throws a host error with `name` and `code` (for example `TypeError` + `ERR_INVALID_ARG_VALUE`)
- **THEN** the sandbox-visible error MUST preserve that `name` and `code`
- **AND** the bridge MUST NOT collapse the error to a plain `Error` with only a message

### Requirement: HTTP Agent Bridge Preserves Node Pooling Semantics
Bridge-provided `http.Agent` behavior SHALL preserve the observable pooling state that Node.js userland and conformance tests inspect.

#### Scenario: Sandboxed code inspects agent bookkeeping
- **WHEN** sandboxed code uses `http.Agent` or `require('_http_agent').Agent`
- **THEN** the bridge MUST expose matching `Agent` constructors through both module paths
- **AND** `getName()`, `requests`, `sockets`, `freeSockets`, and `totalSocketCount` MUST reflect request queueing and socket reuse state with Node-compatible key shapes

#### Scenario: Keepalive sockets are reused or discarded
- **WHEN** sandboxed code enables `keepAlive` and reuses pooled HTTP connections
- **THEN** the bridge MUST mark reused requests via `request.reusedSocket`

### Requirement: Dgram Socket Option Bridge Preserves Node Validation And Bind-Time Semantics
Bridge-provided `dgram.Socket` option helpers SHALL preserve Node-compatible validation order, not-running errors, and deferred application of constructor buffer-size options.

#### Scenario: Unbound dgram socket exposes Node-style socket-option errors
- **WHEN** sandboxed code calls `socket.setBroadcast()`, `socket.setTTL()`, `socket.setMulticastTTL()`, or `socket.setMulticastLoopback()` before `bind()`
- **THEN** the bridge MUST throw the corresponding Node-style `Error` with the syscall name and `EBADF`
- **AND** unbound `get*BufferSize()` / `set*BufferSize()` calls MUST throw `ERR_SOCKET_BUFFER_SIZE` with `EBADF`

#### Scenario: Constructor buffer-size options do not hide unbound error paths
- **WHEN** sandboxed code creates `dgram.createSocket({ recvBufferSize, sendBufferSize })`
- **THEN** the bridge MUST cache those requested sizes until the socket is actually bound
- **AND** it MUST NOT eagerly apply them in a way that makes unbound buffer-size getters/setters succeed

#### Scenario: Source-specific membership validates argument types before address semantics
- **WHEN** sandboxed code calls `addSourceSpecificMembership()` or `dropSourceSpecificMembership()` with non-string `sourceAddress` or `groupAddress`
- **THEN** the bridge MUST throw Node-compatible `ERR_INVALID_ARG_TYPE` for the offending argument before running multicast/unicast address validation

### Requirement: HTTP Server Bridge Preserves CONNECT Upgrade And Informational Semantics
Bridge-provided `http.Server` behavior SHALL preserve Node.js event sequencing for `CONNECT`, `upgrade`, and informational `1xx` responses.

#### Scenario: Sandboxed loopback server receives CONNECT or upgrade traffic
- **WHEN** sandboxed code listens with `http.createServer()` and registers `server.on('connect', ...)` or `server.on('upgrade', ...)`
- **THEN** localhost `CONNECT` and `Connection: Upgrade` requests MUST dispatch those server events instead of being collapsed into a normal `'request'` handler
- **AND** the bridged socket/head arguments MUST remain writable/readable so tunnel and upgrade protocols can continue over the same connection

#### Scenario: Sandboxed server emits informational responses before the final response
- **WHEN** sandboxed code sends `100`, `102`, or `103` responses via `writeHead()`, `writeContinue()`, `writeProcessing()`, or raw header writes
- **THEN** sandboxed HTTP clients MUST receive matching `'information'` events before the final `'response'`
- **AND** the bridged informational message MUST preserve status code, status text, headers, and raw header casing needed by Node conformance assertions
- **AND** destroyed or remotely closed sockets MUST be removed from the pool instead of being reassigned to queued requests

#### Scenario: Total socket limits are configured
- **WHEN** sandboxed code constructs an `http.Agent` with `maxSockets`, `maxFreeSockets`, or `maxTotalSockets`
- **THEN** invalid argument types and ranges MUST throw Node-compatible `ERR_INVALID_ARG_TYPE` / `ERR_OUT_OF_RANGE` errors
- **AND** queued requests across origins MUST respect both per-origin and total socket limits

### Requirement: TLS Bridge Uses Host TLS Semantics For Both External And Loopback Sockets
Bridge-provided `tls` APIs SHALL terminate TLS with host `node:tls` primitives, including sandbox loopback sockets that are paired in-kernel.

#### Scenario: Sandbox upgrades a client or accepted server socket to TLS
- **WHEN** sandboxed code calls `tls.connect(...)` or `tls.createServer(...)` and the bridged socket is upgraded to TLS
- **THEN** the bridge MUST use host `node:tls` handshakes, certificate validation, and cipher reporting
- **AND** loopback socket pairs MUST use a host-side in-memory duplex transport instead of bypassing the kernel connection model

#### Scenario: Sandbox reads TLS authorization or cipher metadata
- **WHEN** sandboxed code inspects `tls.TLSSocket.authorized`, `authorizationError`, `getCipher()`, or `tls.getCiphers()`
- **THEN** the bridge MUST surface host `node:tls` results rather than placeholder values

#### Scenario: Loopback TLS servers resolve SNI contexts and ALPN/session metadata
- **WHEN** sandboxed code uses `tls.Server(...)` or `tls.createServer(...)` with `server.addContext(...)`, `SNICallback`, `ALPNProtocols`, or `ALPNCallback`, and a sandboxed client connects with `servername`, `session`, or `ALPNProtocols`
- **THEN** the server-side bridge MUST resolve the client hello metadata before starting the host TLS handshake
- **AND** `tls.TLSSocket` methods such as `getSession()`, `isSessionReused()`, `getPeerCertificate()`, `getCertificate()`, and `getProtocol()` MUST reflect the underlying host `node:tls` socket state

### Requirement: HTTP2 Bridge Preserves Basic Session And Stream Lifecycle
Bridge-provided `http2` APIs SHALL preserve the basic client/server session and stream lifecycle needed for sandbox request/response flows.

#### Scenario: Sandboxed code establishes plaintext or TLS HTTP2 sessions
- **WHEN** sandboxed code calls `http2.createServer(...)`, `http2.createSecureServer(...)`, or `http2.connect(...)`
- **THEN** the bridge MUST surface Node-compatible `'listening'`, `'connect'`, `'connection'`, and `'secureConnection'` events
- **AND** `server.address()`, `session.encrypted`, `session.alpnProtocol`, `session.originSet`, and the internal `kSocket` metadata MUST reflect the host-backed session state

#### Scenario: Sandboxed code responds through HTTP2 stream events
- **WHEN** a bridged HTTP2 server receives a request and emits `'stream'`
- **THEN** the stream callback MUST receive a writable server stream plus pseudo-header metadata
- **AND** `stream.respond(...)`, `stream.write(...)`, and `stream.end(...)` MUST drive the corresponding host HTTP2 response headers/body/close lifecycle
- **AND** the paired client stream MUST emit `'response'`, `'data'`, `'end'`, and `'close'` with Node-compatible ordering for basic request/response flows

#### Scenario: Sandboxed code uses HTTP2 push, settings negotiation, or GOAWAY lifecycle
- **WHEN** sandboxed code calls `stream.pushStream(...)`, `session.settings(...)`, `server.updateSettings(...)`, `session.goaway(...)`, or inspects `session.localSettings`, `session.remoteSettings`, and `pendingSettingsAck`
- **THEN** the bridge MUST delegate push-stream creation, settings exchange, and GOAWAY delivery to the host `node:http2` session
- **AND** pushed client streams MUST emit the session `'stream'` event plus pushed-stream `'push'` headers before body delivery
- **AND** nested push attempts and HEAD push write-after-end behavior MUST surface Node-compatible `ERR_HTTP2_NESTED_PUSH` and `ERR_STREAM_WRITE_AFTER_END` errors
- **AND** session/server settings objects exposed in the sandbox MUST track the last host-acknowledged values with stable object identity until the next settings update

#### Scenario: Sandboxed code inspects HTTP2 flow-control state or pauses inbound streams
- **WHEN** sandboxed code calls `session.setLocalWindowSize(...)`, inspects `session.state`, or pauses/resumes a bridged server stream while request body frames are in flight
- **THEN** the bridge MUST delegate the window-size change to the host `node:http2` session
- **AND** sandbox-visible `session.state` fields such as `effectiveLocalWindowSize`, `localWindowSize`, and `remoteWindowSize` MUST reflect the host session state after the update
- **AND** server-stream `'error'`, `'close'`, `'drain'`, `'data'`, and `'end'` events MUST preserve the host flow-control and RST lifecycle closely enough for Node's vendored flow-control tests

#### Scenario: Secure HTTP2 servers allow HTTP1 compatibility fallback
- **WHEN** sandboxed code creates `http2.createSecureServer({ allowHTTP1: true }, listener)` and an HTTP/1.1 client connects to that port
- **THEN** the host-backed server MUST negotiate the HTTP/1.1 fallback instead of hanging the connection
- **AND** the sandbox `'request'` listener MUST receive compatibility request/response objects that can complete the HTTP/1.1 exchange

### Requirement: HTTP ClientRequest Bridge Preserves Abort Destroy And Timeout Lifecycle Semantics
Bridge-provided `http.ClientRequest` behavior SHALL preserve the observable abort, destroy, timeout, and abort-signal lifecycle that Node.js tests inspect.

#### Scenario: Sandboxed code aborts or destroys an HTTP request
- **WHEN** sandboxed code calls `req.abort()` or `req.destroy()` on an `http.ClientRequest`
- **THEN** the request MUST expose Node-compatible `aborted` / `destroyed` state
- **AND** the request MUST emit `'abort'` at most once for `req.abort()`
- **AND** the request MUST emit `'close'` when teardown completes
- **AND** loopback server-side request objects MUST observe matching `'aborted'` / `ECONNRESET` behavior

#### Scenario: Sandboxed code configures request timeouts or abort signals
- **WHEN** sandboxed code passes `timeout` or `signal` in `http.request()` options, or calls `req.setTimeout(...)`
- **THEN** invalid timeout values MUST throw Node-compatible argument errors
- **AND** the request/socket timeout callbacks MUST be attached with Node-compatible listener reuse
- **AND** `AbortSignal` cancellation MUST destroy the request with an `AbortError` carrying `code === 'ABORT_ERR'`

### Requirement: Net Bridge Preserves Socket Timeout Validation, Listen Validation, And Server Bookkeeping
Bridge-provided `net.Socket` and `net.Server` behavior SHALL preserve the timeout validation, listen-address timing, and server bookkeeping that Node.js tests inspect.

#### Scenario: Sandboxed code configures socket timeouts
- **WHEN** sandboxed code calls `socket.setTimeout(timeout, callback)` on a `net.Socket`
- **THEN** invalid timeout values MUST throw Node-compatible `ERR_INVALID_ARG_TYPE` / `ERR_OUT_OF_RANGE` errors
- **AND** invalid callbacks MUST throw `ERR_INVALID_ARG_TYPE`
- **AND** refed sockets MUST emit `'timeout'` after idle periods while unrefed socket timeout timers MUST NOT keep the runtime alive

#### Scenario: Sandboxed code reads server.address() immediately after listen()
- **WHEN** sandboxed code calls `server.listen(...)` and synchronously reads `server.address()` before the `'listening'` callback runs
- **THEN** the bridge MUST already expose the bound address and assigned port, including `port: 0` ephemeral bindings

#### Scenario: Sandboxed code passes invalid listen() arguments
- **WHEN** sandboxed code calls `server.listen(...)` with invalid booleans, malformed option objects, or out-of-range ports
- **THEN** the bridge MUST throw Node-compatible `ERR_INVALID_ARG_VALUE` / `ERR_SOCKET_BAD_PORT` errors
- **AND** accepted numeric strings such as `'0'` MUST still bind successfully like Node

#### Scenario: Sandboxed code inspects server connection bookkeeping
- **WHEN** sandboxed code uses `server.getConnections(...)`, assigns `server.maxConnections`, or inspects `socket.server`
- **THEN** accepted sockets MUST increment/decrement the observable connection count with Node-compatible callback timing
- **AND** `server.getConnections(...)` MUST return the server instance
- **AND** sockets rejected because `maxConnections` is reached MUST emit a `'drop'` event carrying local and remote address metadata

#### Scenario: Sandboxed code listens on or connects to Unix path sockets
- **WHEN** sandboxed code calls `server.listen(path)`, `server.listen({ path, readableAll, writableAll })`, `net.connect(path)`, or `net.connect({ path })`
- **THEN** the bridge MUST route those sockets through the kernel `AF_UNIX` path instead of TCP port validation
- **AND** `server.address()` MUST return the bound path string for Unix listeners
- **AND** `readableAll` / `writableAll` listener options MUST be reflected in the created socket file mode bits

#### Scenario: Sandboxed code validates IP address helpers
- **WHEN** sandboxed code calls `net.isIP(...)`, `net.isIPv4(...)`, or `net.isIPv6(...)`
- **THEN** the bridge MUST match Node-compatible IPv4 / IPv6 validation for plain strings, zoned IPv6 literals, embedded IPv4 IPv6 forms, and string-coercible objects

### Requirement: Dgram Bridge Preserves Basic UDP Socket Lifecycle And Message Delivery
Bridge-provided `dgram.Socket` behavior SHALL preserve the basic bind, send, receive, close, and address semantics that Node.js tests inspect.

#### Scenario: Sandboxed code creates and binds UDP sockets
- **WHEN** sandboxed code calls `dgram.createSocket('udp4' | 'udp6')` and then `socket.bind(...)`
- **THEN** the bridge MUST return a reusable `Socket` instance
- **AND** invalid socket types MUST throw Node-compatible `ERR_SOCKET_BAD_TYPE`
- **AND** successful binds MUST emit `'listening'` and make `socket.address()` report the bound family/address/port

#### Scenario: Sandboxed code sends or receives UDP datagrams
- **WHEN** sandboxed code calls `socket.send(...)` between sandbox UDP sockets or to its own bound port
- **THEN** the bridge MUST preserve datagram message boundaries and callback byte counts
- **AND** unbound sender sockets MUST implicitly bind before sending like Node
- **AND** `'message'` listeners MUST receive a `Buffer` plus `rinfo` metadata carrying `address`, `family`, `port`, and `size`

#### Scenario: Sandboxed code closes or unrefs a UDP socket
- **WHEN** sandboxed code calls `socket.close()` or `socket.unref()` on a bridged UDP socket
- **THEN** the bridge MUST stop polling for incoming datagrams, release kernel socket ownership, and emit `'close'` with Node-compatible timing

### Requirement: Raw Loopback HTTP Bridge Preserves Pipelining And Transfer Framing
Bridge-provided loopback `net.connect()` traffic sent to sandbox `http.createServer()` listeners SHALL preserve the HTTP/1.1 framing and sequencing that Node.js raw-socket tests inspect.

#### Scenario: Sandboxed raw client pipelines multiple loopback HTTP requests
- **WHEN** sandboxed code opens a loopback `net.Socket` to a sandbox `http.Server` and writes multiple HTTP/1.1 requests on the same connection
- **THEN** the bridge MUST parse and dispatch each complete request sequentially from the shared byte stream
- **AND** leading blank lines before the next request line MUST be ignored like Node's parser
- **AND** already-buffered requests MUST still dispatch even if an earlier request destroys the socket or response

#### Scenario: Sandboxed raw client uses chunked or invalid transfer framing
- **WHEN** loopback raw HTTP traffic uses `Transfer-Encoding: chunked` or malformed transfer-encoding/chunk framing
- **THEN** valid chunked bodies MUST be de-chunked before the request listener sees them
- **AND** malformed transfer-encoding values or invalid chunk extensions MUST receive a raw `400 Bad Request` response with `Connection: close`
- **AND** `204`/`304` responses with an explicit `Transfer-Encoding: chunked` header MUST close the connection without emitting a terminating chunk body

### Requirement: HTTP Header Validation And Duplicate Header Semantics Match Node
Bridge-provided `http` behavior SHALL preserve Node.js header token validation, path validation, and duplicate header normalization for the public `http` surface and `_http_common`.

#### Scenario: Sandboxed code validates methods, paths, and header tokens
- **WHEN** sandboxed code calls `http.request()`, `http.validateHeaderName()`, `http.validateHeaderValue()`, or `_http_common` validators
- **THEN** invalid HTTP methods and header names MUST throw `ERR_INVALID_HTTP_TOKEN`
- **AND** invalid request paths MUST throw `ERR_UNESCAPED_CHARACTERS`
- **AND** invalid header values MUST throw `ERR_HTTP_INVALID_HEADER_VALUE` or `ERR_INVALID_CHAR` with Node-compatible messages

#### Scenario: Sandboxed code sends or receives duplicate headers
- **WHEN** sandboxed code sets duplicate headers such as repeated `set-cookie`
- **THEN** `IncomingMessage.headers['set-cookie']` MUST remain an array of cookie values
- **AND** non-cookie duplicate headers MUST be normalized to the Node-compatible comma-joined string form
- **AND** request-side header inspection (`getHeaderNames()`, `getRawHeaderNames()`) MUST preserve Node-compatible casing and ordering
