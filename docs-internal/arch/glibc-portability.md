# glibc portability policy for secure-exec-v8

## Summary

The `secure-exec-v8` binary (Rust + V8 engine) is dynamically linked against glibc.
The minimum glibc version on target systems is determined by the build environment's glibc version, because the linker stamps versioned symbol requirements into the binary at link time.

The two key factors:

1. **Rust standard library** links against pthread symbols. In glibc 2.34, `libpthread.so` was merged into `libc.so.6`, so all pthread symbols got re-versioned to `GLIBC_2.34`. Building on glibc < 2.34 avoids this jump.
2. **rusty_v8 prebuilt static libraries** reference `sem_clockwait` (`GLIBC_2.30`) and other symbols. On Bullseye (glibc 2.31), `sem_clockwait` is available in the separate `libpthread.so`.

## Build base image policy

All Linux build environments (Dockerfiles, CI runners) must use **Debian Bullseye (glibc 2.31)**.

This produces binaries requiring only **glibc >= 2.29**, verified empirically:

```
BOOKWORM build: glibc floor = 2.34
BULLSEYE build: glibc floor = 2.29
```

Specifically:
- Dockerfiles: `FROM rust:1.85.0-bullseye`
- GitHub Actions: `ubuntu-22.04` (the oldest available runner; glibc 2.35, but still better than `ubuntu-latest` which floats to newer versions)

Note: GitHub Actions doesn't offer a Bullseye runner, so CI builds will have a higher glibc floor (~2.29 from Bullseye Docker, ~2.34 from ubuntu-22.04 runner). For maximum portability, prefer Docker-based builds.

## Why not older?

- **CentOS 7 (glibc 2.17)**: `sem_clockwait` and other symbols V8 needs don't exist.
- **Buster (glibc 2.28)**: `sem_clockwait` (GLIBC_2.30) is missing from libpthread.

## Why not musl?

The rusty_v8 crate only ships prebuilt `.a` files for `*-linux-gnu` targets. Building V8 from source against musl would require patching V8's build system and takes 30–60 minutes per platform. Not worth it given the glibc 2.29 floor covers virtually all active Linux distributions.

## How to verify

After building, check the binary's glibc floor:

```bash
objdump -T target/release/secure-exec-v8 | grep -oP 'GLIBC_[0-9.]+' | sort -t. -k1,1n -k2,2n -k3,3n -u
```

The highest version in the output is the minimum glibc required at runtime.

## Compatibility matrix

| Distro | glibc | Compatible? |
|---|---|---|
| CentOS 7 | 2.17 | No |
| Amazon Linux 2 | 2.26 | No |
| Debian 10 (Buster) | 2.28 | No |
| Ubuntu 20.04 | 2.31 | Yes |
| Debian 11 (Bullseye) | 2.31 | Yes |
| Amazon Linux 2023 | 2.34 | Yes |
| Ubuntu 22.04 | 2.35 | Yes |
| Debian 12 (Bookworm) | 2.36 | Yes |
| Ubuntu 24.04 | 2.39 | Yes |
| Fedora 36+ | 2.35+ | Yes |
| RHEL 9 | 2.34 | Yes |
