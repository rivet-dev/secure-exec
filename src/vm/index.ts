import { init, Directory } from "@wasmer/sdk/node";
import { SystemBridge } from "../system-bridge/index.js";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface VirtualMachineOptions {
  memoryLimit?: number; // MB, default 128 for isolates
}

let wasmerInitialized = false;

export class VirtualMachine {
  private bridge: SystemBridge | null = null;
  private options: VirtualMachineOptions;
  private initialized = false;

  constructor(options: VirtualMachineOptions = {}) {
    this.options = options;
  }

  /**
   * Initialize the VM (ensures wasmer is initialized)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!wasmerInitialized) {
      await init();
      wasmerInitialized = true;
    }

    // Create SystemBridge after wasmer is initialized
    this.bridge = new SystemBridge();
    this.initialized = true;
  }

  /**
   * Ensure VM is initialized (throws if not)
   */
  private ensureInitialized(): SystemBridge {
    if (!this.bridge) {
      throw new Error("VirtualMachine not initialized. Call init() first.");
    }
    return this.bridge;
  }

  /**
   * Get the underlying SystemBridge
   */
  getSystemBridge(): SystemBridge {
    return this.ensureInitialized();
  }

  /**
   * Get the underlying Directory instance
   */
  getDirectory(): Directory {
    return this.ensureInitialized().getDirectory();
  }

  /**
   * Write a file to the virtual filesystem
   */
  writeFile(path: string, content: string | Uint8Array): void {
    this.ensureInitialized().writeFile(path, content);
  }

  /**
   * Read a file from the virtual filesystem
   */
  async readFile(path: string): Promise<string> {
    return this.ensureInitialized().readFile(path);
  }

  /**
   * Read a file as binary
   */
  async readFileBinary(path: string): Promise<Uint8Array> {
    return this.ensureInitialized().readFileBinary(path);
  }

  /**
   * Check if a path exists
   */
  async exists(path: string): Promise<boolean> {
    return this.ensureInitialized().exists(path);
  }

  /**
   * Read directory contents
   */
  async readDir(path: string): Promise<string[]> {
    return this.ensureInitialized().readDir(path);
  }

  /**
   * Create a directory
   */
  mkdir(path: string): void {
    this.ensureInitialized().mkdir(path);
  }

  /**
   * Remove a file
   */
  async remove(path: string): Promise<void> {
    return this.ensureInitialized().remove(path);
  }

  /**
   * Load files from host filesystem into the virtual filesystem
   * This recursively copies all files from the host path into the virtual fs
   * @param hostPath - Path on the host filesystem to copy from
   * @param virtualBasePath - Where to mount in virtual fs (default "/")
   */
  async loadFromHost(
    hostPath: string,
    virtualBasePath: string = "/"
  ): Promise<void> {
    const { loadHostDirectory } = await import("./host-loader.js");
    const bridge = this.ensureInitialized();
    await loadHostDirectory(hostPath, virtualBasePath, bridge);
  }

  /**
   * Spawn a command in the virtual machine
   * Routes to appropriate runtime (node -> NodeProcess, linux -> WasixInstance)
   */
  async spawn(command: string, args: string[] = []): Promise<SpawnResult> {
    // This will be implemented in Step 9
    throw new Error("spawn not yet implemented");
  }
}
