/**
 * Controls how deeply and widely console.log arguments are serialized.
 * Prevents CPU amplification and memory buildup from deeply-nested or
 * massive objects being logged inside the sandbox.
 */
export interface ConsoleSerializationBudget {
	maxDepth: number;
	maxKeys: number;
	maxArrayLength: number;
	maxOutputLength: number;
}

export const DEFAULT_CONSOLE_SERIALIZATION_BUDGET: ConsoleSerializationBudget = {
	maxDepth: 6,
	maxKeys: 50,
	maxArrayLength: 50,
	maxOutputLength: 4096,
};

function normalizeBudget(
	budget: ConsoleSerializationBudget,
): ConsoleSerializationBudget {
	const defaults = {
		maxDepth: 6,
		maxKeys: 50,
		maxArrayLength: 50,
		maxOutputLength: 4096,
	};
	const clamp = (value: number, fallback: number) => {
		if (!Number.isFinite(value)) return fallback;
		const normalized = Math.floor(value);
		return normalized > 0 ? normalized : fallback;
	};

	return {
		maxDepth: clamp(budget.maxDepth, defaults.maxDepth),
		maxKeys: clamp(budget.maxKeys, defaults.maxKeys),
		maxArrayLength: clamp(budget.maxArrayLength, defaults.maxArrayLength),
		maxOutputLength: clamp(budget.maxOutputLength, defaults.maxOutputLength),
	};
}

function safeStringifyConsoleValueWithBudget(
	value: unknown,
	budget: ConsoleSerializationBudget,
): string {
	const suffix = "...[Truncated]";
	const clampOutput = (text: string) => {
		if (text.length <= budget.maxOutputLength) {
			return text;
		}
		if (budget.maxOutputLength <= suffix.length) {
			return suffix.slice(0, budget.maxOutputLength);
		}
		return (
			text.slice(0, budget.maxOutputLength - suffix.length) + suffix
		);
	};

	if (value === null) return "null";
	if (value === undefined) return "undefined";
	const valueType = typeof value;
	if (valueType !== "object") {
		if (valueType === "bigint") {
			return `${String(value)}n`;
		}
		return clampOutput(String(value));
	}

	const rootObject = value as Record<string, unknown>;
	const skipFastPath =
		(Array.isArray(rootObject) &&
			rootObject.length > budget.maxArrayLength) ||
		(!Array.isArray(rootObject) &&
			Object.keys(rootObject).length > budget.maxKeys);

	if (!skipFastPath) {
		try {
			const quickSerialized = JSON.stringify(value);
			if (quickSerialized !== undefined) {
				return clampOutput(quickSerialized);
			}
		} catch {
			// Fall back to circular-safe and budget-aware serialization.
		}
	}

	const seen = new WeakSet<object>();
	const depthByObject = new WeakMap<object, number>();
	const replacer = function (this: unknown, key: string, current: unknown) {
		if (typeof current === "bigint") {
			return `${String(current)}n`;
		}
		if (typeof current !== "object" || current === null) {
			return current;
		}

		const currentObject = current as Record<string, unknown>;
		if (seen.has(currentObject)) {
			return "[Circular]";
		}
		seen.add(currentObject);

		let depth = 0;
		if (key !== "") {
			const parent = this;
			if (typeof parent === "object" && parent !== null) {
				depth = (depthByObject.get(parent as object) ?? 0) + 1;
			}
		}
		depthByObject.set(currentObject, depth);

		if (depth > budget.maxDepth) {
			return "[MaxDepth]";
		}

		if (Array.isArray(currentObject)) {
			if (currentObject.length <= budget.maxArrayLength) {
				return currentObject;
			}
			const trimmed = currentObject.slice(0, budget.maxArrayLength);
			trimmed.push("[Truncated]");
			return trimmed;
		}

		const keys = Object.keys(currentObject);
		if (keys.length <= budget.maxKeys) {
			return currentObject;
		}

		const trimmed: Record<string, unknown> = {};
		for (let i = 0; i < budget.maxKeys; i += 1) {
			const keyName = keys[i];
			trimmed[keyName] = currentObject[keyName];
		}
		trimmed["[Truncated]"] = `${keys.length - budget.maxKeys} key(s)`;
		return trimmed;
	};

	try {
		const serialized = JSON.stringify(value, replacer);
		if (serialized === undefined) {
			return clampOutput(String(value));
		}
		return clampOutput(serialized);
	} catch {
		return clampOutput(String(value));
	}
}

/** Serialize a single value with circular reference detection and budget limits. */
export function safeStringifyConsoleValue(
	value: unknown,
	rawBudget: ConsoleSerializationBudget,
): string {
	return safeStringifyConsoleValueWithBudget(value, normalizeBudget(rawBudget));
}

/** Format an array of console arguments into a single space-separated string. */
export function formatConsoleArgs(
	args: unknown[],
	rawBudget: ConsoleSerializationBudget,
): string {
	const budget = normalizeBudget(rawBudget);
	const formatted: string[] = [];
	for (let i = 0; i < args.length; i += 1) {
		formatted.push(safeStringifyConsoleValueWithBudget(args[i], budget));
	}
	return formatted.join(" ");
}

/**
 * Generate isolate-side JavaScript that installs a `globalThis.console` shim.
 * The shim serializes arguments using the budget and forwards them to host
 * bridge references (`_log` / `_error`) via `applySync`.
 */
