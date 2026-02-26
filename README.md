# libsandbox

Run sandboxed Node.js code in both Node and the browser using a driver-based runtime. libsandbox is now a focused wrapper around `sandboxed-node` (isolated-vm on Node, Web Workers in the browser) with pluggable system drivers (fs, network, child_process).

## Features

- **Node + Browser**: Same sandbox API on Node (isolated-vm) and browser (Worker isolate).
- **Driver-based**: Provide a driver to map filesystem, network, and child_process.
- **Permissions**: Gate syscalls with custom allow/deny functions.
- **Opt-in system features**: Disable network/child_process/FS by omission.

## Usage (Node)

```ts
import {
  NodeProcess,
  createNodeDriver,
  NodeFileSystem,
} from "sandboxed-node";

const driver = createNodeDriver({
  filesystem: new NodeFileSystem(),
  useDefaultNetwork: true,
  permissions: {
    network: ({ url }) => ({ allow: !!url && url.startsWith("https://") }),
  },
});

const proc = new NodeProcess({ driver });
const result = await proc.exec("console.log('hello from node')");
console.log(result.stdout);
```

## Usage (Browser)

```ts
import { BrowserSandbox } from "sandboxed-node/browser";

const sandbox = new BrowserSandbox({
  filesystem: "opfs",
  networkEnabled: true,
  permissions: {
    network: ({ url }) => ({ allow: !!url && url.startsWith("https://") }),
  },
});

const result = await sandbox.exec("console.log('hello from browser')");
console.log(result.stdout);
```

## Child Process Integration

`child_process` is opt-in. Provide a `CommandExecutor` when running in Node. For a just-bash integration example, see `examples/just-bash/`.

## Hono Example

The Hono end-to-end loader/runner example lives in `examples/hono/`:

- `examples/hono/loader` runs sandboxed code from the runner package
- `examples/hono/runner` contains a regular Hono app with `node_modules`

## Repository Layout

- `packages/sandboxed-node/` — core runtime and drivers
- `examples/just-bash/` — example integration (kept out of core)
- `examples/hono/` — loader/runner Hono HTTP server example
