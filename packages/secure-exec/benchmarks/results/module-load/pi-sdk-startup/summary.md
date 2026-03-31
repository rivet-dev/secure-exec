# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T09:40:43.971Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1729.225 ms
- Bridge calls/iteration: 2548.000
- Warm fixed session overhead: 117.534 ms
- Scenario IPC connect RTT: 0.000 ms
- Warm phase attribution: Create->InjectGlobals 0.500 ms, InjectGlobals->Execute 4.500 ms, ExecutionResult->Destroy 102.500 ms, residual 10.034 ms
- Dominant bridge time: `_loadPolyfill` 844.908 ms/iteration across 2523.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 7469421.667 bytes/iteration
- _loadPolyfill real polyfill-body loads: 79.000 calls/iteration, 116.126 ms/iteration, 839171.667 bytes/iteration
- _loadPolyfill __bd:* bridge-dispatch wrappers: 2444.000 calls/iteration, 728.782 ms/iteration, 6630250.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 7475865.667 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2262.805 ms | 2139.579 ms | 123.226 ms | 2548 | 1161.267 ms |
| 2 | 1640.092 ms | 1521.579 ms | 118.513 ms | 2548 | 747.366 ms |
| 3 | 1818.358 ms | 1701.804 ms | 116.554 ms | 2548 | 789.556 ms |

## Session Phase Attribution

Equivalent lifecycle phases come from `CreateSession -> InjectGlobals -> Execute -> ExecutionResult -> DestroySession` timestamps in `ipc.ndjson`.

| Iteration | Create->InjectGlobals | InjectGlobals->Execute | Execute | ExecutionResult->Destroy | Residual Overhead |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.000 ms | 5.000 ms | 2139.579 ms | 104.000 ms | 11.226 ms |
| 2 | 0.000 ms | 6.000 ms | 1521.579 ms | 102.000 ms | 10.513 ms |
| 3 | 1.000 ms | 3.000 ms | 1701.804 ms | 103.000 ms | 9.554 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 2523.000 | 844.908 ms | 0.335 ms | 7469421.667 |
| `_resolveModule` | 21.000 | 53.650 ms | 2.555 ms | 2986.000 |
| `_fsExists` | 2.000 | 0.463 ms | 0.231 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.271 ms | 0.271 ms | 3311.000 |
| `_log` | 1.000 | 0.105 ms | 0.105 ms | 47.000 |

## _loadPolyfill Attribution

| Kind | Calls/Iter | Time/Iter | Response Bytes/Iter | Sample Targets |
| --- | ---: | ---: | ---: | --- |
| real polyfill-body loads | 79.000 | 116.126 ms | 839171.667 | `#ansi-styles`, `#supports-color`, `@borewit/text-codec`, `@mariozechner/jiti`, `@mariozechner/pi-agent-core` |
| __bd:* bridge-dispatch wrappers | 2444.000 | 728.782 ms | 6630250.000 | `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@borewit+text-codec@0.2.1/node_modules/@borewit/text-codec/lib/index.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/dist/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+jiti@2.6.5/node_modules/@mariozechner/jiti/lib/jiti.cjs"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js"]`, `__bd:_loadFileSync:["/home/nathan/se6/node_modules/.pnpm/@mariozechner+pi-agent-core@0.60.0_zod@3.25.76/node_modules/@mariozechner/pi-agent-core/dist/agent.js"]` |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 2548.000 | 7475865.667 | 7356109.667 |
| `send:Execute` | 1.000 | 1242197.000 | 0.000 |
| `recv:BridgeCall` | 2548.000 | 552317.000 | 396887.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Ping` | 1.000 | 38.000 | 32.000 |
| `recv:Pong` | 1.000 | 38.000 | 32.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T07:22:33.627Z

- Warm wall: 1693.028 -> 1729.225 ms (+36.197 ms (+2.14%))
- Bridge calls/iteration: 2548.000 -> 2548.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 115.200 -> 117.534 ms (+2.334 ms (+2.03%))
- Warm Create->InjectGlobals: 0.500 -> 0.500 ms (0.000 ms (0.00%))
- Warm InjectGlobals->Execute: 4.500 -> 4.500 ms (0.000 ms (0.00%))
- Warm ExecutionResult->Destroy: 101.000 -> 102.500 ms (+1.500 ms (+1.49%))
- Warm residual overhead: 9.200 -> 10.034 ms (+0.834 ms (+9.06%))
- Bridge time/iteration: 923.769 -> 899.396 ms (-24.373 ms (-2.64%))
- BridgeResponse encoded bytes/iteration: 9142839.000 -> 7475865.667 bytes (-1666973.333 bytes (-18.23%))
- _loadPolyfill real polyfill-body loads: calls 0.000 -> 79.000 calls (+79.000 calls); time 0.000 -> 116.126 ms (+116.126 ms); response bytes 0.000 -> 839171.667 bytes (+839171.667 bytes)
- _loadPolyfill __bd:* bridge-dispatch wrappers: calls 2523.000 -> 2444.000 calls (-79.000 calls (-3.13%)); time 878.447 -> 728.782 ms (-149.665 ms (-17.04%)); response bytes 9136395.000 -> 6630250.000 bytes (-2506145.000 bytes (-27.43%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 878.447 | 844.908 | -33.539 |
| Method time | `_resolveModule` | 44.611 | 53.650 | +9.039 |
| Method time | `_log` | 0.046 | 0.105 | +0.059 |
| Method bytes | `_loadPolyfill` | 9136395.000 | 7469421.667 | -1666973.333 |
| Frame bytes | `send:BridgeResponse` | 9142839.000 | 7475865.667 | -1666973.333 |

