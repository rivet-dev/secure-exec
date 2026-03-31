# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Generated: 2026-03-31T21:01:07.511Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.

## Progress Copy Fields

- Warm wall mean: 1754.015 ms
- Bridge calls/iteration: 2772.333
- Warm fixed session overhead: 13.227 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.500 ms, residual 6.226 ms
- Dominant bridge time: `_bridgeDispatch` 823.737 ms/iteration across 2638.333 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2679118.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 80.413 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3449878.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2081.957 ms | 2067.012 ms | 14.945 ms | 2773 | 1189.465 ms |
| 2 | 1778.983 ms | 1762.200 ms | 16.783 ms | 2772 | 832.019 ms |
| 3 | 1729.047 ms | 1719.377 ms | 9.670 ms | 2772 | 892.067 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 10.000 ms | 0.000 ms | 2067.012 ms | 0.000 ms | 4.945 ms |
| 2 | 7.000 ms | 0.000 ms | 1762.200 ms | 1.000 ms | 8.783 ms |
| 3 | 6.000 ms | 0.000 ms | 1719.377 ms | 0.000 ms | 3.670 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2638.333 | 823.737 ms | 0.312 ms | 2679118.667 |
| `_loadPolyfill` | 71.000 | 80.413 ms | 1.133 ms | 758629.667 |
| `_fsExists` | 43.000 | 45.285 ms | 1.053 ms | 2150.000 |
| `_fsMkdir` | 1.000 | 6.043 ms | 6.043 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 5.861 ms | 5.861 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 3.305 ms | 0.661 ms | 7684.000 |
| `_fsChmod` | 1.000 | 1.261 ms | 1.261 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.227 ms | 1.227 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.205 ms | 1.205 ms | 47.000 |
| `_fsStat` | 1.000 | 1.167 ms | 1.167 ms | 206.333 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 71.000 | 80.413 ms | 758629.667 | `#ansi-styles`, `#supports-color`, `@anthropic-ai/sdk`, `@borewit/text-codec`, `@mariozechner/jiti` |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2772.333 | 3449878.667 | 3319579.000 |
| `recv:BridgeCall` | 2772.333 | 576242.667 | 402059.667 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15114.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.333 | 135.333 | 30.333 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T20:29:57.416Z

- Warm wall: 1049.009 -> 1754.015 ms (+705.006 ms (+67.21%))
- Bridge calls/iteration: 2772.000 -> 2772.333 calls (+0.333 calls (+0.01%))
- Warm fixed overhead: 9.409 -> 13.227 ms (+3.818 ms (+40.58%))
- Warm Create->InjectGlobals: 6.000 -> 6.500 ms (+0.500 ms (+8.33%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.500 ms (+0.500 ms)
- Warm residual overhead: 3.409 -> 6.226 ms (+2.817 ms (+82.63%))
- Bridge time/iteration: 553.958 -> 971.184 ms (+417.226 ms (+75.32%))
- BridgeResponse encoded bytes/iteration: 3449856.000 -> 3449878.667 bytes (+22.667 bytes (+0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 51.942 -> 80.413 ms (+28.471 ms (+54.81%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 440.689 | 823.737 | +383.048 |
| Method time | `_loadPolyfill` | 51.942 | 80.413 | +28.471 |
| Method time | `_networkFetchRaw` | 3.002 | 5.861 | +2.859 |
| Method bytes | `_bridgeDispatch` | 2679096.667 | 2679118.667 | +22.000 |
| Method bytes | `_fsStat` | 205.667 | 206.333 | +0.666 |
| Frame bytes | `recv:DestroySessionResult` | 0.000 | 39.000 | +39.000 |
| Frame bytes | `send:Ping` | 50.667 | 12.667 | -38.000 |
| Frame bytes | `recv:Pong` | 50.667 | 12.667 | -38.000 |

