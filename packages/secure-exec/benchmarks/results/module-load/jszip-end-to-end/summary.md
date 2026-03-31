# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T20:29:36.447Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 77.776 ms
- Bridge calls/iteration: 182.000
- Warm fixed session overhead: 6.130 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 0.630 ms
- Dominant bridge time: `_loadPolyfill` 43.727 ms/iteration across 17.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 233610.000 bytes/iteration
- _loadPolyfill real polyfill-body loads: 17.000 calls/iteration, 43.727 ms/iteration, 233610.000 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:WarmSnapshot` 411447.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 335.160 ms | 320.618 ms | 14.542 ms | 182 | 173.637 ms |
| 2 | 83.108 ms | 76.227 ms | 6.881 ms | 182 | 13.829 ms |
| 3 | 72.444 ms | 67.065 ms | 5.379 ms | 182 | 10.329 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 12.000 ms | 0.000 ms | 320.618 ms | 0.000 ms | 2.542 ms |
| 2 | 6.000 ms | 0.000 ms | 76.227 ms | 0.000 ms | 0.881 ms |
| 3 | 5.000 ms | 0.000 ms | 67.065 ms | 0.000 ms | 0.379 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 17.000 | 43.727 ms | 2.572 ms | 233610.000 |
| `_bridgeDispatch` | 164.000 | 22.101 ms | 0.135 ms | 177197.667 |
| `_log` | 1.000 | 0.104 ms | 0.104 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 17.000 | 43.727 ms | 233610.000 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:WarmSnapshot` | 0.333 | 411447.667 | 0.000 |
| `send:BridgeResponse` | 182.000 | 410854.667 | 402300.667 |
| `recv:BridgeCall` | 182.000 | 31859.000 | 20438.000 |
| `send:Execute` | 1.000 | 15833.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:StreamEvent` | 1.000 | 58.000 | 13.000 |
| `send:Ping` | 1.333 | 50.667 | 42.667 |
| `recv:Pong` | 1.333 | 50.667 | 42.667 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T13:28:24.667Z

- Warm wall: 193.293 -> 77.776 ms (-115.517 ms (-59.76%))
- Bridge calls/iteration: 182.000 -> 182.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 108.653 -> 6.130 ms (-102.523 ms (-94.36%))
- Warm Create->InjectGlobals: 4.500 -> 5.500 ms (+1.000 ms (+22.22%))
- Warm InjectGlobals->Execute: 1.000 -> 0.000 ms (-1.000 ms (-100.00%))
- Warm ExecutionResult->Destroy: 101.500 -> 0.000 ms (-101.500 ms (-100.00%))
- Warm residual overhead: 1.653 -> 0.630 ms (-1.023 ms (-61.89%))
- Bridge time/iteration: 59.496 -> 65.932 ms (+6.436 ms (+10.82%))
- BridgeResponse encoded bytes/iteration: 421791.667 -> 410854.667 bytes (-10937.000 bytes (-2.59%))
- _loadPolyfill real polyfill-body loads: calls 17.000 -> 17.000 calls (0.000 calls (0.00%)); time 44.497 -> 43.727 ms (-0.770 ms (-1.73%)); response bytes 233549.333 -> 233610.000 bytes (+60.667 bytes (+0.03%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 164.000 -> 0.000 calls (-164.000 calls (-100.00%)); time 14.882 -> 0.000 ms (-14.882 ms (-100.00%)); response bytes 188195.333 -> 0.000 bytes (-188195.333 bytes (-100.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 0.000 | 22.101 | +22.101 |
| Method time | `_loadPolyfill` | 59.379 | 43.727 | -15.652 |
| Method time | `_log` | 0.117 | 0.104 | -0.013 |
| Method bytes | `_loadPolyfill` | 421744.667 | 233610.000 | -188134.667 |
| Method bytes | `_bridgeDispatch` | 0.000 | 177197.667 | +177197.667 |
| Frame bytes | `send:BridgeResponse` | 421791.667 | 410854.667 | -10937.000 |
| Frame bytes | `send:Execute` | 14851.000 | 15833.000 | +982.000 |
| Frame bytes | `recv:BridgeCall` | 32458.000 | 31859.000 | -599.000 |

