## MODIFIED Requirements

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
