# Pi CLI Startup

Scenario: `pi-cli-startup`
Generated: 2026-03-31T04:18:31.052Z
Description: Boots the Pi CLI help path inside the sandbox.

## Progress Copy Fields

- Warm wall mean: 1899.870 ms
- Bridge calls/iteration: 5336.000
- Warm fixed session overhead: 107.644 ms
- Dominant bridge time: `_loadPolyfill` 964.642 ms/iteration across 5247.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9370068.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9381015.333 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2691.391 ms | 2579.741 ms | 111.650 ms | 5336 | 1423.612 ms |
| 2 | 1808.662 ms | 1699.966 ms | 108.696 ms | 5336 | 848.222 ms |
| 3 | 1991.078 ms | 1884.486 ms | 106.592 ms | 5336 | 931.993 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5247.000 | 964.642 ms | 0.184 ms | 9370068.000 |
| `_fsExists` | 44.000 | 49.175 ms | 1.118 ms | 2200.000 |
| `_resolveModule` | 34.000 | 39.102 ms | 1.150 ms | 4795.000 |
| `_fsMkdir` | 1.000 | 5.269 ms | 5.269 ms | 47.000 |
| `_fsReadFile` | 2.000 | 2.107 ms | 1.054 ms | 3364.000 |
| `_fsStat` | 1.000 | 1.686 ms | 1.686 ms | 206.333 |
| `_fsWriteFile` | 1.000 | 1.487 ms | 1.487 ms | 47.000 |
| `_fsUtimes` | 1.000 | 1.435 ms | 1.435 ms | 47.000 |
| `_fsChmod` | 1.000 | 1.420 ms | 1.420 ms | 47.000 |
| `_fsRmdir` | 1.000 | 1.318 ms | 1.318 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5336.000 | 9381015.333 | 9130223.333 |
| `send:Execute` | 1.000 | 1240994.000 | 0.000 |
| `recv:BridgeCall` | 5336.000 | 893538.000 | 568233.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 228.000 | 190.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:02:11.634Z

- Warm wall: 1919.521 -> 1899.870 ms (-19.651 ms (-1.02%))
- Bridge calls/iteration: 5336.000 -> 5336.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.798 -> 107.644 ms (-0.154 ms (-0.14%))
- Bridge time/iteration: 1003.838 -> 1067.942 ms (+64.104 ms (+6.39%))
- BridgeResponse encoded bytes/iteration: 9381014.667 -> 9381015.333 bytes (+0.666 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 899.241 | 964.642 | +65.401 |
| Method time | `_resolveModule` | 42.821 | 39.102 | -3.719 |
| Method time | `_fsExists` | 50.061 | 49.175 | -0.886 |
| Method bytes | `_fsStat` | 205.667 | 206.333 | +0.666 |
| Frame bytes | `send:BridgeResponse` | 9381014.667 | 9381015.333 | +0.666 |

