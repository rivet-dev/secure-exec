# Microbench Empty Session

Scenario: `micro-empty-session`
Kind: `lifecycle`
Generated: 2026-03-31T23:09:13.975Z
Description: Executes a no-op script to isolate fresh-session create, execute, and destroy overhead.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 24.437 ms
- Bridge calls/iteration: 4.000
- Warm fixed session overhead: 5.563 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 4.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 1.063 ms
- Dominant bridge time: `_loadPolyfill` 10.144 ms/iteration across 2.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 2.000 calls/iteration, 10.144 ms/iteration, 99809.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `stream/web` 1.000 calls/iteration, 5.367 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `stream/web` 1.000 calls/iteration, 5.367 ms/iteration, 57983.333 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 161.961 ms; runtime create 98.259 ms; first pass 63.702 ms; sandbox 0.000 ms; checks `noop`=true
- Sandbox true cold start, warm snapshot disabled: total 173.986 ms; runtime create 4.902 ms; first pass 169.084 ms; sandbox 0.000 ms; checks `noop`=true
- Sandbox new-session replay, warm snapshot enabled: cold 62.768 ms; warm 24.437 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 155.653 ms; warm 22.459 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 63.515 ms; first checks `noop`=true; replay checks `noop`=true
- Host same-session control: total 0.034 ms; first 0.028 ms; replay 0.004 ms; first checks `noop`=true; replay checks `noop`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 62.768 ms | 48.274 ms | 14.494 ms | 4 | 29.800 ms |
| 2 | 24.887 ms | 19.240 ms | 5.647 ms | 4 | 0.632 ms |
| 3 | 23.987 ms | 18.508 ms | 5.479 ms | 4 | 0.587 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 13.000 ms | 0.000 ms | 48.274 ms | 0.000 ms | 1.494 ms |
| 2 | 4.000 ms | 0.000 ms | 19.240 ms | 1.000 ms | 0.647 ms |
| 3 | 4.000 ms | 0.000 ms | 18.508 ms | 0.000 ms | 1.479 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2.000 | 10.144 ms | 5.072 ms | 99809.333 |
| `_bridgeDispatch` | 1.000 | 0.099 ms | 0.099 ms | 70.000 |
| `_log` | 1.000 | 0.097 ms | 0.097 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 2.000 | 10.144 ms | 99809.333 | 2 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 1.000 | 5.367 ms | 57983.333 |
| real polyfill-body loads | by calls | `url` | 1.000 | 4.777 ms | 41826.000 |
| real polyfill-body loads | by time | `stream/web` | 1.000 | 5.367 ms | 57983.333 |
| real polyfill-body loads | by time | `url` | 1.000 | 4.777 ms | 41826.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 | 5.367 ms | 57983.333 |
| real polyfill-body loads | by response bytes | `url` | 1.000 | 4.777 ms | 41826.000 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 4.000 | 99926.333 | 99738.333 |
| `send:Execute` | 1.000 | 14018.000 | 0.000 |
| `recv:BridgeCall` | 4.000 | 347.000 | 110.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T23:06:33.529Z

- Warm wall: 23.887 -> 24.437 ms (+0.550 ms (+2.30%))
- Bridge calls/iteration: 4.000 -> 4.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.994 -> 5.563 ms (-0.431 ms (-7.19%))
- Warm Create->InjectGlobals: 5.000 -> 4.000 ms (-1.000 ms (-20.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 0.994 -> 1.063 ms (+0.069 ms (+6.94%))
- Bridge time/iteration: 10.618 -> 10.340 ms (-0.278 ms (-2.62%))
- BridgeResponse encoded bytes/iteration: 99926.333 -> 99926.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 2.000 -> 2.000 calls (0.000 calls (0.00%)); time 10.415 -> 10.144 ms (-0.271 ms (-2.60%)); response bytes 99809.333 -> 99809.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.479 -> 5.367 ms (-0.112 ms (-2.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.936 -> 4.777 ms (-0.159 ms (-3.22%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.936 -> 4.777 ms (-0.159 ms (-3.22%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.479 -> 5.367 ms (-0.112 ms (-2.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 5.479 -> 5.367 ms (-0.112 ms (-2.04%)) | 57983.333 -> 57983.333 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 4.936 -> 4.777 ms (-0.159 ms (-3.22%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 10.415 | 10.144 | -0.271 |
| Method time | `_bridgeDispatch` | 0.107 | 0.099 | -0.008 |
| Method time | `_log` | 0.095 | 0.097 | +0.002 |

