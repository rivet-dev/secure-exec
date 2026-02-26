# Node.js Standard Library Compatibility

Status of each Node.js core module in sandboxed-node. Modules are provided via one of three mechanisms:

- **Bridge** — Custom implementation in `src/bridge/`, communicates with host via `ivm.Reference`
- **Polyfill** — Provided by `node-stdlib-browser` (e.g., `path-browserify`, `readable-stream`)
- **Stub** — Minimal implementation for compatibility, may return mocks or throw

## fs

- Bridge implementation (`src/bridge/fs.ts`, ~1800 lines)
- `readFile`, `readFileSync`, `writeFile`, `writeFileSync`, `appendFile`, `appendFileSync`
- `open`, `openSync`, `read`, `readSync`, `write`, `writeSync`, `close`, `closeSync`
- `readdir`, `readdirSync` (with `Dirent` support)
- `mkdir`, `mkdirSync` (recursive)
- `rmdir`, `rmdirSync` (recursive), `rm`, `rmSync`
- `unlink`, `unlinkSync`
- `stat`, `statSync`, `lstat`, `lstatSync` (full `Stats` class implementing `nodeFs.Stats`)
- `rename`, `renameSync`
- `copyFile`, `copyFileSync`
- `exists`, `existsSync`
- `createReadStream`, `createWriteStream`
- `writev`, `writevSync`
- `fs.promises` — async versions of all above
- Missing: `watch`, `watchFile`, `access`, `chmod`, `chown`, `link`, `symlink`, `readlink`, `truncate`, `utimes`, `realpath`

## process

- Bridge implementation (`src/bridge/process.ts`, ~1050 lines)
- `platform`, `arch`, `version`, `versions`, `pid`, `ppid`, `execPath`, `execArgv`, `argv`, `title`
- `env` (permission-gated per variable)
- `cwd()`, `chdir()`
- `exit()` (throws `ProcessExitError`), `exitCode`, `abort()`
- `nextTick()` (via `queueMicrotask`)
- `hrtime()`, `hrtime.bigint()`
- `getuid`, `getgid`, `geteuid`, `getegid`, `getgroups`
- `umask()`, `uptime()`, `kill()`
- `memoryUsage()`, `cpuUsage()`, `resourceUsage()` — mock values
- `stdout`, `stderr` — bridge to host `_log`/`_error`
- `stdin` — full implementation with data/end/close events, async iterator
- Full `EventEmitter` support (`on`, `once`, `off`, `emit`, `prependListener`, etc.)
- `emitWarning()`, `binding()` (stub), `send()` (no-op)

## os

- Bridge implementation (`src/bridge/os.ts`, ~295 lines)
- `platform()`, `arch()`, `type()`, `release()`, `version()` — all configurable via `OSConfig`
- `homedir()`, `tmpdir()`, `hostname()` — configurable
- `userInfo()`, `cpus()` (1 virtual CPU), `totalmem()`, `freemem()`, `loadavg()`
- `networkInterfaces()` — returns empty object
- `endianness()`, `EOL`, `devNull`, `machine()`, `availableParallelism()`
- `constants.signals` (31 signals), `constants.errno` (60+ codes), `constants.priority`, `constants.dlopen`

## child_process

- Bridge implementation (`src/bridge/child-process.ts`, ~700 lines)
- `spawn()` — streaming with stdin/stdout/stderr, kill support
- `spawnSync()` — synchronous via `_childProcessSpawnSync` bridge
- `exec()`, `execSync()` — shell command execution
- `execFile()`, `execFileSync()`
- `ChildProcess` class with pid, streams, kill, signal handling
- Active handle tracking (keeps sandbox alive while children run)
- Missing: `fork()` (IPC not supported across isolate boundary)

## http / https

- Bridge implementation (`src/bridge/network.ts`, ~880 lines)
- `request()`, `get()` — backed by host-side `_networkHttpRequestRaw`
- `ClientRequest` class with event support
- `IncomingMessage` class with stream support
- `Agent` class (simplified), `globalAgent`
- `METHODS`, `STATUS_CODES` constants
- Missing: `createServer()` (throws; use `@hono/node-server` bridge instead)

## dns

- Bridge implementation (`src/bridge/network.ts`)
- `lookup()`, `resolve()`, `resolve4()`, `resolve6()`
- `dns.promises.lookup()`, `dns.promises.resolve()`
- Simplified — all resolution delegates to host `_networkDnsLookupRaw`

