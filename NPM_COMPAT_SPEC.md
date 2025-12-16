# npm Compatibility Implementation Spec

This document specifies the Node.js APIs required to run the `npm` package inside NodeProcess.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     NodeProcess (isolated-vm)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   require   │  │   process   │  │   child_process     │  │
│  │   (CJS)     │  │   object    │  │   ──────────────    │  │
│  └─────────────┘  └─────────────┘  │   spawn/exec/fork   │  │
│                                     │         │           │  │
│  ┌─────────────┐  ┌─────────────┐  │         ▼           │  │
│  │  http/https │  │  net/tls    │  │   WasixInstance     │  │
│  │  dns/fetch  │  │             │  │   (bash/coreutils)  │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                   │
│         ▼                ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Host Bridge (ivm.Reference)                 ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Host Node.js                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ native http │  │ native net  │  │ native child_process│  │
│  │ native https│  │ native tls  │  │ (fallback only)     │  │
│  │ native dns  │  │             │  └─────────────────────┘  │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

## Key Simplifications

### Streaming: Fake It

All "streaming" APIs buffer the entire response/output, then emit it as a single chunk:

```javascript
// How we fake streaming for http.request response:
function createIncomingMessage(data) {
  const msg = new EventEmitter();
  msg.statusCode = data.statusCode;
  msg.headers = data.headers;
  // Emit entire body as single 'data' event
  queueMicrotask(() => {
    msg.emit('data', Buffer.from(data.body));
    msg.emit('end');
  });
  return msg;
}

// How we fake streaming for child_process.spawn:
// 1. Wait for process to complete
// 2. Emit all stdout as single 'data' event
// 3. Emit 'close' event
```

This works for npm because it typically waits for completion anyway.

### Networking: Just Bridge to Host

All networking is trivial - just call host Node.js native modules:

```javascript
// Host side
const fetchRef = new ivm.Reference(async (url, opts) => {
  const res = await fetch(url, opts);
  return { status: res.status, body: await res.text(), headers: [...res.headers] };
});

// Sandbox side
globalThis.fetch = async (url, opts) => {
  const data = await fetchRef.apply(undefined, [url, opts], { result: { promise: true }});
  return new Response(data.body, { status: data.status, headers: data.headers });
};
```

Same pattern for `http.request`, `dns.lookup`, etc.

---

## Phase 1: Process Object Enhancement

### 1.1 Static Properties

| Property | Value | Notes |
|----------|-------|-------|
| `process.platform` | `'linux'` | Configurable via options |
| `process.arch` | `'x64'` | Configurable via options |
| `process.version` | `'v20.0.0'` | Configurable |
| `process.versions` | `{node: '20.0.0', v8: '11.0', ...}` | Object |
| `process.pid` | `1` | Fake PID |
| `process.ppid` | `0` | Parent PID |
| `process.execPath` | `'/usr/bin/node'` | Fake path |
| `process.title` | `'node'` | Read/write |
| `process.config` | `{target_defaults: {}, variables: {}}` | Build config stub |
| `process.release` | `{name: 'node', ...}` | Release info stub |

### 1.2 Methods to Implement

| Method | Implementation |
|--------|----------------|
| `process.exit(code)` | Set `process.exitCode`, throw `ProcessExitError` |
| `process.nextTick(fn, ...args)` | Use `queueMicrotask(() => fn(...args))` |
| `process.hrtime()` | Use `performance.now()` conversion |
| `process.hrtime.bigint()` | Return `BigInt(performance.now() * 1e6)` |
| `process.getuid()` | Return `0` (root) |
| `process.getgid()` | Return `0` (root) |
| `process.umask()` | Return `0o022` |
| `process.uptime()` | Track start time, return diff |
| `process.memoryUsage()` | Return stub object |
| `process.cpuUsage()` | Return stub object |
| `process.kill(pid, signal)` | No-op or throw if pid !== process.pid |

### 1.3 Test Code

