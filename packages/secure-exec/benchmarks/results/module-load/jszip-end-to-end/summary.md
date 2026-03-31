# JSZip End-to-End

Scenario: `jszip-end-to-end`
Generated: 2026-03-31T05:47:31.678Z
Description: Builds a representative nested archive and serializes it to a zip payload.

## Progress Copy Fields

- Warm wall mean: 552.962 ms
- Bridge calls/iteration: 63.667
- Warm fixed session overhead: -
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals -, InjectGlobals->Execute -, ExecutionResult->Destroy -, residual -
- Dominant bridge time: `_loadPolyfill` 58.723 ms/iteration across 63.667 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 396786.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 5.667 calls/iteration, 41.549 ms/iteration, 232670.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 58.000 calls/iteration, 17.174 ms/iteration, 164116.000 bytes/iteration
- Dominant frame bytes: `send:Execute` 414582.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 738.519 ms | - | - | 191 | 176.170 ms |
| 2 | 554.284 ms | - | - | 0 | 0.000 ms |
| 3 | 551.639 ms | - | - | 0 | 0.000 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | - | - | - |
| 2 | - | - | - | - | - |
| 3 | - | - | - | - | - |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 63.667 | 58.723 ms | 0.922 ms | 396786.667 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 5.667 | 41.549 ms | 232670.667 | `buffer`, `core-util-is`, `events`, `inherits`, `internal/mime` |
| __bd:* bridge-dispatch wrappers | 58.000 | 17.174 ms | 164116.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/core-util-is@1.0.3/node_modules/core-util-is/lib/util.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/inherits@2.0.4/node_modules/inherits/inherits.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/isarray@1.0.0/node_modules/isarray/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/base64.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/compressedObject.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:Execute` | 0.333 | 414582.000 | 0.000 |
| `send:BridgeResponse` | 63.667 | 396786.667 | 393794.333 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `recv:BridgeCall` | 63.667 | 11098.333 | 7214.667 |
| `send:StreamEvent` | 2.667 | 154.667 | 34.667 |
| `send:InjectGlobals` | 0.333 | 78.667 | 66.000 |
| `send:CreateSession` | 0.333 | 15.333 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T05:47:31.678Z

- Warm wall: 552.962 -> 552.962 ms (0.000 ms (0.00%))
- Bridge calls/iteration: 519.000 -> 63.667 calls (-455.333 calls (-87.73%))
- Warm fixed overhead: -
- Warm Create->InjectGlobals: -
- Warm InjectGlobals->Execute: -
- Warm ExecutionResult->Destroy: -
- Warm residual overhead: -
- Bridge time/iteration: 46.083 -> 58.723 ms (+12.640 ms (+27.43%))
- BridgeResponse encoded bytes/iteration: 1214540.000 -> 396786.667 bytes (-817753.333 bytes (-67.33%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 5.667 calls (+5.667 calls); time 0.000 -> 41.549 ms (+41.549 ms); response bytes 0.000 -> 232670.667 bytes (+232670.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 518.000 -> 58.000 calls (-460.000 calls (-88.80%)); time 45.999 -> 17.174 ms (-28.825 ms (-62.66%)); response bytes 1214493.000 -> 164116.000 bytes (-1050377.000 bytes (-86.49%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 45.999 | 58.723 | +12.724 |
| Method time | `_log` | 0.084 | 0.000 | -0.084 |
| Method bytes | `_loadPolyfill` | 1214493.000 | 396786.667 | -817706.333 |
| Method bytes | `_log` | 47.000 | 0.000 | -47.000 |
| Frame bytes | `send:Execute` | 1242365.000 | 414582.000 | -827783.000 |
| Frame bytes | `send:BridgeResponse` | 1214540.000 | 396786.667 | -817753.333 |
| Frame bytes | `recv:BridgeCall` | 70253.000 | 11098.333 | -59154.667 |

