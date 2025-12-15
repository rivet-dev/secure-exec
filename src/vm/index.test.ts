import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VirtualMachine } from "./index";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("VirtualMachine", () => {
  describe("Step 4: Basic filesystem", () => {
    it("should write and read files", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.writeFile("/foo.txt", "bar");
      expect(await vm.readFile("/foo.txt")).toBe("bar");
    });

    it("should write and read binary files", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      vm.writeFile("/binary.bin", data);

      const result = await vm.readFileBinary("/binary.bin");
      expect(result).toEqual(data);
    });

    it("should check if files exist", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.writeFile("/exists.txt", "yes");

      expect(await vm.exists("/exists.txt")).toBe(true);
      expect(await vm.exists("/notexists.txt")).toBe(false);
    });

    it("should list directory contents", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.mkdir("/mydir");
      vm.writeFile("/mydir/a.txt", "a");
      vm.writeFile("/mydir/b.txt", "b");

      const entries = await vm.readDir("/mydir");
      expect(entries).toContain("a.txt");
      expect(entries).toContain("b.txt");
    });

    it("should remove files", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      vm.writeFile("/remove.txt", "delete me");
      expect(await vm.exists("/remove.txt")).toBe(true);

      await vm.remove("/remove.txt");
      expect(await vm.exists("/remove.txt")).toBe(false);
    });

    it("should expose underlying SystemBridge and Directory", async () => {
      const vm = new VirtualMachine();
      await vm.init();

      expect(vm.getSystemBridge()).toBeDefined();
      expect(vm.getDirectory()).toBeDefined();
    });

    it("should initialize only once", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.init(); // Should not throw

      vm.writeFile("/test.txt", "ok");
      expect(await vm.readFile("/test.txt")).toBe("ok");
    });
  });

  describe("Step 5: Host filesystem loading", () => {
    let tempDir: string;

    beforeAll(async () => {
      // Create a temp directory with some test files
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vm-test-"));
      await fs.writeFile(path.join(tempDir, "hello.txt"), "Hello World");
      await fs.mkdir(path.join(tempDir, "subdir"));
      await fs.writeFile(path.join(tempDir, "subdir", "nested.txt"), "Nested content");
      await fs.mkdir(path.join(tempDir, "node_modules"));
      await fs.writeFile(
        path.join(tempDir, "node_modules", "package.json"),
        '{"name": "test-pkg"}'
      );
    });

    afterAll(async () => {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("should load files from host directory", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.loadFromHost(tempDir);

      expect(await vm.readFile("/hello.txt")).toBe("Hello World");
    });

    it("should load nested directories", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.loadFromHost(tempDir);

      expect(await vm.readFile("/subdir/nested.txt")).toBe("Nested content");
    });

    it("should load node_modules directory", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.loadFromHost(tempDir);

      const pkgJson = await vm.readFile("/node_modules/package.json");
      expect(pkgJson).toContain("test-pkg");
    });

    it("should list loaded directories", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.loadFromHost(tempDir);

      const entries = await vm.readDir("/");
      expect(entries).toContain("hello.txt");
      expect(entries).toContain("subdir");
      expect(entries).toContain("node_modules");
    });

    it("should load to custom virtual base path", async () => {
      const vm = new VirtualMachine();
      await vm.init();
      await vm.loadFromHost(tempDir, "/project");

      expect(await vm.readFile("/project/hello.txt")).toBe("Hello World");
    });
  });
});
