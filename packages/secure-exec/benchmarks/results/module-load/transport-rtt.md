# Transport RTT

Generated: 2026-03-31T11:03:59.603Z
Measurement: authenticated IPC Ping/Pong on a dedicated Unix domain socket connection.
Connect RTT: 0.344 ms
Warmup iterations/payload: 3
Measured iterations/payload: 20

| Payload | Samples | Min RTT | Mean RTT | P95 RTT | Max RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 B | 20 | 0.026 ms | 0.049 ms | 0.084 ms | 0.123 ms |
| 1 KB | 20 | 0.027 ms | 0.040 ms | 0.060 ms | 0.064 ms |
| 64 KB | 20 | 0.116 ms | 0.150 ms | 0.208 ms | 0.209 ms |

## Comparison To Previous Baseline

Baseline transport timestamp: 2026-03-31T10:39:00.307Z
- Connect RTT: 0.359 -> 0.344 ms (-0.015 ms (-4.18%))
- 1 B mean RTT: 0.218 -> 0.049 ms (-0.169 ms (-77.52%))
- 1 B P95 RTT: 0.533 -> 0.084 ms (-0.449 ms (-84.24%))
- 1 KB mean RTT: 0.103 -> 0.040 ms (-0.063 ms (-61.16%))
- 1 KB P95 RTT: 0.151 -> 0.060 ms (-0.091 ms (-60.27%))
- 64 KB mean RTT: 0.614 -> 0.150 ms (-0.464 ms (-75.57%))
- 64 KB P95 RTT: 0.626 -> 0.208 ms (-0.418 ms (-66.77%))

