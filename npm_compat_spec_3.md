# npm Compatibility Spec - Phase 3: Installation Support

## Current State

npm CLI integration has basic functionality working in the nanosandbox:

| Command | Status | Notes |
|---------|--------|-------|
| npm --version | ✅ Working | Returns version string |
| npm config list | ✅ Working | Shows configuration |
| npm ls | ✅ Working | Shows package tree |
| npm init -y | ✅ Working | Creates package.json |
| npm ping | ✅ Working | Registry connectivity (mocked) |
| npm view | ✅ Working | Fetches package info |
| npm pack | ⚠️ Partial | Runs but fails to create tarball |
| npm install | ⚠️ Partial | Makes requests but doesn't install |

## Issues to Fix

### 1. File URL Handling in npm-package-arg

**Location:** `packages/nanosandbox/src/node-process/process-polyfill.ts` (URL polyfill)

**Problem:** npm-package-arg creates file URLs like `file:.` for the current directory and expects both of these to work:
```javascript
resolvedUrl = new URL("file:.", "file:///app/")  // Should resolve to file:///app
specUrl = new URL("file:.")                       // Should throw TypeError
```

When `specUrl` throws, npm-package-arg catches it and re-throws with "Invalid file: URL, must comply with RFC 8089". This breaks `npm pack` when run without arguments.

**Current Behavior:**
- `new URL("file:.", "file:///app/")` → `file:///app` ✅
- `new URL("file:.")` → throws TypeError ✅ (correct per spec)
- npm-package-arg catches the error and throws RFC 8089 error ❌

**Root Cause Analysis:**

The bug isn't in our URL polyfill - `new URL("file:.")` correctly throws TypeError (same as real Node.js). The issue is that **`path.resolve()` should be converting `.` to an absolute path before the `file:` prefix is added, but it's not happening**.

**Real npm behavior:**
```javascript
// Somewhere before npm-package-arg:
const absolutePath = path.resolve('.')  // '/Users/foo/project'
const spec = `file:${absolutePath}`     // 'file:/Users/foo/project'
npa(spec)  // new URL("file:/Users/foo/project") works fine
```

**Our sandbox behavior:**
```javascript
// The path isn't being resolved before the file: prefix
const spec = `file:.`  // Still relative
npa(spec)  // new URL("file:.") throws
```

**To verify, check:**
1. Is our `path.resolve()` polyfill working correctly?
2. Is `process.cwd()` returning the right value inside the isolate?
3. Where in npm's code does the path get resolved before hitting npm-package-arg?

**Quick diagnostic:**
```javascript
// Add to test before running npm:
console.log('cwd:', process.cwd());
console.log('path.resolve("."):', require("path").resolve("."));
// If path.resolve(".") returns "." instead of "/app", that's the bug
```

**Potential Solutions:**
1. **Fix path.resolve polyfill** to properly use process.cwd() for relative paths
2. **Pre-resolve file specs** before they reach npm-package-arg
3. **Use absolute paths** for npm pack by resolving `.` to full path before npm runs

**Files to modify:**
- `process-polyfill.ts` - Could intercept/transform args before npm runs
- Or create a wrapper that normalizes file specs

### 2. Tarball Extraction (npm install)

**Location:** Network adapter and fs polyfill

**Problem:** npm install fetches package metadata successfully but fails to extract tarballs. The process:
1. Fetch package metadata from registry ✅
2. Fetch tarball (.tgz file) ❓ (not seeing this request)
3. Extract tarball to node_modules ❌
4. Write package files ❌

#### 2a. The Fetch/Response Disconnect

**Observed behavior during test:**
```
[Network] httpRequest: https://registry.npmjs.org/npm
[Network] httpRequest: https://registry.npmjs.org/is-number
// No tarball request ever appears
// npmCli promise never resolves
```

**Expected behavior:**
```
[Network] httpRequest: https://registry.npmjs.org/is-number     <- metadata
[Network] httpRequest: https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz  <- tarball
// Then extraction and file writes
```

**The disconnect happens between metadata fetch and tarball fetch.** npm never requests the .tgz file.

**Likely causes (in order of probability):**

1. **Response stream not completing** - The HTTP response body is delivered but the stream never signals completion. npm's `npm-registry-fetch` uses minipass streams that wait for 'end' events. If our `IncomingMessage` doesn't properly emit stream end, the metadata fetch appears to hang.

   ```javascript
   // In network-polyfill.ts - IncomingMessage
   // The [Symbol.asyncIterator] returns data but the consumer may expect different behavior
   [Symbol.asyncIterator]() {
     let consumed = false;
     return {
       async next() {
         if (consumed) return { done: true };
         consumed = true;
         return { done: false, value: Buffer.from(body) };
       }
     };
   }
   ```

   **Issue:** minipass may not recognize this as a proper async iterable, or may expect additional events.

