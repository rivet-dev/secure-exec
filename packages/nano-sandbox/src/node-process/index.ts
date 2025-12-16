import ivm from "isolated-vm";
import * as https from "node:https";
import * as dns from "node:dns";
import * as zlib from "node:zlib";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import { resolveModule, loadFile } from "./package-bundler.js";
import type { SystemBridge } from "../system-bridge/index.js";
import { FS_MODULE_CODE, getBridgeWithConfig } from "../bridge-loader.js";

// Config types for process and os modules
export interface ProcessConfig {
  platform?: string;
  arch?: string;
  version?: string;
  cwd?: string;
  env?: Record<string, string>;
  argv?: string[];
  execPath?: string;
}

export interface OSConfig {
  platform?: string;
  arch?: string;
  type?: string;
  release?: string;
  version?: string;
  homedir?: string;
  tmpdir?: string;
  hostname?: string;
}

// Interface for command executor (like WasixInstance)
export interface CommandExecutor {
  exec(command: string): Promise<{ stdout: string; stderr: string; code: number }>;
  run(command: string, args?: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
}

// Interface for network adapter (fetch, http, dns)
export interface NetworkAdapter {
  fetch(url: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
  }): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    url: string;
    redirected: boolean;
  }>;
  dnsLookup(hostname: string): Promise<{
    address: string;
    family: number;
  } | { error: string; code: string }>;
  httpRequest(url: string, options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    url: string;
  }>;
}

/**
 * Create a default network adapter using Node.js native https and dns modules.
 * This allows the sandbox to make real network requests.
 */
export function createDefaultNetworkAdapter(): NetworkAdapter {
  return {
    async fetch(url, options) {
      const response = await fetch(url, {
        method: options?.method || "GET",
        headers: options?.headers,
        body: options?.body,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headers[k] = v;
      });

      // Node's fetch auto-decompresses gzip, so remove content-encoding header
      // to prevent double-decompression in the sandbox
      delete headers["content-encoding"];

      // Only base64 encode for actual binary content types (not based on content-encoding
      // since Node's fetch already decompressed it)
      const contentType = response.headers.get("content-type") || "";
      const isBinary =
        contentType.includes("octet-stream") ||
        contentType.includes("gzip") ||
        url.endsWith(".tgz");

      let body: string;
      if (isBinary) {
        // For binary content, get raw bytes and base64 encode
        const buffer = await response.arrayBuffer();
        body = Buffer.from(buffer).toString("base64");
        headers["x-body-encoding"] = "base64";
      } else {
        body = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
        url: response.url,
        redirected: response.redirected,
      };
    },

    async dnsLookup(hostname) {
      return new Promise((resolve) => {
        dns.lookup(hostname, (err, address, family) => {
          if (err) {
            resolve({ error: err.message, code: err.code || "ENOTFOUND" });
          } else {
            resolve({ address, family });
          }
        });
      });
    },

    async httpRequest(url, options) {
      return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions: https.RequestOptions = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: options?.method || "GET",
          headers: options?.headers || {},
        };

        const req = https.request(reqOptions, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", async () => {
            let buffer: Buffer = Buffer.concat(chunks);

            // Decompress gzip if needed (https.request doesn't auto-decompress)
            const contentEncoding = res.headers["content-encoding"];
            if (contentEncoding === "gzip" || contentEncoding === "deflate") {
              try {
                buffer = await new Promise((res, rej) => {
                  const decompress =
                    contentEncoding === "gzip" ? zlib.gunzip : zlib.inflate;
                  decompress(buffer, (err, result) => {
                    if (err) rej(err);
                    else res(result);
                  });
                });
              } catch {
                // If decompression fails, use original buffer
              }
            }

            const contentType = res.headers["content-type"] || "";
            const isBinary =
              contentType.includes("octet-stream") ||
              contentType.includes("gzip") ||
              url.endsWith(".tgz");

            const headers: Record<string, string> = {};
            Object.entries(res.headers).forEach(([k, v]) => {
              if (typeof v === "string") headers[k] = v;
              else if (Array.isArray(v)) headers[k] = v.join(", ");
            });

            // Remove content-encoding since we decompressed
            delete headers["content-encoding"];

            // For binary content, base64 encode and add marker header
            if (isBinary) {
              headers["x-body-encoding"] = "base64";
              resolve({
                status: res.statusCode || 200,
                statusText: res.statusMessage || "OK",
                headers,
                body: buffer.toString("base64"),
                url,
              });
            } else {
              resolve({
                status: res.statusCode || 200,
                statusText: res.statusMessage || "OK",
                headers,
                body: buffer.toString("utf-8"),
                url,
              });
            }
          });
          res.on("error", reject);
        });

        req.on("error", reject);
        if (options?.body) req.write(options.body);
        req.end();
      });
    },
  };
}

export interface NodeProcessOptions {
  memoryLimit?: number; // MB, default 128
  systemBridge?: SystemBridge; // For accessing virtual filesystem
  processConfig?: ProcessConfig; // Process object configuration
  commandExecutor?: CommandExecutor; // For child_process support (e.g., WasixInstance)
  networkAdapter?: NetworkAdapter; // For network support (fetch, http, https, dns)
  osConfig?: OSConfig; // OS module configuration
}

/**
 * Detect if code uses ESM syntax
 */
