# compatibility-governance Specification

## Purpose
Define compatibility and tracking obligations for secure-exec changes.
## Requirements
### Requirement: TypeScript Tooling Split Must Stay Documented
Changes that add, remove, or materially alter TypeScript compile/typecheck behavior MUST update core runtime docs and companion tooling docs in the same change so the JS-only core/runtime boundary stays explicit.

#### Scenario: Core runtime TypeScript handling changes
- **WHEN** the core runtime adds or removes implicit TypeScript preprocessing behavior
- **THEN** `docs/quickstart.mdx`, `docs/api-reference.mdx`, `docs/runtimes/node.mdx`, `docs/node-compatability.mdx`, `docs-internal/arch/overview.md`, and `docs-internal/friction.md` MUST be updated in the same change

#### Scenario: Companion TypeScript tooling API changes
- **WHEN** the public API of the companion TypeScript tooling package changes
- **THEN** `docs/quickstart.mdx` and `docs/api-reference.mdx` MUST be updated in the same change so project/source helper semantics remain accurate

### Requirement: Maintain Node Stdlib Compatibility Matrix
Changes affecting bridged or polyfilled Node APIs MUST keep `docs/node-compatability.mdx` synchronized with the actual runtime surface, including supported, limited, and unsupported modules/APIs. Every module entry in the matrix MUST include an explicit support-tier classification (Bridge, Polyfill, Stub, Deferred, or Unsupported) as defined by the `node-stdlib` spec. The page MUST include a top-of-page target Node version statement.

#### Scenario: Bridge API surface changes
- **WHEN** a change adds, removes, or materially alters bridged Node API behavior
- **THEN** the compatibility matrix page at `docs/node-compatability.mdx` MUST be updated in the same change to reflect the new runtime contract

#### Scenario: Legacy internal matrix path appears anywhere in repository docs/spec sources
- **WHEN** a repository document or spec source references the legacy internal stdlib compatibility document
- **THEN** the reference MUST be replaced with `docs/node-compatability.mdx` before the change is considered complete

#### Scenario: Target Node version callout is missing
- **WHEN** `docs/node-compatability.mdx` is updated
- **THEN** the page MUST retain an explicit target Node version statement at the top

### Requirement: Node Compatibility Target Version Tracks Test Type Baseline
The runtime compatibility target MUST align with the `@types/node` package major version used to validate secure-exec tests and type checks. Compatibility documentation and spec references MUST describe the same target major Node line.

#### Scenario: Current baseline is declared for contributors and users
- **WHEN** this requirement is applied for the current dependency baseline
- **THEN** compatibility docs and governance text MUST declare Node `22.x` as the active target line derived from `@types/node` `22.x`

#### Scenario: `@types/node` target major is upgraded
- **WHEN** the workspace intentionally upgrades `@types/node` to a new major version used by secure-exec validation
- **THEN** the same change MUST update `docs/node-compatability.mdx` and related compatibility-governance references to the new target Node major line

#### Scenario: Compatibility target is documented
- **WHEN** compatibility requirements or docs declare a target Node version
- **THEN** the declared target MUST match the active `@types/node` major version used by secure-exec validation workflows

### Requirement: Maintain Secure-Exec Follow-Up Backlog
Work touching secure-exec behavior SHALL keep follow-up work tracked in OpenSpec change artifacts, including checking off completed tasks and adding newly discovered actionable items as new tasks or follow-up changes.

#### Scenario: Implementation resolves tracked backlog work
- **WHEN** a change completes an item already tracked in OpenSpec tasks
- **THEN** the item MUST be marked complete with scope-consistent notes

#### Scenario: Implementation uncovers new follow-up work
- **WHEN** development reveals a new actionable gap not currently tracked
- **THEN** a new OpenSpec task or follow-up change MUST be added immediately with enough detail to guide follow-up work

### Requirement: Maintain Friction Log for Development Issues
Unexpected issues, workarounds, and integration friction encountered during secure-exec development MUST be recorded in `docs-internal/friction.md`, and resolved items MUST be marked as resolved with fix notes.

#### Scenario: Workaround is introduced during implementation
- **WHEN** a change requires a workaround to unblock progress
- **THEN** the workaround and its impact MUST be logged in the friction file

#### Scenario: Previously logged issue is fixed
- **WHEN** a known friction item is resolved
- **THEN** its log entry MUST be updated to indicate resolution and summarize the fix

### Requirement: Run Bridge Type Conformance Tests After Bridge Changes
Any change to files under `packages/secure-exec/src/bridge` MUST run bridge type conformance checks via `pnpm run check-types:test` in `packages/secure-exec` before completion.

#### Scenario: Bridge source file is modified
- **WHEN** a commit modifies one or more files in `packages/secure-exec/src/bridge`
- **THEN** `pnpm run check-types:test` MUST be executed and failures MUST be addressed before the change is considered complete

### Requirement: Compatibility Project Matrix Uses Black-Box Node Fixtures
Compatibility validation for secure-exec SHALL execute fixture projects that behave as ordinary Node projects, with no sandbox-aware code paths.

#### Scenario: Fixture uses only Node-project interfaces
- **WHEN** a fixture is added under the compatibility project matrix
- **THEN** it MUST define a standard Node project structure (`package.json` + source entrypoint) and MUST NOT import sandbox runtime internals directly

#### Scenario: Runtime remains opaque to fixture identity
- **WHEN** secure-exec executes a compatibility fixture
- **THEN** runtime behavior MUST NOT branch on fixture name, fixture path, or test-specific markers

### Requirement: Compatibility Matrix Enforces Differential Parity Checks
The compatibility project matrix SHALL execute each fixture in host Node and in secure-exec, then compare normalized externally visible outcomes.

#### Scenario: Pass fixture requires parity
- **WHEN** a fixture is classified as pass-expected
- **THEN** the matrix MUST fail unless host Node and secure-exec produce matching normalized `code`, `stdout`, and `stderr`

#### Scenario: Fail fixture requires deterministic failure contract
- **WHEN** a fixture is classified as fail-expected for unsupported behavior
- **THEN** the matrix MUST fail unless secure-exec produces the documented deterministic error contract

### Requirement: Compatibility Matrix Uses Persistent Fixture Install Cache
Fixture dependency installation SHALL be cached across repeated test invocations using a persistent content hash.

#### Scenario: Unchanged fixture reuses cached install
- **WHEN** fixture inputs and cache key factors are unchanged
- **THEN** matrix preparation MUST reuse the existing prepared fixture directory and skip reinstall

#### Scenario: Changed fixture invalidates cache
- **WHEN** fixture files or cache key factors change
- **THEN** the matrix MUST prepare a new cache entry and reinstall dependencies before execution

### Requirement: Parity Mismatches Remain Failing Until Resolved
Compatibility project-matrix policy SHALL NOT include a "known mismatch" or equivalent pass-through state for parity failures.

#### Scenario: Detected parity mismatch
- **WHEN** a fixture marked pass-expected fails parity comparison
- **THEN** the test result MUST remain failing and MUST be addressed by runtime or bridge fixes rather than fixture reclassification

### Requirement: Timing Hardening Deviations Are Explicitly Documented
Any runtime timing-hardening behavior that intentionally diverges from default Node.js timing semantics MUST be documented in compatibility/friction artifacts in the same change.

#### Scenario: Hardened timing mode is introduced or changed
- **WHEN** a change adds or modifies timing hardening behavior (for example frozen clocks or disabled timing primitives)
- **THEN** the change MUST update `docs-internal/friction.md` with the deviation and fix/intent notes

#### Scenario: Security-first default intentionally diverges from Node timing
- **WHEN** timing hardening is enabled by default for sandbox execution
- **THEN** the change MUST explicitly document the default-on compatibility trade-off and the supported compatibility opt-out path