```typescript
// packages/nanosandbox/src/node-process/index.test.ts

describe("Phase 1: Process Object Enhancement", () => {
  describe("process static properties", () => {
    it("should have process.platform", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = process.platform;
        `);
        expect(result.exports).toBe("linux");
      } finally {
        np.dispose();
      }
    });

    it("should have process.arch", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = process.arch;
        `);
        expect(result.exports).toBe("x64");
      } finally {
        np.dispose();
      }
    });

    it("should have process.version", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = process.version;
        `);
        expect(result.exports).toMatch(/^v\d+\.\d+\.\d+$/);
      } finally {
        np.dispose();
      }
    });

    it("should have process.versions object", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = {
            hasNode: typeof process.versions.node === 'string',
            hasV8: typeof process.versions.v8 === 'string'
          };
        `);
        expect(result.exports).toEqual({ hasNode: true, hasV8: true });
      } finally {
        np.dispose();
      }
    });

    it("should have process.pid", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = typeof process.pid === 'number' && process.pid > 0;
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should have process.argv", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = Array.isArray(process.argv) && process.argv.length >= 2;
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should have process.execPath", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = typeof process.execPath === 'string' && process.execPath.includes('node');
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });
  });

  describe("process methods", () => {
    it("should support process.exit() by throwing", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          process.exit(42);
          module.exports = 'should not reach';
        `);
        expect(result.code).toBe(42);
      } finally {
        np.dispose();
      }
    });

    it("should support process.exitCode", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          process.exitCode = 5;
          module.exports = process.exitCode;
        `);
        expect(result.exports).toBe(5);
        expect(result.code).toBe(5);
      } finally {
        np.dispose();
      }
    });

    it("should support process.nextTick", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          const order = [];
          order.push(1);
          process.nextTick(() => order.push(3));
          order.push(2);
          // Need to await microtasks
          await new Promise(r => setTimeout(r, 0));
          module.exports = order;
        `);
        expect(result.exports).toEqual([1, 2, 3]);
      } finally {
        np.dispose();
      }
    });

    it("should support process.hrtime()", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          const t1 = process.hrtime();
          const isArray = Array.isArray(t1) && t1.length === 2;
          const hasSeconds = typeof t1[0] === 'number';
          const hasNanos = typeof t1[1] === 'number';
          module.exports = { isArray, hasSeconds, hasNanos };
        `);
        expect(result.exports).toEqual({ isArray: true, hasSeconds: true, hasNanos: true });
      } finally {
        np.dispose();
      }
    });

    it("should support process.hrtime.bigint()", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          const t = process.hrtime.bigint();
          module.exports = typeof t === 'bigint';
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should support process.getuid() and process.getgid()", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = {
            uid: process.getuid(),
            gid: process.getgid()
          };
        `);
        expect(result.exports.uid).toBe(0);
        expect(result.exports.gid).toBe(0);
      } finally {
        np.dispose();
      }
    });

    it("should support process.uptime()", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          const t = process.uptime();
          module.exports = typeof t === 'number' && t >= 0;
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should support process.memoryUsage()", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          const mem = process.memoryUsage();
          module.exports = {
            hasRss: typeof mem.rss === 'number',
            hasHeapTotal: typeof mem.heapTotal === 'number',
            hasHeapUsed: typeof mem.heapUsed === 'number'
          };
        `);
        expect(result.exports).toEqual({ hasRss: true, hasHeapTotal: true, hasHeapUsed: true });
      } finally {
        np.dispose();
      }
    });
  });
});
```

---

## Phase 2: Process as EventEmitter

### 2.1 Events to Support

| Event | Trigger |
|-------|---------|
| `exit` | When process.exit() is called or script ends |
| `beforeExit` | Before exit, if event loop is empty |
| `uncaughtException` | Unhandled errors (optional - may just throw) |
| `warning` | Process warnings |

### 2.2 Methods to Implement

| Method | Notes |
|--------|-------|
| `process.on(event, listener)` | Standard EventEmitter |
| `process.once(event, listener)` | Standard EventEmitter |
| `process.off(event, listener)` | Alias for removeListener |
| `process.removeListener(event, listener)` | Standard EventEmitter |
| `process.removeAllListeners(event?)` | Standard EventEmitter |
| `process.emit(event, ...args)` | Standard EventEmitter |
| `process.listeners(event)` | Standard EventEmitter |
| `process.listenerCount(event)` | Standard EventEmitter |

### 2.3 Stdio Streams

| Stream | Implementation |
|--------|----------------|
| `process.stdin` | Readable stream (initially empty/paused) |
| `process.stdout` | Writable stream → captures to result.stdout |
| `process.stderr` | Writable stream → captures to result.stderr |

### 2.4 Test Code

```typescript
describe("Phase 2: Process as EventEmitter", () => {
  describe("process events", () => {
    it("should support process.on and process.emit", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          let received = null;
          process.on('custom', (data) => { received = data; });
          process.emit('custom', 'hello');
          module.exports = received;
        `);
        expect(result.exports).toBe("hello");
      } finally {
        np.dispose();
      }
    });

    it("should support process.once", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          let count = 0;
          process.once('test', () => { count++; });
          process.emit('test');
          process.emit('test');
          module.exports = count;
        `);
        expect(result.exports).toBe(1);
      } finally {
        np.dispose();
      }
    });

    it("should support process.removeListener", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          let count = 0;
          const handler = () => { count++; };
          process.on('test', handler);
          process.emit('test');
          process.removeListener('test', handler);
          process.emit('test');
          module.exports = count;
        `);
        expect(result.exports).toBe(1);
      } finally {
        np.dispose();
      }
    });

    it("should support process.off as alias", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = process.off === process.removeListener;
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should fire exit event on process.exit()", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          let exitFired = false;
          process.on('exit', (code) => {
            exitFired = true;
            console.log('exit:' + code);
          });
          process.exit(0);
        `);
        expect(result.stdout).toContain("exit:0");
      } finally {
        np.dispose();
      }
    });
  });

  describe("process stdio streams", () => {
    it("should have process.stdout as writable", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          process.stdout.write('hello from stdout');
          module.exports = typeof process.stdout.write === 'function';
        `);
        expect(result.stdout).toContain("hello from stdout");
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should have process.stderr as writable", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          process.stderr.write('hello from stderr');
          module.exports = typeof process.stderr.write === 'function';
        `);
        expect(result.stderr).toContain("hello from stderr");
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should have process.stdin as readable", async () => {
      const np = new NodeProcess();
      try {
        const result = await np.run(`
          module.exports = {
            hasOn: typeof process.stdin.on === 'function',
            hasRead: typeof process.stdin.read === 'function',
            readable: process.stdin.readable !== undefined
          };
        `);
        expect(result.exports.hasOn).toBe(true);
      } finally {
        np.dispose();
      }
    });
  });
});
```

