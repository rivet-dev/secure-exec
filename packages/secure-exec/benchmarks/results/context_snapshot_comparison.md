# Context Snapshot Benchmark Comparison

Comparison of V8 runtime performance before and after context snapshot optimization.

## Hardware

| Field | Value |
|-------|-------|
| CPU | 12th Gen Intel Core i7-12700KF |
| Cores | 20 |
| RAM | 62 GB |
| Node | v24.13.0 |
| OS | Linux 6.1.0-41-amd64 (x64) |

## Warm Start (Per-Session Cost)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Mean | 13.75 ms | 2.70 ms | **-80.4%** |
| P50 | 13.70 ms | 2.50 ms | **-81.8%** |
| Min | 12.50 ms | 2.30 ms | **-81.6%** |
| Max | 15.60 ms | 3.40 ms | **-78.2%** |

Target: < 6 ms. **Achieved: 2.7 ms mean (55% below target).**

## Cold Start (Process Startup)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Process cold (first run) | 99.88 ms | 66.16 ms | **-33.8%** |
| Steady-state mean | 48.23 ms | 22.00 ms | **-54.4%** |
| Steady-state P50 | 48.20 ms | 21.90 ms | **-54.6%** |

## What Changed

**Before (isolate-only snapshot):** Each session compiled and executed the bridge IIFE
(~3000 lines of JS) from scratch, then applied config and set up the module system.

**After (context snapshot):** The bridge IIFE is compiled and executed once during
snapshot creation. Each session restores the pre-initialized context from the snapshot,
replaces stub bridge functions with real session-local ones, and runs a short
post-restore config script (~10 lines).

## Breakdown of Savings

| Phase | Before | After | Saved |
|-------|--------|-------|-------|
| Bridge IIFE compilation | ~4 ms | 0 ms (snapshot) | ~4 ms |
| Bridge IIFE execution | ~7 ms | 0 ms (snapshot) | ~7 ms |
| Bridge fn replacement | N/A | ~0.5 ms | -0.5 ms |
| Post-restore config | N/A | ~0.5 ms | -0.5 ms |
| **Total warm start** | **~13.75 ms** | **~2.7 ms** | **~11 ms** |

## Commits

- Before: `8d8cac5` (2026-03-19, pre-context-snapshot)
- After: `e999710` (2026-03-19, post-context-snapshot, US-052 through US-066)