function isESM(code: string, filePath?: string): boolean {
  // .mjs is always ESM, .cjs is always CJS
  if (filePath?.endsWith(".mjs")) return true;
  if (filePath?.endsWith(".cjs")) return false;

  // Check for ESM syntax patterns
  // import declarations (but not dynamic import())
  // Note: Use \s* (not \s+) to handle minified code like "import{...}from"
  const hasImport =
    /^\s*import\s*(?:[\w{},*\s]+\s*from\s*)?['"][^'"]+['"]/m.test(code) ||
    /^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]/m.test(code);
  // export declarations (also handle minified export{...})
  const hasExport =
    /^\s*export\s+(?:default|const|let|var|function|class|{)/m.test(code) ||
    /^\s*export\s*\{/m.test(code);

  return hasImport || hasExport;
}

/**
 * Transform dynamic import() calls to __dynamicImport() calls
 * This is needed because isolated-vm's V8 doesn't support the import() syntax
 */
function transformDynamicImport(code: string): string {
  // Replace import( with __dynamicImport(
  // This regex handles the common cases while avoiding transformation inside strings
  // We match "import(" that's not preceded by a word character (to avoid matching e.g. "reimport(")
  return code.replace(/(?<![a-zA-Z_$])import\s*\(/g, "__dynamicImport(");
}

/**
 * Extract all static import specifiers from transformed code
 * Only extracts string literals, not dynamic expressions
 */
function extractDynamicImportSpecifiers(code: string): string[] {
  const regex = /__dynamicImport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const specifiers = new Set<string>();
  let match;
  while ((match = regex.exec(code)) !== null) {
    specifiers.add(match[1]);
  }
  return Array.from(specifiers);
}

/**
 * Convert CJS module to ESM-compatible wrapper
 */
function wrapCJSForESM(code: string): string {
  return `
    const module = { exports: {} };
    const exports = module.exports;
    ${code}
    export default module.exports;
    export const __cjsModule = true;
  `;
}

export interface RunResult<T = unknown> {
  stdout: string;
  stderr: string;
  code: number;
  exports?: T;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

// Cache of bundled polyfills
const polyfillCodeCache: Map<string, string> = new Map();

export class NodeProcess {
  private isolate: ivm.Isolate;
  private context: ivm.Context | null = null;
  private memoryLimit: number;
  private systemBridge?: SystemBridge;
  private processConfig: ProcessConfig;
  private commandExecutor?: CommandExecutor;
  private networkAdapter?: NetworkAdapter;
  private osConfig: OSConfig;
  // Cache for compiled ESM modules (per isolate)
  private esmModuleCache: Map<string, ivm.Module> = new Map();

  constructor(options: NodeProcessOptions = {}) {
    this.memoryLimit = options.memoryLimit ?? 128;
    this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
    this.systemBridge = options.systemBridge;
    this.processConfig = options.processConfig ?? {};
    this.commandExecutor = options.commandExecutor;
    this.networkAdapter = options.networkAdapter;
    this.osConfig = options.osConfig ?? {};
  }

  /**
   * Set the command executor for child_process support
   */
  setCommandExecutor(executor: CommandExecutor): void {
    this.commandExecutor = executor;
  }

  /**
   * Set the network adapter for fetch/http/https/dns support
   */
  setNetworkAdapter(adapter: NetworkAdapter): void {
    this.networkAdapter = adapter;
  }

  /**
   * Resolve a module specifier to an absolute path
   */
  private async resolveESMPath(
    specifier: string,
    referrerPath: string
  ): Promise<string | null> {
    // Handle node: prefix for built-ins
    if (specifier.startsWith("node:")) {
      return specifier; // Keep as-is for built-in handling
    }

    // Handle bare module names that are polyfills (events, path, etc.)
    const moduleName = specifier.replace(/^node:/, "");
    // Special modules we provide via bridge (fs, module, os)
    const bridgeModules = ["fs", "module", "os"];
    if (hasPolyfill(moduleName) || bridgeModules.includes(moduleName)) {
      return specifier; // Return as-is, compileESMModule will handle it
    }

    // Handle absolute paths - return as-is
    if (specifier.startsWith("/")) {
      return specifier;
    }

    // Get directory of referrer
    const referrerDir = referrerPath.includes("/")
      ? referrerPath.substring(0, referrerPath.lastIndexOf("/")) || "/"
      : "/";

    // Handle relative paths
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      // Resolve relative to referrer directory
      const parts = referrerDir.split("/").filter(Boolean);
      const specParts = specifier.split("/");

      for (const part of specParts) {
        if (part === "..") {
          parts.pop();
        } else if (part !== ".") {
          parts.push(part);
        }
      }

      return "/" + parts.join("/");
    }

    // Bare specifier - try to resolve from node_modules
    if (!this.systemBridge) {
      return null;
    }

    return resolveModule(specifier, referrerDir, this.systemBridge);
  }

  /**
   * Load and compile an ESM module, handling both ESM and CJS sources
   */
  private async compileESMModule(
    filePath: string,
    context: ivm.Context
  ): Promise<ivm.Module> {
    // Check cache first
    const cached = this.esmModuleCache.get(filePath);
    if (cached) {
      return cached;
    }

    let code: string;

    // Handle built-in modules (node: prefix or known polyfills)
    const moduleName = filePath.replace(/^node:/, "");

    // Special handling for modules we provide via bridge
    const specialModules = ["fs", "module", "os"];
    const isSpecialModule = specialModules.includes(moduleName);

    if (
      filePath.startsWith("node:") ||
      hasPolyfill(moduleName) ||
      isSpecialModule
    ) {
      // Special case for fs
      if (moduleName === "fs") {
        code = wrapCJSForESM(FS_MODULE_CODE);
      } else if (moduleName === "module") {
        // Module polyfill from bridge - provides createRequire, Module class, etc.
        code = `
          const _modulePolyfill = globalThis.bridge?.module || {
            createRequire: globalThis._createRequire || function(f) {
              const dir = f.replace(/\\/[^\\/]*$/, '') || '/';
              return function(m) { return globalThis._requireFrom(m, dir); };
            },
            Module: { builtinModules: [] },
            isBuiltin: () => false,
            builtinModules: []
          };
          export default _modulePolyfill;
          export const createRequire = _modulePolyfill.createRequire;
          export const Module = _modulePolyfill.Module;
          export const isBuiltin = _modulePolyfill.isBuiltin;
          export const builtinModules = _modulePolyfill.builtinModules;
          export const SourceMap = _modulePolyfill.SourceMap;
          export const syncBuiltinESMExports = _modulePolyfill.syncBuiltinESMExports || (() => {});
        `;
      } else if (moduleName === "os" && !hasPolyfill(moduleName)) {
        // OS polyfill from bridge
        code = `
          const _osPolyfill = globalThis.bridge?.os || {};
          export default _osPolyfill;
        `;
      } else {
        // Get polyfill code and wrap for ESM
        let polyfillCode = polyfillCodeCache.get(moduleName);
        if (!polyfillCode) {
          polyfillCode = await bundlePolyfill(moduleName);
          polyfillCodeCache.set(moduleName, polyfillCode);
        }
        // Polyfills are IIFE that return the module, wrap for ESM
        code = `
          const _polyfillResult = ${polyfillCode};
          export default _polyfillResult;
          // Re-export all properties for named imports
          const _keys = typeof _polyfillResult === 'object' && _polyfillResult !== null
            ? Object.keys(_polyfillResult) : [];
          export { _keys as __polyfillKeys };
        `;
      }
    } else {
      // Load from filesystem
      if (!this.systemBridge) {
        throw new Error("SystemBridge required for loading modules");
      }
      const source = await loadFile(filePath, this.systemBridge);
      if (source === null) {
        throw new Error(`Cannot load module: ${filePath}`);
      }

      // Handle JSON files
      if (filePath.endsWith(".json")) {
        code = `export default ${source};`;
      } else if (!isESM(source, filePath)) {
        // CJS module - wrap it for ESM compatibility
        code = wrapCJSForESM(source);
      } else {
        code = source;
      }
    }

    // Compile the module
    const module = await this.isolate.compileModule(code, {
      filename: filePath,
    });

    // Cache it
    this.esmModuleCache.set(filePath, module);

    return module;
  }

  /**
   * Create the ESM resolver callback for module.instantiate()
   */
  private createESMResolver(
    context: ivm.Context
  ): (
    specifier: string,
    referrer: ivm.Module
  ) => Promise<ivm.Module> {
    return async (specifier: string, referrer: ivm.Module) => {
      // Get the referrer's filename from our cache (reverse lookup)
      let referrerPath = "/";
      for (const [path, mod] of this.esmModuleCache.entries()) {
        if (mod === referrer) {
          referrerPath = path;
          break;
        }
      }

      // Resolve the specifier
      const resolved = await this.resolveESMPath(specifier, referrerPath);
      if (!resolved) {
        throw new Error(
          `Cannot resolve module '${specifier}' from '${referrerPath}'`
        );
      }

      // Compile and return the module
      const module = await this.compileESMModule(resolved, context);

      // Instantiate if not already (recursive resolution happens automatically)
      if (module.dependencySpecifiers.length > 0) {
        try {
          await module.instantiate(context, this.createESMResolver(context));
        } catch {
          // Already instantiated, ignore
        }
      }

      return module;
    };
  }

  /**
   * Run ESM code
   */
  private async runESM(
    code: string,
    context: ivm.Context,
    filePath: string = "/<entry>.mjs"
  ): Promise<unknown> {
    // Compile the entry module
    const entryModule = await this.isolate.compileModule(code, {
      filename: filePath,
    });
    this.esmModuleCache.set(filePath, entryModule);

    // Instantiate with resolver (this resolves all dependencies)
    await entryModule.instantiate(context, this.createESMResolver(context));

    // Evaluate and return
    return entryModule.evaluate({ copy: true });
  }

  // Cache for pre-compiled dynamic import modules (namespace references)
  private dynamicImportCache = new Map<string, ivm.Reference<unknown>>();

  /**
   * Pre-compile all static dynamic import specifiers found in the code
   * This must be called BEFORE running the code to avoid deadlocks
   */
  private async precompileDynamicImports(
    transformedCode: string,
    context: ivm.Context,
    referrerPath: string = "/"
  ): Promise<void> {
    const specifiers = extractDynamicImportSpecifiers(transformedCode);

    for (const specifier of specifiers) {
      // Resolve the module path
      const resolved = await this.resolveESMPath(specifier, referrerPath);
      if (!resolved) {
        continue; // Skip unresolvable modules, error will be thrown at runtime
      }

      // Check if already compiled
      if (this.dynamicImportCache.has(resolved)) {
        continue;
      }

      // Compile the module
      const module = await this.compileESMModule(resolved, context);

      // Instantiate
      try {
        await module.instantiate(context, this.createESMResolver(context));
      } catch {
        // Already instantiated
      }

      // Evaluate
      await module.evaluate();

      // Cache the namespace reference
      this.dynamicImportCache.set(resolved, module.namespace);

      // Also cache by original specifier for direct lookup
      if (resolved !== specifier) {
        this.dynamicImportCache.set(specifier, module.namespace);
      }
    }
  }

  /**
   * Set up dynamic import() function for ESM
   * Note: precompileDynamicImports must be called BEFORE running user code
   * Falls back to require() for CommonJS modules when not pre-compiled
   */
  private async setupDynamicImport(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>
  ): Promise<void> {
    // Create a SYNCHRONOUS reference for dynamic imports (returns from cache or null if not found)
    const dynamicImportRef = new ivm.Reference((specifier: string) => {
      // Check the cache - look up both by specifier and resolved path
      const ns = this.dynamicImportCache.get(specifier);
      if (!ns) {
        // Return null to signal fallback to require()
        return null;
      }
      return ns.derefInto();
    });

    await jail.set("_dynamicImport", dynamicImportRef);

    // Create the __dynamicImport function in the isolate
    // First tries ESM cache, then falls back to require()
    await context.eval(`
      globalThis.__dynamicImport = function(specifier) {
        // Try the ESM cache first
        const cached = _dynamicImport.applySync(undefined, [specifier]);
        if (cached !== null) {
          return Promise.resolve(cached);
        }
        // Fall back to require() for CommonJS modules
        try {
          const mod = require(specifier);
          // Wrap in ESM-like namespace object with default export
          return Promise.resolve({ default: mod, ...mod });
        } catch (e) {
          return Promise.reject(new Error(
            'Cannot dynamically import \\'' + specifier + '\\': ' + e.message
          ));
        }
      };
    `);
  }

  /**
   * Set the SystemBridge for filesystem access
   */
  setSystemBridge(bridge: SystemBridge): void {
    this.systemBridge = bridge;
  }

  /**
   * Set up the require() system in a context
   */
  private async setupRequire(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>
  ): Promise<void> {
    // Create a reference that can load polyfills on demand
    const loadPolyfillRef = new ivm.Reference(
      async (moduleName: string): Promise<string | null> => {
        const name = moduleName.replace(/^node:/, "");

        // fs is handled specially
        if (name === "fs") {
          return null;
        }

        // child_process is handled specially
        if (name === "child_process") {
          return null;
        }

        // Network modules are handled specially
        if (name === "http" || name === "https" || name === "dns") {
          return null;
        }

        // os module is handled specially with our own polyfill
        if (name === "os") {
          return null;
        }

        // module is handled specially with our own polyfill
        if (name === "module") {
          return null;
        }

        if (!hasPolyfill(name)) {
          return null;
        }
        // Check cache first
        let code = polyfillCodeCache.get(name);
        if (!code) {
          code = await bundlePolyfill(name);
          polyfillCodeCache.set(name, code);
        }
        return code;
      }
    );

    // Create a reference for resolving module paths
    const resolveModuleRef = new ivm.Reference(
      async (request: string, fromDir: string): Promise<string | null> => {
        if (!this.systemBridge) {
          return null;
        }
        return resolveModule(request, fromDir, this.systemBridge);
      }
    );

    // Create a reference for loading file content
    // Also transforms dynamic import() calls to __dynamicImport()
    const loadFileRef = new ivm.Reference(
      async (path: string): Promise<string | null> => {
        if (!this.systemBridge) {
          return null;
        }
        const source = await loadFile(path, this.systemBridge);
        if (source === null) {
          return null;
        }
        // Transform dynamic import() to __dynamicImport() for V8 compatibility
        return transformDynamicImport(source);
      }
    );

    await jail.set("_loadPolyfill", loadPolyfillRef);
    await jail.set("_resolveModule", resolveModuleRef);
    await jail.set("_loadFile", loadFileRef);

    // Set up timer Reference for actual delays (not just microtasks)
    // This allows setTimeout/setInterval to use real host-side timers
    const scheduleTimerRef = new ivm.Reference((delayMs: number) => {
      return new Promise<void>((resolve) => {
        // Use real host setTimeout with actual delay
        globalThis.setTimeout(resolve, delayMs);
      });
    });
    await jail.set("_scheduleTimer", scheduleTimerRef);

    // Set up fs References if we have a SystemBridge
    if (this.systemBridge) {
      const bridge = this.systemBridge;

      // Create individual References for each fs operation
      const readFileRef = new ivm.Reference(async (path: string) => {
        return bridge.readFile(path);
      });
      const writeFileRef = new ivm.Reference((path: string, content: string) => {
        bridge.writeFile(path, content);
      });
      // Binary file operations using base64 encoding
      const readFileBinaryRef = new ivm.Reference(async (path: string) => {
        const data = await bridge.readFileBinary(path);
        // Convert to base64 for transfer across isolate boundary
        return Buffer.from(data).toString("base64");
      });
      const writeFileBinaryRef = new ivm.Reference((path: string, base64Content: string) => {
        // Decode base64 and write as binary
        const data = Buffer.from(base64Content, "base64");
        bridge.writeFile(path, data);
      });
      const readDirRef = new ivm.Reference(async (path: string) => {
        const entries = await bridge.readDirWithTypes(path);
        // Return as JSON string for transfer
        return JSON.stringify(entries);
      });
      const mkdirRef = new ivm.Reference((path: string) => {
        bridge.mkdir(path);
      });
      const rmdirRef = new ivm.Reference(async (path: string) => {
        await bridge.removeDir(path);
      });
      const existsRef = new ivm.Reference(async (path: string) => {
        return bridge.exists(path);
      });
      const statRef = new ivm.Reference(async (path: string) => {
        const stat = await bridge.stat(path);
        // Return as JSON string for transfer
        return JSON.stringify({
          mode: stat.mode,
          size: stat.size,
          isDirectory: stat.isDirectory,
          atimeMs: stat.atimeMs,
          mtimeMs: stat.mtimeMs,
          ctimeMs: stat.ctimeMs,
          birthtimeMs: stat.birthtimeMs,
        });
      });
      const unlinkRef = new ivm.Reference(async (path: string) => {
        await bridge.unlink(path);
      });
      const renameRef = new ivm.Reference(async (oldPath: string, newPath: string) => {
        await bridge.rename(oldPath, newPath);
      });

      // Set up each fs Reference individually in the isolate
      await jail.set("_fsReadFile", readFileRef);
      await jail.set("_fsWriteFile", writeFileRef);
      await jail.set("_fsReadFileBinary", readFileBinaryRef);
      await jail.set("_fsWriteFileBinary", writeFileBinaryRef);
      await jail.set("_fsReadDir", readDirRef);
      await jail.set("_fsMkdir", mkdirRef);
      await jail.set("_fsRmdir", rmdirRef);
      await jail.set("_fsExists", existsRef);
      await jail.set("_fsStat", statRef);
      await jail.set("_fsUnlink", unlinkRef);
      await jail.set("_fsRename", renameRef);

      // Create the _fs object inside the isolate
      await context.eval(`
        globalThis._fs = {
          readFile: _fsReadFile,
          writeFile: _fsWriteFile,
          readFileBinary: _fsReadFileBinary,
          writeFileBinary: _fsWriteFileBinary,
          readDir: _fsReadDir,
          mkdir: _fsMkdir,
          rmdir: _fsRmdir,
          exists: _fsExists,
          stat: _fsStat,
          unlink: _fsUnlink,
          rename: _fsRename,
        };
      `);
    }

    // Store the fs module code for use in require
    await jail.set("_fsModuleCode", FS_MODULE_CODE);

    // Set up child_process References if we have a CommandExecutor
    if (this.commandExecutor) {
      const executor = this.commandExecutor;

      // Reference for exec (shell command) - returns JSON string for transfer
      const childProcessExecRef = new ivm.Reference(
        async (command: string): Promise<string> => {
          const result = await executor.exec(command);
          return JSON.stringify(result);
        }
      );

      // Reference for spawn (command with args) - returns JSON string for transfer
      // Args are passed as JSON string for transferability
      const childProcessSpawnRef = new ivm.Reference(
        async (command: string, argsJson: string): Promise<string> => {
          const args = JSON.parse(argsJson) as string[];
          const result = await executor.run(command, args);
          return JSON.stringify(result);
        }
      );

      await jail.set("_childProcessExecRaw", childProcessExecRef);
      await jail.set("_childProcessSpawnRaw", childProcessSpawnRef);
    }

    // Set up network References if we have a NetworkAdapter
    if (this.networkAdapter) {
      const adapter = this.networkAdapter;

      // Reference for fetch - returns JSON string for transfer
      const networkFetchRef = new ivm.Reference(
        async (url: string, optionsJson: string): Promise<string> => {
          const options = JSON.parse(optionsJson);
          const result = await adapter.fetch(url, options);
          return JSON.stringify(result);
        }
      );

      // Reference for DNS lookup - returns JSON string for transfer
      const networkDnsLookupRef = new ivm.Reference(
        async (hostname: string): Promise<string> => {
          const result = await adapter.dnsLookup(hostname);
          return JSON.stringify(result);
        }
      );

      // Reference for HTTP request - returns JSON string for transfer
      const networkHttpRequestRef = new ivm.Reference(
        async (url: string, optionsJson: string): Promise<string> => {
          const options = JSON.parse(optionsJson);
          const result = await adapter.httpRequest(url, options);
          return JSON.stringify(result);
        }
      );

      await jail.set("_networkFetchRaw", networkFetchRef);
      await jail.set("_networkDnsLookupRaw", networkDnsLookupRef);
      await jail.set("_networkHttpRequestRaw", networkHttpRequestRef);
    }

    // Set up globals needed by the bridge BEFORE loading it
    const initialCwd = this.processConfig.cwd ?? "/";
    await context.eval(`
      globalThis._moduleCache = {};
      globalThis._pendingModules = {};
      globalThis._currentModule = { dirname: ${JSON.stringify(initialCwd)} };
    `);

    // Load the bridge bundle which sets up all polyfill modules
    const bridgeCode = getBridgeWithConfig(this.processConfig, this.osConfig);
    await context.eval(bridgeCode);

    // Unset module globals that require adapters if adapters aren't configured
    if (!this.commandExecutor) {
      await context.eval(`delete globalThis._childProcessModule;`);
    }
    if (!this.networkAdapter) {
      await context.eval(`
        delete globalThis._httpModule;
        delete globalThis._httpsModule;
        delete globalThis._dnsModule;
      `);
    }

    // Set up the require system with dynamic CommonJS resolution
    await context.eval(`

      // Path utilities
      function _dirname(p) {
        const lastSlash = p.lastIndexOf('/');
        if (lastSlash === -1) return '.';
        if (lastSlash === 0) return '/';
        return p.slice(0, lastSlash);
      }

      globalThis.require = function require(moduleName) {
        return _requireFrom(moduleName, _currentModule.dirname);
      };

      function _requireFrom(moduleName, fromDir) {
        // Strip node: prefix
        const name = moduleName.replace(/^node:/, '');

        // For absolute paths (resolved paths), use as cache key
        // For relative/bare imports, resolve first
        let cacheKey = name;
        let resolved = null;

        // Check if it's a relative import
        const isRelative = name.startsWith('./') || name.startsWith('../');

        // Special handling for fs module
        if (name === 'fs') {
          if (_moduleCache['fs']) return _moduleCache['fs'];
          if (typeof _fs === 'undefined') {
            throw new Error('fs module requires SystemBridge to be configured');
          }
          const fsModule = eval(_fsModuleCode);
          _moduleCache['fs'] = fsModule;
          return fsModule;
        }

        // Special handling for fs/promises module
        if (name === 'fs/promises') {
          if (_moduleCache['fs/promises']) return _moduleCache['fs/promises'];
          // Get fs module first, then extract promises
          const fsModule = _requireFrom('fs', fromDir);
          _moduleCache['fs/promises'] = fsModule.promises;
          return fsModule.promises;
        }

        // Special handling for child_process module
        if (name === 'child_process') {
          if (_moduleCache['child_process']) return _moduleCache['child_process'];
          if (typeof _childProcessModule === 'undefined') {
            throw new Error('child_process module requires CommandExecutor to be configured');
          }
          _moduleCache['child_process'] = _childProcessModule;
          return _childProcessModule;
        }

        // Special handling for http module
        if (name === 'http') {
          if (_moduleCache['http']) return _moduleCache['http'];
          if (typeof _httpModule === 'undefined') {
            throw new Error('http module requires NetworkAdapter to be configured');
          }
          _moduleCache['http'] = _httpModule;
          return _httpModule;
        }

        // Special handling for https module
        if (name === 'https') {
          if (_moduleCache['https']) return _moduleCache['https'];
          if (typeof _httpsModule === 'undefined') {
            throw new Error('https module requires NetworkAdapter to be configured');
          }
          _moduleCache['https'] = _httpsModule;
          return _httpsModule;
        }

        // Special handling for dns module
        if (name === 'dns') {
          if (_moduleCache['dns']) return _moduleCache['dns'];
          if (typeof _dnsModule === 'undefined') {
            throw new Error('dns module requires NetworkAdapter to be configured');
          }
          _moduleCache['dns'] = _dnsModule;
          return _dnsModule;
        }

        // Special handling for os module
        if (name === 'os') {
          if (_moduleCache['os']) return _moduleCache['os'];
          if (typeof _osModule === 'undefined') {
            throw new Error('os module not initialized');
          }
          _moduleCache['os'] = _osModule;
          return _osModule;
        }

        // Special handling for module module
        if (name === 'module') {
          if (_moduleCache['module']) return _moduleCache['module'];
          if (typeof _moduleModule === 'undefined') {
            throw new Error('module module not initialized');
          }
          _moduleCache['module'] = _moduleModule;
          return _moduleModule;
        }

        // Stub for chalk (ESM module that npm uses for coloring)
        // Provides no-color passthrough functionality
        if (name === 'chalk') {
          if (_moduleCache['chalk']) return _moduleCache['chalk'];

          // Create a chainable chalk-like object that just returns the input
          const createChalk = function(options) {
            const chalk = function(...strings) {
              return strings.join(' ');
            };
            chalk.level = options && options.level !== undefined ? options.level : 0;

            // Make all style methods pass through
            const styles = [
              'reset', 'bold', 'dim', 'italic', 'underline', 'overline',
              'inverse', 'hidden', 'strikethrough', 'visible',
              'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey',
              'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright',
              'magentaBright', 'cyanBright', 'whiteBright',
              'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite',
              'bgBlackBright', 'bgRedBright', 'bgGreenBright', 'bgYellowBright',
              'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright'
            ];

            // Each style property returns chalk itself for chaining
            const handler = {
              get(target, prop) {
                if (prop === 'level') return target.level;
                if (styles.includes(prop)) return target;
                if (typeof target[prop] === 'function') return target[prop].bind(target);
                return target[prop];
              }
            };

            return new Proxy(chalk, handler);
          };

          const chalk = createChalk();
          chalk.Chalk = function Chalk(options) { return createChalk(options); };
          chalk.supportsColor = { level: 0, hasBasic: false, has256: false, has16m: false };
          chalk.stderr = createChalk();
          chalk.stderr.supportsColor = { level: 0, hasBasic: false, has256: false, has16m: false };

          _moduleCache['chalk'] = chalk;
          return chalk;
        }

        // Stub for supports-color (ESM module that chalk uses)
        if (name === 'supports-color') {
          if (_moduleCache['supports-color']) return _moduleCache['supports-color'];

          const colorSupport = { level: 0, hasBasic: false, has256: false, has16m: false };
          const supportsColor = {
            stdout: false,
            stderr: false,
            createSupportsColor: function() { return colorSupport; }
          };

          _moduleCache['supports-color'] = supportsColor;
          return supportsColor;
        }

        // Stub for http2 module (npm uses for registry requests)
        if (name === 'http2') {
          if (_moduleCache['http2']) return _moduleCache['http2'];

          const http2 = {
            constants: {
              HTTP2_HEADER_LOCATION: 'location',
              HTTP2_HEADER_STATUS: ':status',
              HTTP2_HEADER_PATH: ':path',
              HTTP2_HEADER_METHOD: ':method',
              HTTP2_HEADER_AUTHORITY: ':authority',
              HTTP2_HEADER_SCHEME: ':scheme',
              HTTP2_HEADER_CONTENT_TYPE: 'content-type',
              HTTP2_HEADER_CONTENT_LENGTH: 'content-length',
              HTTP2_HEADER_ACCEPT: 'accept',
              HTTP2_HEADER_ACCEPT_ENCODING: 'accept-encoding',
              HTTP2_HEADER_USER_AGENT: 'user-agent',
              HTTP2_METHOD_GET: 'GET',
              HTTP2_METHOD_POST: 'POST',
              NGHTTP2_CANCEL: 0x8,
              NGHTTP2_NO_ERROR: 0x0,
              HTTP_STATUS_OK: 200,
              HTTP_STATUS_NOT_FOUND: 404
            },
            connect: function() {
              throw new Error('http2.connect is not supported in sandbox');
            },
            createServer: function() {
              throw new Error('http2.createServer is not supported in sandbox');
            },
            createSecureServer: function() {
              throw new Error('http2.createSecureServer is not supported in sandbox');
            }
          };

          _moduleCache['http2'] = http2;
          return http2;
        }

        // Stub for v8 module (npm's arborist uses it)
        if (name === 'v8') {
          if (_moduleCache['v8']) return _moduleCache['v8'];

          // Return realistic heap statistics (128MB limit, ~50MB used)
          // npm uses these to calculate cache sizes, so 0 values cause errors
          const v8 = {
            getHeapStatistics: function() {
              return {
                total_heap_size: 67108864,           // 64MB
                total_heap_size_executable: 1048576, // 1MB
                total_physical_size: 67108864,       // 64MB
                total_available_size: 67108864,      // 64MB available
                used_heap_size: 52428800,            // 50MB used
                heap_size_limit: 134217728,          // 128MB limit
                malloced_memory: 8192,
                peak_malloced_memory: 16384,
                does_zap_garbage: 0,
                number_of_native_contexts: 1,
                number_of_detached_contexts: 0,
                external_memory: 0
              };
            },
            getHeapSpaceStatistics: function() { return []; },
            getHeapCodeStatistics: function() { return {}; },
            setFlagsFromString: function() {},
            serialize: function(value) { return Buffer.from(JSON.stringify(value)); },
            deserialize: function(buffer) { return JSON.parse(buffer.toString()); },
            cachedDataVersionTag: function() { return 0; }
          };

          _moduleCache['v8'] = v8;
          return v8;
        }

        // Try to load polyfill first (for built-in modules like path, events, etc.)
        const polyfillCode = _loadPolyfill.applySyncPromise(undefined, [name]);
        if (polyfillCode !== null) {
          if (_moduleCache[name]) return _moduleCache[name];

          const moduleObj = { exports: {} };
          _pendingModules[name] = moduleObj;

          const result = eval(polyfillCode);

          // Patch util module with formatWithOptions if missing
          if (name === 'util' && typeof result.formatWithOptions === 'undefined') {
            // Create a basic formatWithOptions that mimics Node.js behavior
            result.formatWithOptions = function formatWithOptions(inspectOptions, ...args) {
              // Basic implementation using format
              return result.format.apply(null, args);
            };
          }

          // Patch url module to fix file: URL handling for npm-package-arg
          // npm-package-arg tries to create URLs like "file:." which are invalid standalone
          // We wrap URL to handle these cases gracefully by using process.cwd() as default base
          if (name === 'url') {
            const OriginalURL = result.URL;
            if (OriginalURL) {
              // Create a patched URL constructor
              const PatchedURL = function PatchedURL(url, base) {
                // If url is a relative file: reference and no base provided, use cwd as base
                if (typeof url === 'string' && url.startsWith('file:') && !url.startsWith('file://') && base === undefined) {
                  // Try to use process.cwd() as a default base for relative file: URLs
                  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                    const cwd = process.cwd();
                    if (cwd) {
                      try {
                        return new OriginalURL(url, 'file://' + cwd + '/');
                      } catch (e) {
                        // Fall through to original behavior
                      }
                    }
                  }
                }
                // Call original with potentially undefined base
                if (base !== undefined) {
                  return new OriginalURL(url, base);
                } else {
                  return new OriginalURL(url);
                }
              };
              // Copy static properties and prototype
              Object.keys(OriginalURL).forEach(function(key) {
                PatchedURL[key] = OriginalURL[key];
              });
              Object.setPrototypeOf(PatchedURL, OriginalURL);
              PatchedURL.prototype = OriginalURL.prototype;

              // The URL property is a getter from esbuild's bundled output
              // We need to create a new object that copies all properties manually
              const patchedResult = {};
              // Get all property names including non-enumerable ones
              const allKeys = Object.getOwnPropertyNames(result);
              for (let i = 0; i < allKeys.length; i++) {
                const key = allKeys[i];
                if (key === 'URL') {
                  patchedResult.URL = PatchedURL;
                } else {
                  try {
                    patchedResult[key] = result[key];
                  } catch (e) {
                    // Skip properties that can't be read
                  }
                }
              }
              // Replace moduleObj.exports with the patched version and cache it
              moduleObj.exports = patchedResult;
              _moduleCache[name] = patchedResult;
              delete _pendingModules[name];
              return patchedResult;
            }
          }

          // Patch zlib module for minizlib compatibility
          // minizlib (used by npm's tar) calls this._handle._processChunk(data, flushFlag)
          // browserify-zlib has _processChunk on the instance, not on _handle
          if (name === 'zlib') {
            const zlibClasses = ['Gzip', 'Gunzip', 'Deflate', 'Inflate', 'DeflateRaw', 'InflateRaw', 'Unzip'];

            zlibClasses.forEach(function(className) {
              const OrigClass = result[className];
              if (!OrigClass) return;

              // Wrap the constructor to patch _handle
              const PatchedClass = function PatchedZlibClass(opts) {
                const instance = new OrigClass(opts);

                // Ensure _handle exists and has _processChunk
                if (instance._handle) {
                  if (typeof instance._handle._processChunk !== 'function' && typeof instance._processChunk === 'function') {
                    instance._handle._processChunk = instance._processChunk.bind(instance);
                  }
                } else if (typeof instance._processChunk === 'function') {
                  // Create _handle if it doesn't exist
                  instance._handle = {
                    _processChunk: instance._processChunk.bind(instance)
                  };
                }

                return instance;
              };

              // Copy static properties and prototype
              Object.keys(OrigClass).forEach(function(key) {
                PatchedClass[key] = OrigClass[key];
              });
              PatchedClass.prototype = OrigClass.prototype;

              result[className] = PatchedClass;

              // Also patch the create* factory function
              const createFn = 'create' + className;
              const origCreate = result[createFn];
              if (origCreate) {
                result[createFn] = function(opts) {
                  return new PatchedClass(opts);
                };
              }
            });
          }

          // Patch stream module to add stream.promises namespace
          // stream-browserify doesn't include promises, but npm's cacache uses stream.promises.pipeline
          if (name === 'stream') {
            if (!result.promises) {
              // Create promisified versions of pipeline and finished
              const origPipeline = result.pipeline;
              const origFinished = result.finished;

              result.promises = {
                pipeline: function promisePipeline() {
                  const streams = Array.from(arguments);
                  return new Promise((resolve, reject) => {
                    // pipeline(source, ...transforms, destination, callback)
                    // The callback should be the last arg for non-promise version
                    origPipeline.apply(null, streams.concat([function(err) {
                      if (err) reject(err);
                      else resolve();
                    }]));
                  });
                },
                finished: function promiseFinished(stream, options) {
                  return new Promise((resolve, reject) => {
                    origFinished(stream, options || {}, function(err) {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                }
              };
            }
          }

          // Patch path module with win32/posix if missing
          // path-browserify provides posix but not win32, npm expects both
          if (name === 'path') {
            if (result.win32 === null || result.win32 === undefined) {
              // Provide win32 as posix implementation (good enough for sandbox)
              result.win32 = result.posix || result;
            }
            if (result.posix === null || result.posix === undefined) {
              result.posix = result;
            }
            // Patch resolve to ensure it uses process.cwd() correctly
            // path-browserify's resolve captures process at require time
            // which may not be set up yet; wrap it to use current process
            const originalResolve = result.resolve;
            result.resolve = function resolve() {
              // If no arguments or all arguments are relative, prepend cwd
              // to ensure correct resolution
              const args = Array.from(arguments);
              if (args.length === 0 || !args.some(a => typeof a === 'string' && a.length > 0 && a.charAt(0) === '/')) {
                // Check if process.cwd exists and returns a valid path
                if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                  const cwd = process.cwd();
                  if (cwd && cwd.charAt(0) === '/') {
                    // Prepend cwd to args
                    args.unshift(cwd);
                  }
                }
              }
              return originalResolve.apply(this, args);
            };
            // Also patch posix.resolve
            if (result.posix && result.posix.resolve) {
              const originalPosixResolve = result.posix.resolve;
              result.posix.resolve = function resolve() {
                const args = Array.from(arguments);
                if (args.length === 0 || !args.some(a => typeof a === 'string' && a.length > 0 && a.charAt(0) === '/')) {
                  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                    const cwd = process.cwd();
                    if (cwd && cwd.charAt(0) === '/') {
                      args.unshift(cwd);
                    }
                  }
                }
                return originalPosixResolve.apply(this, args);
              };
            }
          }
          if (typeof result === 'object' && result !== null) {
            Object.assign(moduleObj.exports, result);
          } else {
            moduleObj.exports = result;
          }

          // Debug: check if URL was copied correctly
          if (name === 'url') {
            console.log('[DEBUG] After Object.assign, moduleObj.exports.URL._patched:', moduleObj.exports.URL && moduleObj.exports.URL._patched);
            console.log('[DEBUG] After Object.assign, moduleObj.exports.URL === result.URL:', moduleObj.exports.URL === result.URL);
          }

          _moduleCache[name] = moduleObj.exports;
          delete _pendingModules[name];
          return _moduleCache[name];
        }

        // Resolve module path using host-side resolution
        resolved = _resolveModule.applySyncPromise(undefined, [name, fromDir]);

        if (resolved === null) {
          throw new Error('Cannot find module: ' + moduleName + ' from ' + fromDir);
        }

        // Use resolved path as cache key
        cacheKey = resolved;

        // Check cache with resolved path
        if (_moduleCache[cacheKey]) {
          return _moduleCache[cacheKey];
        }

        // Check if we're currently loading this module (circular dep)
        if (_pendingModules[cacheKey]) {
          return _pendingModules[cacheKey].exports;
        }

        // Load file content
        const source = _loadFile.applySyncPromise(undefined, [resolved]);
        if (source === null) {
          throw new Error('Cannot load module: ' + resolved);
        }

        // Handle JSON files
        if (resolved.endsWith('.json')) {
          const parsed = JSON.parse(source);
          _moduleCache[cacheKey] = parsed;
          return parsed;
        }

        // Create module object
        const module = {
          exports: {},
          filename: resolved,
          dirname: _dirname(resolved),
          id: resolved,
          loaded: false,
        };
        _pendingModules[cacheKey] = module;

        // Track current module for nested requires
        const prevModule = _currentModule;
        _currentModule = module;

        try {
          // Wrap and execute the code
          const wrapper = new Function(
            'exports', 'require', 'module', '__filename', '__dirname', '__dynamicImport',
            source
          );

          // Create a require function that resolves from this module's directory
          const moduleRequire = function(request) {
            return _requireFrom(request, module.dirname);
          };
          moduleRequire.resolve = function(request) {
            return _resolveModule.applySyncPromise(undefined, [request, module.dirname]);
          };

          // Create a module-local __dynamicImport that resolves from this module's directory
          const moduleDynamicImport = function(specifier) {
            // Try the ESM cache first via the global helper
            if (typeof _dynamicImport !== 'undefined') {
              const cached = _dynamicImport.applySync(undefined, [specifier]);
              if (cached !== null) {
                return Promise.resolve(cached);
              }
            }
            // Fall back to require() from this module's directory
            try {
              const mod = _requireFrom(specifier, module.dirname);
              // Wrap in ESM-like namespace object with default export
              return Promise.resolve({ default: mod, ...mod });
            } catch (e) {
              return Promise.reject(new Error(
                'Cannot dynamically import \\'' + specifier + '\\': ' + e.message
              ));
            }
          };

          wrapper(
            module.exports,
            moduleRequire,
            module,
            resolved,
            module.dirname,
            moduleDynamicImport
          );

          module.loaded = true;
        } finally {
          _currentModule = prevModule;
        }

        // Cache with resolved path
        _moduleCache[cacheKey] = module.exports;
        delete _pendingModules[cacheKey];

        return module.exports;
      }

      // Expose _requireFrom globally so module polyfill can access it
      globalThis._requireFrom = _requireFrom;

    `);
    // module and process are already initialized by the bridge
  }

  /**
   * Set up ESM-compatible globals (process, Buffer, etc.)
   */
  private async setupESMGlobals(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>
  ): Promise<void> {
    // Set up fs references if we have a SystemBridge (needed for fs import)
    if (this.systemBridge) {
      const bridge = this.systemBridge;

      const readFileRef = new ivm.Reference(async (path: string) => {
        return bridge.readFile(path);
      });
      const writeFileRef = new ivm.Reference((path: string, content: string) => {
        bridge.writeFile(path, content);
      });
      // Binary file operations using base64 encoding
      const readFileBinaryRef = new ivm.Reference(async (path: string) => {
        const data = await bridge.readFileBinary(path);
        return Buffer.from(data).toString("base64");
      });
      const writeFileBinaryRef = new ivm.Reference((path: string, base64Content: string) => {
        const data = Buffer.from(base64Content, "base64");
        bridge.writeFile(path, data);
      });
      const readDirRef = new ivm.Reference(async (path: string) => {
        const entries = await bridge.readDirWithTypes(path);
        return JSON.stringify(entries);
      });
      const mkdirRef = new ivm.Reference((path: string) => {
        bridge.mkdir(path);
      });
      const rmdirRef = new ivm.Reference(async (path: string) => {
        await bridge.removeDir(path);
      });
      const existsRef = new ivm.Reference(async (path: string) => {
        return bridge.exists(path);
      });
      const statRef = new ivm.Reference(async (path: string) => {
        const stat = await bridge.stat(path);
        return JSON.stringify({
          mode: stat.mode,
          size: stat.size,
          isDirectory: stat.isDirectory,
          atimeMs: stat.atimeMs,
          mtimeMs: stat.mtimeMs,
          ctimeMs: stat.ctimeMs,
          birthtimeMs: stat.birthtimeMs,
        });
      });
      const unlinkRef = new ivm.Reference(async (path: string) => {
        await bridge.unlink(path);
      });
      const renameRef = new ivm.Reference(async (oldPath: string, newPath: string) => {
        await bridge.rename(oldPath, newPath);
      });

      await jail.set("_fsReadFile", readFileRef);
      await jail.set("_fsWriteFile", writeFileRef);
      await jail.set("_fsReadFileBinary", readFileBinaryRef);
      await jail.set("_fsWriteFileBinary", writeFileBinaryRef);
      await jail.set("_fsReadDir", readDirRef);
      await jail.set("_fsMkdir", mkdirRef);
      await jail.set("_fsRmdir", rmdirRef);
      await jail.set("_fsExists", existsRef);
      await jail.set("_fsStat", statRef);
      await jail.set("_fsUnlink", unlinkRef);
      await jail.set("_fsRename", renameRef);

      await context.eval(`
        globalThis._fs = {
          readFile: _fsReadFile,
          writeFile: _fsWriteFile,
          readFileBinary: _fsReadFileBinary,
          writeFileBinary: _fsWriteFileBinary,
          readDir: _fsReadDir,
          mkdir: _fsMkdir,
          rmdir: _fsRmdir,
          exists: _fsExists,
          stat: _fsStat,
          unlink: _fsUnlink,
          rename: _fsRename,
        };
      `);
    }

    // Load the bridge bundle which sets up process and other globals
    const bridgeCode = getBridgeWithConfig(this.processConfig, this.osConfig);
    await context.eval(bridgeCode);
  }

  /**
   * Run code and return the value of module.exports (CJS) or default export (ESM)
   * along with exit code and captured stdout/stderr
   */
  async run<T = unknown>(code: string, filePath?: string): Promise<RunResult<T>> {
    // Clear caches for fresh run
    this.esmModuleCache.clear();
    this.dynamicImportCache.clear();

    const context = await this.isolate.createContext();
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Set up console capture
      await this.setupConsole(context, jail, stdout, stderr);

      let exports: T;

      // Detect ESM vs CJS
      if (isESM(code, filePath)) {
        // ESM path
        await this.setupESMGlobals(context, jail);

        // Transform dynamic import() to __dynamicImport()
        const transformedCode = transformDynamicImport(code);

        // Pre-compile all dynamic imports
        await this.precompileDynamicImports(transformedCode, context);

        // Set up dynamic import function
        await this.setupDynamicImport(context, jail);

        exports = (await this.runESM(transformedCode, context, filePath)) as T;
      } else {
        // CJS path (existing behavior)
        await this.setupRequire(context, jail);

        // Create module object
        const moduleObj = await this.isolate.compileScript(
          "globalThis.module = { exports: {} };"
        );
        await moduleObj.run(context);

        // Transform dynamic import() to __dynamicImport()
        const transformedCode = transformDynamicImport(code);

        // Pre-compile all dynamic imports
        await this.precompileDynamicImports(transformedCode, context);

        // Set up dynamic import function
        await this.setupDynamicImport(context, jail);

        // Run user code
        const script = await this.isolate.compileScript(transformedCode);
        await script.run(context);

        // Get module.exports
        exports = (await context.eval("module.exports", { copy: true })) as T;
      }

      // Get exit code from process.exitCode if set
      const exitCode = (await context.eval("process.exitCode || 0", {
        copy: true,
      })) as number;

      return {
        stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
        stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
        code: exitCode,
        exports,
      };
    } catch (err) {
      // Check if this is a ProcessExitError (controlled exit)
      const errMessage = err instanceof Error ? err.message : String(err);

      // ProcessExitError format: "process.exit(N)"
      const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);
      if (exitMatch) {
        const exitCode = parseInt(exitMatch[1], 10);
        return {
          stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
          stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
          code: exitCode,
          exports: undefined as T,
        };
      }

      stderr.push(errMessage);
      return {
        stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
        stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
        code: 1,
        exports: undefined as T,
      };
    } finally {
      context.release();
    }
  }

  /**
   * Set up console with output capture
   */
  private async setupConsole(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>,
    stdout: string[],
    stderr: string[]
  ): Promise<void> {
    const logRef = new ivm.Reference((msg: string) => {
      stdout.push(String(msg));
    });
    const errorRef = new ivm.Reference((msg: string) => {
      stderr.push(String(msg));
    });

    await jail.set("_log", logRef);
    await jail.set("_error", errorRef);

    await context.eval(`
      globalThis.console = {
        log: (...args) => _log.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
        error: (...args) => _error.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
        warn: (...args) => _error.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
        info: (...args) => _log.applySync(undefined, [args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')]),
      };
    `);
  }

  /**
   * Execute code like a script with console output capture
   * Supports both CJS and ESM syntax
   */
  async exec(code: string, filePath?: string): Promise<ExecResult> {
    // Clear caches for fresh run
    this.esmModuleCache.clear();
    this.dynamicImportCache.clear();

    const context = await this.isolate.createContext();
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Set up console capture
      await this.setupConsole(context, jail, stdout, stderr);

      // Detect ESM vs CJS
      if (isESM(code, filePath)) {
        // ESM path
        await this.setupESMGlobals(context, jail);

        // Transform dynamic import() to __dynamicImport()
        const transformedCode = transformDynamicImport(code);

        // Pre-compile all dynamic imports
        await this.precompileDynamicImports(transformedCode, context);

        // Set up dynamic import function
        await this.setupDynamicImport(context, jail);

        await this.runESM(transformedCode, context, filePath);
      } else {
        // CJS path
        await this.setupRequire(context, jail);
        await context.eval("globalThis.module = { exports: {} };");

        // Transform dynamic import() to __dynamicImport()
        const transformedCode = transformDynamicImport(code);

        // Pre-compile all dynamic imports (must happen before setting up the function)
        await this.precompileDynamicImports(transformedCode, context);

        // Now set up the dynamic import function (uses pre-compiled cache)
        await this.setupDynamicImport(context, jail);

        // Wrap code to capture the result in a global and await if it's a promise
        // For async IIFEs, we need to capture the Promise returned by the IIFE
        const wrappedCode = `
          globalThis.__scriptResult__ = eval(${JSON.stringify(transformedCode)});
        `;
        const script = await this.isolate.compileScript(wrappedCode);
        await script.run(context);

        // If the script returned a promise, await it
        // Return the promise directly so isolated-vm can properly await it with { promise: true }
        const hasPromise = await context.eval(
          `globalThis.__scriptResult__ && typeof globalThis.__scriptResult__.then === 'function'`,
          { copy: true }
        );
        console.log('[exec] hasPromise:', hasPromise);
        if (hasPromise) {
          console.log('[exec] Awaiting script Promise...');
          await context.eval(`globalThis.__scriptResult__`, { promise: true });
          console.log('[exec] Script Promise resolved');
        }
      }

      // Get exit code from process.exitCode if set
      const exitCode = await context.eval("process.exitCode || 0", {
        copy: true,
      });

      return {
        stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
        stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
        code: exitCode as number,
      };
    } catch (err) {
      // Check if this is a ProcessExitError (controlled exit)
      const errMessage = err instanceof Error ? err.message : String(err);

      // ProcessExitError format: "process.exit(N)"
      const exitMatch = errMessage.match(/process\.exit\((\d+)\)/);
      if (exitMatch) {
        const exitCode = parseInt(exitMatch[1], 10);
        return {
          stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
          stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
          code: exitCode,
        };
      }

      stderr.push(errMessage);
      return {
        stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
        stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
        code: 1,
      };
    } finally {
      context.release();
    }
  }

  dispose(): void {
    this.isolate.dispose();
  }
}
