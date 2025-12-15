import { init, Wasmer, Directory } from "@wasmer/sdk/node";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { NodeProcess, RunResult } from "../node-process/index.js";
import { SystemBridge } from "../system-bridge/index.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface InteractiveSession {
  /** The running WASM instance - use stdin/stdout/stderr for streaming */
  instance: Awaited<ReturnType<Awaited<ReturnType<typeof Wasmer.fromFile>>["commands"][string]["run"]>>;
  /** Wait for the command to complete and get exit code */
  wait(): Promise<number>;
  /** Stop the IPC poller (call when done) */
  stop(): void;
}

export interface WasixInstanceOptions {
  directory?: Directory;
  systemBridge?: SystemBridge;
  nodeProcess?: NodeProcess;
  memoryLimit?: number; // MB - reserved for future WASM memory limiting
}

const POLL_INTERVAL_MS = 20;

let wasmerInitialized = false;
let wasixRuntime: Awaited<ReturnType<typeof Wasmer.fromFile>> | null = null;

export class WasixInstance {
  private directory: Directory;
  private systemBridge?: SystemBridge;
  private nodeProcess?: NodeProcess;
  private memoryLimit?: number;
  private initialized = false;

  constructor(options: WasixInstanceOptions = {}) {
    this.directory = options.directory ?? new Directory();
    this.systemBridge = options.systemBridge;
    this.nodeProcess = options.nodeProcess;
    this.memoryLimit = options.memoryLimit;
  }

  /**
   * Initialize the WASIX instance
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!wasmerInitialized) {
      await init();
      wasmerInitialized = true;
    }

    // Load runtime package (includes bash + node-shim for IPC)
    if (!wasixRuntime) {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const webcPath = path.resolve(currentDir, "../../assets/runtime.webc");
      const webcBytes = await fs.readFile(webcPath);
      wasixRuntime = await Wasmer.fromFile(webcBytes);
    }

    this.initialized = true;
  }

  /**
   * Get the underlying Directory instance
   */
  getDirectory(): Directory {
    return this.directory;
  }

  /**
   * Execute a shell command string
   * @param commandString - Shell command to execute (e.g., "echo hello")
   */
  async exec(commandString: string): Promise<ExecResult> {
    await this.init();

    if (!wasixRuntime) {
      throw new Error("WASIX not properly initialized");
    }

    // Use bash -c to execute the command string
    const bashCmd = wasixRuntime.commands["bash"];
    if (!bashCmd) {
      // Fallback to sh if bash isn't available
      const shCmd = wasixRuntime.commands["sh"];
      if (!shCmd) {
        throw new Error("No shell command (bash or sh) available");
      }
      return this.runCommand(shCmd, ["-c", commandString]);
    }

    return this.runCommand(bashCmd, ["-c", commandString]);
  }

  /**
   * Run a specific command with arguments
   * @param commandName - Name of the command (e.g., "ls", "cat")
   * @param args - Arguments for the command
   */
  async run(commandName: string, args: string[] = []): Promise<ExecResult> {
    await this.init();

    if (!wasixRuntime) {
      throw new Error("WASIX not properly initialized");
    }

    const cmd = wasixRuntime.commands[commandName];
    if (!cmd) {
      // Try to run via bash
      const bashCmd = wasixRuntime.commands["bash"];
      if (bashCmd) {
        const fullCmd = [commandName, ...args].join(" ");
        return this.runCommand(bashCmd, ["-c", fullCmd]);
      }
      throw new Error(`Command not found: ${commandName}`);
    }

    return this.runCommand(cmd, args);
  }

