# Pi CLI End-to-End

Scenario: `pi-cli-end-to-end`
Kind: `end_to_end`
Generated: 2026-03-31T23:10:47.700Z
Description: Calls Pi's direct dist/main.js print-mode path against the mock Anthropic SSE server.
Primary comparison mode: `sandbox new-session replay (warm snapshot enabled)`

## Progress Copy Fields

- Warm wall mean: 1040.085 ms
- Bridge calls/iteration: 2772.000
- Warm fixed session overhead: 9.563 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 5.500 ms, InjectGlobals->Execute 0.500 ms, ExecutionResult->Destroy 0.000 ms, residual 3.563 ms
- Dominant bridge time: `_bridgeDispatch` 439.532 ms/iteration across 2638.000 calls/iteration
- Dominant bridge response bytes: `_bridgeDispatch` 2679096.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 71.000 calls/iteration, 50.042 ms/iteration, 758629.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by time: `crypto` 1.000 calls/iteration, 15.429 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill real polyfill-body loads top target by response bytes: `crypto` 1.000 calls/iteration, 15.429 ms/iteration, 300368.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 0.000 calls/iteration, 0.000 ms/iteration, 0.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 3449857.333 bytes/iteration

## Benchmark Modes

These controls separate true runtime creation cost, same-session replay, fresh-session replay, warm snapshot toggles, and a direct host Node control.

