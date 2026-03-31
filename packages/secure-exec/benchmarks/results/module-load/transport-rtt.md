# Transport RTT

Generated: 2026-03-31T04:43:52.020Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.251 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.016 ms | 0.025 ms | 0.040 ms | 0.048 ms |
| 1 KB | 20 | 0.017 ms | 0.020 ms | 0.028 ms | 0.028 ms |
| 64 KB | 20 | 0.125 ms | 0.177 ms | 0.331 ms | 0.345 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T04:38:52.787Z
- Connect RTT: 0.432 -> 0.251 ms (-0.181 ms (-41.90%))
- 1 B mean RTT: 0.022 -> 0.025 ms (+0.003 ms (+13.64%))
- 1 B P95 RTT: 0.035 -> 0.040 ms (+0.005 ms (+14.29%))
- 1 KB mean RTT: 0.018 -> 0.020 ms (+0.002 ms (+11.11%))
- 1 KB P95 RTT: 0.022 -> 0.028 ms (+0.006 ms (+27.27%))
- 64 KB mean RTT: 0.137 -> 0.177 ms (+0.040 ms (+29.20%))
- 64 KB P95 RTT: 0.151 -> 0.331 ms (+0.180 ms (+119.20%))

