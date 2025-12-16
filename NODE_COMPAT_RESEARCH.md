# Node.js Compatibility Specification

This document describes the Node.js API compatibility of the nanosandbox NodeProcess implementation.

## Architecture Overview

The implementation uses a three-tier architecture:
1. **isolated-vm Isolate**: V8 context isolation for security
2. **SystemBridge**: Virtual filesystem abstraction (backed by Wasmer's Directory)
3. **Polyfill Layer**: Dynamic require() system with bundled polyfills from node-stdlib-browser

## Quick Compatibility Matrix

| Category | Status | Details |
|----------|--------|---------|
| **File System** | ✅ Full | Comprehensive sync/async, fs.promises, streams (basic) |
| **CommonJS Modules** | ✅ Full | require(), caching, node_modules, relative/bare imports |
| **Core Stdlib** | ✅ Partial | 24+ modules via node-stdlib-browser |
| **Process/OS** | ⚠️ Minimal | Only cwd(), env (empty) |
| **Networking** | ❌ None | http/https browser-only, no sockets |
| **Child Processes** | ❌ None | Security restriction |
| **Native Modules** | ❌ None | Not supported in isolate |
| **ESM/Import** | ✅ Full | import/export via isolated-vm compileModule |
| **Crypto** | ⚠️ Limited | crypto-browserify (web crypto subset) |

## Implemented APIs

### File System (fs) - Comprehensive

Custom implementation at `packages/fs/src/fs-module.ts`

**Synchronous Methods:**
- `readFileSync()` - with encoding options (utf8, ascii, binary, base64, hex)
- `writeFileSync()` - string/Uint8Array support
- `appendFileSync()` - append to files
- `readdirSync()` - with optional withFileTypes
- `mkdirSync()` - with recursive option
- `rmdirSync()` - remove directories
- `existsSync()` - check file existence
- `statSync()` / `lstatSync()` - file statistics (Stats class)
- `unlinkSync()` - delete files
- `renameSync()` - move/rename files
- `copyFileSync()` - file copying
- `accessSync()` - check access permissions
- `realpathSync()` - path normalization
- `openSync()` / `closeSync()` - file descriptor management
- `readSync()` / `writeSync()` - low-level file I/O with fd
- `fstatSync()` / `ftruncateSync()` - fd-based operations
- `createReadStream()` / `createWriteStream()` - basic stream simulation

**Asynchronous Methods:**
- `readFile()`, `writeFile()`, `appendFile()`, `readdir()`, `mkdir()`, `rmdir()`, `stat()`, `lstat()`
- `unlink()`, `rename()`, `copyFile()`, `access()`, `realpath()`, `open()`, `close()`, `read()`, `write()`, `fstat()`
- All support both callback and Promise patterns

**fs.promises API:**
- Wrapped versions of async methods returning Promises
- `access()`, `readFile()`, `writeFile()`, `appendFile()`, `readdir()`, `mkdir()`, `rmdir()`
- `stat()`, `lstat()`, `unlink()`, `rename()`, `copyFile()`

**Supported Constants:**
```javascript
fs.constants: {
  O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND,
  S_IFMT, S_IFREG, S_IFDIR, S_IFLNK
}
```

**Stats Class:**
- Methods: `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`
- Properties: `dev`, `ino`, `mode`, `nlink`, `uid`, `gid`, `rdev`, `size`, `blksize`, `blocks`
- Timestamps: `atimeMs`, `mtimeMs`, `ctimeMs`, `birthtimeMs` (and Date versions)

**Dirent Class (for withFileTypes):**
- `isFile()`, `isDirectory()`, `isSymbolicLink()`, `isBlockDevice()`, `isCharacterDevice()`, `isFIFO()`, `isSocket()`

### Module System - Full CommonJS Support

**require() Features:**
- Dynamic module resolution with proper caching
- `node:` prefix handling (e.g., `require('node:path')`)
- Relative imports (`./lib/module`, `../config`)
- Bare module imports with node_modules walking
- Scoped packages (`@scope/package`, `@scope/package/subpath`)
- Package.json main field resolution
- Default index.js/index.json fallback
- Subpath imports (`package/extra`)
- Circular dependency detection
- `module.exports` / `exports` compatibility
- `require.resolve()` support

**Module Properties:**
```javascript
module.exports  // primary export
module.filename // absolute path
module.dirname  // directory of module
module.id       // resolved path
module.loaded   // boolean flag
```

### Core Stdlib Modules (via node-stdlib-browser)

**Fully Polyfilled:**
- `assert` - assertion library
- `buffer` - Buffer implementation
- `console` - log, error, warn, info
- `constants` - platform constants
- `crypto` - cryptographic functions (web crypto subset)
- `domain` - domain module
- `events` - EventEmitter, full pub/sub
- `path` - path utilities (join, dirname, basename, resolve, etc.)
- `punycode` - Unicode domain names
- `querystring` - URL query string parsing
- `stream` - Stream base classes
- `readable-stream` - Full stream implementation
  - `_stream_duplex`, `_stream_passthrough`, `_stream_readable`, `_stream_transform`, `_stream_writable`
- `string_decoder` - string decoding
- `sys` - util alias
- `timers` - setInterval, setTimeout, setImmediate
- `timers/promises` - Promise-based timers
- `tty` - TTY functionality
- `url` - URL parsing
- `util` - utility functions (format, inspect, inherits, etc.)
- `vm` - basic VM functionality
- `zlib` - compression/decompression

### Global Objects & Variables

```javascript
global / globalThis      // global scope
process                  // minimal process object
process.cwd()           // returns '/' (hardcoded)
process.env             // empty object (can be populated)
module                  // CommonJS module object
module.exports          // export container
console                 // with log, error, warn, info
require()               // CommonJS require function
require.resolve()       // module resolution
Buffer                  // Uint8Array-based implementation
```

## Missing/Stubbed APIs

### Critical System APIs (Not Available)

| Module | Reason |
|--------|--------|
| `child_process` | Security restriction - no process spawning |
| `cluster` | No multi-process support |
| `dgram` | No UDP/datagram networking |
| `dns` | No domain name resolution |
| `net` | No TCP socket connections |
| `readline` | No interactive input |
| `repl` | No interactive shell |
| `tls` | No secure socket layer |
| `http2` | No HTTP/2 protocol |
| `worker_threads` | No multi-threading |

### Process Object Limitations

Missing properties/methods:
- `process.exit()`
- `process.argv`
- `process.pid`
- `process.platform`
- `process.version`
- `process.hrtime()`
- `process.memoryUsage()`
- `process.on()` / process events

### Module System Limitations

- No `require.cache` access
- No `module.createRequire()`
- No dynamic `import()` (static imports work)
- No `vm.runInNewContext()` access

### File System Limitations

- No symbolic link support (lstat identical to stat)
- No permission bits enforcement
- No actual file mode masks
- `watch()` / `watchFile()` / `unwatchFile()` are no-ops
- `createReadStream()` / `createWriteStream()` are basic shims (no backpressure)

### OS Module Limitations

Browser polyfill only - `os.platform()`, `os.arch()`, `os.cpus()`, `os.freemem()` return stub values.

### Crypto Limitations

Uses `crypto-browserify` - missing Node-specific APIs:
- `crypto.scrypt()` / `crypto.scryptSync()`
- `crypto.generateKeyPair()` / `crypto.generateKeyPairSync()`
- Some cipher algorithms

### Native Addons

No support for:
- `.node` files
- `node-gyp` compiled modules
- Packages with native C/C++ bindings (bcrypt, sharp, sqlite3, esbuild native, etc.)

## Programs That Will Work

- File manipulation scripts
- JSON/text processing
- Path operations
- Event-driven code
- Stream processing (basic)
- Crypto operations (common use cases)
- Any pure JavaScript npm package using CommonJS

## Programs That Won't Work

- HTTP servers or clients
- Database clients (network-based)
- Anything using `child_process`
- Native addon packages
- Programs checking `process.platform` or `process.argv`
- File watchers
- Worker threads

---

## WebContainers Comparison

Research on how [WebContainers](https://webcontainers.io/) (by StackBlitz) compares to nanosandbox.

### Architecture Difference

| Aspect | WebContainers | nanosandbox |
|--------|--------------|--------------|
| **Runtime** | Full Node.js compiled to WASM | isolated-vm (V8 isolate) with polyfills |
| **Environment** | Browser-only | Node.js host |
| **Node.js Version** | Actual Node.js (~v16+) | Polyfilled CommonJS |
| **Isolation** | Browser sandbox + ServiceWorker | V8 isolate memory barrier |

### Feature Comparison

| Feature | WebContainers | nanosandbox |
|---------|--------------|--------------|
| **Full Node.js stdlib** | ✅ Yes (real Node) | ⚠️ Partial (polyfills) |
| **npm/pnpm install** | ✅ Yes | ❌ No (pre-install only) |
| **HTTP networking** | ✅ Yes (via ServiceWorker) | ❌ No |
| **TCP sockets** | ⚠️ HTTP only, no raw TCP | ❌ No |
| **WebSockets** | ✅ Yes | ❌ No |
| **child_process.spawn()** | ✅ Yes (within container) | ❌ No |
| **Dev servers (vite, webpack)** | ✅ Yes | ❌ No |
| **Native addons** | ❌ No (--no-addons) | ❌ No |
| **ESM import/export** | ✅ Yes | ✅ Yes (via compileModule) |
| **fs.watch()** | ✅ Yes | ❌ No (stub) |
| **Multiple instances** | ❌ No (one per page) | ✅ Yes |
| **Works in Node.js** | ❌ No (browser only) | ✅ Yes |
| **SharedArrayBuffer required** | ✅ Yes | ❌ No |
| **COOP/COEP headers required** | ✅ Yes | ❌ No |
| **WASM bash/coreutils** | ❌ No | ✅ Yes |

### What WebContainers Has That We Don't

1. **Real Node.js runtime** - Full stdlib, not polyfills
2. **Networking** - HTTP requests, WebSockets, dev servers
3. **Package management** - npm install at runtime
4. **child_process** - Can spawn processes within container
5. **fs.watch()** - File watching works
6. **Full crypto** - Real Node.js crypto module
7. **process object** - Full process.argv, process.env, process.platform, etc.

### What nanosandbox Has That WebContainers Doesn't

1. **Node.js host environment** - Runs server-side, not just browser
2. **Multiple instances** - Can run many sandboxes concurrently
3. **No special headers** - No COOP/COEP requirement
4. **WASM shell** - bash, coreutils via WASIX
5. **Simpler deployment** - No ServiceWorker complexity
6. **Lower overhead** - No full Node.js WASM binary

### Key Gaps to Consider Closing

If we wanted closer parity with WebContainers:

| Gap | Difficulty | Approach |
|-----|-----------|----------|
| **HTTP client** | Medium | Add fetch polyfill that bridges to host |
| **child_process** | Hard | Would need process isolation model |
| **npm install** | Hard | Need package resolution + fetch |
| **process.argv/env** | Easy | Populate from config |
| **fs.watch()** | Medium | Implement with polling |
| **dynamic import()** | Medium | Add async import wrapper |

### Sources

- [WebContainer API Docs](https://webcontainers.io/)
- [Introducing WebContainers](https://blog.stackblitz.com/posts/introducing-webcontainers/)
- [WebContainers Troubleshooting](https://webcontainers.io/guides/troubleshooting)
- [StackBlitz Platform Docs](https://developer.stackblitz.com/platform/api/webcontainer-api)
- [WebContainers GitHub](https://github.com/stackblitz/webcontainer-core)
