# Browser Node.js Runtimes Comparison

A comparison of tools that run Node.js-compatible code in browsers or sandboxed environments.

## Tools

### WebContainers (StackBlitz)

**What it is:** A WebAssembly-based operating system that runs Node.js natively in the browser. Created by StackBlitz, it powers StackBlitz, Bolt.new, and other browser-based development tools.

**Architecture:** WebContainers compile a Node.js-compatible runtime to WASM, running it inside the browser with a virtual filesystem, virtual networking layer (via Service Worker for HTTP), and a shell environment. The runtime supports npm/pnpm/yarn package managers, running real `node_modules` resolution and execution.

**Strengths:**
- Most complete Node.js compatibility of any browser runtime
- Full npm package installation and resolution
- Real `node_modules` — not polyfilled or shimmed
- Framework support (Next.js, Vite, Astro, etc.) works out of the box
- Service Worker-based networking enables `localhost` development
- Production-proven at scale (Bolt.new, StackBlitz)
- Persists state in browser storage

**Weaknesses:**
- Proprietary / commercial — SDK requires API key, not fully open-source
- Large runtime size (~10MB+ initial download)
- Startup time is seconds, not milliseconds (booting an OS)
- Cannot run native addons (WASM only)
- Requires SharedArrayBuffer (COOP/COEP headers)
- Cross-origin isolation headers complicate embedding
- Heavy memory usage (~100-500MB per instance)

**Node API coverage:** High. Covers fs, path, child_process, http/https, net, crypto, stream, Buffer, and most core modules. Sufficient for frameworks like Next.js.

---

### Sandpack / Nodebox (CodeSandbox)

**What it is:** Sandpack is an open-source component toolkit for embedding live code editors/previews. Nodebox is CodeSandbox's browser-based Node.js runtime that powers server-side execution in Sandpack.

**Architecture:** Sandpack provides React components (`<SandpackProvider>`, `<SandpackPreview>`) that embed code editing and preview. For client-side code, it uses iframes with bundling (esbuild-wasm or a custom bundler). For server-side Node.js code, it uses Nodebox — a Worker-based Node.js runtime with a virtual filesystem and emulated modules.

**Strengths:**
- Open-source component library (Sandpack)
- Drop-in React components for code playgrounds
- Supports multiple frameworks (React, Vue, Svelte, Angular)
- Nodebox provides basic Node.js runtime in browser
- CDN-based dependency resolution (no npm install step)
- Lightweight for simple use cases
- Good documentation and community

**Weaknesses:**
- Nodebox is closed-source and less documented than Sandpack
- Node.js compatibility is limited compared to WebContainers
- No real npm installation — dependency resolution via CDN/bundler
- Framework SSR support is limited
- Sandpack's bundler doesn't support all Node.js APIs
- More focused on code playgrounds than general-purpose sandboxing

**Node API coverage:** Moderate. Covers fs (virtual), path, Buffer, stream, events, and basic http. Missing or incomplete: child_process, net, crypto (partial), dns, cluster.

---

### almostnode

**What it is:** A sibling project that provides a lightweight Node.js-compatible runtime for browsers using an in-memory VirtualFS and the just-bash shell interpreter. Targets ~250KB bundle size with instant startup.

**Architecture:** Runs entirely in the main thread or a Worker. Uses an in-memory virtual filesystem (VirtualFS) for all file operations. Integrates just-bash for shell command execution (70+ coreutils implemented in JS). No WASM, no Service Workers — pure JavaScript with minimal dependencies.

**Strengths:**
- Tiny bundle size (~250KB target)
- Instant startup (no boot sequence)
- No WASM or SharedArrayBuffer requirements
- No cross-origin isolation headers needed
- Built-in shell (just-bash) for command execution
- Full control over the execution environment
- Can be embedded anywhere JavaScript runs

**Weaknesses:**
- Limited Node.js API coverage (subset implementation)
- Shell is a JavaScript interpreter, not real bash
- Cannot install real npm packages (no real `node_modules`)
- No native addon support
- VirtualFS is in-memory only (limited storage)
- Single-threaded — no worker_threads or cluster support
- Smaller ecosystem and community than WebContainers

