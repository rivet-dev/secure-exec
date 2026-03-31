# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T05:47:54.085Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1959.386 ms
- Bridge calls/iteration: 5784.000
- Warm fixed session overhead: 9.326 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 0.000 ms, residual 3.826 ms
- Dominant bridge time: `_loadPolyfill` 861.924 ms/iteration across 5675.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9719927.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9737453.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2210.842 ms | 2195.228 ms | 15.614 ms | 5784 | 1123.673 ms |
| 2 | 2057.668 ms | 2049.167 ms | 8.501 ms | 5784 | 981.206 ms |
| 3 | 1861.103 ms | 1850.952 ms | 10.151 ms | 5784 | 820.716 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.000 ms | 6.000 ms | 2195.228 ms | 1.000 ms | 4.614 ms |
| 2 | 0.000 ms | 5.000 ms | 2049.167 ms | 0.000 ms | 3.501 ms |
| 3 | 1.000 ms | 5.000 ms | 1850.952 ms | 0.000 ms | 4.151 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5675.000 | 861.924 ms | 0.152 ms | 9719927.000 |
| `_fsExists` | 55.000 | 52.870 ms | 0.961 ms | 2750.000 |
| `_resolveModule` | 34.000 | 43.321 ms | 1.274 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 4.733 ms | 4.733 ms | 47.000 |
| `_fsReadFile` | 5.000 | 3.052 ms | 0.610 ms | 7684.000 |
| `_networkFetchRaw` | 1.000 | 2.943 ms | 2.943 ms | 1231.000 |
| `_fsWriteFile` | 1.000 | 1.492 ms | 1.492 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.183 ms | 1.183 ms | 47.000 |
| `_fsStat` | 1.000 | 1.141 ms | 1.141 ms | 207.000 |
| `_fsUtimes` | 1.000 | 1.054 ms | 1.054 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5784.000 | 9737453.000 | 9465605.000 |
| `send:Execute` | 1.000 | 1241953.000 | 0.000 |
| `recv:BridgeCall` | 5784.000 | 971466.000 | 618862.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:29:53.251Z

- Warm wall: 1471.664 -> 1959.386 ms (+487.722 ms (+33.14%))
- Bridge calls/iteration: 5784.000 -> 5784.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 5.091 -> 9.326 ms (+4.235 ms (+83.19%))
- Warm Create->InjectGlobals: 1.000 -> 0.500 ms (-0.500 ms (-50.00%))
- Warm InjectGlobals->Execute: 3.500 -> 5.000 ms (+1.500 ms (+42.86%))
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 0.591 -> 3.826 ms (+3.235 ms (+547.38%))
- Bridge time/iteration: 843.151 -> 975.198 ms (+132.047 ms (+15.66%))
- BridgeResponse encoded bytes/iteration: 9737451.667 -> 9737453.000 bytes (+1.333 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 741.734 | 861.924 | +120.190 |
| Method time | `_resolveModule` | 34.722 | 43.321 | +8.599 |
| Method time | `_fsExists` | 47.196 | 52.870 | +5.674 |
| Method bytes | `_fsStat` | 205.667 | 207.000 | +1.333 |
| Frame bytes | `send:Ping` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `recv:Pong` | 0.000 | 38.000 | +38.000 |
| Frame bytes | `send:BridgeResponse` | 9737451.667 | 9737453.000 | +1.333 |