#### Scenario: Research and implementation guidance stays aligned
- **WHEN** timing-side-channel mitigations are proposed or revised
- **THEN** `docs-internal/research/comparison/cloudflare-workers-isolates.md` MUST be updated so its recommendations match the current OpenSpec change scope

### Requirement: CPU Limit Compatibility and Friction Documentation Stays Aligned
Any change that introduces or modifies the secure-exec CPU time limit contract MUST update compatibility/friction documentation in the same change.

#### Scenario: CPU timeout contract is introduced or changed
- **WHEN** runtime behavior for configured CPU limits changes (including option names, failure codes, or timeout stderr contract)
- **THEN** `docs-internal/friction.md` MUST be updated with the behavior change and resolution notes

#### Scenario: Research guidance reflects current CPU limit design
- **WHEN** CPU limit implementation guidance is revised
- **THEN** `docs-internal/research/comparison/cloudflare-workers-isolates.md` MUST be updated so recommendations match the active runtime contract and OpenSpec deltas

### Requirement: Maintain Canonical Secure-Exec Security Model Documentation
The project MUST maintain `docs/security-model.mdx` as the canonical security model for secure-exec runtime behavior and deployment assumptions.

#### Scenario: Security model document covers required security-contract topics
- **WHEN** the canonical security model document is authored or updated
- **THEN** it MUST describe isolate architecture, timing-side-channel posture, execution timeout and memory-limit controls, and host hardening assumptions for untrusted workloads

#### Scenario: User-facing security model language stays implementation-agnostic
- **WHEN** `docs/security-model.mdx` is authored or updated
- **THEN** it MUST describe the secure-exec contract without naming backend implementation dependencies directly

#### Scenario: Canonical security model page is discoverable in docs navigation
- **WHEN** `docs/security-model.mdx` is added or moved as the canonical security model page
- **THEN** `docs/docs.json` MUST include navigation for the page in the same change

#### Scenario: Cloudflare/browser alignment is described without over-claiming parity
- **WHEN** the canonical security model explains isolation architecture
- **THEN** it MUST describe how secure-exec uses the same isolate-style security primitives as Cloudflare Workers and modern browsers while explicitly distinguishing production hardening layers that are outside secure-exec runtime scope

### Requirement: Security-Contract Changes Must Synchronize Security Model Guidance
Changes to security-relevant runtime contracts MUST update canonical security model guidance in the same change.

#### Scenario: Runtime security contract changes trigger documentation updates
- **WHEN** a change modifies timing mitigation behavior/defaults, execution-timeout contract, memory-limit contract, or host trust-boundary assumptions
- **THEN** that change MUST update `docs/security-model.mdx` with the new contract details before completion

#### Scenario: Security-first compatibility trade-offs remain explicit
- **WHEN** a security mitigation intentionally diverges from default Node.js compatibility behavior
- **THEN** the canonical security model and compatibility/friction artifacts MUST explicitly document that security requirements take precedence and MUST describe any supported compatibility mode or opt-out path

### Requirement: Isolate Boundary Payload Limits Are Explicitly Documented
Any change that introduces or modifies isolate-boundary payload size limits MUST document the compatibility and security rationale in canonical project documentation.

#### Scenario: Boundary limit contract changes
- **WHEN** runtime or bridge payload-size limits are introduced or changed for isolate-originated data
- **THEN** `docs-internal/friction.md` MUST be updated with the behavior change, rationale, and resolution notes

#### Scenario: Security model reflects boundary guardrails
- **WHEN** isolate-boundary payload limits are introduced or changed
- **THEN** `docs/security-model.mdx` MUST describe the boundary guardrail, deterministic overflow behavior, and compatibility trade-off against unconstrained host Node behavior

### Requirement: Global Exposure Hardening Policy MUST Be Documented With Exceptions
Changes that harden isolate global exposure MUST document the policy split between hardened custom globals and compatibility-preserved Node stdlib globals in compatibility/friction artifacts in the same change.

#### Scenario: Custom globals are hardened
- **WHEN** runtime or bridge code applies descriptor hardening to custom globals
- **THEN** documentation MUST identify the hardened global categories and the rationale