**Node API coverage:** Partial. Targets core modules: fs (in-memory), path, process, Buffer, stream, events, child_process (via just-bash). Focused on enough coverage for common scripting tasks rather than full framework support.

---

### libsandbox (secure-exec)

**What it is:** A driver-based sandboxed Node.js runtime with two backends: V8 isolates for Node.js (isolate-level isolation) and Web Workers for browsers. Designed for executing code snippets with controlled API access.

**Architecture:** A unified bridge layer provides Node.js APIs (fs, process, child_process, network, os) that work identically across both drivers. The Node driver uses V8 isolates with explicit `Reference`-based bridges. The browser driver uses Web Workers with `postMessage` communication. A permission system gates access to filesystem, network, child process, and environment operations.

**Strengths:**
- Strong isolation on Node.js (V8 isolate — separate heap)
- Works in both Node.js and browsers with same API
- Driver architecture is extensible (swap filesystem, network, etc.)
- Fine-grained permission system
- Fast startup (<1ms for isolate, ~5ms for Worker)
- ESM and CJS module support
- Configurable memory limits (Node driver)

**Weaknesses:**
- Node APIs are manually bridged — coverage depends on implementation effort
- Binary data crosses the boundary via base64 (performance cost)
- Browser driver isolation is weaker (Worker global scope is accessible)
- No npm package installation
- No real `node_modules` resolution (polyfills via node-stdlib-browser)
- The V8 isolate package is a native addon (complicates deployment)
- Single-threaded execution per isolate/Worker

**Node API coverage:** Targeted. Covers fs (full CRUD), path, process, child_process (spawn, exec, spawnSync, execSync, fork), http/https, fetch, dns, os, Buffer, URL, stream, events, timers, console, and modules via node-stdlib-browser polyfills.

---

## Comparison Table

| Feature | WebContainers | Sandpack/Nodebox | almostnode | libsandbox |
|---|---|---|---|---|
| **Architecture** | WASM OS | Worker + bundler | In-memory JS | V8 Isolate / Worker |
| **Bundle size** | ~10MB+ | ~2MB (Sandpack) | ~250KB target | ~500KB (with bridge) |
| **Startup time** | 2-5s | 500ms-2s | <10ms | <10ms |
| **Node API coverage** | High | Moderate | Partial | Targeted |
| **npm support** | Full (install) | CDN resolution | None | Polyfills only |
| **Framework support** | Next.js, Vite, etc. | React, Vue, etc. | Basic scripts | Basic scripts |
| **Shell / child_process** | Real shell (via WASM) | Limited | just-bash (JS) | Via CommandExecutor |
| **Filesystem** | Virtual + persistent | Virtual | In-memory | Driver-based |
| **Security model** | Browser sandbox | iframe / Worker | None (same context) | Isolate / Worker + permissions |
| **Browser support** | Yes (COOP/COEP) | Yes | Yes | Yes |
| **Node.js support** | No | No | No | Yes (primary) |
| **Open source** | Partial (SDK) | Sandpack: yes | Yes | Yes |
| **Memory isolation** | WASM sandbox | iframe/Worker | None | V8 isolate (Node) |
| **Binary/native addons** | No | No | No | No |

## Relevance to libsandbox

libsandbox occupies a distinct niche: **fast, secure, dual-environment code execution** rather than full development environment simulation. Key differentiators:

1. **Security-first**: libsandbox is the only option with real memory isolation (via V8 isolates) and a structured permission system. WebContainers relies on browser sandboxing; almostnode has no isolation.

2. **Node.js as primary target**: libsandbox is designed to run on Node.js servers (for AI agent backends, code execution APIs) with browser as a secondary target. WebContainers and Sandpack are browser-first.

3. **Startup speed**: libsandbox and almostnode start in <10ms, making them suitable for per-request sandbox creation. WebContainers' multi-second boot time limits it to persistent sessions.

4. **API coverage tradeoff**: WebContainers wins on compatibility but at massive cost in size and startup. libsandbox's bridge approach means coverage grows incrementally as APIs are added, without runtime overhead for unused modules.

5. **Extensibility**: The driver pattern lets consumers swap out filesystem (OPFS, S3, in-memory), network, and command execution backends. No other tool in this comparison offers this level of pluggability.
