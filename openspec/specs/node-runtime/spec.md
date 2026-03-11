# node-runtime Specification

## Purpose
Define runtime execution contracts, module loading behavior, async completion semantics, and dynamic import behavior.
## Requirements
### Requirement: Unified Sandbox Execution Interface
The project SHALL provide a stable sandbox execution interface through `NodeRuntime`, with `exec` for running untrusted code and returning structured execution results and `run` for module-export evaluation. Runtime-driver target selection (node or browser) MUST not require separate runtime classes.

#### Scenario: Execute code in Node runtime target
- **WHEN** a caller creates `NodeRuntime` with a Node-target runtime driver and invokes `exec`
- **THEN** the sandbox MUST run the provided code in an isolated execution context and return structured output for the caller

#### Scenario: Execute code in browser runtime target
- **WHEN** a caller creates `NodeRuntime` with a browser-target runtime driver and invokes `exec`
- **THEN** execution MUST run through browser runtime primitives and return the same structured runtime result contract

#### Scenario: Run CJS module and retrieve exports
- **WHEN** a caller invokes `run()` with CommonJS code that assigns to `module.exports`
- **THEN** the result's `exports` field MUST contain the value of `module.exports`

#### Scenario: Run ESM module and retrieve namespace exports
- **WHEN** a caller invokes `run()` with ESM code that uses `export` declarations
- **THEN** the result's `exports` field MUST contain the module namespace object with all named exports and the `default` export (if declared)

#### Scenario: Run ESM module with only a default export
- **WHEN** a caller invokes `run()` with ESM code containing `export default <value>`
- **THEN** the result's `exports` field MUST be an object with a `default` property holding that value

#### Scenario: Run ESM module with named and default exports
- **WHEN** a caller invokes `run()` with ESM code containing both `export default` and named `export` declarations
- **THEN** the result's `exports` field MUST be an object containing both the `default` property and all named export properties

### Requirement: Core Runtime Executes JavaScript Without Implicit TypeScript Preprocessing
The core `NodeRuntime` SHALL treat string input as JavaScript for both Node-target and browser-target runtime drivers and SHALL NOT provide built-in TypeScript type checking or transpilation behavior.

#### Scenario: Node target rejects TypeScript-only syntax through normal execution failure
- **WHEN** a caller invokes `NodeRuntime.exec()` or `NodeRuntime.run()` with TypeScript-only syntax such as type annotations in a Node-target runtime
- **THEN** execution MUST fail through the normal JavaScript parse or evaluation path instead of applying implicit TypeScript preprocessing

#### Scenario: Browser target rejects TypeScript-only syntax through normal execution failure
- **WHEN** a caller invokes `NodeRuntime.exec()` or `NodeRuntime.run()` with TypeScript-only syntax such as type annotations in a browser-target runtime
- **THEN** execution MUST fail through the normal JavaScript parse or evaluation path instead of applying implicit TypeScript preprocessing

### Requirement: Driver-Based Capability Composition
Runtime capabilities SHALL be composed through host-provided system drivers so filesystem, network, and child-process behavior are controlled by configured adapters rather than hardcoded runtime behavior. `NodeRuntime` construction SHALL require both a capability-side `SystemDriver` and an execution-side `RuntimeDriverFactory`.

#### Scenario: Node runtime uses configured adapters with explicit runtime driver factory
- **WHEN** `NodeRuntime` is created with a `SystemDriver` that defines filesystem, network, and command-execution adapters and with a `RuntimeDriverFactory`
- **THEN** sandboxed operations MUST route through those adapters for capability access and execution MUST be created through the provided runtime driver factory

#### Scenario: Missing permissions deny capability access by default
- **WHEN** a system driver is configured without explicit permission allowance for a capability domain
- **THEN** operations in that capability domain MUST be denied by default

#### Scenario: Omitted capability remains unavailable
- **WHEN** a capability adapter is omitted from system-driver configuration
- **THEN** corresponding sandbox operations MUST be unavailable or denied by the runtime contract

#### Scenario: Runtime process/os config remains system-driver-owned
- **WHEN** a caller provides runtime `process` and `os` configuration on the system driver
- **THEN** `NodeRuntime` MUST source and inject that configuration into runtime-driver creation

