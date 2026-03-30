# Isolation Mechanisms Comparison

A comparison of sandboxing and isolation approaches relevant to running untrusted or semi-trusted code in JavaScript/TypeScript environments.

## Approaches

### V8 Isolates

**What it is:** Creates separate V8 heap instances within a single process. Each isolate has its own memory, GC, and execution context with no shared state. A V8 isolate package exposes this via a Node.js API.

**Architecture:** A host Node.js process creates isolate instances, compiles code into them, and communicates across the boundary via `Reference` objects (opaque handles) and `transferIn`/`transferOut` for data copying. No shared memory — all data must be explicitly transferred or copied.

**Strengths:**
- True memory isolation — one isolate cannot read another's heap
- Sub-millisecond startup (~0.5ms to create a context)
- Configurable memory limits per isolate (e.g., 128MB)
- No filesystem, network, or OS access by default — must be explicitly bridged
- Battle-tested in production (Cloudflare Workers uses V8 isolates at scale)
- Runs in the same process — no IPC overhead for function calls

**Weaknesses:**
- Node.js-only (requires native addon via N-API)
- Data transfer across boundary requires serialization (base64 for binary)
- No direct access to host APIs — every capability must be bridged manually
- Single-threaded per isolate — CPU-bound code blocks the isolate
- The V8 isolate package is a community package, not officially supported by V8 team
- No syscall-level isolation — a native addon bug could escape

**libsandbox relevance:** This is libsandbox's primary isolation mechanism for the Node driver. The entire bridge system exists to selectively expose Node APIs across the isolate boundary.

---

### WebAssembly (quickjs-emscripten, Pyodide)

**What it is:** Compile a language runtime (QuickJS, CPython) to WebAssembly, then run user code inside that runtime. The WASM sandbox provides memory isolation by design — WASM modules can only access their own linear memory.

**Architecture:** The host loads a `.wasm` binary containing the interpreter, passes source code in, and communicates via WASM imports/exports. The interpreter runs entirely within WASM's sandboxed memory space.

**Strengths:**
- Runs in both browser and Node.js (universal)
- Strong memory isolation by WASM spec — no out-of-bounds access
- Deterministic execution (no GC pauses in the WASM module itself)
- Can run non-JS languages (Python via Pyodide, Lua, etc.)
- No native addons required

**Weaknesses:**
- Significant startup cost for large runtimes (Pyodide ~4MB, QuickJS ~500KB)
- Performance overhead — interpreted-in-interpreted (JS code running in a JS interpreter compiled to WASM)
- QuickJS lacks modern ES features and is significantly slower than V8
- WASM-based runtimes don't support Node.js APIs natively
- Debugging is difficult — source maps don't cross the WASM boundary cleanly
- Memory management is manual (linear memory, no GC integration with host)

**libsandbox relevance:** An alternative isolation layer that would enable browser support without Workers, but at significant performance cost. The interpreted-in-interpreted penalty makes this impractical for running real Node.js workloads.

---

### Firecracker microVMs (Deno Sandbox, E2B)

**What it is:** Lightweight virtual machines using Linux KVM. Firecracker (open-source by AWS) creates microVMs with a minimal device model — each VM gets its own kernel, filesystem, and network stack.

**Architecture:** A VMM (Virtual Machine Monitor) process manages VM lifecycle. Each microVM boots a Linux kernel with a minimal rootfs. Communication happens over vsock or virtio-net. Startup is ~125ms for Firecracker.

**Strengths:**
- Strongest isolation — full kernel boundary, independent of language runtime
- Each sandbox is a complete Linux environment (can run any binary)
- Memory and CPU limits enforced by the hypervisor
- Snapshot/restore enables sub-100ms warm starts
- Network namespace isolation — full control over connectivity

**Weaknesses:**
- Requires Linux with KVM support (no browser, no macOS/Windows)
- Server-side only — cannot run on end-user devices
- Higher resource overhead (~5MB minimum per VM)
- Startup is milliseconds, not microseconds
- Requires infrastructure to manage VM pools and scheduling
- Filesystem must be provisioned (rootfs images, overlay mounts)

