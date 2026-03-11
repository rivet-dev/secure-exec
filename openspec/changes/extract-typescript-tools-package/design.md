# Design: Sandbox TypeScript in a companion package

## Context

`secure-exec` should execute JavaScript. TypeScript compile and typecheck are separate toolchain concerns, and here they also carry a security concern: compiler work must not execute on the host where untrusted type graphs can grow memory usage outside the sandbox boundary.

The extracted design keeps the runtime contract simple:

- core runtime executes JavaScript only
- TypeScript tooling lives in a companion package
- compiler work runs inside a dedicated `NodeRuntime` sandbox

## Goals

- Prevent TypeScript compiler work from running on the host.
- Restore a JavaScript-only core runtime contract across Node and browser targets.
- Support both filesystem-backed projects and simple string-based TypeScript workflows.
- Keep project compilation behavior close to `tsc`, including filesystem writes through the configured sandbox filesystem.
- Return deterministic diagnostics when compiler sandbox limits are exceeded.

## Non-Goals

- Embedding TypeScript handling back into `NodeRuntime`.
- Supporting watch mode, project references, or long-lived language-server behavior in v1.
- Implementing whole-project bundling into one JavaScript file.

## Decisions

### Decision: Add a companion `@secure-exec/typescript` package

The new package exposes a factory:

- `createTypeScriptTools({ systemDriver, runtimeDriverFactory, memoryLimit, cpuTimeLimitMs, compilerSpecifier })`

And four methods:

- `typecheckProject(...)`
- `compileProject(...)`
- `typecheckSource(...)`
- `compileSource(...)`

This keeps TypeScript policy out of the core runtime while still giving callers a straightforward convenience layer.

### Decision: Use the TypeScript compiler API inside the sandbox

The implementation loads the `typescript` package inside the compiler sandbox and uses compiler APIs directly instead of invoking the `tsc` CLI.

Why:

- keeps compiler execution inside the sandbox
- avoids host `tsc` process orchestration
- allows source helpers to use an in-memory overlay host for string input
- lets project compile and typecheck share one straightforward API surface

### Decision: Project helpers follow `tsc`-style filesystem behavior

`typecheckProject(...)` resolves `tsconfig.json` discovery and project graphs through the compiler API.

`compileProject(...)` emits files through the configured filesystem like `tsc`. The initial implementation writes outputs as the compiler emits them, which preserves the familiar partial-write shape of project compilation rather than adding a separate transactional layer.

### Decision: Source helpers are simple string-in/string-out utilities

`typecheckSource(...)` and `compileSource(...)` accept one source string plus optional file/config/compiler options.

They do not bundle dependency graphs. `compileSource(...)` returns emitted JavaScript text for a single source module.

### Decision: Compiler failures normalize to deterministic diagnostics

If compiler execution exceeds the configured sandbox memory or CPU limit, the package returns a failed result with a deterministic diagnostic message rather than surfacing raw host crashes.

## Architecture

```text
caller TS/project
  -> createTypeScriptTools(...)
  -> compiler request
  -> dedicated NodeRuntime compiler sandbox
  -> load `typescript` inside sandbox
  -> compiler API uses configured filesystem/module-access view
  -> diagnostics + emitted outputs returned to caller
  -> caller executes emitted JavaScript in NodeRuntime or browser runtime
```

## Risks And Mitigations

- Risk: project compilation can still consume significant resources inside the compiler sandbox.
  - Mitigation: require compiler sandbox memory/CPU limits and normalize limit failures.
- Risk: project/source semantics drift away from `tsc`.
  - Mitigation: use the compiler API directly and keep tests focused on `tsconfig`, `node_modules` type resolution, and filesystem writes.
- Risk: callers assume browser runtime can host the compiler sandbox directly.
  - Mitigation: document that browser execution remains JS-only and TypeScript should be compiled before browser runtime execution.

## Implementation Outline

1. Remove TypeScript runtime options and compiler paths from `packages/secure-exec`.
2. Remove browser runtime TypeScript handling and restore browser/playground TypeScript transpilation outside the core runtime.
3. Add `packages/secure-exec-typescript` with sandboxed project/source helpers published as `@secure-exec/typescript`.
4. Update docs, architecture notes, friction log, and OpenSpec baselines.
5. Add integration coverage for compiler sandbox behavior and JS-only runtime regressions.
