# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T22:52:17.914Z
Description: Boots the Pi CLI help path inside the sandbox.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1603.007 ms
- Bridge calls/iteration: 2562.000
- Warm fixed session overhead: 9.242 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 6.500 ms, InjectGlobals->Execute 0.000 ms, ExecutionResult->Destroy 0.000 ms, residual 2.742 ms
- Dominant bridge time: `_bridgeDispatch` 833.158 ms/iteration across 2440.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2547818.333 bytes/iteration
- _loadPolyfill real polyfill-body loads: 70.000 calls/iteration, 86.321 ms/iteration, 758579.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 44.430 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 44.430 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3312400.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 2193.705 ms; runtime create 183.480 ms; first pass 2010.225 ms; checks `stdoutHasUsage`=true
- Sandbox true cold start, warm snapshot disabled: total 1994.483 ms; runtime create 4.850 ms; first pass 1989.633 ms; checks `stdoutHasUsage`=true
- Sandbox new-session replay, warm snapshot enabled: cold 2203.231 ms; warm 1603.007 ms
- Sandbox new-session replay, warm snapshot disabled: cold 2462.800 ms; warm 1561.701 ms
- Sandbox same-session replay: total 2040.786 ms; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 337.462 ms; first 336.846 ms; replay 0.614 ms; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2203.231 ms | 2187.797 ms | 15.434 ms | 2562 | 1243.891 ms |
| 2 | 1552.208 ms | 1542.227 ms | 9.981 ms | 2562 | 826.288 ms |
| 3 | 1653.806 ms | 1645.302 ms | 8.504 ms | 2562 | 885.027 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 9.000 ms | 0.000 ms | 2187.797 ms | 1.000 ms | 5.434 ms |
| 2 | 7.000 ms | 0.000 ms | 1542.227 ms | 0.000 ms | 2.981 ms |
| 3 | 6.000 ms | 0.000 ms | 1645.302 ms | 0.000 ms | 2.504 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2440.000 | 833.158 ms | 0.341 ms | 2547818.333 |
| `_loadPolyfill` | 70.000 | 86.321 ms | 1.233 ms | 758579.667 |
| `_fsExists` | 41.000 | 52.099 ms | 1.271 ms | 2050.000 |
| `_fsMkdir` | 1.000 | 4.908 ms | 4.908 ms | 47.000 |
| `_fsStat` | 1.000 | 1.903 ms | 1.903 ms | 206.333 |
| `_fsReadFile` | 2.000 | 1.888 ms | 0.944 ms | 3364.000 |
| `_fsUtimes` | 1.000 | 1.248 ms | 1.248 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.191 ms | 1.191 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.064 ms | 1.064 ms | 47.000 |
| `_fsChmod` | 1.000 | 0.917 ms | 0.917 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 70.000 | 86.321 ms | 758579.667 | 69 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.751 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 44.430 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 12.459 ms | 56865.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 8.513 ms | 157798.000 |
| real polyfill-body loads | by calls | `url` | 1.000 | 6.905 ms | 41826.000 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 44.430 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 12.459 ms | 56865.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 8.513 ms | 157798.000 |
| real polyfill-body loads | by time | `url` | 1.000 | 6.905 ms | 41826.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.138 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 44.430 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 8.513 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.751 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.138 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 12.459 ms | 56865.667 |
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