**libsandbox relevance:** Overkill for libsandbox's use case (running JS/TS code snippets), but relevant as the strongest option for managed sandbox services. E2B and Deno Sandbox use this approach.

---

### Containers (Docker-based)

**What it is:** Linux containers using namespaces (pid, net, mount, user) and cgroups for resource limits. Docker popularized the interface but the primitives are kernel features.

**Architecture:** A container runtime (runc, containerd) sets up namespaces and cgroup limits, then exec's the target process inside the isolated namespace. Filesystem isolation via overlay mounts.

**Strengths:**
- Mature ecosystem — extensive tooling, images, orchestration
- Can run any Linux binary/application
- Resource limits via cgroups (CPU, memory, I/O, network)
- Filesystem isolation via overlay filesystem
- Fast startup (~100-500ms for lightweight containers)

**Weaknesses:**
- Weaker isolation than VMs — shared kernel attack surface
- Container escapes are a known class of vulnerability
- Linux-only for native containers (Docker Desktop uses a VM on macOS/Windows)
- Not suitable for browser environments
- Per-container overhead (rootfs, process, network stack)
- Requires root or rootless container runtime setup

**libsandbox relevance:** Used by platforms like Replit for full development environments. Too heavy for libsandbox's in-process model but relevant for understanding the managed sandbox landscape.

---

### SES / Object Capabilities (Agoric, MetaMask Snaps)

**What it is:** Secure ECMAScript (SES) uses `lockdown()` to freeze all built-in objects and `Compartment` to create isolated evaluation contexts. Access to capabilities (filesystem, network) is granted explicitly by passing objects into the compartment.

**Architecture:** `lockdown()` hardens the global environment (freezes prototypes, removes ambient authority). `new Compartment({ globals, modules })` creates an evaluation scope where only explicitly granted globals and modules are available. Code evaluated in a Compartment cannot access anything not passed to it.

**Strengths:**
- Pure JavaScript — no native addons, works in any JS environment
- Zero startup overhead (just function calls)
- Fine-grained capability control — grant exactly the APIs you want
- Formally analyzed security model (object-capability discipline)
- Used in production by MetaMask Snaps and Agoric blockchain

**Weaknesses:**
- Not memory-isolated — shares the same V8 heap as the host
- Relies on JavaScript spec compliance — engine bugs can break the sandbox
- Cannot prevent CPU exhaustion (infinite loops) without external timeout
- `lockdown()` has performance implications (freezing all builtins)
- Ecosystem compatibility issues — libraries that modify prototypes break
- Spec is still evolving (TC39 proposal stage)

**libsandbox relevance:** A lighter-weight alternative to V8 isolates that would work in browsers without Workers. The lack of memory isolation and CPU limits makes it insufficient for running untrusted code, but the capability model is a good conceptual match for libsandbox's permission system.

---

### Membrane Proxies (near-membrane, Salesforce Locker)

**What it is:** JavaScript `Proxy` objects that intercept all property access, method calls, and object creation to enforce access policies. A "membrane" wraps an object graph so that objects from one realm cannot directly touch objects from another.

**Architecture:** The host wraps target objects in Proxy handlers. Every property access, function call, and prototype traversal goes through the membrane, which can allow, deny, or transform the operation. Objects returned from proxied calls are themselves wrapped.

**Strengths:**
- Pure JavaScript — no native addons
- Can enforce fine-grained access policies per property/method
- Transparent to well-behaved code — proxied objects behave like originals
- Can be layered on top of other isolation (SES + membrane)
- Good for isolating third-party UI components (Salesforce Lightning)

**Weaknesses:**
- Significant performance overhead — every operation goes through a Proxy trap
- Same heap as host — no memory isolation
- Cannot intercept all operations (some engine internals bypass Proxy)
- Complex to implement correctly — identity discontinuity, prototype chain issues
- `Proxy` can be detected by code (not fully transparent)
- No protection against CPU exhaustion or memory bombs

**libsandbox relevance:** Useful as a complement to isolation (e.g., wrapping bridge references for additional access control), but not a standalone sandbox. libsandbox's permission system achieves similar policy goals at the bridge layer instead.

