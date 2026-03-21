# documentation-site Specification

## Purpose
TBD - created by archiving change add-simple-mintlify-quickstart-docs. Update Purpose after archive.
## Requirements
### Requirement: Single-Page Quickstart Navigation
The documentation site SHALL expose a core navigation set that includes Quickstart, Security Model, and Node Compatibility pages for initial rollout.

#### Scenario: Docs configuration defines required core pages
- **WHEN** the docs configuration is loaded
- **THEN** navigation MUST include `quickstart`, `security-model`, and `nodejs-compatibility` as available documentation pages

#### Scenario: Node compatibility page path is resolvable
- **WHEN** a user selects the Node Compatibility page from navigation
- **THEN** the docs site MUST resolve and render `nodejs-compatibility.mdx` successfully

### Requirement: Quickstart Uses Steps With Runnable Example
The Quickstart page SHALL present onboarding steps using Mintlify `<Steps>` and SHALL include at least one basic runnable example that verifies setup success using the current runtime logging contract.

#### Scenario: Steps component structures onboarding
- **WHEN** the Quickstart page is rendered
- **THEN** the page MUST contain a `<Steps>` block with ordered setup actions

#### Scenario: Quickstart includes basic verification example
- **WHEN** a user follows the Quickstart page
- **THEN** the page MUST provide at least one concrete command example and expected successful outcome text

#### Scenario: Quickstart does not rely on legacy buffered output fields
- **WHEN** Quickstart demonstrates how to read execution logs
- **THEN** it MUST use hook-based log streaming examples and MUST NOT instruct users to read `result.stdout` or `result.stderr`

### Requirement: Node Compatibility Page Declares Target Version and Matrix
The docs site MUST provide `docs/nodejs-compatibility.mdx` with an explicit target Node version statement near the top of the page and a clean compatibility matrix table that summarizes module support tier and runtime notes.

#### Scenario: Target Node version is visible at top of page
- **WHEN** `nodejs-compatibility.mdx` is rendered
- **THEN** users MUST see the targeted Node version before the compatibility matrix content

#### Scenario: Compatibility matrix uses concise tabular format
- **WHEN** `nodejs-compatibility.mdx` is rendered
- **THEN** it MUST include a simple table with module/support-tier/status details migrated from the internal compatibility source

#### Scenario: Permission model scope stays at runtime and bridge contract
- **WHEN** `nodejs-compatibility.mdx` documents permission behavior
- **THEN** it MUST describe core runtime/bridge permission enforcement and MUST NOT present driver-construction convenience defaults as the canonical security contract

