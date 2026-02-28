## ADDED Requirements

### Requirement: Isolate-Executed Bootstrap Sources MUST Be Static TypeScript Modules
Any source code evaluated inside the isolate for runtime/bootstrap setup MUST originate from static files under `packages/secure-exec/isolate-runtime/` and MUST be tracked as normal TypeScript source.

#### Scenario: Runtime injects require and bridge bootstrap code
- **WHEN** secure-exec prepares isolate bootstrap code for `require` setup, bridge setup, or related runtime helpers
- **THEN** the injected source MUST come from static isolate-runtime module files rather than ad-hoc inline source assembly in host runtime files

#### Scenario: New isolate injection path is introduced
- **WHEN** a change adds a new host-to-isolate code injection path
- **THEN** the injected code MUST be added as a static `.ts` file under `packages/secure-exec/isolate-runtime/` in the same change

#### Scenario: Existing template-generated bootstrap helper is migrated
- **WHEN** secure-exec migrates helpers such as `getRequireSetupCode`, `getBridgeWithConfig`, or `createInitialBridgeGlobalsCode`
- **THEN** the executable isolate source for those helpers MUST come from static isolate-runtime files rather than template-literal code builders in host runtime modules

### Requirement: Isolate-Runtime Compilation MUST Be a Build Prerequisite
The secure-exec package build MUST execute isolate-runtime compilation before producing final runtime artifacts, and build orchestration MUST treat isolate-runtime compilation as an explicit dependency.

#### Scenario: Package build runs with clean outputs
- **WHEN** `packages/secure-exec` is built from a clean workspace
- **THEN** the build MUST run a dedicated isolate-runtime compile step before final package build output is produced

#### Scenario: Turbo build graph resolves secure-exec build dependencies
- **WHEN** turbo runs `build` for secure-exec
- **THEN** the task graph MUST enforce `build:isolate-runtime` as a dependency of secure-exec `build`

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
