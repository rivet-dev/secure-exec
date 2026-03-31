# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T05:05:08.670Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1927.126 ms
- Bridge calls/iteration: 5336.000
- Warm fixed session overhead: 107.510 ms
- Scenario IPC connect RTT: 1.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.000 ms, ExecutionResult->Destroy 102.500 ms, residual 0.509 ms
- Dominant bridge time: `_loadPolyfill` 977.736 ms/iteration across 5247.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9370068.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9381014.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2767.303 ms | 2653.558 ms | 113.745 ms | 5336 | 1449.066 ms |
| 2 | 1884.701 ms | 1776.552 ms | 108.149 ms | 5336 | 896.769 ms |
| 3 | 1969.550 ms | 1862.680 ms | 106.870 ms | 5336 | 869.221 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2653.558 ms | 103.000 ms | 2.745 ms |
| 2 | 1.000 ms | 4.000 ms | 1776.552 ms | 103.000 ms | 0.149 ms |
| 3 | 0.000 ms | 4.000 ms | 1862.680 ms | 102.000 ms | 0.870 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5247.000 | 977.736 ms | 0.186 ms | 9370068.000 |
| `_fsExists` | 44.000 | 42.443 ms | 0.965 ms | 2200.000 |
| `_resolveModule` | 34.000 | 38.296 ms | 1.126 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 4.390 ms | 4.390 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.629 ms | 1.315 ms | 3364.000 |
| `_fsWriteFile` | 1.000 | 1.681 ms | 1.681 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.209 ms | 1.209 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.087 ms | 1.087 ms | 47.000 |
| `_fsStat` | 1.000 | 0.992 ms | 0.992 ms | 205.000 |
| `_fsUtimes` | 1.000 | 0.963 ms | 0.963 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5336.000 | 9381014.000 | 9130222.000 |
| `send:Execute` | 1.000 | 1240994.000 | 0.000 |
| `recv:BridgeCall` | 5336.000 | 893538.000 | 568233.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:03:43.560Z

- Warm wall: 1920.839 -> 1927.126 ms (+6.287 ms (+0.33%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.693 -> 107.510 ms (-0.183 ms (-0.17%))
- Warm Create->InjectGlobals: 0.000 -> 0.500 ms (+0.500 ms)
- Warm InjectGlobals->Execute: 4.500 -> 4.000 ms (-0.500 ms (-11.11%))
- Warm ExecutionResult->Destroy: 102.500 -> 102.500 ms (0.000 ms (0.00%))
- Warm residual overhead: 0.693 -> 0.509 ms (-0.184 ms (-26.55%))
- Bridge time/iteration: 905.879 -> 1071.685 ms (+165.806 ms (+18.30%))
- BridgeResponse encoded bytes/iteration: 9381013.333 -> 9381014.000 bytes (+0.667 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 815.840 | 977.736 | +161.896 |
| Method time | `_fsReadFile` | 1.187 | 2.629 | +1.442 |
| Method time | `_resolveModule` | 36.936 | 38.296 | +1.360 |
| Method bytes | `_fsStat` | 204.333 | 205.000 | +0.667 |
| Frame bytes | `send:BridgeResponse` | 9381013.333 | 9381014.000 | +0.667 |

