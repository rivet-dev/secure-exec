# runtime-execution-model Specification

## Purpose
Define the runtime execution contract for sandbox interfaces, module loading behavior, and completion semantics.
## Requirements
### Requirement: Unified Sandbox Execution Interface
The project SHALL provide a stable sandbox execution interface for both Node and browser runtimes, with each runtime exposing an `exec` path for running untrusted code and returning structured execution results. Dynamic `import()` expressions within executed code SHALL evaluate lazily at call time rather than eagerly during setup.

#### Scenario: Execute code in Node runtime
- **WHEN** a caller creates `NodeProcess` with a valid driver and invokes `exec`
- **THEN** the sandbox MUST run the provided code in an isolated execution context and return structured output for the caller

#### Scenario: Execute code in browser runtime
- **WHEN** a caller creates `BrowserSandbox` and invokes `exec`
- **THEN** the sandbox MUST execute code in a Worker-backed isolated context and return structured output for the caller

#### Scenario: Dynamic imports in executed code evaluate lazily
- **WHEN** a caller invokes `exec` with code containing `import()` expressions
- **THEN** the execution pipeline MUST defer module evaluation until the `import()` expression is reached during code execution, preserving correct side-effect ordering

### Requirement: Driver-Based Capability Composition
Runtime capabilities SHALL be composed through host-provided drivers so filesystem, network, and child-process behavior are controlled by configured adapters rather than hardcoded runtime behavior.

#### Scenario: Node process uses configured adapters
- **WHEN** `NodeProcess` is created with a driver that defines filesystem, network, and command-execution adapters
- **THEN** sandboxed operations MUST route through those adapters for capability access

#### Scenario: Omitted capability remains unavailable
- **WHEN** a capability adapter is omitted from runtime configuration
- **THEN** corresponding sandbox operations MUST be unavailable or denied by the runtime contract

### Requirement: Active Handle Completion for Async Operations
The Node runtime SHALL wait for tracked active handles before finalizing execution results so callback-driven asynchronous work can complete.

#### Scenario: Child process output completes before exec resolves
- **WHEN** sandboxed code starts a child process and registers active-handle lifecycle events
- **THEN** `exec` MUST wait for handle completion before returning final output

### Requirement: Host-to-Sandbox HTTP Verification Path
The Node runtime SHALL expose a host-side request path for sandboxed HTTP servers so loader/host code can verify server behavior externally.

#### Scenario: Host fetches sandbox server endpoint
- **WHEN** sandboxed code starts an HTTP server through the bridged server APIs
- **THEN** host code MUST be able to issue requests through the runtime network facade and receive the sandbox server response

