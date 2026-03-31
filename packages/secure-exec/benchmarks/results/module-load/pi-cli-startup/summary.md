# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T05:29:47.535Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1948.524 ms
- Bridge calls/iteration: 5336.000
- Warm fixed session overhead: 107.761 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 1.000 ms, InjectGlobals->Execute 5.000 ms, ExecutionResult->Destroy 102.000 ms, residual -0.239 ms
- Dominant bridge time: `_loadPolyfill` 994.653 ms/iteration across 5247.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9370068.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9381016.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2776.885 ms | 2662.633 ms | 114.252 ms | 5336 | 1529.208 ms |
| 2 | 1749.361 ms | 1641.687 ms | 107.674 ms | 5336 | 779.706 ms |
| 3 | 2147.686 ms | 2039.839 ms | 107.847 ms | 5336 | 1002.517 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2.000 ms | 6.000 ms | 2662.633 ms | 104.000 ms | 2.252 ms |
| 2 | 1.000 ms | 5.000 ms | 1641.687 ms | 102.000 ms | -0.326 ms |
| 3 | 1.000 ms | 5.000 ms | 2039.839 ms | 102.000 ms | -0.153 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5247.000 | 994.653 ms | 0.190 ms | 9370068.000 |
| `_fsExists` | 44.000 | 53.465 ms | 1.215 ms | 2200.000 |
| `_resolveModule` | 34.000 | 42.986 ms | 1.264 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 5.104 ms | 5.104 ms | 47.000 |
| `_fsStat` | 1.000 | 1.443 ms | 1.443 ms | 207.000 |
| `_fsReadFile` | 2.000 | 1.429 ms | 0.714 ms | 3364.000 |
| `_fsWriteFile` | 1.000 | 1.197 ms | 1.197 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.086 ms | 1.086 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.082 ms | 1.082 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.013 ms | 1.013 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5336.000 | 9381016.000 | 9130224.000 |
| `send:Execute` | 1.000 | 1240994.000 | 0.000 |
| `recv:BridgeCall` | 5336.000 | 893538.000 | 568233.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

