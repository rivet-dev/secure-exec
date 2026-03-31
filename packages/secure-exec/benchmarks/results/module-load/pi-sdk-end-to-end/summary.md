# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T05:47:41.981Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1294.301 ms
- Bridge calls/iteration: 5747.000
- Warm fixed session overhead: 109.273 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 4.000 ms, ExecutionResult->Destroy 101.500 ms, residual 2.773 ms
- Dominant bridge time: `_loadPolyfill` 587.640 ms/iteration across 5664.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9703825.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9715780.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2091.848 ms | 1973.489 ms | 118.359 ms | 5747 | 954.306 ms |
| 2 | 1339.707 ms | 1229.927 ms | 109.780 ms | 5747 | 535.359 ms |
| 3 | 1248.894 ms | 1140.127 ms | 108.767 ms | 5747 | 491.296 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.000 ms | 7.000 ms | 1973.489 ms | 102.000 ms | 5.359 ms |
| 2 | 1.000 ms | 4.000 ms | 1229.927 ms | 102.000 ms | 2.780 ms |
| 3 | 1.000 ms | 4.000 ms | 1140.127 ms | 101.000 ms | 2.767 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5664.000 | 587.640 ms | 0.104 ms | 9703825.000 |
| `_resolveModule` | 34.000 | 35.275 ms | 1.037 ms | 4795.000 |
| `_fsExists` | 38.000 | 33.169 ms | 0.873 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 2.698 ms | 2.698 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 1.255 ms | 0.628 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.219 ms | 0.044 ms | 435.000 |
| `_log` | 3.000 | 0.064 ms | 0.021 ms | 141.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5747.000 | 9715780.000 | 9445671.000 |
| `send:Execute` | 1.000 | 1241735.000 | 0.000 |
| `recv:BridgeCall` | 5747.000 | 966611.000 | 616170.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:40.433Z

- Warm wall: 1334.696 -> 1294.301 ms (-40.395 ms (-3.03%))
- Bridge calls/iteration: 5747.000 -> 5747.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 106.892 -> 109.273 ms (+2.381 ms (+2.23%))
- Warm Create->InjectGlobals: 0.500 -> 1.000 ms (+0.500 ms (+100.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.000 ms (-0.500 ms (-11.11%))
- Warm ExecutionResult->Destroy: 101.500 -> 101.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.392 -> 2.773 ms (+2.381 ms (+607.40%))
- Bridge time/iteration: 626.718 -> 660.320 ms (+33.602 ms (+5.36%))
- BridgeResponse encoded bytes/iteration: 9715780.000 -> 9715780.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 556.728 | 587.640 | +30.912 |
| Method time | `_fsExists` | 30.622 | 33.169 | +2.547 |
| Method time | `_resolveModule` | 34.714 | 35.275 | +0.561 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |

