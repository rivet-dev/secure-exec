# Attack Vectors

Catalog of known attack vectors against the sandbox runtime.

**Layer definitions** (see `docs-internal/glossary.md`):
- **Runtime** — affects the core isolate/bridge; every consumer is exposed regardless of configuration
- **Driver** — affects the host-side capability provider (fs, network, child_process); mitigation quality depends on their implementation
- **User** — affects whoever configures permissions; mitigation depends on how permissive they are

## CPU Exhaustion

| Vector                              | Layer   | Mitigated? | Notes                                                                                        |
| ----------------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------- |
| Infinite loop in sandbox code       | Runtime | Partial    | V8 isolate timeout via `cpuTimeLimitMs`. Gap: optional, no default; unset = no limit        |
| ReDoS (catastrophic regex)          | Runtime | Partial    | Caught by same CPU timeout. Gap: same; no per-regex complexity limit                         |
| Crypto cost abuse (pbkdf2/scrypt)   | Runtime | No         | No caps on iterations/N/r/p parameters. Burns host CPU outside isolate timeout               |
| JSON.parse bomb on host             | Runtime | No         | 8 host-side JSON.parse calls, no size check. Runs in host process; isolate limits don't help |

## Memory Exhaustion

| Vector                              | Layer   | Mitigated? | Notes                                                                                   |
| ----------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------- |
| Isolate heap exhaustion             | Runtime | Yes        | V8 isolate `memoryLimit` (default 128MB). OOM kills isolate, not host process          |
| Base64 amplification on host        | Runtime | No         | 50MB file → 67MB base64 on host heap. No transfer size cap; host OOM possible           |
| Timer/interval bombing              | Runtime | No         | Bridge timer map grows unbounded. No limit on count of active timers                    |
| stdout/stderr accumulation          | Runtime | No         | Output arrays grow unbounded on host. No cap on captured output size                    |
| Child process output accumulation   | Driver  | No         | stdout/stderr chunks concatenated without limit                                         |

## Thread Pool / Availability

| Vector                              | Layer   | Mitigated? | Notes                                                                                   |
| ----------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------- |
| Reference call flooding             | Runtime | No         | Async References use libuv thread pool. No concurrency limit; starves host I/O          |
| Active handle deadlock              | Runtime | No         | Handles that never unregister → sandbox never exits. No timeout on _waitForActiveHandles |

## Sandbox Escape

| Vector                              | Layer   | Mitigated? | Notes                                                                                   |
| ----------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------- |
| Prototype pollution across boundary | Runtime | Likely safe | V8 isolate copies values, no shared prototypes. Needs verification test               |
| Reference argument type confusion   | Runtime | No         | Host References don't validate argument types. String expected, object passed → UB      |
| Bridge global overwriting           | Runtime | No         | `_fs`, `_registerHandle` etc. are writable. Impact: self-sabotage / host hang, not escape |
| Module resolution path traversal    | Driver  | Partial    | VirtualFileSystem abstracts scope. Gap: no path canonicalization before permission check |
| Code injection via eval strings     | Runtime | Likely safe | JSON.stringify used for all interpolation. Needs audit of every eval() call site        |
| `__proto__` / constructor injection | Runtime | Likely safe | JSON.parse doesn't invoke setters. Parsed objects used as-is with no sanitize           |

## Information Disclosure

| Vector                              | Layer   | Mitigated? | Notes                                                                                   |
| ----------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------- |
| Error stack traces leak host paths  | Runtime | No         | Host Reference errors propagate into isolate. May contain host file paths               |
| Timing side channels                | Runtime | Partial    | `timingMitigation` option exists. Gap: `Date.now()` still advances during execution     |
| OS module leaking host info         | Driver  | Partial    | Bridge returns config values, not raw os calls. Depends on driver not passing real values |
| process.env leakage                 | Driver  | Partial    | filterEnv gates on permission checker. Gap: no built-in denylist for sensitive keys     |
| process.cwd / process.argv          | Driver  | Partial    | Values come from config. Gap: default config may use real host paths                    |

## Misuse

| Vector                              | Layer   | Mitigated? | Notes                                                                                   |
| ----------------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------- |
| Crypto mining                       | User    | No         | No compute budget beyond CPU timeout. Long timeout + WASM = effective mining            |
| Outbound network as open proxy      | User    | Partial    | Permission-gated via network checker. Gap: if fetch allowed, sandbox is open proxy      |
| DNS tunneling / data exfiltration   | User    | Partial    | Permission-gated via network checker. Gap: if DNS allowed, data encodes in queries      |
| Child process SSRF                  | User    | Partial    | Permission-gated via childProcess checker. Gap: can hit metadata endpoints if allowed   |
| Child process env hijacking         | User    | No         | LD_PRELOAD, NODE_OPTIONS passable via env. No denylist on dangerous env vars            |
| HTTP server serving bad content     | User    | Partial    | Loopback-only restriction. Gap: other processes on same host can reach it               |