### Requirement: Active Handle Completion for Async Operations
The Node runtime SHALL wait for tracked active handles before finalizing execution results so callback-driven asynchronous work can complete.

#### Scenario: Child process output completes before exec resolves
- **WHEN** sandboxed code starts a child process and registers active-handle lifecycle events
- **THEN** `exec` MUST wait for handle completion before returning final output

### Requirement: Circular-Safe Console Output Capture
The runtime SHALL process console arguments without throwing on circular structures, and SHALL avoid retaining console output in execution-result buffers. If a log-stream hook is configured, serialized log events MUST be emitted to the hook without persistent runtime buffering.

#### Scenario: Circular console value with default logging mode
- **WHEN** sandboxed code logs an object containing circular references and no log hook is configured
- **THEN** execution MUST NOT throw due to log serialization and runtime result capture buffers MUST remain empty

#### Scenario: Circular console value with streaming hook configured
- **WHEN** sandboxed code logs an object containing circular references and a log hook is configured
- **THEN** the hook MUST receive a serialized event containing circular-safe markers (for example `[Circular]`) and execution MUST continue

### Requirement: Bounded Console Serialization Work
Console argument serialization SHALL enforce bounded work before log emission, including the streaming-hook path, by applying depth/key/array/output limits with deterministic truncation markers.

#### Scenario: Deep object logging is bounded for streaming hooks
- **WHEN** sandboxed code logs an object exceeding configured depth limits and a log hook is configured
- **THEN** emitted log payloads MUST include deterministic depth truncation markers instead of unbounded traversal

#### Scenario: Large object logging is bounded for streaming hooks
- **WHEN** sandboxed code logs an object/array exceeding configured key or element budgets and a log hook is configured
- **THEN** emitted log payloads MUST include deterministic truncation markers and MUST NOT require unbounded host-runtime serialization work

#### Scenario: Oversized serialized payload is bounded before emission
- **WHEN** serialized console output exceeds configured output-length budgets
- **THEN** emitted log payloads MUST be truncated with deterministic suffix markers and runtime MUST NOT accumulate full unbounded output in memory

### Requirement: Host-to-Sandbox HTTP Verification Path
The Node runtime SHALL expose a host-side request path for sandboxed HTTP servers so loader/host code can verify server behavior externally.

#### Scenario: Host fetches sandbox server endpoint
- **WHEN** sandboxed code starts an HTTP server through the bridged server APIs
- **THEN** host code MUST be able to issue requests through the runtime network facade and receive the sandbox server response

### Requirement: Lazy Evaluation of Dynamic Imports
Dynamically imported modules (`import()`) SHALL be evaluated only when the import expression is reached during user code execution, not during the precompilation phase.

#### Scenario: Side effects execute at import call time
- **WHEN** user code logs `before`, awaits `import("./side-effect")`, and then logs `after`, where `./side-effect` logs during evaluation, with a log hook configured
- **THEN** hook events MUST show `before`, module side effects, and `after` in that order

#### Scenario: Conditional dynamic import skips unused branch
- **WHEN** user code contains `if (false) { await import("./unused"); }` where `./unused` logs during evaluation, with a log hook configured
- **THEN** no hook event from `./unused` evaluation MUST be emitted

#### Scenario: Repeated dynamic import returns same module without re-evaluation
- **WHEN** user code calls `await import("./mod")` twice, where `./mod` increments a global counter on evaluation
- **THEN** the counter MUST equal 1 after both imports, and both calls MUST return the same module namespace

### Requirement: Precompilation Without Evaluation
The precompilation phase SHALL resolve and compile dynamic import targets but MUST NOT instantiate or evaluate them before user code reaches the corresponding `import()` expression.

#### Scenario: Precompiled module has no side effects before user code
- **WHEN** a module targeted by a static `import("./target")` specifier logs during evaluation and a log hook is configured
- **THEN** no hook event from that module SHALL be emitted before user code begins executing

#### Scenario: Dynamic import side effects preserve surrounding user-code order
- **WHEN** user code logs `before`, awaits `import("./side-effect")`, and then logs `after`, where `./side-effect` logs during evaluation, with a log hook configured
- **THEN** hook events MUST preserve the order `before`, module side effects, `after`

