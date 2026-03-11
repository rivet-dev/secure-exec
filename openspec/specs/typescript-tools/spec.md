# typescript-tools Specification

## Purpose
Define the sandboxed TypeScript compile/typecheck helper contract exposed outside the core runtime.

## Requirements
### Requirement: Companion Package Exposes Project And Source Helpers
The project SHALL provide a companion TypeScript tooling package that exposes project-backed and source-backed compile/typecheck helpers through a factory API.

#### Scenario: Create TypeScript tools with compiler sandbox drivers
- **WHEN** a caller creates the TypeScript tools factory with a system driver and runtime-driver factory
- **THEN** the package MUST expose `typecheckProject`, `compileProject`, `typecheckSource`, and `compileSource` helpers that run against that configured compiler sandbox

### Requirement: Project Helpers Must Follow TypeScript Project Semantics
Project-backed helpers SHALL resolve `tsconfig` and module/type inputs using the TypeScript compiler API and the configured filesystem view, and project compilation SHALL write emitted files through that filesystem like `tsc`.

#### Scenario: Project typecheck resolves workspace node_modules types
- **WHEN** a project `tsconfig.json` references Node types or packages available through the configured module-access view
- **THEN** `typecheckProject` MUST resolve those types through the compiler API and report diagnostics as TypeScript would for that project graph

#### Scenario: Project compile writes emitted files to the configured filesystem
- **WHEN** `compileProject` succeeds for a filesystem-backed project with an `outDir`
- **THEN** emitted JavaScript and related outputs MUST be written through the configured filesystem and the result MUST report emitted file paths

### Requirement: Source Helpers Must Support Simple String Workflows
Source-backed helpers SHALL support single-source TypeScript inputs without requiring the caller to materialize a full project on disk.

#### Scenario: Source typecheck reports diagnostics for a single string input
- **WHEN** a caller invokes `typecheckSource` with one TypeScript source string
- **THEN** the result MUST include TypeScript diagnostics for that source without mutating the configured filesystem

#### Scenario: Source compile returns JavaScript text
- **WHEN** a caller invokes `compileSource` with one TypeScript source string
- **THEN** the result MUST return emitted JavaScript text for that source and MAY return an emitted source map when compiler options request one

### Requirement: Compiler Execution Must Stay Sandboxed And Deterministic
The companion package SHALL run TypeScript compiler work inside a dedicated sandbox runtime and SHALL normalize compiler runtime-limit failures into deterministic diagnostics.

#### Scenario: Compiler sandbox memory limit failure returns deterministic diagnostics
- **WHEN** compiler work exceeds the configured sandbox memory limit
- **THEN** the package MUST return a failed result with deterministic diagnostics and MUST NOT crash the host process
