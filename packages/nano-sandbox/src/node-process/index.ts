import ivm from "isolated-vm";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import { resolveModule, loadFile } from "./package-bundler.js";
import type { SystemBridge } from "../system-bridge/index.js";
import { FS_MODULE_CODE } from "@nano-sandbox/fs-polyfill";
import {
  generateProcessPolyfill,
  type ProcessConfig,
} from "./process-polyfill.js";

export interface NodeProcessOptions {
  memoryLimit?: number; // MB, default 128
  systemBridge?: SystemBridge; // For accessing virtual filesystem
  processConfig?: ProcessConfig; // Process object configuration
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
  const hasImport = /^\s*import\s+(?:[\w{},*\s]+\s+from\s+)?['"][^'"]+['"]/m.test(code);
  // export declarations
  const hasExport = /^\s*export\s+(?:default|const|let|var|function|class|{)/m.test(code);

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
  // Cache for compiled ESM modules (per isolate)
  private esmModuleCache: Map<string, ivm.Module> = new Map();

  constructor(options: NodeProcessOptions = {}) {
    this.memoryLimit = options.memoryLimit ?? 128;
    this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
    this.systemBridge = options.systemBridge;
    this.processConfig = options.processConfig ?? {};
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
    if (hasPolyfill(moduleName) || moduleName === "fs") {
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
    if (filePath.startsWith("node:") || hasPolyfill(moduleName)) {
      // Special case for fs
      if (moduleName === "fs") {
        code = wrapCJSForESM(FS_MODULE_CODE);
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
   */
  private async setupDynamicImport(
    context: ivm.Context,
    jail: ivm.Reference<Record<string, unknown>>
  ): Promise<void> {
    // Create a SYNCHRONOUS reference for dynamic imports (returns from cache)
    const dynamicImportRef = new ivm.Reference((specifier: string) => {
      // Check the cache - look up both by specifier and resolved path
      let ns = this.dynamicImportCache.get(specifier);
      if (!ns) {
        throw new Error(
          `Cannot dynamically import '${specifier}': module not pre-compiled. ` +
            `Only string literal imports are supported, e.g., import('path'), not import(variable).`
        );
      }
      return ns.derefInto();
    });

    await jail.set("_dynamicImport", dynamicImportRef);

    // Create the __dynamicImport function in the isolate (uses sync lookup)
    await context.eval(`
      globalThis.__dynamicImport = function(specifier) {
        return Promise.resolve(_dynamicImport.applySync(undefined, [specifier]));
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
    const loadFileRef = new ivm.Reference(
      async (path: string): Promise<string | null> => {
        if (!this.systemBridge) {
          return null;
        }
        return loadFile(path, this.systemBridge);
      }
    );

    await jail.set("_loadPolyfill", loadPolyfillRef);
    await jail.set("_resolveModule", resolveModuleRef);
    await jail.set("_loadFile", loadFileRef);

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

    // Set up the require system with dynamic CommonJS resolution
    await context.eval(`
      globalThis._moduleCache = {};
      globalThis._pendingModules = {};
      globalThis._currentModule = { dirname: '/' };

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

        // Try to load polyfill first (for built-in modules like path, events, etc.)
        const polyfillCode = _loadPolyfill.applySyncPromise(undefined, [name]);
        if (polyfillCode !== null) {
          if (_moduleCache[name]) return _moduleCache[name];

          const moduleObj = { exports: {} };
          _pendingModules[name] = moduleObj;

          const result = eval(polyfillCode);
          if (typeof result === 'object' && result !== null) {
            Object.assign(moduleObj.exports, result);
          } else {
            moduleObj.exports = result;
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
            'exports', 'require', 'module', '__filename', '__dirname',
            source
          );

          // Create a require function that resolves from this module's directory
          const moduleRequire = function(request) {
            return _requireFrom(request, module.dirname);
          };
          moduleRequire.resolve = function(request) {
            return _resolveModule.applySyncPromise(undefined, [request, module.dirname]);
          };

          wrapper(
            module.exports,
            moduleRequire,
            module,
            resolved,
            module.dirname
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

    `);

    // Set up comprehensive process object
    const processPolyfillCode = generateProcessPolyfill(this.processConfig);
    await context.eval(processPolyfillCode);
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

    // Set up comprehensive process object
    const processPolyfillCode = generateProcessPolyfill(this.processConfig);
    await context.eval(processPolyfillCode);
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

        const script = await this.isolate.compileScript(transformedCode);
        await script.run(context);
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
