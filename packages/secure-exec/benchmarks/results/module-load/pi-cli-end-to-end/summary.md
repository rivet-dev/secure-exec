# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T05:29:53.251Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1471.664 ms
- Bridge calls/iteration: 5784.000
- Warm fixed session overhead: 5.091 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 3.500 ms, ExecutionResult->Destroy 0.000 ms, residual 0.591 ms
- Dominant bridge time: `_loadPolyfill` 741.734 ms/iteration across 5675.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9719927.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9737451.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2328.953 ms | 2318.782 ms | 10.171 ms | 5784 | 1240.449 ms |
| 2 | 1652.345 ms | 1646.974 ms | 5.371 ms | 5784 | 713.293 ms |
| 3 | 1290.983 ms | 1286.172 ms | 4.811 ms | 5784 | 575.711 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2318.782 ms | 0.000 ms | 2.171 ms |
| 2 | 1.000 ms | 4.000 ms | 1646.974 ms | 0.000 ms | 0.371 ms |
| 3 | 1.000 ms | 3.000 ms | 1286.172 ms | 0.000 ms | 0.811 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5675.000 | 741.734 ms | 0.131 ms | 9719927.000 |
| `_fsExists` | 55.000 | 47.196 ms | 0.858 ms | 2750.000 |
| `_resolveModule` | 34.000 | 34.722 ms | 1.021 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 6.461 ms | 6.461 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.853 ms | 3.853 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 2.772 ms | 0.554 ms | 7684.000 |
| `_fsWriteFile` | 1.000 | 1.298 ms | 1.298 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.246 ms | 1.246 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.231 ms | 1.231 ms | 47.000 |
| `_fsStat` | 1.000 | 1.213 ms | 1.213 ms | 205.667 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5784.000 | 9737451.667 | 9465603.667 |
| `send:Execute` | 1.000 | 1241953.000 | 0.000 |
| `recv:BridgeCall` | 5784.000 | 971466.000 | 618862.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