- Sandbox true cold start, warm snapshot enabled: total 1350.713 ms; runtime create 181.288 ms; first pass 1169.425 ms; mock requests 1; checks `responseSeen`=true
- Sandbox true cold start, warm snapshot disabled: total 1389.170 ms; runtime create 4.524 ms; first pass 1384.646 ms; mock requests 1; checks `responseSeen`=true
- Sandbox new-session replay, warm snapshot enabled: cold 1289.082 ms; warm 1040.085 ms; mock requests mean 1.000
- Sandbox new-session replay, warm snapshot disabled: cold 1361.169 ms; warm 966.697 ms; mock requests mean 1.000
- Sandbox same-session replay: total 1230.963 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true
- Host same-session control: total 407.639 ms; first 400.165 ms; replay 7.472 ms; mock requests 2; first checks `completed`=true; replay checks `completed`=true

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1289.082 ms | 1275.104 ms | 13.978 ms | 2772 | 672.697 ms |
| 2 | 1032.233 ms | 1021.724 ms | 10.509 ms | 2772 | 489.691 ms |
| 3 | 1047.937 ms | 1039.320 ms | 8.617 ms | 2772 | 480.873 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.000 ms | 1.000 ms | 1275.104 ms | 0.000 ms | 4.978 ms |
| 2 | 6.000 ms | 1.000 ms | 1021.724 ms | 0.000 ms | 3.509 ms |
| 3 | 5.000 ms | 0.000 ms | 1039.320 ms | 0.000 ms | 3.617 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_bridgeDispatch` | 2638.000 | 439.532 ms | 0.167 ms | 2679096.667 |
| `_loadPolyfill` | 71.000 | 50.042 ms | 0.705 ms | 758629.667 |
| `_fsExists` | 43.000 | 40.699 ms | 0.946 ms | 2150.000 |
| `_fsMkdir` | 1.000 | 4.615 ms | 4.615 ms | 47.000 |
| `_networkFetchRaw` | 1.000 | 3.165 ms | 3.165 ms | 1231.000 |
| `_fsReadFile` | 5.000 | 2.866 ms | 0.573 ms | 7684.000 |
| `_fsStat` | 1.000 | 1.541 ms | 1.541 ms | 207.000 |
| `_fsChmod` | 1.000 | 1.381 ms | 1.381 ms | 47.000 |
| `_fsWriteFile` | 1.000 | 1.155 ms | 1.155 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.147 ms | 1.147 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Attributed Targets | Unattributed Calls/Iter |
| --- | ---: | ---: | ---: | ---: | ---: |
| real polyfill-body loads | 71.000 | 50.042 ms | 758629.667 | 70 | 0.000 |
| __bd:* bridge-dispatch wrappers | 0.000 | 0.000 ms | 0.000 | 0 | 0.000 |

## _loadPolyfill Target Hotspots

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | ---: | ---: | ---: |
| real polyfill-body loads | by calls | `stream/web` | 2.000 | 5.753 ms | 115966.667 |
| real polyfill-body loads | by calls | `crypto` | 1.000 | 15.429 ms | 300368.667 |
| real polyfill-body loads | by calls | `assert` | 1.000 | 8.157 ms | 56865.667 |
| real polyfill-body loads | by calls | `zlib` | 1.000 | 7.743 ms | 157798.000 |
| real polyfill-body loads | by calls | `stream` | 1.000 | 6.822 ms | 82604.667 |
| real polyfill-body loads | by time | `crypto` | 1.000 | 15.429 ms | 300368.667 |
| real polyfill-body loads | by time | `assert` | 1.000 | 8.157 ms | 56865.667 |
| real polyfill-body loads | by time | `zlib` | 1.000 | 7.743 ms | 157798.000 |
| real polyfill-body loads | by time | `stream` | 1.000 | 6.822 ms | 82604.667 |
| real polyfill-body loads | by time | `stream/web` | 2.000 | 5.753 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 | 15.429 ms | 300368.667 |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 | 7.743 ms | 157798.000 |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 | 5.753 ms | 115966.667 |
| real polyfill-body loads | by response bytes | `stream` | 1.000 | 6.822 ms | 82604.667 |
| real polyfill-body loads | by response bytes | `assert` | 1.000 | 8.157 ms | 56865.667 |
| __bd:* bridge-dispatch wrappers | - | - | - | - | - |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2772.000 | 3449857.333 | 3319573.333 |
| `recv:BridgeCall` | 2772.000 | 576212.000 | 402050.000 |
| `send:WarmSnapshot` | 0.333 | 494493.333 | 0.000 |
| `send:Execute` | 1.000 | 15114.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 244.000 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:StreamEvent` | 2.000 | 116.000 | 26.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:DestroySessionResult` | 1.000 | 39.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T22:52:39.891Z

- Warm wall: 1898.294 -> 1040.085 ms (-858.209 ms (-45.21%))
- Bridge calls/iteration: 2772.000 -> 2772.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 10.689 -> 9.563 ms (-1.126 ms (-10.53%))
- Warm Create->InjectGlobals: 7.000 -> 5.500 ms (-1.500 ms (-21.43%))
- Warm InjectGlobals->Execute: 0.000 -> 0.500 ms (+0.500 ms)
- Warm ExecutionResult->Destroy: 0.000 -> 0.000 ms (0.000 ms)
- Warm residual overhead: 3.689 -> 3.563 ms (-0.126 ms (-3.42%))
- Bridge time/iteration: 1090.520 -> 547.754 ms (-542.766 ms (-49.77%))
- BridgeResponse encoded bytes/iteration: 3449855.333 -> 3449857.333 bytes (+2.000 bytes (0.00%))
- _loadPolyfill real polyfill-body loads: calls 71.000 -> 71.000 calls (0.000 calls (0.00%)); time 58.042 -> 50.042 ms (-8.000 ms (-13.78%)); response bytes 758629.667 -> 758629.667 bytes (0.000 bytes (0.00%))
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 0.000 -> 0.000 calls (0.000 calls); time 0.000 -> 0.000 ms (0.000 ms); response bytes 0.000 -> 0.000 bytes (0.000 bytes)

### _loadPolyfill Target Deltas

| Kind | Ranking | Target | Calls/Iter | Time/Iter | Response Bytes/Iter |
| --- | --- | --- | --- | --- | --- |
| real polyfill-body loads | by calls | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.420 -> 5.753 ms (+0.333 ms (+6.14%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.287 -> 15.429 ms (-0.858 ms (-5.27%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.256 -> 7.743 ms (-1.513 ms (-16.35%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.536 -> 6.822 ms (+0.286 ms (+4.38%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by calls | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.772 -> 8.157 ms (-3.615 ms (-30.71%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.772 -> 8.157 ms (-3.615 ms (-30.71%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `url` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.226 -> 4.670 ms (-1.556 ms (-24.99%)) | 41826.000 -> 41826.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.256 -> 7.743 ms (-1.513 ms (-16.35%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.287 -> 15.429 ms (-0.858 ms (-5.27%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by time | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.420 -> 5.753 ms (+0.333 ms (+6.14%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `crypto` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 16.287 -> 15.429 ms (-0.858 ms (-5.27%)) | 300368.667 -> 300368.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `zlib` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 9.256 -> 7.743 ms (-1.513 ms (-16.35%)) | 157798.000 -> 157798.000 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream/web` | 2.000 -> 2.000 calls (0.000 calls (0.00%)) | 5.420 -> 5.753 ms (+0.333 ms (+6.14%)) | 115966.667 -> 115966.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `stream` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 6.536 -> 6.822 ms (+0.286 ms (+4.38%)) | 82604.667 -> 82604.667 bytes (0.000 bytes (0.00%)) |
| real polyfill-body loads | by response bytes | `assert` | 1.000 -> 1.000 calls (0.000 calls (0.00%)) | 11.772 -> 8.157 ms (-3.615 ms (-30.71%)) | 56865.667 -> 56865.667 bytes (0.000 bytes (0.00%)) |

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_bridgeDispatch` | 951.271 | 439.532 | -511.739 |
| Method time | `_fsExists` | 59.256 | 40.699 | -18.557 |
| Method time | `_loadPolyfill` | 58.042 | 50.042 | -8.000 |
| Method bytes | `_fsStat` | 205.000 | 207.000 | +2.000 |
| Frame bytes | `send:BridgeResponse` | 3449855.333 | 3449857.333 | +2.000 |

