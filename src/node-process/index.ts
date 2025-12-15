import ivm from "isolated-vm";
import { bundlePolyfill, hasPolyfill } from "./polyfills.js";

export interface NodeProcessOptions {
  memoryLimit?: number; // MB, default 128
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

  constructor(options: NodeProcessOptions = {}) {
    this.memoryLimit = options.memoryLimit ?? 128;
    this.isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
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

    await jail.set("_loadPolyfill", loadPolyfillRef);

    // Set up the require system
    await context.eval(`
      globalThis._moduleCache = {};
      globalThis._pendingModules = {};

      globalThis.require = function require(moduleName) {
        // Strip node: prefix
        const name = moduleName.replace(/^node:/, '');

        // Check cache
        if (_moduleCache[name]) {
          return _moduleCache[name];
        }

        // Check if we're currently loading this module (circular dep)
        if (_pendingModules[name]) {
          return _pendingModules[name].exports;
        }

        // Try to load polyfill synchronously
        const code = _loadPolyfill.applySyncPromise(undefined, [name]);
        if (code === null) {
          throw new Error('Cannot find module: ' + moduleName);
        }

        // Create module object for circular dependency support
        const moduleObj = { exports: {} };
        _pendingModules[name] = moduleObj;

        // Execute the bundled code to get the module
        const result = eval(code);

        // Merge with moduleObj.exports in case of circular deps
        if (typeof result === 'object' && result !== null) {
          Object.assign(moduleObj.exports, result);
        } else {
          moduleObj.exports = result;
        }

        // Cache and cleanup
        _moduleCache[name] = moduleObj.exports;
        delete _pendingModules[name];

        return _moduleCache[name];
      };

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