---

## Phase 3: child_process via WasixInstance

### 3.1 Architecture

```
child_process.spawn('ls', ['-la'])
         │
         ▼
┌─────────────────────────────┐
│  child_process polyfill     │
│  (in isolated-vm)           │
└──────────────┬──────────────┘
               │ ivm.Reference call
               ▼
┌─────────────────────────────┐
│  Host bridge function       │
│  (in host Node.js)          │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  WasixInstance              │
│  - runInteractive()         │
│  - exec()                   │
└─────────────────────────────┘
               │
               ▼
┌─────────────────────────────┐
│  WASM bash/coreutils        │
└─────────────────────────────┘
```

### 3.2 Methods to Implement

| Method | Implementation |
|--------|----------------|
| `spawn(cmd, args, opts)` | → `wasixInstance.runInteractive(cmd, args)` |
| `exec(cmd, opts, cb)` | → `wasixInstance.exec(cmd)` wrapped with callback |
| `execSync(cmd, opts)` | → `wasixInstance.exec(cmd)` (blocking via applySyncPromise) |
| `execFile(file, args, opts, cb)` | → `wasixInstance.run(file, args)` |
| `execFileSync(file, args, opts)` | → `wasixInstance.run(file, args)` blocking |
| `fork(modulePath, args, opts)` | → spawn new NodeProcess with IPC |
| `spawnSync(cmd, args, opts)` | → `wasixInstance.run(cmd, args)` blocking |

### 3.3 ChildProcess Class

```typescript
interface ChildProcess extends EventEmitter {
  pid: number;
  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;
  stdio: [Writable | null, Readable | null, Readable | null];
  killed: boolean;
  exitCode: number | null;
  signalCode: string | null;

  kill(signal?: string): boolean;
  ref(): void;
  unref(): void;
}
```

### 3.4 Test Code

