# Cloudflare Workers Isolate Security Model vs libsandbox

## Cloudflare Workers Security Model

Cloudflare uses V8 isolates as their primary isolation boundary but does not rely on them alone. Their production system has 9 layers of defense-in-depth:

1. **V8 isolates** -- separate JS heaps, no shared memory between tenants
2. **V8 sandbox (pointer compression)** -- 4 GiB cage confines memory corruption; each isolate group has an independent sandbox
3. **Hardware memory protection keys (Intel PKU/MPK)** -- CPU-enforced isolation, blocks 92% of cross-isolate reads at the hardware level via ~12 random protection keys per process
4. **Process-level sandbox** -- Linux namespaces (totally empty filesystem) + seccomp (blocks all FS and network syscalls); stricter than typical containers
5. **Cordon system** -- trust-based process grouping; free-tier users never co-reside with enterprise tenants in the same OS process
6. **Dynamic process isolation** -- hardware performance counters detect Spectre-like branch misprediction patterns and automatically move suspicious workers to isolated processes
7. **Capability-based API** -- workers start with zero ambient authority; all external access requires explicit configuration bindings (immune to SSRF by design)
8. **Code restrictions** -- no `eval()` or `new Function()` during request handling, no native code, no `SharedArrayBuffer`
9. **<24 hour V8 patch cadence** -- automated systems deploy V8 security patches within hours of publication

### Key architectural decisions

- Many isolates share a single OS process (microsecond startup, minimal overhead)
- All built-in APIs implemented in native C++ (not JS), shared across isolates
- Communication between co-located workers happens in-thread with zero latency
- The open-source runtime (`workerd`) explicitly warns it is **"not, on its own, a secure way to run possibly-malicious code"** -- the production-only hardening layers are what make the system trustworthy

### Spectre mitigations (detailed)

Cloudflare collaborated with TU Graz (co-discoverers of original Spectre). Researchers with full source access achieved 120 bits/hour leakage via Spectre v1 -- impractical in production due to noise from concurrent requests and periodic memory reshuffling.

Cascading defense:
- **Step 0:** No native code (JS/Wasm only), eliminating x86-specific vectors like CLFLUSH
- **Step 1:** Frozen clocks -- `Date.now()` returns time of triggering network message, does not advance during execution; no `SharedArrayBuffer` or multi-threading
- **Step 2:** Dynamic process isolation via hardware perf counter monitoring of branch mispredictions
- **Step 3:** Periodic memory shuffling via runtime restarts and worker rescheduling

### Resource limits

| Resource | Free plan | Paid plan |
|---|---|---|
| CPU time per request | 10 ms | Up to 5 min |
| Memory per isolate | 128 MB | 128 MB |
| Subrequests | 50 | Up to 10,000 |

### Known limitations acknowledged by Cloudflare

