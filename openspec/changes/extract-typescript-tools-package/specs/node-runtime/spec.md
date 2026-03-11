## ADDED Requirements
### Requirement: Core Runtime Executes JavaScript Without Implicit TypeScript Preprocessing
The core `NodeRuntime` SHALL treat string input as JavaScript for both Node-target and browser-target runtime drivers and SHALL NOT provide built-in TypeScript type checking or transpilation behavior.

#### Scenario: Node target rejects TypeScript-only syntax through normal execution failure
- **WHEN** a caller invokes `NodeRuntime.exec()` or `NodeRuntime.run()` with TypeScript-only syntax such as type annotations in a Node-target runtime
- **THEN** execution MUST fail through the normal JavaScript parse or evaluation path instead of applying implicit TypeScript preprocessing

#### Scenario: Browser target rejects TypeScript-only syntax through normal execution failure
- **WHEN** a caller invokes `NodeRuntime.exec()` or `NodeRuntime.run()` with TypeScript-only syntax such as type annotations in a browser-target runtime
- **THEN** execution MUST fail through the normal JavaScript parse or evaluation path instead of applying implicit TypeScript preprocessing