```typescript
describe("Phase 3: child_process via WasixInstance", () => {
  describe("child_process.exec", () => {
    it("should execute shell command and return output", async () => {
      const dir = new Directory();
      dir.writeFile("/test.txt", "hello world");

      const systemBridge = new SystemBridge(dir);
      const wasix = new WasixInstance({ directory: dir });
      const np = new NodeProcess({ systemBridge, wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          const { stdout } = await execAsync('cat /test.txt');
          module.exports = stdout.trim();
        `);
        expect(result.exports).toBe("hello world");
      } finally {
        np.dispose();
      }
    });

    it("should capture stderr", async () => {
      const wasix = new WasixInstance();
      const np = new NodeProcess({ wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          try {
            await execAsync('cat /nonexistent');
          } catch (err) {
            module.exports = err.stderr.includes('No such file');
          }
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });
  });

  describe("child_process.execSync", () => {
    it("should execute synchronously", async () => {
      const dir = new Directory();
      dir.writeFile("/data.txt", "sync content");

      const systemBridge = new SystemBridge(dir);
      const wasix = new WasixInstance({ directory: dir });
      const np = new NodeProcess({ systemBridge, wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { execSync } = require('child_process');
          const output = execSync('cat /data.txt', { encoding: 'utf8' });
          module.exports = output.trim();
        `);
        expect(result.exports).toBe("sync content");
      } finally {
        np.dispose();
      }
    });
  });

  describe("child_process.spawn", () => {
    it("should spawn process with streaming output", async () => {
      const dir = new Directory();
      dir.writeFile("/file1.txt", "one");
      dir.writeFile("/file2.txt", "two");

      const systemBridge = new SystemBridge(dir);
      const wasix = new WasixInstance({ directory: dir });
      const np = new NodeProcess({ systemBridge, wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { spawn } = require('child_process');

          const child = spawn('ls', ['/']);

          let stdout = '';
          child.stdout.on('data', (data) => { stdout += data; });

          await new Promise((resolve) => child.on('close', resolve));

          module.exports = {
            hasFile1: stdout.includes('file1.txt'),
            hasFile2: stdout.includes('file2.txt')
          };
        `);
        expect(result.exports).toEqual({ hasFile1: true, hasFile2: true });
      } finally {
        np.dispose();
      }
    });

    it("should provide exit code", async () => {
      const wasix = new WasixInstance();
      const np = new NodeProcess({ wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { spawn } = require('child_process');

          const child = spawn('bash', ['-c', 'exit 42']);

          const code = await new Promise((resolve) => {
            child.on('close', (code) => resolve(code));
          });

          module.exports = code;
        `);
        expect(result.exports).toBe(42);
      } finally {
        np.dispose();
      }
    });

    it("should support stdin", async () => {
      const wasix = new WasixInstance();
      const np = new NodeProcess({ wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { spawn } = require('child_process');

          const child = spawn('cat', []);

          let stdout = '';
          child.stdout.on('data', (data) => { stdout += data; });

          child.stdin.write('hello from stdin');
          child.stdin.end();

          await new Promise((resolve) => child.on('close', resolve));

          module.exports = stdout;
        `);
        expect(result.exports).toBe("hello from stdin");
      } finally {
        np.dispose();
      }
    });
  });

  describe("child_process spawning node", () => {
    it("should spawn node via IPC to NodeProcess", async () => {
      const wasix = new WasixInstance();
      const np = new NodeProcess({ wasixInstance: wasix });

      try {
        const result = await np.run(`
          const { execSync } = require('child_process');
          const output = execSync('node -e "console.log(2+2)"', { encoding: 'utf8' });
          module.exports = output.trim();
        `);
        expect(result.exports).toBe("4");
      } finally {
        np.dispose();
      }
    });
  });
});
```

---

## Phase 4: Networking (Host Bridge)

### 4.1 Architecture

All networking calls bridge to host Node.js native modules via `ivm.Reference`.

```
┌─────────────────────────────────────────┐
│          Isolated VM                     │
│  ┌─────────────────────────────────┐    │
│  │  fetch('https://registry...')   │    │
│  │  http.request(...)              │    │
│  │  dns.lookup(...)                │    │
│  └──────────────┬──────────────────┘    │
│                 │ Reference.apply        │
└─────────────────┼───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│          Host Node.js                    │
│  ┌─────────────────────────────────┐    │
│  │  Native fetch()                  │    │
│  │  Native http.request()           │    │
│  │  Native dns.lookup()             │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 4.2 Modules to Bridge

