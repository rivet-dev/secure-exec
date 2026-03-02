import { Bash, InMemoryFs, type IFileSystem } from "just-bash";
import {
  allowAll,
  NodeRuntime,
  createNodeDriver,
  createNodeExecutionFactory,
  type CommandExecutor,
  type SpawnedProcess,
  type VirtualFileSystem,
} from "secure-exec";

function createVirtualFs(fs: IFileSystem): VirtualFileSystem {
  return {
    readFile: (path: string) => fs.readFileBuffer(path),
    readTextFile: (path: string) => fs.readFile(path),
    readDir: (path: string) => fs.readdir(path),
    writeFile: (path: string, content: string | Uint8Array) =>
      fs.writeFile(path, content),
    createDir: (path: string) => fs.mkdir(path, { recursive: false }),
    mkdir: (path: string) => fs.mkdir(path, { recursive: true }),
    exists: (path: string) => fs.exists(path),
    removeFile: (path: string) => fs.rm(path, { force: false, recursive: false }),
    removeDir: (path: string) => fs.rm(path, { force: false, recursive: false }),
  };
}

class JustBashCommandExecutor implements CommandExecutor {
  private bash: Bash;

  constructor(bash: Bash) {
    this.bash = bash;
  }

  spawn(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      onStdout?: (data: Uint8Array) => void;
      onStderr?: (data: Uint8Array) => void;
    },
  ): SpawnedProcess {
    const fullCommand = [command, ...args].join(" ");
    const encoder = new TextEncoder();

    let exitPromise: Promise<number>;
    let stdout = "";
    let stderr = "";

    exitPromise = this.bash
      .exec(fullCommand, {
        cwd: options.cwd,
        env: options.env,
      })
      .then((result: { stdout?: string; stderr?: string; exitCode?: number; code?: number }) => {
        stdout = result.stdout ?? "";
        stderr = result.stderr ?? "";
        const code = result.exitCode ?? result.code ?? 0;
        if (stdout && options.onStdout) {
          options.onStdout(encoder.encode(stdout));
        }
        if (stderr && options.onStderr) {
          options.onStderr(encoder.encode(stderr));
        }
        return code;
      });

    return {
      writeStdin: () => {
        // just-bash exec is non-streaming; stdin isn't supported in this example
      },
      closeStdin: () => {
        // no-op
      },
      kill: () => {
        // no-op
      },
      wait: async () => exitPromise,
    };
  }
}

async function main(): Promise<void> {
  const bashFs = new InMemoryFs();
  const bash = new Bash({ fs: bashFs });

  const virtualFs = createVirtualFs(bashFs);
  const commandExecutor = new JustBashCommandExecutor(bash);
  const driver = createNodeDriver({
    filesystem: virtualFs,
    commandExecutor,
    permissions: allowAll,
  });

  const proc = new NodeRuntime({
    driver,
    executionFactory: createNodeExecutionFactory(),
  });
  const result = await proc.exec(`
    const { execSync } = require('child_process');
    const output = execSync('echo hello from bash');
    console.log(output.toString());
  `);

  console.log(result.stdout);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
