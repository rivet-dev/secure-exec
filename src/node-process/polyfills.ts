import * as esbuild from "esbuild";
import { fileURLToPath } from "url";
import * as path from "path";
import * as fs from "fs";

// Cache bundled polyfills
const polyfillCache: Map<string, string> = new Map();

// Map of stdlib modules to their polyfill packages
const STDLIB_POLYFILLS: Record<string, string> = {
  path: "path-browserify",
  buffer: "buffer/",
  events: "events/",
  util: "util/util.js",
  assert: "assert/",
  url: "url/",
  querystring: "querystring-es3",
  string_decoder: "string_decoder/",
  punycode: "punycode/",
  stream: "stream-browserify",
  timers: "timers-browserify",
};

/**
 * Bundle a stdlib polyfill module using esbuild
 */
export async function bundlePolyfill(moduleName: string): Promise<string> {
  const cached = polyfillCache.get(moduleName);
  if (cached) return cached;

  const polyfillPackage = STDLIB_POLYFILLS[moduleName];
  if (!polyfillPackage) {
    throw new Error(`No polyfill available for module: ${moduleName}`);
  }

  // Create a virtual entry that exports the polyfill
  const entryCode = `
    const mod = require("${polyfillPackage}");
    module.exports = mod;
  `;

  const result = await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: process.cwd(),
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "__polyfill__",
    platform: "browser",
    target: "es2020",
    minify: false,
    define: {
      "process.env.NODE_ENV": '"production"',
      global: "globalThis",
    },
    inject: [],
  });

  const code = result.outputFiles[0].text;
  // Extract the module from the IIFE wrapper
  const wrappedCode = `(function() {
    ${code}
    return __polyfill__;
  })()`;

  polyfillCache.set(moduleName, wrappedCode);
  return wrappedCode;
}

/**
 * Get all available stdlib modules
 */
export function getAvailableStdlib(): string[] {
  return Object.keys(STDLIB_POLYFILLS);
}

/**
 * Check if a module has a polyfill available
 */
export function hasPolyfill(moduleName: string): boolean {
  // Strip node: prefix
  const name = moduleName.replace(/^node:/, "");
  return name in STDLIB_POLYFILLS;
}

/**
 * Pre-bundle all polyfills (for faster startup)
 */
export async function prebundleAllPolyfills(): Promise<Map<string, string>> {
  const modules = getAvailableStdlib();
  await Promise.all(modules.map((m) => bundlePolyfill(m)));
  return new Map(polyfillCache);
}