| Module | Key APIs | Bridge Strategy |
|--------|----------|-----------------|
| `fetch` | globalThis.fetch | Direct async bridge to host fetch |
| `http` | request, get | Use host fetch internally, wrap response as IncomingMessage |
| `https` | request, get | Same as http |
| `dns` | lookup, resolve | Direct async bridge to host dns |
| `net` | Socket | Stub - not needed for npm (uses http) |
| `tls` | TLSSocket | Stub - not needed for npm (uses https) |

**Implementation note**: `http.request` and `https.request` don't need to bridge to native http/https modules. Instead, internally call host's `fetch()` and wrap the response:

```javascript
// http.request implementation (simplified)
function request(options, callback) {
  const req = new ClientRequest(options);

  // When req.end() is called, do the actual fetch
  req._doRequest = async () => {
    const url = `http://${options.hostname}:${options.port || 80}${options.path}`;
    const res = await hostFetch(url, {
      method: options.method,
      headers: options.headers,
      body: req._body
    });

    // Create fake IncomingMessage
    const incoming = createIncomingMessage(res);
    callback(incoming);
  };

  return req;
}
```

### 4.3 Test Code

```typescript
describe("Phase 4: Networking via Host Bridge", () => {
  describe("global fetch", () => {
    it("should fetch from URL", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const response = await fetch('https://httpbin.org/get');
          const data = await response.json();
          module.exports = {
            ok: response.ok,
            hasUrl: typeof data.url === 'string'
          };
        `);
        expect(result.exports.ok).toBe(true);
        expect(result.exports.hasUrl).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should support POST with body", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const response = await fetch('https://httpbin.org/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: 'data' })
          });
          const data = await response.json();
          module.exports = data.json;
        `);
        expect(result.exports).toEqual({ test: 'data' });
      } finally {
        np.dispose();
      }
    });

    it("should handle fetch errors", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          try {
            await fetch('https://nonexistent.invalid/');
            module.exports = 'should have thrown';
          } catch (err) {
            module.exports = err.message.includes('ENOTFOUND') ||
                            err.message.includes('fetch failed') ||
                            err.code === 'ENOTFOUND';
          }
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });
  });

  describe("http module", () => {
    it("should make HTTP GET request", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const http = require('http');

          const data = await new Promise((resolve, reject) => {
            const req = http.get('http://httpbin.org/get', (res) => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => resolve({ status: res.statusCode, body }));
            });
            req.on('error', reject);
          });

          module.exports = {
            status: data.status,
            hasBody: data.body.length > 0
          };
        `);
        expect(result.exports.status).toBe(200);
        expect(result.exports.hasBody).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should make HTTP POST request", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const http = require('http');

          const data = await new Promise((resolve, reject) => {
            const req = http.request({
              hostname: 'httpbin.org',
              path: '/post',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            }, (res) => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => resolve(JSON.parse(body)));
            });
            req.on('error', reject);
            req.write(JSON.stringify({ hello: 'world' }));
            req.end();
          });

          module.exports = data.json;
        `);
        expect(result.exports).toEqual({ hello: 'world' });
      } finally {
        np.dispose();
      }
    });
  });

  describe("https module", () => {
    it("should make HTTPS request", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const https = require('https');

          const data = await new Promise((resolve, reject) => {
            https.get('https://httpbin.org/get', (res) => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => resolve(res.statusCode));
            }).on('error', reject);
          });

          module.exports = data;
        `);
        expect(result.exports).toBe(200);
      } finally {
        np.dispose();
      }
    });
  });

  describe("dns module", () => {
    it("should resolve DNS lookup", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const dns = require('dns');
          const { promisify } = require('util');
          const lookup = promisify(dns.lookup);

          const result = await lookup('google.com');
          module.exports = {
            hasAddress: typeof result.address === 'string',
            hasFamily: result.family === 4 || result.family === 6
          };
        `);
        expect(result.exports.hasAddress).toBe(true);
        expect(result.exports.hasFamily).toBe(true);
      } finally {
        np.dispose();
      }
    });

    it("should support dns.promises", async () => {
      const np = new NodeProcess();

      try {
        const result = await np.run(`
          const dns = require('dns');
          const result = await dns.promises.lookup('google.com');
          module.exports = typeof result.address === 'string';
        `);
        expect(result.exports).toBe(true);
      } finally {
        np.dispose();
      }
    });
  });
});
```

---

## Phase 5: OS Module Fixes

### 5.1 Methods to Implement/Fix

| Method | Return Value |
|--------|--------------|
| `os.platform()` | `'linux'` |
| `os.arch()` | `'x64'` |
| `os.type()` | `'Linux'` |
| `os.release()` | `'5.15.0'` |
| `os.version()` | `'#1 SMP'` |
| `os.homedir()` | `'/root'` (or configurable) |
| `os.tmpdir()` | `'/tmp'` |
| `os.hostname()` | `'sandbox'` |
| `os.userInfo()` | `{username: 'root', uid: 0, gid: 0, ...}` |
| `os.cpus()` | `[{model: 'Virtual CPU', speed: 2000, times: {...}}]` |
| `os.totalmem()` | `1073741824` (1GB) |
| `os.freemem()` | `536870912` (512MB) |
| `os.loadavg()` | `[0.1, 0.1, 0.1]` |
| `os.uptime()` | `3600` |
| `os.networkInterfaces()` | `{}` (empty - no networking info) |
| `os.endianness()` | `'LE'` |
| `os.EOL` | `'\n'` |
| `os.devNull` | `'/dev/null'` |
| `os.constants` | signal and errno constants |

### 5.2 Test Code

```typescript
describe("Phase 5: OS Module", () => {
  it("should have os.platform()", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        module.exports = os.platform();
      `);
      expect(result.exports).toBe("linux");
    } finally {
      np.dispose();
    }
  });

  it("should have os.arch()", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        module.exports = os.arch();
      `);
      expect(result.exports).toBe("x64");
    } finally {
      np.dispose();
    }
  });

  it("should have os.homedir()", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        module.exports = os.homedir();
      `);
      expect(result.exports).toBe("/root");
    } finally {
      np.dispose();
    }
  });

  it("should have os.tmpdir()", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        module.exports = os.tmpdir();
      `);
      expect(result.exports).toBe("/tmp");
    } finally {
      np.dispose();
    }
  });

  it("should have os.userInfo()", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        const info = os.userInfo();
        module.exports = {
          hasUsername: typeof info.username === 'string',
          hasUid: typeof info.uid === 'number',
          hasGid: typeof info.gid === 'number',
          hasHomedir: typeof info.homedir === 'string'
        };
      `);
      expect(result.exports).toEqual({
        hasUsername: true,
        hasUid: true,
        hasGid: true,
        hasHomedir: true
      });
    } finally {
      np.dispose();
    }
  });

  it("should have os.cpus()", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        const cpus = os.cpus();
        module.exports = {
          isArray: Array.isArray(cpus),
          hasModel: cpus.length > 0 && typeof cpus[0].model === 'string'
        };
      `);
      expect(result.exports.isArray).toBe(true);
      expect(result.exports.hasModel).toBe(true);
    } finally {
      np.dispose();
    }
  });

  it("should have os.EOL", async () => {
    const np = new NodeProcess();
    try {
      const result = await np.run(`
        const os = require('os');
        module.exports = os.EOL;
      `);
      expect(result.exports).toBe("\n");
    } finally {
      np.dispose();
    }
  });
});
```

---

## Phase 6: module.createRequire

### 6.1 What It Does

`module.createRequire(filename)` creates a `require` function that resolves modules relative to the given filename path.

```javascript
const { createRequire } = require('module');
const requireFromRoot = createRequire('/app/package.json');
const pkg = requireFromRoot('./lib/util'); // resolves from /app/
```

### 6.2 Implementation

Our existing `require` implementation already supports specifying a base path. `createRequire` simply:
1. Takes a filename
2. Returns a new require function bound to `path.dirname(filename)`

```typescript
// Implementation sketch
function createRequire(filename: string): RequireFunction {
  const baseDir = path.dirname(filename);
  const requireFn = (specifier: string) => {
    return internalRequire(specifier, baseDir);
  };
  requireFn.resolve = (specifier: string) => {
    return resolveModule(specifier, baseDir);
  };
  requireFn.cache = moduleCache;
  requireFn.main = undefined;
  return requireFn;
}
```

### 6.3 Complications

1. **URL support**: `createRequire` also accepts `file://` URLs - need URL parsing
2. **ESM interop**: In ESM, `createRequire` is the only way to use require() - already works via our polyfill
3. **require.main**: Should point to the main module - need to track this
4. **require.cache**: Should be shared across all require functions