### Requirement: Async Dynamic Import Resolution
The `__dynamicImport` bridge function SHALL return a Promise that resolves to the module namespace, performing instantiation and evaluation on demand.

#### Scenario: Dynamic import resolves to module namespace
- **WHEN** user code calls `const m = await import("./mod")` where `./mod` exports `{ value: 42 }` as default
- **THEN** `m.default` MUST equal `{ value: 42 }`

#### Scenario: Dynamic import of non-existent module rejects
- **WHEN** user code calls `await import("./nonexistent")`
- **THEN** the returned Promise MUST reject with an error indicating the module cannot be resolved

### Requirement: Configurable CPU Time Limit for Node Runtime Execution
The Node runtime MUST support an optional `cpuTimeLimitMs` execution budget for sandboxed code and MUST enforce it as a shared per-execution deadline across runtime calls that execute user-controlled code.

#### Scenario: Infinite loop is interrupted by configured CPU limit
- **WHEN** a caller configures `cpuTimeLimitMs` and executes code that does not terminate (for example `while(true){}`)
- **THEN** the runtime MUST interrupt execution once the configured budget is exhausted and return a timeout failure contract

#### Scenario: Shared deadline is enforced across multiple execution phases
- **WHEN** a caller configures `cpuTimeLimitMs` and execution spends time across multiple user-code phases (for example module evaluation plus later active-handle waiting)
- **THEN** the runtime MUST apply one shared budget across phases rather than resetting timeout per phase

#### Scenario: Timeout contract is deterministic
- **WHEN** execution exceeds a configured `cpuTimeLimitMs`
- **THEN** the runtime MUST return `code` `124` and include `CPU time limit exceeded` in stderr

#### Scenario: Unset CPU limit preserves existing runtime behavior
- **WHEN** a caller does not configure `cpuTimeLimitMs`
- **THEN** the runtime MUST preserve existing no-timeout behavior for execution duration control

### Requirement: Isolate Recovery After Timeout
When execution exceeds a configured CPU budget, the runtime MUST recycle isolate state before serving subsequent executions.

#### Scenario: Timeout execution does not leak state into next run
- **WHEN** an execution times out due to `cpuTimeLimitMs`
- **THEN** the next execution on the same `NodeRuntime` instance MUST start from a fresh isolate state

### Requirement: Optional Timing Side-Channel Mitigation Profile
The Node runtime MUST provide timing mitigation controls that reduce high-resolution timing signals exposed to sandboxed code, with security-first default behavior.

#### Scenario: Default timing mode freezes execution clocks
- **WHEN** a caller executes code with `timingMitigation` unset
- **THEN** repeated reads of `Date.now()`, `performance.now()`, and `process.hrtime()` within the same execution MUST return deterministic frozen-time values

#### Scenario: Compatibility mode restores Node-like clocks
- **WHEN** a caller executes code with `timingMitigation` set to `"off"`
- **THEN** `Date.now()` and `performance.now()` MUST advance with real execution time semantics

#### Scenario: Default timing mode removes shared-memory timing primitive
- **WHEN** a caller executes code with `timingMitigation` unset
- **THEN** `SharedArrayBuffer` MUST NOT be available on `globalThis`

### Requirement: Package Metadata-Aware Module Classification
The runtime MUST classify JavaScript modules using Node-compatible metadata rules (extension plus nearest `package.json` module type), not source-token heuristics alone.

#### Scenario: .js under type module is treated as ESM
- **WHEN** a package has `package.json` with `"type": "module"` and sandboxed code loads `./index.js`
- **THEN** the runtime MUST evaluate the file as ESM semantics (including `import.meta` availability and ESM export behavior)

#### Scenario: .js under type commonjs is treated as CJS
- **WHEN** a package has `package.json` with `"type": "commonjs"` (or no ESM override) and sandboxed code loads `./index.js` via `require`
- **THEN** the runtime MUST evaluate the file as CommonJS and return `module.exports`

### Requirement: Dynamic Import Error Fidelity
Dynamic `import()` handling MUST preserve Node-like failure behavior by surfacing ESM compile/instantiate/evaluate errors directly and avoiding unintended fallback masking.