  /**
   * Internal method to run a command
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async runCommand(cmd: any, args: string[]): Promise<ExecResult> {
    try {
      const instance = await cmd.run({
        args,
        mount: { "/": this.directory },
      });

      const result = await instance.wait();

      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        code: result.code ?? 0,
      };
    } catch (err) {
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        code: 1,
      };
    }
  }

  /**
   * Run a command with IPC polling for node shim support
   * This allows bash scripts to call `node` which triggers IPC to NodeProcess
   */
  async runWithIpc(
    commandName: string,
    args: string[] = []
  ): Promise<ExecResult> {
    await this.init();

    if (!wasixRuntime) {
      throw new Error("WASIX not properly initialized");
    }

    // Create IPC directory
    const ipcDir = new Directory();

    // Get command
    const cmd = wasixRuntime.commands[commandName];
    if (!cmd) {
      throw new Error(`Command not found: ${commandName}`);
    }

    // Start IPC polling loop
    let pollActive = true;

    const poller = (async () => {
      while (pollActive) {

        try {
          // Check for request file
          const requestContent = await ipcDir.readTextFile("/request.txt");

          // Parse request (all lines are node args)
          let nodeArgs = requestContent.trim().split("\n").filter(Boolean);

          // Handle --ipc-script: read script from /ipc/script.js
          const ipcScriptIdx = nodeArgs.indexOf("--ipc-script");
          if (ipcScriptIdx !== -1) {
            const scriptContent = await ipcDir.readTextFile("/script.js");
            nodeArgs = ["-e", scriptContent];
          }

          // Execute node via NodeProcess or real node
          let nodeResult: { exitCode: number; stdout: string; stderr: string };

          if (this.nodeProcess) {
            // Use isolated-vm NodeProcess
            const result = await this.executeNodeViaProcess(nodeArgs);
            nodeResult = result;
          } else {
            // Fallback to spawning real node (for testing)
            nodeResult = await this.executeNodeViaSpawn(nodeArgs);
          }

          // Write response
          const responseContent = `${nodeResult.exitCode}\n${nodeResult.stdout}`;
          ipcDir.writeFile("/response.txt", responseContent);

          // Clear request for next iteration
          try {
            await ipcDir.removeFile("/request.txt");
            await ipcDir.removeFile("/script.js");
          } catch {
            // Ignore
          }
        } catch {
          // Request not found yet, continue polling
          await sleep(POLL_INTERVAL_MS);
        }
      }
    })();

    try {
      // Run the command with IPC directory mounted
      const instance = await cmd.run({
        args,
        mount: {
          "/": this.directory,
          "/ipc": ipcDir,
        },
      });

      const result = await instance.wait();

      pollActive = false;
      await poller;

      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        code: result.code ?? 0,
      };
    } catch (err) {
      pollActive = false;
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        code: 1,
      };
    }
  }

  /**
   * Run an interactive command with streaming I/O
   * Returns the instance for stream access plus IPC polling for node support
   */
  async runInteractive(
    commandName: string,
    args: string[] = []
  ): Promise<InteractiveSession> {
    await this.init();

    if (!wasixRuntime) {
      throw new Error("WASIX not properly initialized");
    }

    // Create IPC directory for node execution support
    const ipcDir = new Directory();

    // Get command
    const cmd = wasixRuntime.commands[commandName];
    if (!cmd) {
      throw new Error(`Command not found: ${commandName}`);
    }

    // Start IPC polling loop
    let pollActive = true;

    const poller = (async () => {
      while (pollActive) {
        try {
          const requestContent = await ipcDir.readTextFile("/request.txt");
          let nodeArgs = requestContent.trim().split("\n").filter(Boolean);

          // Handle --ipc-script: read script from /ipc/script.js
          const ipcScriptIdx = nodeArgs.indexOf("--ipc-script");
          if (ipcScriptIdx !== -1) {
            const scriptContent = await ipcDir.readTextFile("/script.js");
            // Replace --ipc-script with -e and the script content
            nodeArgs = ["-e", scriptContent];
          }

          let nodeResult: { exitCode: number; stdout: string; stderr: string };

          if (this.nodeProcess) {
            nodeResult = await this.executeNodeViaProcess(nodeArgs);
          } else {
            nodeResult = await this.executeNodeViaSpawn(nodeArgs);
          }

          const responseContent = `${nodeResult.exitCode}\n${nodeResult.stdout}`;
          ipcDir.writeFile("/response.txt", responseContent);

          try {
            await ipcDir.removeFile("/request.txt");
            await ipcDir.removeFile("/script.js");
          } catch {
            // Ignore
          }
        } catch {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    })();

    // Run the command with IPC directory mounted
    const instance = await cmd.run({
      args,
      mount: {
        "/": this.directory,
        "/ipc": ipcDir,
      },
    });

    return {
      instance,
      async wait(): Promise<number> {
        const result = await instance.wait();
        pollActive = false;
        await poller;
        return result.code ?? 0;
      },
      stop(): void {
        pollActive = false;
      },
    };
  }

  /**
   * Execute node code via NodeProcess (isolated-vm)
   */
  private async executeNodeViaProcess(
    args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (!this.nodeProcess || !this.systemBridge) {
      throw new Error("NodeProcess or SystemBridge not configured");
    }

    // Parse args to get the code to run
    // Common patterns: node -e "code" or node script.js
    let code = "";

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-e" || args[i] === "--eval") {
        code = args[i + 1] || "";
        break;
      } else if (!args[i].startsWith("-")) {
        // It's a script file path
        const scriptPath = args[i];
        try {
          code = await this.systemBridge.readFile(scriptPath);
        } catch {
          return {
            exitCode: 1,
            stdout: "",
            stderr: `Cannot find module '${scriptPath}'`,
          };
        }
        break;
      }
    }

    if (!code) {
      return { exitCode: 0, stdout: "", stderr: "" };
    }

    const result = await this.nodeProcess.exec(code);
    return {
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Execute node by spawning real node process (fallback)
   */
  private async executeNodeViaSpawn(
    args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const { spawn } = await import("child_process");

    return new Promise((resolve) => {
      const proc = spawn("node", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });

      proc.on("error", (err) => {
        resolve({
          exitCode: 1,
          stdout: "",
          stderr: err.message,
        });
      });
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { Directory };