2. **JSON parsing succeeds but promise chain breaks** - The packument (package metadata) is parsed, but somewhere in pacote's resolution logic, a promise doesn't resolve. This could be:
   - `cacache` (npm's cache) trying to write/read cache files
   - `ssri` (subresource integrity) validation failing silently
   - `@npmcli/arborist` tree building hanging

3. **Packument format issues** - Our mock response may be missing fields that npm expects:
   ```javascript
   // Our mock returns:
   {
     name: "is-number",
     "dist-tags": { latest: "7.0.0" },
     versions: {
       "7.0.0": {
         name: "is-number",
         version: "7.0.0",
         main: "index.js",
         dist: {
           tarball: "https://...",
           shasum: "...",
           integrity: "sha512-..."
         }
       }
     }
   }

   // Real packument has additional fields:
   {
     _id: "is-number",
     _rev: "...",
     time: { created: "...", modified: "...", "7.0.0": "..." },
     maintainers: [...],
     repository: {...},
     // ... many more
   }
   ```

   Missing fields might cause validation to fail silently.

4. **Cache operations blocking** - npm tries to cache the packument before proceeding. If `cacache` operations don't complete (missing fs methods, stream issues), the install hangs.

**Debugging strategy:**

```javascript
// Add to test to trace what's happening after metadata fetch:
const mockNetworkAdapter = {
  async httpRequest(url, options) {
    console.log("[Network] Request:", url);

    if (url.includes("is-number") && !url.includes(".tgz")) {
      console.log("[Network] Returning packument...");
      const response = { /* packument */ };
      console.log("[Network] Packument size:", JSON.stringify(response).length);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(response),
        url
      };
    }

    if (url.includes(".tgz")) {
      console.log("[Network] TARBALL REQUEST - this means packument was processed!");
      // ...
    }
  }
};
```

**Key question:** Is the packument response being fully consumed, or is something waiting for a stream event that never comes?

#### 2b. Tarball Response (if we get there)
The network mock returns empty body for .tgz requests. Need to:
- Return actual gzipped tarball data
- Or mock the extraction directly

#### 2c. Gunzip Support
npm uses zlib to decompress .tgz files. Current zlib polyfill status:
```javascript
// packages/nanosandbox/src/node-process/polyfills.ts
// zlib polyfill is minimal - needs gunzip/inflate support
```

**Required zlib methods:**
- `createGunzip()` - streaming decompression
- `gunzip(buffer, callback)` - one-shot decompression
- `inflate(buffer, callback)` - raw inflate

#### 2d. Tar Extraction
npm uses `tar` package (via pacote) which requires:
- Readable stream from gunzip
- Proper stream piping
- File write operations

**Files to modify:**
- `polyfills.ts` - Add zlib gunzip support
- `fs.ts` (bridge) - Ensure createWriteStream handles binary data
- Network adapter mock - Return valid tarball data

### 3. Async Completion (npmCli Promise)

**Location:** npm CLI execution in isolated-vm

**Problem:** For npm pack and npm install, the `await npmCli(process)` promise never resolves:
```javascript
await npmCli(process);  // Never returns
console.log("done");    // Never reached
```

**Root Cause Analysis:**
- npm uses complex async operations with streams
- Some internal promise/callback never completes
- Likely a stream that doesn't emit 'end' or 'finish'

**Debugging Steps:**
1. Add tracing to all stream operations
2. Identify which stream is blocking
3. Ensure all streams properly emit lifecycle events

**Potential Issues:**
- `createWriteStream` - Fixed to emit finish/close ✅
- `createReadStream` - May need similar fixes
- HTTP response streams - IncomingMessage async iterator
- Tar/gzip streams - Need proper implementation

### 4. Binary Data Handling

**Location:** `packages/nanosandbox/src/bridge/fs.ts`

**Problem:** Current fs implementation converts everything to strings:
```javascript
write(chunk: string | Uint8Array): boolean {
  content += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  return true;
}
```

This corrupts binary data (like tarballs). Need:
- Binary-safe file operations
- Proper Buffer/Uint8Array handling
- Base64 encoding for binary transfer across isolate boundary

**Files to modify:**
- `fs.ts` - Handle binary writes properly
- `bridge.js` - Binary data transfer

## Implementation Priority

### Phase 3a: Fix npm pack (Medium Effort)
1. Resolve file URL issue by pre-normalizing paths
2. Test with explicit absolute path: `npm pack /app`

### Phase 3b: Add zlib Support (High Effort)
1. Implement gunzip/createGunzip
2. Use pako or similar pure-JS implementation
3. Wire into polyfill system

### Phase 3c: Binary File Support (Medium Effort)
1. Update fs bridge for binary data
2. Add base64 encoding for cross-boundary transfer
3. Test with binary file read/write

### Phase 3d: Full npm install (High Effort)
1. Implement tarball fetching with real data
2. Wire gunzip → tar extraction pipeline
3. Debug async completion issues
4. Test end-to-end installation

## Test Cases to Add

```typescript
describe("npm pack with absolute path", () => {
  it("should create tarball when given absolute path", async () => {
    // npm pack /app instead of npm pack
  });
});

describe("zlib gunzip", () => {
  it("should decompress gzipped data", async () => {
    const zlib = require('zlib');
    const gzipped = Buffer.from('H4sIAAAAAAAAA0tMTAYAV9cQCgMAAAA=', 'base64');
    const result = await new Promise((resolve, reject) => {
      zlib.gunzip(gzipped, (err, data) => {
        if (err) reject(err);
        else resolve(data.toString());
      });
    });
    expect(result).toBe('test');
  });
});

describe("binary file operations", () => {
  it("should write and read binary data correctly", async () => {
    const binary = new Uint8Array([0x00, 0xFF, 0x7F, 0x80]);
    fs.writeFileSync('/test.bin', binary);
    const read = fs.readFileSync('/test.bin');
    expect(read).toEqual(binary);
  });
});

describe("npm install full flow", () => {
  it("should install a package to node_modules", async () => {
    // With real tarball data mocked
    // Verify package files exist after install
  });
});
```

## References

- npm-package-arg: https://github.com/npm/npm-package-arg
- pacote (npm's package fetcher): https://github.com/npm/pacote
- node-tar: https://github.com/npm/node-tar
- pako (pure JS zlib): https://github.com/nodeca/pako
- RFC 8089 (file URI scheme): https://tools.ietf.org/html/rfc8089