export function getConsoleSetupCode(
	budget: ConsoleSerializationBudget = DEFAULT_CONSOLE_SERIALIZATION_BUDGET,
): string {
	const normalizedBudget = normalizeBudget(budget);
	return `
	      // tsx/esbuild may emit __name(...) wrappers inside function source strings.
	      const __name = (value) => value;
	      const __consoleBudget = ${JSON.stringify(normalizedBudget)};
	      const normalizeBudget = ${normalizeBudget.toString()};
	      const safeStringifyConsoleValueWithBudget = ${safeStringifyConsoleValueWithBudget.toString()};
      const safeStringifyConsoleValue = ${safeStringifyConsoleValue.toString()};
      const formatConsoleArgs = ${formatConsoleArgs.toString()};

      // Console class constructor — wrapped in IIFE to avoid polluting user scope
      (function() {
      function Console(stdout, stderr) {
        if (!(this instanceof Console)) {
          return new Console(stdout, stderr);
        }
        // When stdout/stderr are provided, use their write method directly.
        // When null (global console), lazily route through process.stdout/stderr
        // so user-space overrides of process.stdout.write are honoured.
        const out = stdout && typeof stdout.write === 'function'
          ? (msg) => stdout.write(msg + '\\n')
          : (msg) => {
              if (typeof process !== 'undefined' && process.stdout && process.stdout.write) {
                process.stdout.write(msg + '\\n');
              } else {
                _log(msg);
              }
            };
        const err = stderr && typeof stderr.write === 'function'
          ? (msg) => stderr.write(msg + '\\n')
          : (msg) => {
              if (typeof process !== 'undefined' && process.stderr && process.stderr.write) {
                process.stderr.write(msg + '\\n');
              } else if (typeof _error !== 'undefined') {
                _error(msg);
              } else {
                out(msg);
              }
            };

        const counters = new Map();
        const timers = new Map();
        let groupDepth = 0;
        const indent = () => '  '.repeat(groupDepth);

        // Non-constructible method factory
        const method = (name, fn) => {
          Object.defineProperty(fn, 'name', { value: name, configurable: true });
          return fn;
        };

        this.log = method('log', (...args) => out(indent() + formatConsoleArgs(args, __consoleBudget)));
        this.debug = method('debug', (...args) => this.log(...args));
        this.info = method('info', (...args) => this.log(...args));
        this.dirxml = method('dirxml', (...args) => this.log(...args));
        this.error = method('error', (...args) => err(indent() + formatConsoleArgs(args, __consoleBudget)));
        this.warn = method('warn', (...args) => this.error(...args));
        this.dir = method('dir', (...args) => out(indent() + formatConsoleArgs(args, __consoleBudget)));
        this.table = method('table', (...args) => out(indent() + formatConsoleArgs(args, __consoleBudget)));
        this.trace = method('trace', (...args) => {
          err(indent() + 'Trace: ' + formatConsoleArgs(args, __consoleBudget));
        });
        this.assert = method('assert', (condition, ...args) => {
          if (!condition) {
            const msg = args.length > 0 ? formatConsoleArgs(args, __consoleBudget) : 'Assertion failed';
            err(indent() + 'Assertion failed: ' + msg);
          }
        });
        this.clear = method('clear', () => {
          if (typeof process !== 'undefined' && process.stdout && process.stdout.isTTY &&
              (typeof process.env === 'undefined' || process.env.TERM !== 'dumb')) {
            // Write ANSI escape directly — no trailing newline (matches Node.js)
            if (stdout && typeof stdout.write === 'function') {
              stdout.write('\\u001b[1;1H\\u001b[0J');
            } else if (typeof process !== 'undefined' && process.stdout) {
              process.stdout.write('\\u001b[1;1H\\u001b[0J');
            }
          }
        });
        this.count = method('count', (label) => {
          const key = label === undefined ? 'default' : ('' + label);
          const count = (counters.get(key) || 0) + 1;
          counters.set(key, count);
          out(key + ': ' + count);
        });
        this.countReset = method('countReset', (label) => {
          const key = label === undefined ? 'default' : ('' + label);
          counters.delete(key);
        });
        this.time = method('time', (label) => {
          const key = label === undefined ? 'default' : String(label);
          timers.set(key, Date.now());
        });
        this.timeEnd = method('timeEnd', (label) => {
          const key = label === undefined ? 'default' : String(label);
          const start = timers.get(key);
          if (start === undefined) {
            err('Warning: No such label \\'' + key + '\\' for console.timeEnd()');
            return;
          }
          timers.delete(key);
          out(key + ': ' + (Date.now() - start) + 'ms');
        });
        this.timeLog = method('timeLog', (label, ...args) => {
          const key = label === undefined ? 'default' : String(label);
          const start = timers.get(key);
          if (start === undefined) {
            err('Warning: No such label \\'' + key + '\\' for console.timeLog()');
            return;
          }
          const extra = args.length > 0 ? ' ' + formatConsoleArgs(args, __consoleBudget) : '';
          out(key + ': ' + (Date.now() - start) + 'ms' + extra);
        });
        this.group = method('group', (...args) => {
          if (args.length > 0) out(indent() + formatConsoleArgs(args, __consoleBudget));
          groupDepth++;
        });
        this.groupCollapsed = method('groupCollapsed', (...args) => this.group(...args));
        this.groupEnd = method('groupEnd', () => {
          if (groupDepth > 0) groupDepth--;
        });
      }

      // Create the global console as an instance of Console
      const _console = new Console(null, null);
      _console.Console = Console;
      globalThis.console = _console;
      })();
    `;
}
