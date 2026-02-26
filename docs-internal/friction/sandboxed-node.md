# Sandboxed Node Friction Log

## 2026-02-25

1. **[resolved]** Package resolution for `node_modules` was too limited.
   - Symptom: packages with `exports` maps and `.mjs/.cjs` entrypoints (including modern ESM-first packages) were not reliably resolvable.
   - Fix: expanded `package-bundler` resolution logic to support `exports` condition keys, extension probing for `.mjs/.cjs`, and import-vs-require mode preference.

2. **[resolved]** `http.createServer()` path was blocked in the sandbox runtime.
   - Symptom: server-oriented frameworks could not boot; existing bridge intentionally threw for `http.createServer`.
   - Fix: introduced a bridged `@hono/node-server` runtime module inside the isolate plus host-side `NetworkAdapter.honoServe/honoClose`, backed by real `@hono/node-server` in the Node driver.

3. **[resolved]** Workspace layout originally only matched one-level examples.
   - Symptom: nested `examples/hono/loader` and `examples/hono/runner` packages were not included in the pnpm workspace.
   - Fix: added `examples/*/*` to workspace globs.

4. **[resolved]** `require('fs')` depended on `globalThis.bridge`, but bridge loading did not publish the bridge object globally.
   - Symptom: `fs` resolved to `{}` and `readFileSync` was missing.
   - Fix: updated bridge loader wrappers to assign `globalThis.bridge = bridge` during bridge initialization.

5. **[resolved]** Relative import resolution in package directories preferred directories over sibling files.
   - Symptom: requests like `require('./request')` failed when both `request/` and `request.js` existed.
   - Fix: changed resolver order to match Node behavior: file + extension probes run before directory index/package resolution.

6. ESM + top-level await in this runtime path can return early for long async waits.
   - Symptom: module evaluation could finish before awaited async work (timers/network) completed.
   - Mitigation for example: runner switched to CJS async-IIFE, which `exec()` already awaits reliably.

7. `sandboxed-node` package build currently fails due to broad pre-existing type errors in bridge/browser files.
   - Symptom: importing `sandboxed-node` from `dist/` in example loader was not reliable in this workspace state.
   - Mitigation for example: loader imports `packages/sandboxed-node/src/index.ts` directly so the end-to-end example can run without a successful package build.
   - Note: 32+ type errors remain across child-process, network, os, process, and polyfills bridge files (as of 2026-02-25).

8. **[resolved]** Workspace-linked `node_modules` in the runner package caused environment coupling.
   - Symptom: runner execution could be influenced by workspace layout and local symlinked install topology.
   - Fix: loader now copies runner sources into a fresh temp directory and runs `pnpm install --ignore-workspace` there before sandbox execution.
