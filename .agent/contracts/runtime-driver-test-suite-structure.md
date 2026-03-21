# runtime-driver-test-suite-structure Specification

## Purpose
Define canonical test layout for runtime-driver integration coverage, shared suite execution rules, and kernel test patterns for unit and cross-runtime testing.
## Requirements
### Requirement: Runtime Test Suite SHALL Use A Canonical Flat Layout
Secure-exec runtime-driver integration coverage MUST use the canonical filesystem layout:

- `packages/secure-exec/tests/test-suite.test.ts`
- `packages/secure-exec/tests/test-suite/{name}.ts`
- `packages/secure-exec/tests/exec-driver/{name}.test.ts`
- `packages/secure-exec/tests/runtime-driver/{name}.test.ts`
- `packages/secure-exec-core/test/kernel/{name}.test.ts` (kernel unit tests)
- `packages/secure-exec/tests/kernel/{name}.test.ts` (kernel cross-runtime integration tests)

#### Scenario: Shared matrix entrypoint exists at canonical path
- **WHEN** contributors add or update shared runtime-driver suite orchestration
- **THEN** orchestration MUST live in `packages/secure-exec/tests/test-suite.test.ts`

#### Scenario: Shared suites are flat under test-suite folder
- **WHEN** contributors add or update shared matrix-applied runtime suites
- **THEN** each shared suite MUST live directly under `packages/secure-exec/tests/test-suite/` as `*.ts`

#### Scenario: Driver-specific suites are separated by driver responsibility
- **WHEN** assertions cannot be shared across all compatible driver pairs
- **THEN** execution-driver-specific assertions MUST live under `packages/secure-exec/tests/exec-driver/*.test.ts` and runtime-driver-specific assertions MUST live under `packages/secure-exec/tests/runtime-driver/*.test.ts`

### Requirement: Shared Runtime Suites SHALL Execute Across Compatible Driver Pairs Without Exclusions
The shared runtime test suite MUST define a compatibility matrix of `(execution driver, runtime driver)` pairs and MUST execute the same shared suite registration for every compatible pair.

#### Scenario: Compatible pair runs full shared suite set
- **WHEN** a pair is marked compatible in `test-suite.test.ts`
- **THEN** all shared suites registered from `packages/secure-exec/tests/test-suite/*.ts` MUST execute for that pair

#### Scenario: Incompatible pair is excluded deterministically
- **WHEN** a pair is not supported by runtime contracts
- **THEN** the pair MUST be omitted only through explicit compatibility-matrix rules in `test-suite.test.ts`

#### Scenario: Pair-specific suite filtering is disallowed
- **WHEN** shared suites run for a compatible pair
- **THEN** the test harness MUST NOT skip or filter shared suites based on specific driver names

### Requirement: Shared Suite Registration SHALL Be Deterministic
Shared suite registration order in the matrix entrypoint MUST be explicit and stable.

#### Scenario: Shared suites are imported explicitly
- **WHEN** shared suites are registered from `test-suite.test.ts`
- **THEN** they MUST be imported and invoked in deterministic source order rather than filesystem discovery

### Requirement: Kernel Unit Tests SHALL Use MockRuntimeDriver In Kernel Package
Kernel unit tests that validate kernel subsystem behavior (VFS, FD table, process table, device layer, pipe manager, command registry, permissions) SHALL reside under `packages/secure-exec-core/test/kernel/` and use MockRuntimeDriver for driver interactions.

#### Scenario: Kernel unit tests live in kernel package
- **WHEN** contributors add or update tests for kernel subsystem behavior
- **THEN** those tests MUST reside under `packages/secure-exec-core/test/kernel/` as `*.test.ts` files

#### Scenario: Kernel unit tests use MockRuntimeDriver
- **WHEN** kernel unit tests need to validate spawn/exec orchestration or command registration
- **THEN** they MUST use a MockRuntimeDriver (from `packages/secure-exec-core/test/kernel/helpers.ts`) that implements the RuntimeDriver interface with controllable behavior, rather than requiring real runtime drivers

#### Scenario: Kernel unit tests validate subsystem invariants independently
- **WHEN** kernel unit tests validate FD table, process table, pipe manager, or device layer behavior
- **THEN** each subsystem MUST be testable in isolation without mounting a full kernel or real RuntimeDriver

### Requirement: Cross-Runtime Integration Tests SHALL Live Under Secure-Exec Kernel Directory
Cross-runtime integration tests that exercise kernel-mediated multi-driver scenarios SHALL reside under `packages/secure-exec/tests/kernel/` and test behavior that spans multiple mounted RuntimeDrivers.

#### Scenario: Cross-runtime tests use real RuntimeDrivers
- **WHEN** integration tests validate cross-runtime interactions (e.g., WasmVM piped to Node, Python calling Node commands)
- **THEN** those tests MUST mount real RuntimeDrivers into a kernel and exercise the full kernel spawn/pipe/process lifecycle

#### Scenario: Cross-runtime tests share helpers with kernel-aware TestContext
- **WHEN** multiple cross-runtime integration tests need kernel setup/teardown
- **THEN** shared helpers MUST reside in `packages/secure-exec/tests/kernel/helpers.ts` and provide kernel creation, driver mounting, and disposal utilities

#### Scenario: Cross-runtime tests cover VFS consistency across drivers
- **WHEN** integration tests validate that file writes from one driver are visible to another
- **THEN** those tests MUST reside under `packages/secure-exec/tests/kernel/` and verify that VFS state is shared across all mounted drivers

