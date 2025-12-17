# NanoSandbox

**X% more efficient Linux sandboxes** (compared to microVMs)

Sandboxes requires full Linux environments without compromise. Most Linux sandboxes are powered by microVMs today. However, these sandboxes are expensive to run due to idle resources and wasted virtual machine overhead.

NanoSandbox provides a resource efficient alternative by providing a hybrid virtual machine combining WASIX to provide a low overhead Linux OS with V8 isolates for high-performance Node.js sandboxing.

The end result is a vaslty more efficient Linux sandbox with nearly identical performance that can run anywhere.

TODO: Before diagram

TODO: After diagram

TODO: What sandboxes care about:
- speed
- it just works
- cost

## Features

- Suitable for short-lived code execution or long-lived sandboxes
- No microVMs, just V8 isolates & WASM
- Runs anywhere Node.js can run (Vercel Fluid Compute, Railway, Fly.io, Lambda, Cloud Run, etc)
- Available as a library or MCP server
- High-performance JS, no watered down JS runtime
- Interactive terminal with TTY
- Automatic fallback to microVMs without API changes (see Limitations below)

## Demo

Try an interactive terminal.

## Getting Started

### MCP Server

_Recommended for most use cases. This lets you separate your agent code from resource-intensive sandboxed code._

Managed MCP server:

TODO

Self-hosted MCP server:

TODO

### As A Library

_Available for portability._

TODO

Supports any platform that supports Node.js, such as:

- Vercel Fluid Compute
- Railway
- AWS Lambda
- Google Cloud Run

### Interactive Shell

TODO

```
npx @nanosandbox/shell
```

## Components

- `nanosandbox`
- `@nanosandbox/sandboxed-node`
- `nanosandbox-actor` (WIP)
- `nanosandbox-mcp` (WIP)
- `wasix-runtime`
- Tools compiled to WASIX: TODO

## Architecture

TODO

## Comparison to Existing Sandbox Technologies

TODO: Architecture diagrams for each, and sort by light -> heavy

|       | microVM                      | Isolates & WASM                              | Docker/cgroup/bubblewarp/nsjail/etc | Full VMs |
| Cost  | Expensive           
| Self-hostable | No | Yes | Yes | No |
| Users | Daytona, E2B, Fly.io, Lambda | NanoSandbox, Chromium, Cloudflare Workers, Deno Deploy | TBD                   | EC2      |
| Secure | Yes | Yes | No | Yes |
| Coldstarts | Medium | Low | Low | High |
| Resource Packing | Poor (ballooning allocator) | Good | Good | Poor |
| Idle compute | Paying for expensive compute while idle | Costs almost nothing while idle | Costs almost nothing while idle | Paying for expensive compute while idle |
| Compatibility | Good | Good enough (has fallback) | Good | Great |
| Supports browser-based sandboxes | No | Coming soon | No | No |

## Benchmarks

### Idle

Measuring: idle memory, idle CPU

- Next.js dev server
- Vite dev server

### CPU-bound

Measuring: idle memory, idle CPU

- Next.js build
- Vite build

## Security

### TL;DR

This is based on the same technology (V8 isolates & WASM) that provides secure code execution to Chromium browsers and to Cloudflare Workers. By default, V8 isolates and WASM modules cannot execute any dangerous functionality outside of their respective sandboxes. This maeks auditing them simple: you can see the extensions that NanoSandbox provides here (TODO).

### Thread Model

TODO

### Comparison to Cloudflare Workers

Cloudflare Workers is the gold standard of using V8 isolates for isolated code execution at scale, so it helps to compare to them as a baseline.

TODO

## Limitations

- Linux tools must be complied to WASIX (see other repo TODO)
    - Does not support apt and other package managers. We've already compiled commonly used tools to WASIX and included in the runtime.
- Native modules, including:
    - esbuild
    - turbo
    - Biome

## Future Work

- Browser support vs ServiceWorkers
    - Requires tunneling for network traffic
- Bun support (TBD)
- Lazy FS loading
- VS Code server support
- Publish WASIX patches for popular native libraries (esbuild, turbopack, etc)

## License

Apache 2.0

