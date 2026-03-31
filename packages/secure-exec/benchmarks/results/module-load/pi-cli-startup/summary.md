# Pi CLI Startup

Scenario: `pi-cli-startup`
Kind: `startup`
Generated: 2026-03-31T23:10:34.284Z
Description: Boots the Pi CLI help path inside the sandbox.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 953.642 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.565 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 4.065 ms
- Dominant bridge time: `_bridgeDispatch` 417.974 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547818.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 48.828 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 14.743 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 14.743 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3312400.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1284.640 ms; runtime create 181.918 ms; first pass 1102.722 ms; checks `stdoutHasUsage`=true
- Sandbox true cold start, warm snapshot disabled: total 1311.226 ms; runtime create 4.693 ms; first pass 1306.533 ms; checks `stdoutHasUsage`=true
- Sandbox new-session replay, warm snapshot enabled: cold 1182.127 ms; warm 953.642 ms
- Sandbox new-session replay, warm snapshot disabled: cold 1283.351 ms; warm 893.856 ms
- Sandbox same-session replay: total 1134.964 ms; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 332.585 ms; first 331.985 ms; replay 0.597 ms; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1182.127 ms | 1168.672 ms | 13.455 ms | 2562 | 635.611 ms |
| 2 | 933.476 ms | 923.295 ms | 10.181 ms | 2562 | 451.212 ms |
| 3 | 973.808 ms | 964.859 ms | 8.949 ms | 2562 | 467.792 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 1168.672 ms | 1.000 ms | 3.455 ms |
| 2 | 6.000 ms | 0.000 ms | 923.295 ms | 0.000 ms | 4.181 ms |
| 3 | 5.000 ms | 0.000 ms | 964.859 ms | 0.000 ms | 3.949 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 417.974 ms | 0.171 ms | 2547818.333 |
| `_loadPolyfill` | 70.000 | 48.828 ms | 0.698 ms | 758579.667 |
| `_fsExists` | 41.000 | 39.939 ms | 0.974 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 4.694 ms | 4.694 ms | 47.000 |
| `_fsReadFile` | 2.000 | 1.335 ms | 0.668 ms | 3364.000 |
| `_fsStat` | 1.000 | 1.092 ms | 1.092 ms | 206.333 |
| `_fsWriteFile` | 1.000 | 1.078 ms | 1.078 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.067 ms | 1.067 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.029 ms | 1.029 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.956 ms | 0.956 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 70.000 | 48.828 ms | 758579.667 | 69 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 6.230 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 14.743 ms | 300368.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 8.606 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.671 ms | 82604.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 6.075 ms | 56865.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 14.743 ms | 300368.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 8.606 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.671 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 6.230 ms | 115966.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 6.075 ms | 56865.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 14.743 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 8.606 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 6.230 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.671 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 6.075 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2562.000 | 3312400.333 | 3191986.333 |
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

Baseline scenario timestamp: 2026-03-31T22:52:17.914Z

- Warm wall: 1603.007 -> 953.642 ms (-649.365 ms (-40.51%))
- Bridge calls/iteration: 2562.000 -> 2562.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 9.242 -> 9.565 ms (+0.323 ms (+3.50%))
- Warm Create->InjectGlobals: 6.500 -> 5.500 ms (-1.000 ms (-15.38%))
- Warm InjectGlobals->Execute: 0.000 -> 0.000 ms (0.000 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 2.742 -> 4.065 ms (+1.323 ms (+48.25%))
- Bridge time/iteration: 985.069 -> 518.205 ms (-466.864 ms (-47.39%))
- BridgeResponse encoded bytes/iteration: 3312400.333 -> 3312400.333 bytes (0.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 70.000 -> 70.000 calls (0.000 calls (0.00%)); time 86.321 -> 48.828 ms (-37.493 ms (-43.43%)); response bytes 758579.667 -> 758579.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.751 -> 6.230 ms (+0.479 ms (+8.33%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 44.430 -> 14.743 ms (-29.687 ms (-66.82%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.513 -> 8.606 ms (+0.093 ms (+1.09%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.138 -> 6.671 ms (+0.533 ms (+8.68%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.459 -> 6.075 ms (-6.384 ms (-51.24%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 44.430 -> 14.743 ms (-29.687 ms (-66.82%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.459 -> 6.075 ms (-6.384 ms (-51.24%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.905 -> 5.072 ms (-1.833 ms (-26.55%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.138 -> 6.671 ms (+0.533 ms (+8.68%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.751 -> 6.230 ms (+0.479 ms (+8.33%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 44.430 -> 14.743 ms (-29.687 ms (-66.82%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 8.513 -> 8.606 ms (+0.093 ms (+1.09%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.751 -> 6.230 ms (+0.479 ms (+8.33%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.138 -> 6.671 ms (+0.533 ms (+8.68%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 12.459 -> 6.075 ms (-6.384 ms (-51.24%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 833.158 | 417.974 | -415.184 |
| Method time | `_loadPolyfill` | 86.321 | 48.828 | -37.493 |
| Method time | `_fsExists` | 52.099 | 39.939 | -12.160 |

