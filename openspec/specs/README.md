# OpenSpec Capability Delta Guide

Use these baseline capabilities when proposing secure-exec runtime or bridge changes:

- `node-runtime`
- `typescript-tools`
- `node-stdlib`
- `node-bridge`
- `node-permissions`
- `compatibility-governance`

## How To Reference Baselines In New Changes

1. In the change `proposal.md`, list each impacted baseline under **Modified Capabilities** using the exact capability folder name.
2. In the change `specs/<capability>/spec.md`, use delta sections (`## MODIFIED Requirements`, `## ADDED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`) rather than rewriting unrelated requirements.
3. If bridge or stdlib behavior changes, include matching documentation updates required by `compatibility-governance` (compatibility matrix, TODO sync, friction log updates where applicable).
4. Keep deltas scoped: update only requirements that actually changed, and include at least one `#### Scenario` per requirement.

## Typical Mapping

- Runtime execution semantics, async completion, module loading behavior -> `node-runtime`
- Sandboxed TypeScript compile/typecheck helpers -> `typescript-tools`
- Stdlib support tiers, builtin resolution behavior, polyfill/stub policy -> `node-stdlib`
- Bridge scope, module-resolution boundary, capability exposure rules -> `node-bridge`
- Permission defaults and allow/deny behavior -> `node-permissions`
- Compatibility/process obligations and required maintenance docs -> `compatibility-governance`