#### Scenario: ESM syntax failure rejects without require fallback masking
- **WHEN** user code executes `await import("./broken.mjs")` and `./broken.mjs` contains invalid ESM syntax
- **THEN** the Promise MUST reject with an ESM compile/evaluation error for that module rather than a fallback `require()`-style resolution error

#### Scenario: ESM runtime failure rejects with module error
- **WHEN** user code executes `await import("./throws.mjs")` and the imported module throws during evaluation
- **THEN** the Promise MUST reject with that evaluation failure and MUST NOT re-route to CommonJS fallback

### Requirement: CJS Namespace Shape for Dynamic Import
When dynamic `import()` resolves a CommonJS module, the returned namespace object MUST preserve Node-compatible default semantics for `module.exports` values across object, function, primitive, and null exports.

#### Scenario: Primitive CommonJS export is accessible as default
- **WHEN** sandboxed code executes `await import("./primitive.cjs")` and `primitive.cjs` sets `module.exports = 7`
- **THEN** the namespace result MUST expose `default === 7` without throwing during namespace construction

#### Scenario: Null CommonJS export is accessible as default
- **WHEN** sandboxed code executes `await import("./nullish.cjs")` and `nullish.cjs` sets `module.exports = null`
- **THEN** the namespace result MUST expose `default === null` without throwing during namespace construction

### Requirement: Host-Side Parse Boundaries Protect Runtime Stability
The Node runtime MUST validate isolate-originated serialized payload size before every host-side `JSON.parse` call that consumes isolate-originated data, and MUST fail requests that exceed the configured limit.

#### Scenario: Oversized serialized payload is rejected before parsing
- **WHEN** an isolate-originated payload exceeds the runtime JSON parse size limit
- **THEN** the runtime MUST fail the operation with a deterministic overflow error and MUST NOT call `JSON.parse` on that payload

#### Scenario: All isolate-originated parse entry points are guarded
- **WHEN** host runtime code in `packages/secure-exec/src/index.ts` parses isolate-originated JSON payloads for bridged operations
- **THEN** each parse entry point MUST apply the same pre-parse size validation before invoking `JSON.parse`

#### Scenario: In-limit serialized payload preserves existing behavior
- **WHEN** an isolate-originated payload is within the runtime JSON parse size limit and JSON-valid
- **THEN** the runtime MUST parse and process the request using existing bridge/runtime behavior

### Requirement: Boundary Overflow Errors Are Deterministic and Non-Fatal to Host
When boundary payload validation fails for isolate-originated data, runtime behavior MUST produce a deterministic failure contract without crashing the host process.

#### Scenario: Boundary overflow returns stable failure contract
- **WHEN** a base64 transfer or isolate-originated JSON payload exceeds configured runtime limits
- **THEN** execution MUST return a stable error contract for the operation and MUST NOT terminate the host process

### Requirement: Runtime Parse Limits Use UTF-8 Serialized Byte Length
The Node runtime MUST measure isolate-originated JSON payload size using UTF-8 byte length of the serialized JSON text before host-side parsing.

#### Scenario: JSON parse size guard uses UTF-8 byte length
- **WHEN** the runtime evaluates whether isolate-originated JSON input exceeds the parse limit
- **THEN** it MUST compute size from the UTF-8 byte length of the serialized payload string before calling `JSON.parse`

### Requirement: Payload Limits Are Host-Configurable Within Safety Bounds
The Node runtime MUST allow host configuration of isolate-boundary payload limits while enforcing bounded minimum/maximum safety constraints.

#### Scenario: Host configures in-range payload limits
- **WHEN** a host creates `NodeRuntime` with payload-limit overrides within runtime safety bounds
- **THEN** the runtime MUST apply those configured limits for base64 transfer and isolate-originated JSON parse checks

#### Scenario: Host configures out-of-range payload limits
- **WHEN** a host provides payload-limit overrides outside runtime safety bounds
- **THEN** `NodeRuntime` construction MUST fail with a deterministic validation error and MUST NOT disable payload-size enforcement

### Requirement: Runtime Bootstrap MUST Harden Custom Non-Stdlib Globals
Runtime bootstrap paths that expose custom non-stdlib globals into the isolate MUST install those bindings using hardened descriptors (`writable: false`, `configurable: false`) by default.

