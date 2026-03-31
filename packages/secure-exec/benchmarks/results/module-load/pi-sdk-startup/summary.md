# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T22:12:40.594Z
Description: Loads the Pi SDK entry module and inspects its exported surface.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1628.007 ms
- Bridge calls/iteration: 2511.000
- Warm fixed session overhead: 9.200 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.000 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 2.700 ms
- Dominant bridge time: `_bridgeDispatch` 832.555 ms/iteration across 2437.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547621.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 62.592 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3309659.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1737.443 ms; runtime create 107.250 ms; first pass 1630.193 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox true cold start, warm snapshot disabled: total 1821.573 ms; runtime create 12.797 ms; first pass 1808.776 ms; sandbox 0.000 ms; checks `createAgentSessionType`=function, `runPrintModeType`=function
- Sandbox new-session replay, warm snapshot enabled: cold 1775.604 ms; warm 1628.007 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox new-session replay, warm snapshot disabled: cold 1623.520 ms; warm 1421.628 ms; sandbox cold 0.000 ms, warm 0.000 ms
- Sandbox same-session replay: total 1560.715 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function
- Host same-session control: total 338.967 ms; first 338.902 ms; replay 0.062 ms; first checks `createAgentSessionType`=function, `runPrintModeType`=function; replay checks `createAgentSessionType`=function, `runPrintModeType`=function

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1775.604 ms | 1761.191 ms | 14.413 ms | 2511 | 985.753 ms |
| 2 | 1682.780 ms | 1673.374 ms | 9.406 ms | 2511 | 895.736 ms |
| 3 | 1573.234 ms | 1564.239 ms | 8.995 ms | 2511 | 806.449 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1761.191 ms | 1.000 ms | 4.413 ms |
| 2 | 6.000 ms | 0.000 ms | 1673.374 ms | 1.000 ms | 2.406 ms |
| 3 | 6.000 ms | 0.000 ms | 1564.239 ms | 0.000 ms | 2.995 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2437.000 | 832.555 ms | 0.342 ms | 2547621.333 |
| `_loadPolyfill` | 70.000 | 62.592 ms | 0.894 ms | 758579.667 |
| `_fsExists` | 2.000 | 0.519 ms | 0.260 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.254 ms | 0.254 ms | 3311.000 |
| `_log` | 1.000 | 0.059 ms | 0.059 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 62.592 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2511.000 | 3309659.000 | 3191642.000 |
| `recv:BridgeCall` | 2511.000 | 520459.000 | 362433.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14284.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T21:00:49.796Z

- Warm wall: 1665.403 -> 1628.007 ms (-37.396 ms (-2.25%))
- Bridge calls/iteration: 2511.000 -> 2511.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 12.056 -> 9.200 ms (-2.856 ms (-23.69%))
- Warm Create->InjectGlobals: 6.000 -> 6.000 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 6.056 -> 2.700 ms (-3.356 ms (-55.42%))
- Bridge time/iteration: 854.598 -> 895.979 ms (+41.381 ms (+4.84%))
- BridgeResponse encoded bytes/iteration: 3309659.000 -> 3309659.000 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 74.071 -> 62.592 ms (-11.479 ms (-15.50%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 779.699 | 832.555 | +52.856 |
| Method time | `_loadPolyfill` | 74.071 | 62.592 | -11.479 |
| Method time | `_log` | 0.148 | 0.059 | -0.089 |

