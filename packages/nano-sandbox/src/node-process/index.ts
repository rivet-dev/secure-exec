import ivm from "isolated-vm";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";
import { resolveModule, loadFile } from "./package-bundler.js";
import type { SystemBridge } from "../system-bridge/index.js";
import { FS_MODULE_CODE } from "@nano-sandbox/fs-polyfill";

export interface NodeProcessOptions {
  memoryLimit?: number; // MB, default 128
  systemBridge?: SystemBridge; // For accessing virtual filesystem
}

export interface RunResult {
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

  constructor(options: NodeProcessOptions = {}) {
    this.memoryLimit = options.memoryLimit ?? 128;
    this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
    this.systemBridge = options.systemBridge;
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

      // Also set up process.cwd() which path module needs
      globalThis.process = globalThis.process || {};
      globalThis.process.cwd = function() { return '/'; };
      globalThis.process.env = globalThis.process.env || {};
    `);
  }

  /**
   * Run code and return the value of module.exports
   */
  async run<T = unknown>(code: string): Promise<T> {
    const context = await this.isolate.createContext();

    try {
      // Set up module.exports
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Set up require system
      await this.setupRequire(context, jail);

      // Create module object
      const moduleObj = await this.isolate.compileScript(
        "globalThis.module = { exports: {} };"
      );
      await moduleObj.run(context);

      // Run user code
      const script = await this.isolate.compileScript(code);
      await script.run(context);

      // Get module.exports
      const result = await context.eval("module.exports", { copy: true });
      return result as T;
    } finally {
      context.release();
    }
  }

  /**
   * Execute code like a script with console output capture
   */
  async exec(code: string): Promise<RunResult> {
    const context = await this.isolate.createContext();
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Set up require system
      await this.setupRequire(context, jail);

      // Set up console with output capture via References
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
        globalThis.module = { exports: {} };
      `);

      // Run user code
      const script = await this.isolate.compileScript(code);
      await script.run(context);

      return {
        stdout: stdout.join("\n") + (stdout.length > 0 ? "\n" : ""),
        stderr: stderr.join("\n") + (stderr.length > 0 ? "\n" : ""),
        code: 0,
      };
    } catch (err) {
      stderr.push(err instanceof Error ? err.message : String(err));
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