#### Scenario: Runtime exposes custom import or bridge coordination binding
- **WHEN** runtime setup publishes a custom non-stdlib global used for module loading or bridge coordination
- **THEN** that global binding MUST be non-writable and non-configurable unless explicitly classified as required mutable runtime state

### Requirement: Runtime MUST Maintain Classified Custom-Global Inventory
Runtime and bridge custom non-stdlib globals exposed into the isolate MUST be tracked in a maintained inventory that classifies each global as hardened or intentionally mutable runtime state.

#### Scenario: New custom global exposure is introduced
- **WHEN** a runtime or bridge change introduces a new custom non-stdlib global on `globalThis`
- **THEN** that global MUST be added to the inventory with a classification and rationale in the same change

### Requirement: Runtime Mutable Global State MUST Be Explicitly Classified
Runtime globals that remain mutable for correct execution behavior MUST be explicitly classified as mutable runtime state and MUST NOT be hardened by default.

#### Scenario: Runtime updates per-execution mutable state
- **WHEN** execution setup updates mutable runtime-state globals (for example per-run module or stdin state)
- **THEN** those updates MUST continue to work and the mutable classification for those globals MUST be intentional and documented

### Requirement: Runtime Filesystem Metadata Access Is Driver-Native
Sandbox runtime filesystem metadata operations MUST use driver metadata APIs and MUST NOT derive metadata by reading full file contents.

#### Scenario: Stat call on large file does not require content read
- **WHEN** sandboxed code performs `stat` on a large file path
- **THEN** the runtime MUST resolve metadata via driver `stat` behavior and MUST NOT read the file body to compute size/type

#### Scenario: Exists check uses metadata/access path
- **WHEN** sandboxed code performs an existence check on a file or directory path
- **THEN** the runtime MUST use metadata/access operations and MUST NOT probe existence by loading entire file contents

### Requirement: Runtime Directory Type Enumeration Avoids Per-Entry Re-Probing
When sandboxed code requests directory entries with type information, the runtime MUST return type metadata from one directory traversal and MUST NOT perform an additional directory probe per entry.

#### Scenario: Mixed directory listing returns types without N+1 probes
- **WHEN** a directory contains both files and subdirectories and sandboxed code requests typed entries
- **THEN** the runtime MUST return each entry with correct `isDirectory` information without issuing per-entry `readDir` probes

### Requirement: Runtime Rename Delegates to Driver Rename Semantics
Runtime rename behavior MUST delegate to the active driver `rename` operation and MUST NOT emulate rename with copy-write-delete in the default runtime path.

#### Scenario: Atomic rename path is preserved when supported
- **WHEN** the active driver supports atomic rename semantics
- **THEN** sandboxed `rename` MUST complete through that atomic driver operation

#### Scenario: Unsupported atomic rename is explicit and deterministic
- **WHEN** the active driver cannot provide atomic rename semantics
- **THEN** the runtime MUST expose deterministic documented behavior for that driver and MUST NOT silently perform copy-write-delete emulation as if it were atomic

### Requirement: Runtime Package Identity Uses Secure-Exec
The runtime SHALL publish its execution interface from the `secure-exec` package name, and runtime implementation sources SHALL reside under `packages/secure-exec` in the workspace.

#### Scenario: Consumers import runtime APIs from secure-exec
- **WHEN** a Node or browser consumer imports runtime APIs
- **THEN** the documented and supported package specifier MUST be `secure-exec`

#### Scenario: Runtime source path is canonicalized to secure-exec
- **WHEN** contributors update runtime implementation files
- **THEN** those files MUST live under `packages/secure-exec` rather than the legacy runtime package path

### Requirement: Projected Modules MUST Exclude Native Addons
Module projection and overlay-based loading SHALL reject native addon artifacts (`.node`) so projected dependency execution remains within supported sandbox module formats.

#### Scenario: Overlay dependency attempts to load native addon file
- **WHEN** sandboxed code or package runtime behavior attempts to load a `.node` artifact from `/app/node_modules`
- **THEN** runtime MUST fail deterministically and MUST NOT execute native addon code

