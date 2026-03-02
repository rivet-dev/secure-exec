## Context

`RuntimeDriver` currently carries both capability configuration (filesystem/network/child-process/permissions/runtime config) and execution-construction hooks (`runtimeHooks`). This mixes data ownership with engine-construction concerns and makes the generic driver type depend on Node-specific execution wiring.

The goal is to preserve runtime behavior while clarifying boundaries: capability data stays on the driver, and execution construction moves to a separate factory contract.

## Goals / Non-Goals

**Goals:**
- Separate capability/config ownership from execution-engine construction.
- Keep `runtime.process` and `runtime.os` sourced from the driver and injected into execution.
- Preserve deny-by-default semantics and existing run/exec behavior.
- Provide a clean extension point for non-Node execution engines without hook leakage.

**Non-Goals:**
- Reworking module loading/bridge semantics.
- Changing permission policy behavior.
- Restoring browser runtime support in this change.

## Decisions

1. Introduce explicit execution factory contract.
- Decision: Add a dedicated runtime execution factory/provider type and remove `runtimeHooks` from `RuntimeDriver`.
- Rationale: keeps `RuntimeDriver` as pure capability/config surface and removes implicit, optional hook coupling.
- Alternative considered: keep `runtimeHooks` but make fields required. Rejected because it still blends concerns and keeps generic driver tied to execution internals.

2. Update `NodeRuntime` constructor to accept both capability driver and execution factory.
- Decision: `NodeRuntime` requires explicit factory wiring at construction time.
- Rationale: dependency is explicit at API boundary and independent of driver data shape.
- Alternative considered: global/default factory fallback. Rejected because hidden defaults reduce clarity and complicate multi-runtime composition.

3. Keep runtime config injection path unchanged in intent.
- Decision: `process`/`os` config remains on driver and is normalized by `NodeRuntime` before creating execution driver.
- Rationale: preserves current ownership expectations and avoids duplicating runtime config across surfaces.
- Alternative considered: move runtime config into factory options only. Rejected because driver is the canonical capability/config bundle.

4. Keep Node-owned heavy lifting in Node factory/driver modules.
- Decision: Node-specific isolate wiring and execution driver construction stays in Node implementation modules, not generic runtime types.
- Rationale: aligns with driver-owned specialization and reduces generic runtime coupling.

## Risks / Trade-offs

- [Breaking API surface] Constructor/type signatures change for hosts creating `NodeRuntime` directly. → Mitigation: update exports/types in one change and cover with type tests.
- [Migration confusion] Existing code may still expect `driver.runtimeHooks`. → Mitigation: remove hook references in runtime/docs and update Node factory helpers to provide the new execution factory directly.
- [Behavior drift risk] Refactor could accidentally alter deny-by-default behavior. → Mitigation: run targeted permissions/runtime tests and preserve adapter wrapping/stubs paths.