#### Scenario: Stdlib globals are intentionally not force-frozen
- **WHEN** stdlib globals remain mutable/configurable for Node compatibility
- **THEN** documentation MUST explicitly record that this is an intentional compatibility decision, not an implementation gap

### Requirement: Descriptor Policy Changes MUST Include Exhaustive Custom-Global Regression Coverage
Any change to global exposure descriptor policy SHALL include exhaustive tests that verify every hardened custom global in the maintained inventory resists overwrite/redefine attempts, while stdlib compatibility behavior remains intact.

#### Scenario: Exhaustive hardened coverage and compatibility paths are tested
- **WHEN** a change updates global descriptor policy
- **THEN** tests MUST cover all hardened custom globals in the inventory and at least one stdlib global compatibility case

#### Scenario: Inventory and test coverage stay in sync
- **WHEN** a new hardened custom global is added to the inventory
- **THEN** the same change MUST add or update tests that assert overwrite/redefine resistance for that global

### Requirement: Filesystem Metadata and Rename Deviations Must Be Documented
Any intentional deviation from default Node.js behavior for filesystem metadata access patterns or rename atomicity MUST be documented in compatibility/friction artifacts in the same change.

#### Scenario: Driver cannot provide atomic rename semantics
- **WHEN** a runtime/driver path cannot satisfy Node-like atomic rename behavior
- **THEN** `docs-internal/friction.md` MUST record the limitation and supported behavior contract in the same change

#### Scenario: Metadata behavior intentionally differs from Node expectations
- **WHEN** filesystem metadata behavior diverges from default Node semantics for performance or platform constraints
- **THEN** compatibility documentation MUST explicitly describe the divergence and mitigation/expected impact

### Requirement: Compatibility Matrix Coverage Is Updated for Filesystem Semantics Changes
Changes to runtime or bridge filesystem metadata/rename behavior SHALL update compatibility project-matrix coverage with black-box fixtures that compare host Node and secure-exec normalized outputs.

#### Scenario: Metadata behavior change is implemented
- **WHEN** a change modifies `stat`, `exists`, typed `readdir`, or rename semantics in secure-exec
- **THEN** the compatibility project-matrix MUST include fixture coverage that exercises the changed behavior under host Node and secure-exec comparison

### Requirement: Governance References Use Canonical Secure-Exec Naming
Governance artifacts that reference runtime package imports or runtime source paths SHALL use `secure-exec` and `packages/secure-exec` as the canonical identifiers.

#### Scenario: Governance guidance references runtime package imports
- **WHEN** a governance document or spec requirement describes runtime package imports
- **THEN** it MUST use `secure-exec` rather than the legacy package name

#### Scenario: Governance guidance references runtime source paths
- **WHEN** a governance document or spec requirement describes runtime source directories
- **THEN** it MUST use `packages/secure-exec` rather than the legacy package path

### Requirement: Module-Access Boundary Changes MUST Update Security and Friction Documentation
Any change that introduces or modifies driver-managed host module projection or overlay boundaries MUST update compatibility/friction and security-model documentation in the same change.

#### Scenario: Scoped node_modules projection or always-on overlay behavior is introduced or changed
- **WHEN** runtime or driver behavior for projected module access changes (including scope boundary, always-on overlay defaults, read-only policy, or native-addon rejection)
- **THEN** `docs-internal/friction.md` MUST document the compatibility trade-off and resolution notes in the same change

#### Scenario: Host trust-boundary assumptions for module loading change
- **WHEN** module-loading trust boundaries change due to driver-managed host dependency projection or always-on `cwd/node_modules` overlay
- **THEN** `docs/security-model.mdx` MUST describe the boundary and the enforced `<cwd>/node_modules` containment contract

### Requirement: Logging Capture Contract Changes MUST Update Compatibility And Security Docs
Any change that introduces or modifies runtime log-capture defaults or hook-based logging behavior MUST update compatibility/friction/security documentation in the same change and MUST include exploit-oriented regression tests for host resource amplification.