### Requirement: Isolate-Executed Bootstrap Sources MUST Be Static TypeScript Modules
Any source code evaluated inside the isolate for runtime/bootstrap setup MUST originate from static files under `packages/secure-exec/isolate-runtime/src/` and MUST be tracked as normal TypeScript source with inject entrypoints rooted in `packages/secure-exec/isolate-runtime/src/inject/`.

#### Scenario: Runtime injects require and bridge bootstrap code
- **WHEN** secure-exec prepares isolate bootstrap code for `require` setup, bridge setup, or related runtime helpers
- **THEN** the injected source MUST come from static isolate-runtime module files rather than ad-hoc inline source assembly in host runtime files

#### Scenario: New isolate injection path is introduced
- **WHEN** a change adds a new host-to-isolate code injection path
- **THEN** the injected code MUST be added as a static `.ts` file under `packages/secure-exec/isolate-runtime/src/inject/` in the same change

#### Scenario: Existing template-generated bootstrap helper is migrated
- **WHEN** secure-exec migrates helpers such as `getRequireSetupCode`, `getBridgeWithConfig`, or `createInitialBridgeGlobalsCode`
- **THEN** the executable isolate source for those helpers MUST come from static isolate-runtime files rather than template-literal code builders in host runtime modules

### Requirement: Isolate-Runtime Compilation MUST Be a Build Prerequisite
The secure-exec package build MUST execute isolate-runtime compilation before producing final runtime artifacts, and build orchestration MUST treat isolate-runtime compilation and isolate-runtime typecheck as explicit validation dependencies.

#### Scenario: Package build runs with clean outputs
- **WHEN** `packages/secure-exec` is built from a clean workspace
- **THEN** the build MUST run a dedicated isolate-runtime compile step before final package build output is produced

#### Scenario: Turbo build graph resolves secure-exec build dependencies
- **WHEN** turbo runs `build` for secure-exec
- **THEN** the task graph MUST enforce `build:isolate-runtime` as a dependency of secure-exec `build`

#### Scenario: Isolate runtime source typing regresses
- **WHEN** isolate-runtime inject/common source introduces type errors against the declared runtime global contracts
- **THEN** repository type validation MUST fail before changes are considered complete

### Requirement: Isolate Injection Assembly MUST Avoid Template-Literal Source Synthesis
Host runtime code paths that inject executable source into the isolate MUST NOT construct those executable payloads via template-literal code generation.

#### Scenario: Runtime passes execution-specific configuration into isolate
- **WHEN** secure-exec needs to pass per-execution values (for example process, os, cwd, or module context) into isolate bootstrap logic
- **THEN** it MUST pass values through structured data channels consumed by static isolate-runtime source rather than interpolating executable source templates

#### Scenario: Isolate bootstrap helpers are updated
- **WHEN** contributors modify helpers used to inject source into the isolate
- **THEN** the resulting injected executable source MUST remain defined by static isolate-runtime files without template-literal-generated code bodies

### Requirement: Runtime MUST Enforce No-Regressions For Template-Literal Injection
The secure-exec runtime repository MUST include automated verification that fails when template-literal executable source generation is introduced in host runtime isolate-injection paths.

#### Scenario: CI validates isolate injection source policy
- **WHEN** runtime verification is executed for secure-exec
- **THEN** checks MUST fail if host runtime isolate-injection paths introduce new template-literal executable source builders

### Requirement: Runtime Default Logging Mode Drops Console Output
Runtime logging SHALL be drop-on-floor by default: if no explicit log hook is configured, console emissions MUST NOT be retained in runtime-managed execution buffers or surfaced through legacy result output fields.

#### Scenario: Exec without log hook does not capture console output
- **WHEN** sandboxed code emits `console.log` and `console.error` and runtime executes without a configured log hook
- **THEN** execution MUST complete without buffered log capture and execution results MUST NOT expose buffered `stdout`/`stderr` fields

### Requirement: Runtime Exposes Optional Streaming Log Hook
The Node runtime SHALL expose an optional host hook for streaming stdio events (`stdout` and `stderr` channels) in emission order, without retaining runtime-owned history.

#### Scenario: Hook receives ordered events across stdout and stderr channels
- **WHEN** sandboxed code emits interleaved `console.log`, `console.warn`, and `console.error` calls with a configured hook
- **THEN** the hook MUST receive ordered events with channel metadata matching the original emission sequence

