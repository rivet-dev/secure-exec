# Proposal: Extract TypeScript tooling into a sandboxed companion package

## Why

TypeScript compiler work does not belong in the core runtime path. It widens the core API contract, duplicates behavior across runtime targets, and allows untrusted compiler workloads to consume host resources before execution reaches the sandbox boundary we actually trust.

We need to:

- keep core `secure-exec` runtime behavior JavaScript-only
- move TypeScript project/source workflows into a dedicated companion package
- run the TypeScript compiler API inside a dedicated sandbox runtime instead of on the host
- remove the browser runtime TypeScript path and keep browser execution JavaScript-only

## What Changes

- Remove TypeScript-specific runtime options, typecheck APIs, and transpilation/typecheck behavior from the core `secure-exec` runtime and browser runtime path.
- Add a new `@secure-exec/typescript` package exposing:
  - `typecheckProject(...)`
  - `compileProject(...)`
  - `typecheckSource(...)`
  - `compileSource(...)`
- Implement those helpers by running the TypeScript compiler API inside a dedicated compiler sandbox runtime with deterministic runtime-limit failures.
- Update the playground/browser flow to keep TypeScript transpilation outside the core browser runtime.
- Update docs and OpenSpec baselines so the JS-only core runtime boundary and companion tooling package are explicit.

## Modified Capabilities

- `node-runtime`
- `compatibility-governance`

## Added Capabilities

- `typescript-tools`

## Tests

- Update Node runtime-driver coverage to prove TypeScript-only syntax fails as JavaScript in the Node runtime.
- Update browser runtime-driver coverage to prove TypeScript-only syntax fails as JavaScript in the browser runtime.
- Add `@secure-exec/typescript` integration coverage for:
  - project typecheck with types resolved from `node_modules`
  - project compile writing outputs to the configured filesystem
  - source typecheck without filesystem mutation
  - source compile returning JavaScript text
  - deterministic compiler memory-limit failures
- Run targeted playground/browser regression coverage touched by the browser TypeScript-path removal.
