## MODIFIED Requirements

### Requirement: Unified Sandbox Execution Interface
The project SHALL provide a stable sandbox execution interface for both Node and browser runtimes, with each runtime exposing an `exec` path for running untrusted code and returning structured execution results, and a `run` path that returns module exports.

#### Scenario: Execute code in Node runtime
- **WHEN** a caller creates `NodeProcess` with a valid driver and invokes `exec`
- **THEN** the sandbox MUST run the provided code in an isolated execution context and return structured output for the caller

#### Scenario: Execute code in browser runtime
- **WHEN** a caller creates `BrowserSandbox` and invokes `exec`
- **THEN** the sandbox MUST execute code in a Worker-backed isolated context and return structured output for the caller

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
