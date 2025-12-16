# NanoSandbox

**X% more efficient Linux sandboxes** (compared to microVMs)

Sandboxes requires full Linux environments without compromise. Most Linux sandboxes are powered by microVMs today. However, these sandboxes are expensive to run due to idle resources and wasted virtual machine overhead.

NanoSandbox provides a resource efficient alternative by providing a hybrid virtual machine combining WASIX to provide a low overhead Linux OS with V8 isolates for high-performance Node.js sandboxing.

The end result is a vaslty more efficient Linux sandbox with nearly identical performance that can run anywhere.

## Features

- Available as a library or MCP server
- No microVMs, just WASM & V8 isolates (both included in Node.js)
- High-performance JS, no watered down JS runtime
- Interactive terminal
- Automatic fallback to microVMs without API changes (see Limitations below)

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

|       | microVM                      | Isolates & WASM                              | cgroup/bubblewarp/nsjail/etc | Full VMs |
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

## Limitations

- Linux tools must be complied to WASIX (see other repo TODO)
    - Does not support apt and other package managers. We've already compiled commonly used tools to WASIX and included in the runtime.
- Native modules, including:
    - esbuild
    - turbo
    - Biome

## Future Work

- TODO

## License

Apache 2.0

