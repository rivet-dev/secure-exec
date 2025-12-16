import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { init, Directory } from "@wasmer/sdk/node";
import { NodeProcess } from "./index";
import { SystemBridge } from "../system-bridge/index";

describe("NodeProcess", () => {
  let proc: NodeProcess;

  beforeAll(async () => {
    await init();
  });

  afterEach(() => {
    proc?.dispose();
  });

  describe("Step 1: Basic isolate execution", () => {
    it("should run basic code and return module.exports", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`module.exports = 1 + 1`);
      expect(result.exports).toBe(2);
    });

    it("should return complex objects", async () => {
      proc = new NodeProcess();
      const result = await proc.run<{ foo: string; bar: number }>(
        `module.exports = { foo: "hello", bar: 42 }`
      );
      expect(result.exports).toEqual({ foo: "hello", bar: 42 });
    });

    it("should execute code with console output", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`console.log("hello world")`);
      expect(result.stdout).toBe("hello world\n");
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
    });

    it("should capture errors to stderr", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`throw new Error("oops")`);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("oops");
    });

    it("should capture console.error to stderr", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`console.error("bad thing")`);
      expect(result.stderr).toBe("bad thing\n");
      expect(result.code).toBe(0);
    });
  });

  describe("Step 2: require() with node stdlib polyfills", () => {
    it("should require path module and use join", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const path = require("path");
        module.exports = path.join("foo", "bar");
      `);
      expect(result.exports).toBe("foo/bar");
    });

    it("should require path module with node: prefix", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const path = require("node:path");
        module.exports = path.dirname("/foo/bar/baz.txt");
      `);
      expect(result.exports).toBe("/foo/bar");
    });

    it("should require events module", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const { EventEmitter } = require("events");
        const emitter = new EventEmitter();
        let called = false;
        emitter.on("test", () => { called = true; });
        emitter.emit("test");
        module.exports = called;
      `);
      expect(result.exports).toBe(true);
    });

    it("should require util module", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const util = require("util");
        module.exports = util.format("hello %s", "world");
      `);
      expect(result.exports).toBe("hello world");
    });

    it("should cache modules", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const path1 = require("path");
        const path2 = require("path");
        module.exports = path1 === path2;
      `);
      expect(result.exports).toBe(true);
    });

    it("should throw for unknown modules", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`
        const unknown = require("nonexistent-module");
      `);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Cannot find module");
    });
  });

  describe("Step 8: Package imports from node_modules", () => {
    it("should load a simple package from virtual node_modules", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Create a simple mock package
      bridge.mkdir("/node_modules/my-pkg");
      bridge.writeFile(
        "/node_modules/my-pkg/package.json",
        JSON.stringify({ name: "my-pkg", main: "index.js" })
      );
      bridge.writeFile(
        "/node_modules/my-pkg/index.js",
        `module.exports = { add: (a, b) => a + b };`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const pkg = require('my-pkg');
        module.exports = pkg.add(2, 3);
      `);

      expect(result.exports).toBe(5);
    });

    it("should load package with default index.js", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Package without explicit main
      bridge.mkdir("/node_modules/simple-pkg");
      bridge.writeFile(
        "/node_modules/simple-pkg/package.json",
        JSON.stringify({ name: "simple-pkg" })
      );
      bridge.writeFile(
        "/node_modules/simple-pkg/index.js",
        `module.exports = "hello from simple-pkg";`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const pkg = require('simple-pkg');
        module.exports = pkg;
      `);

      expect(result.exports).toBe("hello from simple-pkg");
    });

    it("should prioritize polyfills over node_modules", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Even if path exists in node_modules, polyfill should be used
      bridge.mkdir("/node_modules/path");
      bridge.writeFile(
        "/node_modules/path/package.json",
        JSON.stringify({ name: "path", main: "index.js" })
      );
      bridge.writeFile(
        "/node_modules/path/index.js",
        `module.exports = { fake: true };`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const path = require('path');
        // Real path polyfill has join, our fake doesn't
        module.exports = typeof path.join === 'function';
      `);

      expect(result.exports).toBe(true);
    });

    it("should use setSystemBridge to add bridge later", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.mkdir("/node_modules/late-pkg");
      bridge.writeFile(
        "/node_modules/late-pkg/package.json",
        JSON.stringify({ name: "late-pkg", main: "index.js" })
      );
      bridge.writeFile(
        "/node_modules/late-pkg/index.js",
        `module.exports = 42;`
      );

      proc = new NodeProcess();
      proc.setSystemBridge(bridge);

      const result = await proc.run(`
        const pkg = require('late-pkg');
        module.exports = pkg;
      `);

      expect(result.exports).toBe(42);
    });
  });

  describe("Dynamic CommonJS module resolution", () => {
    it("should resolve relative imports", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Create a file with relative import
      bridge.mkdir("/lib");
      bridge.writeFile("/lib/helper.js", `module.exports = { greet: () => 'Hello' };`);
      bridge.writeFile(
        "/main.js",
        `const helper = require('./lib/helper'); module.exports = helper.greet();`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const main = require('/main.js');
        module.exports = main;
      `);

      expect(result.exports).toBe("Hello");
    });

    it("should resolve parent directory imports", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.mkdir("/src/utils");
      bridge.writeFile("/src/config.js", `module.exports = { name: 'test' };`);
      bridge.writeFile(
        "/src/utils/reader.js",
        `const config = require('../config'); module.exports = config.name;`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const reader = require('/src/utils/reader.js');
        module.exports = reader;
      `);

      expect(result.exports).toBe("test");
    });

    it("should load JSON files", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.writeFile("/data.json", JSON.stringify({ version: "1.0.0" }));

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const data = require('/data.json');
        module.exports = data.version;
      `);

      expect(result.exports).toBe("1.0.0");
    });

    it("should handle nested requires with dependencies", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Create a package with internal dependencies
      bridge.mkdir("/node_modules/my-lib");
      bridge.writeFile(
        "/node_modules/my-lib/package.json",
        JSON.stringify({ name: "my-lib", main: "index.js" })
      );
      bridge.writeFile(
        "/node_modules/my-lib/utils.js",
        `module.exports = { double: x => x * 2 };`
      );
      bridge.writeFile(
        "/node_modules/my-lib/index.js",
        `const utils = require('./utils'); module.exports = { calc: x => utils.double(x) };`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const lib = require('my-lib');
        module.exports = lib.calc(5);
      `);

      expect(result.exports).toBe(10);
    });

    it("should handle package subpath imports", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.mkdir("/node_modules/toolkit");
      bridge.writeFile(
        "/node_modules/toolkit/package.json",
        JSON.stringify({ name: "toolkit", main: "index.js" })
      );
      bridge.writeFile(
        "/node_modules/toolkit/index.js",
        `module.exports = { main: true };`
      );
      bridge.writeFile(
        "/node_modules/toolkit/extra.js",
        `module.exports = { extra: true };`
      );

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const extra = require('toolkit/extra');
        module.exports = extra.extra;
      `);

      expect(result.exports).toBe(true);
    });

    it("should cache modules", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.writeFile("/counter.js", `
        let count = 0;
        module.exports = { increment: () => ++count };
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const c1 = require('/counter.js');
        const c2 = require('/counter.js');
        c1.increment();
        c1.increment();
        module.exports = c2.increment();
      `);

      // If caching works, c2 is the same instance as c1
      expect(result.exports).toBe(3);
    });
  });

  describe("fs polyfill", () => {
    it("should read and write files", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        fs.writeFileSync('/test.txt', 'hello world');
        module.exports = fs.readFileSync('/test.txt', 'utf8');
      `);

      expect(result.exports).toBe("hello world");
    });

    it("should check file existence", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);
      bridge.writeFile("/existing.txt", "content");

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        module.exports = {
          exists: fs.existsSync('/existing.txt'),
          notExists: fs.existsSync('/nonexistent.txt'),
        };
      `);

      expect(result.exports).toEqual({ exists: true, notExists: false });
    });

    it("should get file stats", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);
      bridge.writeFile("/myfile.txt", "hello");

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        const stats = fs.statSync('/myfile.txt');
        module.exports = {
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
        };
      `);

      expect(result.exports).toEqual({
        isFile: true,
        isDirectory: false,
        size: 5,
      });
    });

    it("should read directory contents", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);
      bridge.mkdir("/mydir");
      bridge.writeFile("/mydir/a.txt", "a");
      bridge.writeFile("/mydir/b.txt", "b");

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run<string[]>(`
        const fs = require('fs');
        module.exports = fs.readdirSync('/mydir').sort();
      `);

      expect(result.exports).toContain("a.txt");
      expect(result.exports).toContain("b.txt");
    });

    it("should delete files", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);
      bridge.writeFile("/todelete.txt", "content");

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        const existsBefore = fs.existsSync('/todelete.txt');
        fs.unlinkSync('/todelete.txt');
        const existsAfter = fs.existsSync('/todelete.txt');
        module.exports = { existsBefore, existsAfter };
      `);

      expect(result.exports).toEqual({ existsBefore: true, existsAfter: false });
    });

    it("should work with file descriptors", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        const fd = fs.openSync('/fd-test.txt', 'w');
        fs.writeSync(fd, 'hello');
        fs.closeSync(fd);
        module.exports = fs.readFileSync('/fd-test.txt', 'utf8');
      `);

      expect(result.exports).toBe("hello");
    });

    it("should append to files", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);
      bridge.writeFile("/append.txt", "hello");

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        fs.appendFileSync('/append.txt', ' world');
        module.exports = fs.readFileSync('/append.txt', 'utf8');
      `);

      expect(result.exports).toBe("hello world");
    });

    it("should create directories", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.run(`
        const fs = require('fs');
        fs.mkdirSync('/newdir');
        fs.writeFileSync('/newdir/file.txt', 'content');
        module.exports = fs.existsSync('/newdir/file.txt');
      `);

      expect(result.exports).toBe(true);
    });
  });

  describe("ESM Support", () => {
    it("should detect and run basic ESM code", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`
        const x = 1 + 1;
        export default x;
        console.log("result:", x);
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("result: 2");
    });

    it("should import built-in modules with ESM syntax", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`
        import path from 'path';
        console.log(path.join('foo', 'bar'));
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("foo/bar");
    });

    it("should import path with node: prefix", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`
        import path from 'node:path';
        console.log(path.basename('/foo/bar/baz.txt'));
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("baz.txt");
    });

    it("should import events module", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`
        import events from 'events';
        const emitter = new events.EventEmitter();
        let msg = '';
        emitter.on('test', (data) => { msg = data; });
        emitter.emit('test', 'hello');
        console.log(msg);
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("hello");
    });

    it("should import from filesystem with ESM", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Create directory and ESM module
      bridge.mkdir("/lib");
      bridge.writeFile("/lib/math.js", `
        export const add = (a, b) => a + b;
        export const multiply = (a, b) => a * b;
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        import { add, multiply } from '/lib/math.js';
        console.log('add:', add(2, 3));
        console.log('multiply:', multiply(4, 5));
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("add: 5");
      expect(result.stdout).toContain("multiply: 20");
    });

    it("should import CJS module from ESM", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Create directory and CJS module
      bridge.mkdir("/lib");
      bridge.writeFile("/lib/cjs-helper.js", `
        module.exports = { greet: (name) => 'Hello, ' + name };
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        import helper from '/lib/cjs-helper.js';
        console.log(helper.greet('World'));
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Hello, World");
    });

    it("should handle chained ESM imports", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      // Create a chain of ESM imports
      bridge.writeFile("/a.js", `
        export const valueA = 'A';
      `);
      bridge.writeFile("/b.js", `
        import { valueA } from '/a.js';
        export const valueB = valueA + 'B';
      `);
      bridge.writeFile("/c.js", `
        import { valueB } from '/b.js';
        export const valueC = valueB + 'C';
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        import { valueC } from '/c.js';
        console.log(valueC);
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("ABC");
    });

    it("should handle default and named exports together", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.writeFile("/mixed.js", `
        export const PI = 3.14159;
        export const E = 2.71828;
        export default { name: 'math-constants' };
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        import constants, { PI, E } from '/mixed.js';
        console.log('name:', constants.name);
        console.log('PI:', PI);
        console.log('E:', E);
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("name: math-constants");
      expect(result.stdout).toContain("PI: 3.14159");
      expect(result.stdout).toContain("E: 2.71828");
    });

    it("should detect .mjs as ESM regardless of content", async () => {
      proc = new NodeProcess();
      // Even without import/export, .mjs should be treated as ESM
      const result = await proc.exec(
        `console.log("from mjs");`,
        "/test.mjs"
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("from mjs");
    });

    it("should detect .cjs as CJS regardless of content", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(
        `module.exports = 42; console.log("from cjs");`,
        "/test.cjs"
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("from cjs");
    });

    it("should import JSON with ESM", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.writeFile("/config.json", JSON.stringify({ debug: true, version: "1.0.0" }));

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        import config from '/config.json';
        console.log('debug:', config.debug);
        console.log('version:', config.version);
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("debug: true");
      expect(result.stdout).toContain("version: 1.0.0");
    });

    it("should support dynamic import() for built-in modules", async () => {
      proc = new NodeProcess();
      const result = await proc.exec(`
        async function main() {
          const path = await import('path');
          console.log(path.default.join('foo', 'bar'));
        }
        main();
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("foo/bar");
    });

    it("should support dynamic import() for filesystem modules", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.mkdir("/lib");
      bridge.writeFile("/lib/utils.js", `
        export const double = (x) => x * 2;
        export const triple = (x) => x * 3;
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        async function main() {
          const utils = await import('/lib/utils.js');
          console.log('double:', utils.double(5));
          console.log('triple:', utils.triple(5));
        }
        main();
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("double: 10");
      expect(result.stdout).toContain("triple: 15");
    });

    it("should support conditional dynamic imports", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.writeFile("/a.js", `export const name = 'module-a';`);
      bridge.writeFile("/b.js", `export const name = 'module-b';`);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        async function loadModule(useA) {
          if (useA) {
            return await import('/a.js');
          } else {
            return await import('/b.js');
          }
        }

        async function main() {
          const modA = await loadModule(true);
          const modB = await loadModule(false);
          console.log('a:', modA.name);
          console.log('b:', modB.name);
        }
        main();
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("a: module-a");
      expect(result.stdout).toContain("b: module-b");
    });

    it("should support dynamic import() with CJS modules", async () => {
      const dir = new Directory();
      const bridge = new SystemBridge(dir);

      bridge.mkdir("/lib");
      bridge.writeFile("/lib/cjs-mod.js", `
        module.exports = { greeting: 'Hello from CJS' };
      `);

      proc = new NodeProcess({ systemBridge: bridge });
      const result = await proc.exec(`
        async function main() {
          const mod = await import('/lib/cjs-mod.js');
          console.log(mod.default.greeting);
        }
        main();
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Hello from CJS");
    });
  });

  describe("Phase 1: Process Object Enhancement", () => {
    describe("process static properties", () => {
      it("should have process.platform", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = process.platform;
        `);
        expect(result.exports).toBe("linux");
      });

      it("should have process.arch", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = process.arch;
        `);
        expect(result.exports).toBe("x64");
      });

      it("should have process.version", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = process.version;
        `);
        expect(result.exports).toMatch(/^v\d+\.\d+\.\d+$/);
      });

      it("should have process.versions object", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = {
            hasNode: typeof process.versions.node === 'string',
            hasV8: typeof process.versions.v8 === 'string'
          };
        `);
        expect(result.exports).toEqual({ hasNode: true, hasV8: true });
      });

      it("should have process.pid", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = typeof process.pid === 'number' && process.pid > 0;
        `);
        expect(result.exports).toBe(true);
      });

      it("should have process.argv", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = Array.isArray(process.argv) && process.argv.length >= 2;
        `);
        expect(result.exports).toBe(true);
      });

      it("should have process.execPath", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = typeof process.execPath === 'string' && process.execPath.includes('node');
        `);
        expect(result.exports).toBe(true);
      });
    });

    describe("process methods", () => {
      it("should support process.exit() by throwing", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          process.exit(42);
          module.exports = 'should not reach';
        `);
        expect(result.code).toBe(42);
      });

      it("should support process.exitCode", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          process.exitCode = 5;
          module.exports = process.exitCode;
        `);
        expect(result.exports).toBe(5);
        expect(result.code).toBe(5);
      });

      it("should support process.nextTick", async () => {
        proc = new NodeProcess();
        // Test that nextTick exists and is callable
        const result = await proc.run(`
          const hasNextTick = typeof process.nextTick === 'function';
          let callbackCalled = false;
          process.nextTick(() => { callbackCalled = true; });
          // Callback won't have run yet since we're still in sync code
          module.exports = {
            hasNextTick: hasNextTick,
            callbackCalledSync: callbackCalled
          };
        `);
        expect(result.exports).toEqual({
          hasNextTick: true,
          callbackCalledSync: false // Callback runs async via queueMicrotask
        });
      });

      it("should support process.hrtime()", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          const t1 = process.hrtime();
          const isArray = Array.isArray(t1) && t1.length === 2;
          const hasSeconds = typeof t1[0] === 'number';
          const hasNanos = typeof t1[1] === 'number';
          module.exports = { isArray, hasSeconds, hasNanos };
        `);
        expect(result.exports).toEqual({ isArray: true, hasSeconds: true, hasNanos: true });
      });

      it("should support process.hrtime.bigint()", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          const t = process.hrtime.bigint();
          // BigInt cannot be serialized to JSON, so check type in sandbox
          module.exports = typeof t === 'bigint';
        `);
        expect(result.exports).toBe(true);
      });

      it("should support process.getuid() and process.getgid()", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = {
            uid: process.getuid(),
            gid: process.getgid()
          };
        `);
        expect(result.exports).toEqual({ uid: 0, gid: 0 });
      });

      it("should support process.uptime()", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          const t = process.uptime();
          module.exports = typeof t === 'number' && t >= 0;
        `);
        expect(result.exports).toBe(true);
      });

      it("should support process.memoryUsage()", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          const mem = process.memoryUsage();
          module.exports = {
            hasRss: typeof mem.rss === 'number',
            hasHeapTotal: typeof mem.heapTotal === 'number',
            hasHeapUsed: typeof mem.heapUsed === 'number'
          };
        `);
        expect(result.exports).toEqual({ hasRss: true, hasHeapTotal: true, hasHeapUsed: true });
      });
    });
  });

  describe("Phase 2: Process as EventEmitter", () => {
    describe("process events", () => {
      it("should support process.on and process.emit", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          let received = null;
          process.on('custom', (data) => { received = data; });
          process.emit('custom', 'hello');
          module.exports = received;
        `);
        expect(result.exports).toBe("hello");
      });

      it("should support process.once", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          let count = 0;
          process.once('test', () => { count++; });
          process.emit('test');
          process.emit('test');
          module.exports = count;
        `);
        expect(result.exports).toBe(1);
      });

      it("should support process.removeListener", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          let count = 0;
          const handler = () => { count++; };
          process.on('test', handler);
          process.emit('test');
          process.removeListener('test', handler);
          process.emit('test');
          module.exports = count;
        `);
        expect(result.exports).toBe(1);
      });

      it("should support process.off as alias", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = process.off === process.removeListener;
        `);
        expect(result.exports).toBe(true);
      });

      it("should fire exit event on process.exit()", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          let exitFired = false;
          process.on('exit', (code) => {
            exitFired = true;
            console.log('exit:' + code);
          });
          process.exit(0);
        `);
        expect(result.stdout).toContain("exit:0");
      });
    });

    describe("process stdio streams", () => {
      it("should have process.stdout as writable", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          process.stdout.write('hello from stdout');
          module.exports = typeof process.stdout.write === 'function';
        `);
        expect(result.stdout).toContain("hello from stdout");
        expect(result.exports).toBe(true);
      });

      it("should have process.stderr as writable", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          process.stderr.write('hello from stderr');
          module.exports = typeof process.stderr.write === 'function';
        `);
        expect(result.stderr).toContain("hello from stderr");
        expect(result.exports).toBe(true);
      });

      it("should have process.stdin as readable", async () => {
        proc = new NodeProcess();
        const result = await proc.run(`
          module.exports = {
            hasOn: typeof process.stdin.on === 'function',
            hasRead: typeof process.stdin.read === 'function',
            readable: process.stdin.readable !== undefined
          };
        `);
        expect(result.exports).toEqual({
          hasOn: true,
          hasRead: true,
          readable: true
        });
      });
    });
  });
});