---

### Cross-Origin Iframes / Web Workers

**What it is:** Browser-native isolation primitives. Cross-origin iframes get separate browsing contexts (no DOM access to parent). Web Workers run in separate threads with no shared globals. `SharedArrayBuffer` can optionally enable shared memory.

**Architecture:** The parent page creates an iframe with `sandbox` attribute or a Worker from a URL/blob. Communication happens via `postMessage` (structured clone algorithm). The child context has its own global scope and event loop.

**Strengths:**
- Browser-native — no library needed, standard APIs
- Workers run on separate threads — true parallelism
- No shared globals between parent and Worker
- Well-understood security model (same-origin policy)
- Workers support `Transferable` objects for zero-copy binary transfer
- Service Workers enable offline and request interception

**Weaknesses:**
- Browser-only (not available in Node.js)
- Communication is async-only via `postMessage`
- Workers have no DOM access
- Iframes have higher overhead than Workers (full browsing context)
- `eval()` in Workers is not isolated from the Worker's own globals
- No memory limits — a Worker can consume arbitrary memory

**libsandbox relevance:** This is libsandbox's browser isolation mechanism. `NodeRuntime` uses a browser runtime driver that creates a Web Worker and communicates via a request/response protocol over `postMessage`. Note that Worker isolation is weaker than V8 isolates — code in the Worker has full access to the Worker global scope.

---

### Node.js `vm` Module

**What it is:** Node.js built-in module that creates V8 contexts (not isolates) for running code with customized global objects. Available as `vm.createContext()` and `vm.runInContext()`.

**Architecture:** Creates a new V8 context within the same isolate (same heap). The context gets a fresh set of global bindings but shares the underlying memory space, built-in prototypes, and GC with the host.

**Strengths:**
- Built into Node.js — no dependencies
- Fast context creation
- Custom global objects — can control what's visible
- Supports ESM modules (`vm.Module` — experimental)

**Weaknesses:**
- **Not a security boundary** — Node.js docs explicitly warn against using it for sandboxing
- Same V8 isolate — can access host objects via prototype chain traversal
- `this.constructor.constructor('return process')()` escapes trivially
- No memory isolation — can exhaust host memory
- No CPU isolation — infinite loops block the host
- Built-in modules (`require('fs')`) are accessible via constructor chains

**libsandbox relevance:** This is the approach libsandbox explicitly avoids. The `vm` module is useful for module loading and code transformation but provides no meaningful isolation. V8 isolates solve the same problem with real isolation guarantees.

---

## Comparison Matrix

| Mechanism | Security | Performance | Startup | API Surface | Browser | Node.js |
|---|---|---|---|---|---|---|
| V8 Isolates | High | Near-native | <1ms | Manual bridge | No | Yes |
| WebAssembly | High | 2-10x slower | 10-100ms | Manual bridge | Yes | Yes |
| Firecracker microVMs | Highest | Native | ~125ms | Full Linux | No | Server |
| Containers | Medium-High | Native | 100-500ms | Full Linux | No | Server |
| SES / Compartments | Medium | ~Native | <1ms | Capability-based | Yes | Yes |
| Membrane Proxies | Low-Medium | Slower (Proxy) | <1ms | Policy-filtered | Yes | Yes |
| Workers / Iframes | Medium | Native | 1-10ms | postMessage | Yes | No |
| Node.js `vm` | None | Native | <1ms | Full (unsafe) | No | Yes |

### Key for Security ratings:
- **Highest**: Kernel-level isolation (separate address space, syscall filtering)
- **High**: Separate heap, no shared memory, controlled communication
- **Medium**: Separate execution context, but shared process or heap
- **Low-Medium**: Same heap, policy enforcement via runtime interception
- **None**: Trivially escapable

## Summary

libsandbox's choice of V8 isolates (Node) + Web Workers (browser) represents a pragmatic middle ground: strong isolation with near-native performance and fast startup, at the cost of manually bridging every API. The driver architecture cleanly separates the isolation mechanism from the API surface, making it feasible to swap or layer mechanisms in the future.