#### Scenario: Hook-enabled runtime still avoids buffered accumulation
- **WHEN** high-volume logging is emitted with a configured hook
- **THEN** secure-exec runtime MUST stream events to the hook without accumulating unbounded per-execution log buffers in host memory

### Requirement: Always-On CWD Node-Modules Overlay MUST Be Scoped and Read-Only
The Node runtime SHALL always expose `/app/node_modules` as a read-only overlay sourced from `<overlay.cwd>/node_modules` (default `<overlay.cwd> = process.cwd()`), independent of whether a base `VirtualFileSystem` is mounted.

#### Scenario: Overlay is available without base filesystem adapter
- **WHEN** a caller creates `NodeRuntime` without a base filesystem adapter and host `<overlay.cwd>/node_modules` contains package `left-pad`
- **THEN** sandboxed code requiring `left-pad` from `/app` MUST resolve through `/app/node_modules` overlay content

#### Scenario: Overlay remains available when base filesystem mount differs
- **WHEN** a caller mounts a base filesystem rooted outside `/app` and host `<overlay.cwd>/node_modules` contains package `zod`
- **THEN** sandboxed code requiring `zod` from `/app` MUST resolve via `/app/node_modules` overlay without requiring base filesystem remounting

#### Scenario: Overlay path escaping configured node_modules root is rejected
- **WHEN** an overlay-backed read resolves to a canonical host path outside canonical `<overlay.cwd>/node_modules`
- **THEN** runtime MUST fail with a deterministic out-of-scope error and MUST NOT expose the escaped path to sandbox execution

### Requirement: Runtime Module Resolution MUST Use Unified Filesystem Access
Node runtime import and require resolution SHALL use one shared runtime filesystem interface and MUST NOT branch into a separate "filesystem unavailable" module-loading path when the overlay-backed driver is active.

#### Scenario: Bare package import resolves through shared runtime filesystem
- **WHEN** sandboxed code executes `require("lodash")` with overlay-enabled runtime filesystem
- **THEN** the resolver MUST perform package resolution through the shared runtime filesystem interface rather than a separate host-resolution fallback path

#### Scenario: ESM dynamic import resolves through shared runtime filesystem
- **WHEN** sandboxed code executes `await import("zod")` with overlay-enabled runtime filesystem
- **THEN** dynamic import resolution and module loading MUST use the same shared runtime filesystem interface used by CommonJS resolution

### Requirement: Runtime Execution Result Contract Is Output-Buffer Free
The Node runtime SHALL use an execution result contract that omits runtime-managed output capture fields and relies on explicit hooks/metadata instead.

#### Scenario: Result typing excludes legacy stdout and stderr fields
- **WHEN** runtime API result types are consumed from `secure-exec`
- **THEN** TypeScript definitions for execution results MUST NOT include `stdout` or `stderr` properties

### Requirement: Browser Runtime Driver Rejects Node-Only Execution Options
Browser-target runtime-driver construction MUST reject Node-specific runtime options that are unsupported in browser execution.

#### Scenario: Browser runtime rejects Node-only execution controls
- **WHEN** a caller creates `NodeRuntime` with a browser runtime-driver factory and passes any of `memoryLimit`, `cpuTimeLimitMs`, `timingMitigation`, or payload-limit overrides
- **THEN** construction MUST fail with a deterministic validation error indicating unsupported browser runtime options

#### Scenario: Browser runtime accepts baseline cross-target options
- **WHEN** a caller creates `NodeRuntime` with a browser runtime-driver factory using only cross-target options (for example `systemDriver`, `runtimeDriverFactory`, and optional `onStdio`)
- **THEN** runtime construction MUST succeed and preserve runtime execution behavior

### Requirement: BrowserSandbox API Surface Is Removed
The runtime contract MUST expose browser execution through `NodeRuntime` driver composition and MUST NOT require a separate `BrowserSandbox` execution class.

#### Scenario: Runtime entrypoint is unified by driver target
- **WHEN** a caller needs browser execution behavior
- **THEN** they MUST construct `NodeRuntime` with browser system/runtime drivers rather than a separate browser sandbox runtime class