### 6.4 Test Code

```typescript
describe("Phase 6: module.createRequire", () => {
  it("should create require from filename", async () => {
    const dir = new Directory();
    dir.writeFile("/app/lib/util.js", "module.exports = { name: 'util' };");
    dir.writeFile("/app/package.json", "{}");

    const systemBridge = new SystemBridge(dir);
    const np = new NodeProcess({ systemBridge });

    try {
      const result = await np.run(`
        const { createRequire } = require('module');
        const requireFromApp = createRequire('/app/package.json');
        const util = requireFromApp('./lib/util');
        module.exports = util.name;
      `);
      expect(result.exports).toBe("util");
    } finally {
      np.dispose();
    }
  });

  it("should support file:// URLs", async () => {
    const dir = new Directory();
    dir.writeFile("/app/mod.js", "module.exports = 42;");

    const systemBridge = new SystemBridge(dir);
    const np = new NodeProcess({ systemBridge });

    try {
      const result = await np.run(`
        const { createRequire } = require('module');
        const req = createRequire('file:///app/index.js');
        module.exports = req('./mod');
      `);
      expect(result.exports).toBe(42);
    } finally {
      np.dispose();
    }
  });

  it("should share module cache", async () => {
    const dir = new Directory();
    dir.writeFile("/a/mod.js", "module.exports = { count: 0 };");
    dir.writeFile("/b/index.js", "");

    const systemBridge = new SystemBridge(dir);
    const np = new NodeProcess({ systemBridge });

    try {
      const result = await np.run(`
        const { createRequire } = require('module');
        const reqA = createRequire('/a/index.js');
        const reqB = createRequire('/b/index.js');

        const mod1 = reqA('./mod');
        mod1.count++;

        const mod2 = reqB('../a/mod');
        module.exports = mod2.count; // Should be 1 if cache is shared
      `);
      expect(result.exports).toBe(1);
    } finally {
      np.dispose();
    }
  });

  it("should have require.resolve", async () => {
    const dir = new Directory();
    dir.writeFile("/app/lib/util.js", "module.exports = {};");

    const systemBridge = new SystemBridge(dir);
    const np = new NodeProcess({ systemBridge });

    try {
      const result = await np.run(`
        const { createRequire } = require('module');
        const req = createRequire('/app/index.js');
        module.exports = req.resolve('./lib/util');
      `);
      expect(result.exports).toBe("/app/lib/util.js");
    } finally {
      np.dispose();
    }
  });
});
```

