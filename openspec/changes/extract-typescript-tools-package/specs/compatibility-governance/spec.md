## ADDED Requirements
### Requirement: TypeScript Tooling Split Must Stay Documented
Changes that add, remove, or materially alter TypeScript compile/typecheck behavior MUST update core runtime docs and companion tooling docs in the same change so the JS-only core/runtime boundary stays explicit.

#### Scenario: Core runtime TypeScript handling changes
- **WHEN** the core runtime adds or removes implicit TypeScript preprocessing behavior
- **THEN** `docs/quickstart.mdx`, `docs/api-reference.mdx`, `docs/runtimes/node.mdx`, `docs/node-compatability.mdx`, `docs-internal/arch/overview.md`, and `docs-internal/friction.md` MUST be updated in the same change

#### Scenario: Companion TypeScript tooling API changes
- **WHEN** the public API of the companion TypeScript tooling package changes
- **THEN** `docs/quickstart.mdx` and `docs/api-reference.mdx` MUST be updated in the same change so project/source helper semantics remain accurate
