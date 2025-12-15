import { describe, it, expect, afterEach } from "vitest";
import { NodeProcess } from "./index";

describe("NodeProcess", () => {
  let proc: NodeProcess;

  afterEach(() => {
    proc?.dispose();
  });

  describe("Step 1: Basic isolate execution", () => {
    it("should run basic code and return module.exports", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`module.exports = 1 + 1`);
      expect(result).toBe(2);
    });

    it("should return complex objects", async () => {
      proc = new NodeProcess();
      const result = await proc.run<{ foo: string; bar: number }>(
        `module.exports = { foo: "hello", bar: 42 }`
      );
      expect(result).toEqual({ foo: "hello", bar: 42 });
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
      expect(result).toBe("foo/bar");
    });

    it("should require path module with node: prefix", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const path = require("node:path");
        module.exports = path.dirname("/foo/bar/baz.txt");
      `);
      expect(result).toBe("/foo/bar");
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
      expect(result).toBe(true);
    });

    it("should require util module", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const util = require("util");
        module.exports = util.format("hello %s", "world");
      `);
      expect(result).toBe("hello world");
    });

    it("should cache modules", async () => {
      proc = new NodeProcess();
      const result = await proc.run(`
        const path1 = require("path");
        const path2 = require("path");
        module.exports = path1 === path2;
      `);
      expect(result).toBe(true);
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
});
