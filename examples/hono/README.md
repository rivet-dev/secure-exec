# Hono Sandbox Example

This example uses a loader/runner split:

- `loader/` runs sandboxed-node and executes the runner entry file.
- `runner/` contains a regular Hono app with package dependencies in `node_modules`.

Run:

```bash
pnpm -C examples/hono/loader dev
```
