# Pi SDK End-to-End

Scenario: `pi-sdk-end-to-end`
Generated: 2026-03-31T05:29:40.433Z
Description: Runs createAgentSession + runPrintMode against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1334.696 ms
- Bridge calls/iteration: 5747.000
- Warm fixed session overhead: 106.892 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 101.500 ms, residual 0.392 ms
- Dominant bridge time: `_loadPolyfill` 556.728 ms/iteration across 5664.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9703825.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9715780.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1663.525 ms | 1549.805 ms | 113.720 ms | 5747 | 806.165 ms |
| 2 | 1264.777 ms | 1157.821 ms | 106.956 ms | 5747 | 512.033 ms |
| 3 | 1404.614 ms | 1297.786 ms | 106.828 ms | 5747 | 561.957 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 6.000 ms | 1549.805 ms | 103.000 ms | 1.720 ms |
| 2 | 0.000 ms | 5.000 ms | 1157.821 ms | 101.000 ms | 0.956 ms |
| 3 | 1.000 ms | 4.000 ms | 1297.786 ms | 102.000 ms | -0.172 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5664.000 | 556.728 ms | 0.098 ms | 9703825.000 |
| `_resolveModule` | 34.000 | 34.714 ms | 1.021 ms | 4795.000 |
| `_fsExists` | 38.000 | 30.622 ms | 0.806 ms | 1900.000 |
| `_networkFetchRaw` | 1.000 | 2.864 ms | 2.864 ms | 1231.000 |
| `_fsReadFile` | 2.000 | 1.425 ms | 0.713 ms | 3453.000 |
| `_cryptoRandomUUID` | 5.000 | 0.265 ms | 0.053 ms | 435.000 |
| `_log` | 3.000 | 0.100 ms | 0.033 ms | 141.000 |

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
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