- V8 cannot defend against Spectre on its own (per Google's V8 team)
- Complete Spectre elimination is theoretically impossible; strategy focuses on making attacks impractically slow
- Remote timing attacks remain theoretically possible but undemonstrated at practical speeds in production
- No public V8 isolate escapes in Workers production have been disclosed

## Comparison with libsandbox

libsandbox uses `isolated-vm` (also V8 isolates) and shares some of the same principles.

| Aspect | Cloudflare Workers | libsandbox |
|---|---|---|
| Isolate tech | V8 (custom workerd) | V8 (isolated-vm) |
| Default posture | Zero capabilities | Zero capabilities |
| Permission model | Capability bindings in config | Function-based permission checks |
| FS access | Blocked at syscall level | No FS unless VirtualFileSystem provided |
| Network | Mediated through proxy | No network unless NetworkAdapter provided |
| Process spawn | Not available | No spawn unless CommandExecutor provided |
| Memory limits | 128 MB hard cap | Configurable (default 128 MB) |
| CPU/time limits | 10ms-5min hard cap | **None** |
| OS-level sandbox | seccomp + namespaces | **None** |
| Spectre mitigations | Frozen clocks, perf counters, process isolation | **None** |
| eval/dynamic code | Blocked during request handling | **Not restricted** |
| Native code | Blocked (JS/Wasm only) | Blocked (isolated-vm limitation) |

### What libsandbox does well

- **Default-deny posture** -- no FS, no network, no processes until explicitly provided via driver interfaces. This mirrors Cloudflare's capability-based approach.
- **Permission granularity** -- per-operation permission checks for fs, network, child process, and env with full request context (path, URL, command, etc.)
- **Memory limits** -- configurable V8 isolate memory cap
- **Clean abstraction boundary** -- all host communication goes through bridge References; no shared heap

## Security Gaps

### 1. No CPU/time limits (HIGH)

A malicious `while(true){}` locks the isolate permanently. `isolated-vm` supports timeouts on `run()`/`eval()` calls -- these should be used.

**Recommendation:** Add execution timeouts using isolated-vm's timeout parameter on script execution calls. Expose a configurable `executionTimeout` option.

### 2. No OS-level sandboxing (MEDIUM-HIGH)

The host Node.js process has full OS access. If there is ever an isolated-vm escape (V8 bug), the attacker owns the host process with all its permissions. Cloudflare wraps everything in seccomp + empty namespaces.

**Recommendation:**
- Document that isolated-vm alone is not sufficient for running untrusted code from the internet
- Provide guidance for users to run the host process in a container with minimal capabilities (`--cap-drop=ALL`)
- Consider optional integration with Linux namespaces or seccomp for the host process

### 3. No Spectre mitigations (MEDIUM)

`Date.now()` likely returns real time in isolated-vm, usable as a timing side-channel. Cloudflare freezes clocks during execution and monitors for Spectre patterns.

**Recommendation:**
- Override `Date.now()` and `performance.now()` in the isolate bridge to return fixed values (time of execution start)
- Ensure `SharedArrayBuffer` is not available in the isolate (likely already absent)

### 4. eval() and new Function() unrestricted (MEDIUM)

Cloudflare blocks these during request handling because they make forensic analysis of exploits harder and expand the attack surface for V8 bugs.

**Recommendation:** Add an option to disable dynamic code generation in the isolate. `isolated-vm` may support this via V8 flags or by overriding these globals in the bridge.

### 5. No resource limits on child processes/network (LOW-MEDIUM)

If a CommandExecutor or NetworkAdapter is provided, there is no rate limiting on concurrent subprocesses, network requests/bandwidth, or disk writes.

**Recommendation:** Add optional rate limiting and concurrency caps to the driver interfaces. For example: max concurrent child processes, max concurrent fetch requests, max total bytes written.

### 6. Permission check default behavior (LOW-MEDIUM)

In `checkPermission()`, if no permission check function is defined, the operation is allowed. This is safe when no driver is provided (operations throw ENOSYS), but could surprise users who provide a driver without configuring permission checks.

**Recommendation:** Consider whether the default should be deny-if-no-check-defined when a driver is present.

## Recommended Priority Order

1. Add execution timeouts (isolated-vm timeout parameter)
2. Freeze `Date.now()` / `performance.now()` in bridge
3. Document threat model explicitly -- isolated-vm is not sufficient for untrusted internet code without additional OS-level hardening
4. Add OS-level hardening guidance (container/namespace recommendations)
5. Add `eval()` restriction option
6. Add subprocess/network rate limits

## Sources

- [Cloudflare Workers Security Model (official docs)](https://developers.cloudflare.com/workers/reference/security-model/)
- [Safe in the sandbox: security hardening for Cloudflare Workers (Sept 2025)](https://blog.cloudflare.com/safe-in-the-sandbox-security-hardening-for-cloudflare-workers/)
- [Mitigating Spectre and Other Security Threats (Kenton Varda)](https://blog.cloudflare.com/mitigating-spectre-and-other-security-threats-the-cloudflare-workers-security-model/)
- [Dynamic Process Isolation: Research with TU Graz](https://blog.cloudflare.com/spectre-research-with-tu-graz/)
- [Introducing workerd](https://blog.cloudflare.com/workerd-open-source-workers-runtime/)
- [workerd on GitHub](https://github.com/cloudflare/workerd)
