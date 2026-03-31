# Transport RTT

Generated: 2026-03-31T23:10:47.711Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.203 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.013 ms | 0.019 ms | 0.030 ms | 0.037 ms |
| 1 KB | 20 | 0.013 ms | 0.015 ms | 0.018 ms | 0.020 ms |
| 64 KB | 20 | 0.108 ms | 0.115 ms | 0.123 ms | 0.143 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T22:52:39.906Z
- Connect RTT: 0.286 -> 0.203 ms (-0.083 ms (-29.02%))
- 1 B mean RTT: 0.048 -> 0.019 ms (-0.029 ms (-60.42%))
- 1 B P95 RTT: 0.080 -> 0.030 ms (-0.050 ms (-62.50%))
- 1 KB mean RTT: 0.016 -> 0.015 ms (-0.001 ms (-6.25%))
- 1 KB P95 RTT: 0.017 -> 0.018 ms (+0.001 ms (+5.88%))
- 64 KB mean RTT: 0.141 -> 0.115 ms (-0.026 ms (-18.44%))
- 64 KB P95 RTT: 0.205 -> 0.123 ms (-0.082 ms (-40.00%))

