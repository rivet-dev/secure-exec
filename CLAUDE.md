## Tooling

- use pnpm, vitest, and tsc for type checks
- use turbo for builds
- keep timeouts under 1 minute and avoid running full test suites unless necessary
- use one-line Conventional Commit messages; never add any co-authors (including agents)
- never mark work complete until typechecks pass and all tests pass in the current turn; if they fail, report the failing command and first concrete error
- always add or update tests that cover plausible exploit/abuse paths introduced by each feature or behavior change
- treat host memory buildup and CPU amplification as critical risks; avoid unbounded buffering/work (for example, default in-memory log buffering)
- check GitHub Actions test/typecheck status per commit to identify when a failure first appeared
- do not use `contract` in test filenames; use names like `suite`, `behavior`, `parity`, `integration`, or `policy` instead

## Terminology

- use `docs-internal/glossary.md` for canonical definitions of isolate, runtime, bridge, and driver

## Node Architecture

- read `docs-internal/arch/overview.md` for the component map (NodeRuntime, RuntimeDriver, NodeDriver, NodeExecutionDriver, ModuleAccessFileSystem, Permissions)
- keep it up to date when adding, removing, or significantly changing components

## Specs Source of Truth

- bridge/runtime/governance requirements are canonical in `openspec/specs/`
- for secure-exec runtime behavior, target Node.js semantics as close to 1:1 as practical
- any intentional deviation from Node.js behavior must be explicitly documented in OpenSpec deltas and reflected in compatibility/friction docs
- use `openspec/specs/README.md` for how to reference baseline capabilities in new change proposals
- track development friction in `docs-internal/friction.md` (mark resolved items with fix notes)
- OpenSpec proposals/design/tasks MUST explicitly list the concrete tests to add or update for the change
- when a request is scoped as `opsx` (propose/plan/apply/archive), always use OpenSpec workflow end-to-end (`opsx propose` -> `opsx apply`) before implementation; do not apply code changes outside an active OpenSpec change

## Compatibility Project-Matrix Policy

- compatibility fixtures live under `packages/secure-exec/tests/projects/` and MUST be black-box Node projects (`package.json` + source entrypoint)
- fixtures MUST stay sandbox-blind: no sandbox-only branches, no sandbox-specific entrypoints, and no runtime tailoring in fixture code
- secure-exec runtime MUST stay fixture-opaque: no behavior branches by fixture name/path/test marker
- the matrix runs each fixture in host Node and secure-exec and compares normalized `code`, `stdout`, and `stderr`
- no known-mismatch classification is allowed; parity mismatches stay failing until runtime/bridge behavior is fixed

## Test Structure

- `tests/test-suite/{node,python}.test.ts` are integration suite drivers; `tests/test-suite/{node,python}/` hold the shared suite definitions
- test suites test generic runtime functionality with any pluggable SystemDriver (exec, run, stdio, env, filesystem, network, timeouts, log buffering); prefer adding tests here because they run against all environments (node, browser, python)
- `tests/runtime-driver/` tests behavior specific to a single runtime driver (e.g. Node-only `memoryLimit`/`timingMitigation`, Python-only warm state or `secure_exec` hooks) that cannot be expressed through the shared suite context
- within `test-suite/{node,python}/`, files are named by domain (e.g. `runtime.ts`, `network.ts`)

## Comment Pattern

Follow the style in `packages/secure-exec/src/index.ts`.

- use short phase comments above logical blocks
- explain intent/why, not obvious mechanics
- keep comments concise and consistent (`Set up`, `Transform`, `Wait for`, `Get`)
- comment tricky ordering/invariants; skip noise
- add inline comments and doc comments when behavior is non-obvious, especially where runtime/bridge/driver pieces depend on each other

## Documentation

- docs pages that must stay current with API changes:
  - `docs/quickstart.mdx` — update when core setup flow changes
  - `docs/api-reference.mdx` — update when any public export signature changes
  - `docs/runtimes/node.mdx` — update when NodeRuntime options/behavior changes
  - `docs/runtimes/python.mdx` — update when PythonRuntime options/behavior changes
  - `docs/system-drivers/node.mdx` — update when createNodeDriver options change
  - `docs/system-drivers/browser.mdx` — update when createBrowserDriver options change

## Skills

- create project skills in `.claude/skills/`
- expose Claude-managed skills to Codex via symlinks in `.codex/skills/`