## fetch API

- Bridge implementation (`src/bridge/network.ts`)
- `fetch()` — full async fetch via host bridge
- `Headers`, `Request`, `Response` classes
- `Response.error()`, `Response.redirect()`
- Installed on `globalThis`

## module

- Bridge implementation (`src/bridge/module.ts`, ~420 lines)
- `createRequire()` — fully functional, resolves relative to filename
- `Module` class with `id`, `path`, `exports`, `loaded`, `children`, `require()`, `_compile()`
- Static: `builtinModules`, `isBuiltin()`, `_resolveFilename()`, `_load()`, `_nodeModulePaths()`, `wrap()`
- ESM support via esbuild transform + `__dynamicImport` fallback

## path

- Polyfill via `path-browserify`
- All standard functions available
- Patched: `resolve()` uses `process.cwd()`, `win32`/`posix` variants present

## buffer

- Polyfill via `buffer` npm package
- Full `Buffer` class, installed as global
- Binary data crosses isolate boundary via base64 encoding

## url

- Polyfill via `whatwg-url`
- `URL`, `URLSearchParams` (spec-compliant)
- Patched: relative `file:` URLs resolve against `process.cwd()`
- Legacy `url.parse()`, `url.format()` via node-stdlib-browser

## events

- Polyfill via node-stdlib-browser (`events` package)
- Full `EventEmitter` class

## stream

- Polyfill via node-stdlib-browser (`readable-stream`)
- `Readable`, `Writable`, `Duplex`, `Transform`, `PassThrough`
- `pipeline()`, `finished()`

## util

- Polyfill via node-stdlib-browser
- `inspect()`, `format()`, `formatWithOptions()`, type checking functions, deprecation helpers

## assert

- Polyfill via node-stdlib-browser
- All assertion functions, strict and loose variants

## querystring

- Polyfill via node-stdlib-browser
- `parse()`, `stringify()`, `escape()`, `unescape()`

## string_decoder

- Polyfill via node-stdlib-browser
- `StringDecoder` class for multibyte UTF-8

## zlib

- Polyfill via node-stdlib-browser
- Compression/decompression available, may have limitations vs native

## timers

- Bridge implementation (`src/bridge/process.ts`)
- `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `setImmediate`, `clearImmediate`
- All return `TimerHandle` with `ref()`, `unref()`, `hasRef()`, `refresh()`

## crypto

- Minimal — only random value generation
- `getRandomValues()` — stub using `Math.random()` (not cryptographically secure)
- `randomUUID()` — RFC 4122 UUID generation
- `subtle.*` — throws "not supported in sandbox"
- No hashing, signing, cipher, or HMAC functions
- node-stdlib-browser's `crypto-browserify` available as polyfill but `subtle` operations blocked

## tty

- Stub (`src/shared/require-setup.ts`)
- `isatty()` — returns `false`
- `ReadStream`, `WriteStream` — stubs

## v8

- Stub (`src/shared/require-setup.ts`)
- `getHeapStatistics()` — mock values (64MB total, 50MB used)
- `serialize()`, `deserialize()` — JSON-based (not real V8 serialization)
- `setFlagsFromString()` — no-op

## constants

- Stub (`src/shared/require-setup.ts`)
- `signal.SIGTERM`, `signal.SIGKILL`, `signal.SIGINT` only
- Full signal/errno constants available via `os.constants` instead

## vm

- Polyfill via node-stdlib-browser
- Limited functionality — not a real sandbox (same as Node's `vm` module limitations)

## Not implemented

- **net** — no socket networking
- **tls** — no TLS/SSL
- **dgram** — no UDP
- **http2** — no HTTP/2
- **cluster** — no worker clustering
- **worker_threads** — no threading
- **wasi** — no WebAssembly System Interface
- **perf_hooks** — no performance monitoring
- **async_hooks** — no async context tracking
- **diagnostics_channel** — no diagnostics
- **inspector** — no debugger protocol
- **repl** — no interactive shell
- **readline** — no line editing (stdin has basic async iterator)
- **trace_events** — no tracing
- **domain** — deprecated, not implemented

## Third-party stubs

These are not Node.js core modules but are stubbed for npm package compatibility:

- **chalk** — pass-through (no color), `level: 0`
- **supports-color** — `stdout: false`, `stderr: false`
- **@hono/node-server** — full bridge implementation (`serve()`, `createAdaptorServer()`)
