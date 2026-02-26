export function getRequireSetupCode(): string {
	return `

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
          _moduleCache['child_process'] = _childProcessModule;
          return _childProcessModule;
        }

        // Special handling for http module
        if (name === 'http') {
          if (_moduleCache['http']) return _moduleCache['http'];
          _moduleCache['http'] = _httpModule;
          return _httpModule;
        }

        // Special handling for https module
        if (name === 'https') {
          if (_moduleCache['https']) return _moduleCache['https'];
          _moduleCache['https'] = _httpsModule;
          return _httpsModule;
        }

        // Special handling for dns module
        if (name === 'dns') {
          if (_moduleCache['dns']) return _moduleCache['dns'];
          _moduleCache['dns'] = _dnsModule;
          return _dnsModule;
        }

        // Special handling for os module
        if (name === 'os') {
          if (_moduleCache['os']) return _moduleCache['os'];
          _moduleCache['os'] = _osModule;
          return _osModule;
        }

        // Special handling for module module
        if (name === 'module') {
          if (_moduleCache['module']) return _moduleCache['module'];
          _moduleCache['module'] = _moduleModule;
          return _moduleModule;
        }

        // Special handling for process module - return our bridge's process object.
        // This prevents node-stdlib-browser's process polyfill from overwriting it.
        if (name === 'process') {
          return globalThis.process;
        }

        // Special handling for @hono/node-server module
        if (name === '@hono/node-server') {
          if (_moduleCache['@hono/node-server']) return _moduleCache['@hono/node-server'];
          _moduleCache['@hono/node-server'] = _honoNodeServerModule;
          return _honoNodeServerModule;
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
            // Add style properties that return the same chalk function
            const styles = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey', 'black', 'bold', 'dim', 'italic', 'underline'];
            styles.forEach(style => {
              chalk[style] = chalk;
            });
            return chalk;
          };

          const chalk = createChalk({ level: 0 });
          _moduleCache['chalk'] = chalk;
          return chalk;
        }

        // Stub for supports-color (npm uses for checking terminal color support)
        if (name === 'supports-color') {
          if (_moduleCache['supports-color']) return _moduleCache['supports-color'];
          const supportsColor = {
            stdout: false,
            stderr: false,
            level: 0,
            hasBasic: false,
            has256: false,
            has16m: false,
          };
          _moduleCache['supports-color'] = supportsColor;
          return supportsColor;
        }

        // Stub for tty module - npm uses for isatty
        if (name === 'tty') {
          if (_moduleCache['tty']) return _moduleCache['tty'];
          const tty = {
            isatty: function() { return false; },
            ReadStream: function() {},
            WriteStream: function() {},
          };
          _moduleCache['tty'] = tty;
          return tty;
        }

        // Stub for constants module
        if (name === 'constants') {
          if (_moduleCache['constants']) return _moduleCache['constants'];
          const constants = { signal: { SIGTERM: 15, SIGKILL: 9, SIGINT: 2 } };
          _moduleCache['constants'] = constants;
          return constants;
        }

        // Stub for v8 module (npm uses for heap stats)
        if (name === 'v8') {
          if (_moduleCache['v8']) return _moduleCache['v8'];
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
                  patchedResult[key] = result[key];
                }
              }
              // Mark as patched to avoid double patching
              patchedResult.URL._patched = true;

              result.URL = patchedResult.URL;
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

    `;
}
