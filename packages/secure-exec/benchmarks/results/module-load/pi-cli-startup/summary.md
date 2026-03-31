# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T22:13:13.034Z
Description: Boots the Pi CLI help path inside the sandbox.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1595.248 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.021 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 3.021 ms
- Dominant bridge time: `_bridgeDispatch` 851.606 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547818.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 77.475 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3312401.000 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1553.175 ms; runtime create 105.728 ms; first pass 1447.447 ms; checks `stdoutHasUsage`=true
- Sandbox true cold start, warm snapshot disabled: total 1300.629 ms; runtime create 5.141 ms; first pass 1295.488 ms; checks `stdoutHasUsage`=true
- Sandbox new-session replay, warm snapshot enabled: cold 2223.988 ms; warm 1595.248 ms
- Sandbox new-session replay, warm snapshot disabled: cold 1365.171 ms; warm 1271.171 ms
- Sandbox same-session replay: total 1489.551 ms; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 340.056 ms; first 339.371 ms; replay 0.682 ms; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2223.988 ms | 2210.656 ms | 13.332 ms | 2562 | 1333.937 ms |
| 2 | 1571.925 ms | 1562.293 ms | 9.632 ms | 2562 | 811.191 ms |
| 3 | 1618.572 ms | 1610.163 ms | 8.409 ms | 2562 | 886.933 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2210.656 ms | 1.000 ms | 3.332 ms |
| 2 | 6.000 ms | 0.000 ms | 1562.293 ms | 1.000 ms | 2.632 ms |
| 3 | 5.000 ms | 0.000 ms | 1610.163 ms | 0.000 ms | 3.409 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 851.606 ms | 0.349 ms | 2547818.333 |
| `_loadPolyfill` | 70.000 | 77.475 ms | 1.107 ms | 758579.667 |
| `_fsExists` | 41.000 | 64.095 ms | 1.563 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 5.700 ms | 5.700 ms | 47.000 |
| `_fsChmod` | 1.000 | 2.973 ms | 2.973 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 2.882 ms | 2.882 ms | 47.000 |
| `_fsStat` | 1.000 | 1.524 ms | 1.524 ms | 207.000 |
| `_fsReadFile` | 2.000 | 1.487 ms | 0.744 ms | 3364.000 |
| `_fsUtimes` | 1.000 | 1.157 ms | 1.157 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.141 ms | 1.141 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 70.000 | 77.475 ms | 758579.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 3312401.000 | 3191987.000 |
| `recv:BridgeCall` | 2562.000 | 530167.000 | 369218.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 14155.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T21:01:01.324Z

- Warm wall: 1367.156 -> 1595.248 ms (+228.092 ms (+16.68%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.168 -> 9.021 ms (-0.147 ms (-1.60%))
- Warm Create->InjectGlobals: 5.500 -> 5.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.668 -> 3.021 ms (-0.647 ms (-17.64%))
- Bridge time/iteration: 846.662 -> 1010.687 ms (+164.025 ms (+19.37%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312401.000 bytes (+0.667 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 63.722 -> 77.475 ms (+13.753 ms (+21.58%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 716.479 | 851.606 | +135.127 |
| Method time | `_loadPolyfill` | 63.722 | 77.475 | +13.753 |
| Method time | `_fsExists` | 51.473 | 64.095 | +12.622 |
| Method bytes | `_fsStat` | 206.333 | 207.000 | +0.667 |
| Frame bytes | `send:BridgeResponse` | 3312400.333 | 3312401.000 | +0.667 |

