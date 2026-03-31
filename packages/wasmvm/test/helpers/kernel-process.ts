import type { DriverProcess, Kernel } from '@secure-exec/core';

type KernelTestInternals = {
  processTable: {
    allocatePid(): number;
    register(
      pid: number,
      driver: string,
      command: string,
      args: string[],
      ctx: {
        pid: number;
        ppid: number;
        env: Record<string, string>;
        cwd: string;
        fds: { stdin: number; stdout: number; stderr: number };
      },
      driverProcess: DriverProcess,
    ): void;
  };
};

function createMockDriverProcess(): DriverProcess {
  let resolveExit!: (code: number) => void;
  const exitPromise = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  return {
    writeStdin() {},
    closeStdin() {},
    kill(signal) {
      resolveExit(128 + signal);
    },
    wait() {
      return exitPromise;
    },
    onStdout: null,
    onStderr: null,
    onExit: null,
  };
}

export function registerKernelPid(kernel: Kernel, ppid = 0): number {
  const internal = kernel as Kernel & KernelTestInternals;
  const pid = internal.processTable.allocatePid();
  internal.processTable.register(
    pid,
    'test',
    'test',
    [],
    {
      pid,
      ppid,
      env: {},
      cwd: '/',
      fds: { stdin: 0, stdout: 1, stderr: 2 },
    },
    createMockDriverProcess(),
  );
  return pid;
}