#### Scenario: Runtime switches default logging behavior
- **WHEN** runtime logging defaults change (for example from buffered capture to log-drop)
- **THEN** `docs-internal/friction.md` MUST document the compatibility impact and resource-exhaustion rationale in the same change

#### Scenario: Runtime introduces or changes log-stream hook behavior
- **WHEN** runtime log-stream hook contract changes (event shape, ordering semantics, or failure behavior)
- **THEN** `docs/security-model.mdx` MUST describe trust-boundary and resource-consumption implications and `docs/node-compatability.mdx` MUST reflect user-visible behavior changes where applicable

#### Scenario: Logging changes include exploit regression coverage
- **WHEN** logging/output behavior is changed in runtime or bridge paths
- **THEN** the same change MUST include tests that assert high-volume log emission does not create unbounded host-memory accumulation

### Requirement: Runtime Driver Contract Changes MUST Run Shared Cross-Target Integration Suites
Any change that modifies runtime-driver behavior or runtime orchestration contracts MUST run shared integration suites against both node and browser runtime-driver targets.

#### Scenario: Runtime/driver implementation changes trigger cross-target validation
- **WHEN** a change modifies runtime contracts or driver behavior under `packages/secure-exec/src/index.ts`, `src/runtime-driver.ts`, `src/node/**`, or `src/browser/**`
- **THEN** the change MUST execute shared integration suites for both node and browser targets before completion

#### Scenario: Shared suites are reused between targets
- **WHEN** runtime integration coverage is executed for node and browser
- **THEN** both targets MUST run the same reusable `run*` contract suites rather than target-specific duplicated logic

### Requirement: Browser Runtime Validation Workflow MUST Remain Available To Contributors
Repository scripts and test wiring MUST provide a documented way to run browser runtime integration tests locally using the shared runtime-contract suites.

#### Scenario: Contributor runs targeted browser integration validation
- **WHEN** a contributor runs the documented browser integration command
- **THEN** the runtime integration suite MUST execute in a real browser environment and report pass/fail for the shared contract suites

### Requirement: Runtime-Driver Contract Changes MUST Validate Through Canonical Test-Suite Entrypoints
Any change that modifies runtime-driver behavior, execution-driver behavior, or shared runtime test harness contracts MUST validate against canonical shared and driver-specific test entrypoints.

#### Scenario: Shared runtime contract change triggers matrix suite validation
- **WHEN** a change updates runtime contract behavior or shared suite orchestration under `packages/secure-exec/tests/test-suite.test.ts` or `packages/secure-exec/tests/test-suite/*.ts`
- **THEN** the change MUST run the matrix suite command that executes `packages/secure-exec/tests/test-suite.test.ts`

#### Scenario: Execution-driver-specific change triggers execution-driver suite validation
- **WHEN** a change updates execution-driver-specific behavior or tests under `packages/secure-exec/tests/exec-driver/`
- **THEN** the change MUST run the execution-driver targeted test command that executes `packages/secure-exec/tests/exec-driver/*.test.ts`

#### Scenario: Runtime-driver-specific change triggers runtime-driver suite validation
- **WHEN** a change updates runtime-driver-specific behavior or tests under `packages/secure-exec/tests/runtime-driver/`
- **THEN** the change MUST run the runtime-driver targeted test command that executes `packages/secure-exec/tests/runtime-driver/*.test.ts`

### Requirement: Shared Runtime Coverage MUST Not Depend On Legacy Or Duplicate Entrypoints
Repository test wiring MUST keep `packages/secure-exec/tests/test-suite.test.ts` as the canonical shared runtime matrix entrypoint and MUST NOT require duplicated node/browser-only shared-suite entrypoints for ongoing validation.

#### Scenario: Canonical shared runtime entrypoint remains singular
- **WHEN** contributors update package scripts or Vitest include patterns for shared runtime coverage
- **THEN** shared runtime matrix execution MUST remain anchored on `packages/secure-exec/tests/test-suite.test.ts` as the canonical entrypoint
