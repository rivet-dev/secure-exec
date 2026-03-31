# Transport RTT

Generated: 2026-03-31T11:52:13.213Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.244 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.024 ms | 0.083 ms | 0.127 ms | 0.218 ms |
| 1 KB | 20 | 0.018 ms | 0.047 ms | 0.083 ms | 0.090 ms |
| 64 KB | 20 | 0.108 ms | 0.120 ms | 0.154 ms | 0.169 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T11:52:13.213Z
- Connect RTT: 0.244 -> 0.244 ms (0.000 ms (0.00%))
- 1 B mean RTT: 0.083 -> 0.083 ms (0.000 ms (0.00%))
- 1 B P95 RTT: 0.127 -> 0.127 ms (0.000 ms (0.00%))
- 1 KB mean RTT: 0.047 -> 0.047 ms (0.000 ms (0.00%))
- 1 KB P95 RTT: 0.083 -> 0.083 ms (0.000 ms (0.00%))
- 64 KB mean RTT: 0.120 -> 0.120 ms (0.000 ms (0.00%))
- 64 KB P95 RTT: 0.154 -> 0.154 ms (0.000 ms (0.00%))