---

## Phase 7: Testing npm Itself

### 7.1 Test Strategy

1. **Unit tests**: Test individual npm commands in isolation
2. **Integration tests**: Run actual npm operations against mock registry
3. **Offline tests**: Test npm with `--offline` flag and pre-installed packages

### 7.2 Mock Registry Setup

Use [verdaccio](https://verdaccio.org/) or a simple HTTP server to provide test packages.

### 7.3 Test Code

```typescript
describe("npm compatibility", () => {
  // Setup: Install npm into the virtual filesystem
  let np: NodeProcess;
  let systemBridge: SystemBridge;
  let wasix: WasixInstance;

  beforeAll(async () => {
    const dir = new Directory();

    // Copy npm package into virtual fs
    // In practice, you'd bundle a subset or use a build step
    await copyNpmToDirectory(dir, '/usr/lib/node_modules/npm');
    dir.writeFile('/usr/bin/npm', '#!/usr/bin/env node\nrequire("/usr/lib/node_modules/npm")');

    systemBridge = new SystemBridge(dir);
    wasix = new WasixInstance({ directory: dir });
    np = new NodeProcess({
      systemBridge,
      wasixInstance: wasix,
      env: {
        HOME: '/root',
        PATH: '/usr/bin:/bin',
        npm_config_registry: 'http://localhost:4873' // local verdaccio
      }
    });
  });

  afterAll(() => {
    np.dispose();
  });

  describe("npm --version", () => {
    it("should print version", async () => {
      const result = await np.run(`
        process.argv = ['node', 'npm', '--version'];
        require('/usr/lib/node_modules/npm');
      `);
      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe("npm ls", () => {
    it("should list installed packages", async () => {
      // Setup: Create a project with dependencies
      systemBridge.writeFile('/app/package.json', JSON.stringify({
        name: 'test-app',
        dependencies: { lodash: '^4.0.0' }
      }));
      systemBridge.mkdir('/app/node_modules/lodash');
      systemBridge.writeFile('/app/node_modules/lodash/package.json',
        JSON.stringify({ name: 'lodash', version: '4.17.21' }));

      const result = await np.run(`
        process.chdir('/app');
        process.argv = ['node', 'npm', 'ls', '--json'];
        require('/usr/lib/node_modules/npm');
      `);

      const output = JSON.parse(result.stdout);
      expect(output.dependencies.lodash.version).toBe('4.17.21');
    });
  });

  describe("npm pack", () => {
    it("should create tarball", async () => {
      systemBridge.writeFile('/app/package.json', JSON.stringify({
        name: 'my-package',
        version: '1.0.0'
      }));
      systemBridge.writeFile('/app/index.js', 'module.exports = {}');

      const result = await np.run(`
        process.chdir('/app');
        process.argv = ['node', 'npm', 'pack'];
        require('/usr/lib/node_modules/npm');
      `);

      expect(result.stdout).toContain('my-package-1.0.0.tgz');
      expect(systemBridge.existsSync('/app/my-package-1.0.0.tgz')).toBe(true);
    });
  });

  describe("npm install --offline", () => {
    it("should install from cache", async () => {
      // Pre-populate npm cache with lodash
      await setupNpmCache(systemBridge, {
        'lodash@4.17.21': '/path/to/lodash-tarball'
      });

      systemBridge.writeFile('/app/package.json', JSON.stringify({
        dependencies: { lodash: '4.17.21' }
      }));

      const result = await np.run(`
        process.chdir('/app');
        process.argv = ['node', 'npm', 'install', '--offline'];
        require('/usr/lib/node_modules/npm');
      `);

      expect(result.code).toBe(0);
      expect(systemBridge.existsSync('/app/node_modules/lodash')).toBe(true);
    });
  });

  describe("npm install (with network)", () => {
    it("should fetch and install package", async () => {
      // Requires verdaccio running at localhost:4873
      systemBridge.writeFile('/app/package.json', JSON.stringify({
        dependencies: { 'is-odd': '^3.0.0' }
      }));

      const result = await np.run(`
        process.chdir('/app');
        process.argv = ['node', 'npm', 'install'];
        require('/usr/lib/node_modules/npm');
      `);

      expect(result.code).toBe(0);
      expect(systemBridge.existsSync('/app/node_modules/is-odd')).toBe(true);
    }, 30000);
  });

  describe("npm run", () => {
    it("should run package.json scripts", async () => {
      systemBridge.writeFile('/app/package.json', JSON.stringify({
        scripts: {
          test: 'echo "running tests"'
        }
      }));

      const result = await np.run(`
        process.chdir('/app');
        process.argv = ['node', 'npm', 'run', 'test'];
        require('/usr/lib/node_modules/npm');
      `);

      expect(result.stdout).toContain('running tests');
    });
  });
});
```

---

## Summary

| Phase | Components | Time Estimate |
|-------|------------|---------------|
| 1 | Process static properties & methods | 30 min |
| 2 | Process as EventEmitter + stdio | 45 min |
| 3 | child_process → WasixInstance (buffered) | 1.5 hr |
| 4 | Networking host bridge (fetch, http, dns) | 1 hr |
| 5 | OS module fixes | 20 min |
| 6 | module.createRequire | 30 min |
| 7 | npm integration tests | 1 hr |
| **Total** | | **~5 hours** |

### Dependencies Between Phases

```
Phase 1 ──┐
          ├──► Phase 7 (npm tests)
Phase 2 ──┤
          │
Phase 3 ──┤ (child_process needed for npm scripts)
          │
Phase 4 ──┤ (networking needed for npm install)
          │
Phase 5 ──┤ (os module needed for platform checks)
          │
Phase 6 ──┘ (createRequire used by some npm internals)
```

Phases 1-2 and 5-6 can be done in parallel. Phase 3 requires WasixInstance integration. Phase 4 requires host bridge setup. Phase 7 requires all others.

### Nothing Is Hard

| Thing | Why It's Easy |
|-------|---------------|
| Networking | Just bridge to host native modules via ivm.Reference |
| Streaming | Fake it - buffer everything, emit once |
| http/https | Internally use fetch on host, wrap response |
| child_process | Route to WasixInstance.exec(), buffer output |
| OS module | Just return static values |
| WasixInstance ↔ NodeProcess | Just pass references during init |
