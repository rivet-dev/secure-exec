# Pi SDK Startup

Scenario: `pi-sdk-startup`
Generated: 2026-03-31T04:18:16.910Z
Description: Loads the Pi SDK entry module and inspects its exported surface.

## Progress Copy Fields

- Warm wall mean: 1676.693 ms
- Bridge calls/iteration: 5278.000
- Warm fixed session overhead: 107.224 ms
- Dominant bridge time: `_loadPolyfill` 873.085 ms/iteration across 5240.000 calls/iteration
- Dominant bridge response bytes: `_loadPolyfill` 9354193.000 bytes/iteration
- Dominant frame bytes: `send:BridgeResponse` 9362446.000 bytes/iteration

## Iteration Timing

| Iteration | Wall | Execute | Fixed Overhead | Bridge Calls | Bridge Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 2585.241 ms | 2471.775 ms | 113.466 ms | 5278 | 1312.559 ms |
| 2 | 1734.741 ms | 1627.307 ms | 107.434 ms | 5278 | 741.811 ms |
| 3 | 1618.645 ms | 1511.631 ms | 107.014 ms | 5278 | 721.222 ms |

## Bridge Methods By Time

| Method | Calls/Iter | Time/Iter | Mean/Call | Response Bytes/Iter |
| --- | ---: | ---: | ---: | ---: |
| `_loadPolyfill` | 5240.000 | 873.085 ms | 0.167 ms | 9354193.000 |
| `_resolveModule` | 34.000 | 51.084 ms | 1.502 ms | 4795.000 |
| `_fsExists` | 2.000 | 0.568 ms | 0.284 ms | 100.000 |
| `_fsReadFile` | 1.000 | 0.360 ms | 0.360 ms | 3311.000 |
| `_log` | 1.000 | 0.101 ms | 0.101 ms | 47.000 |

## Frame Bytes

| Frame | Count/Iter | Encoded Bytes/Iter | Payload Bytes/Iter |
| --- | ---: | ---: | ---: |
| `send:BridgeResponse` | 5278.000 | 9362446.000 | 9114380.000 |
| `send:Execute` | 1.000 | 1240816.000 | 0.000 |
| `recv:BridgeCall` | 5278.000 | 882903.000 | 560930.000 |
| `send:WarmSnapshot` | 0.333 | 348320.333 | 0.000 |
| `send:InjectGlobals` | 1.000 | 236.000 | 198.000 |
| `send:CreateSession` | 1.000 | 46.000 | 0.000 |
| `recv:ExecutionResult` | 1.000 | 43.000 | 0.000 |
| `send:DestroySession` | 1.000 | 38.000 | 0.000 |
| `send:Authenticate` | 0.333 | 12.667 | 0.000 |

## Comparison To Previous Baseline

Baseline scenario timestamp: 2026-03-31T04:01:58.056Z

- Warm wall: 1615.126 -> 1676.693 ms (+61.567 ms (+3.81%))
- Bridge calls/iteration: 5278.000 -> 5278.000 calls (0.000 calls (0.00%))
- Warm fixed overhead: 107.054 -> 107.224 ms (+0.170 ms (+0.16%))
- Bridge time/iteration: 843.322 -> 925.197 ms (+81.875 ms (+9.71%))
- BridgeResponse encoded bytes/iteration: 9362446.000 -> 9362446.000 bytes (0.000 bytes (0.00%))

| Delta Type | Name | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| Method time | `_loadPolyfill` | 802.036 | 873.085 | +71.049 |
| Method time | `_resolveModule` | 40.252 | 51.084 | +10.832 |
| Method time | `_fsExists` | 0.422 | 0.568 | +0.146 |

