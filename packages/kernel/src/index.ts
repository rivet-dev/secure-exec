/**
 * @secure-exec/kernel
 *
 * OS kernel providing VFS, FD table, process table, device layer,
 * pipes, command registry, and permissions. All runtimes share the
 * same kernel instance.
 */

// Kernel factory
export { createKernel } from "./kernel.js";

// Types
export type {
	Kernel,
	KernelOptions,
	KernelInterface,
	ExecOptions,
	ExecResult,
	SpawnOptions,
	ManagedProcess,
	RuntimeDriver,
	ProcessContext,
	DriverProcess,
	ProcessEntry,
	ProcessInfo,
	FDStat,
	FileDescription,
	FDEntry,
	Pipe,
	Permissions,
	PermissionDecision,
	PermissionCheck,
	FsAccessRequest,
	NetworkAccessRequest,
	ChildProcessAccessRequest,
	EnvAccessRequest,
	KernelErrorCode,
	Termios,
	TermiosCC,
	OpenShellOptions,
	ShellHandle,
	ConnectTerminalOptions,
} from "./types.js";

// Structured kernel error and termios defaults
export { KernelError, defaultTermios } from "./types.js";

// VFS types
export type {
	VirtualFileSystem,
	VirtualDirEntry,
	VirtualStat,
} from "./vfs.js";

// Kernel components (for direct use / testing)
export { FDTableManager, ProcessFDTable } from "./fd-table.js";
export { ProcessTable } from "./process-table.js";
export { createDeviceLayer } from "./device-layer.js";
export { PipeManager } from "./pipe-manager.js";
export { PtyManager } from "./pty.js";
export type { LineDisciplineConfig } from "./pty.js";
export { CommandRegistry } from "./command-registry.js";
export { FileLockManager, LOCK_SH, LOCK_EX, LOCK_UN, LOCK_NB } from "./file-lock.js";
export { UserManager } from "./user.js";
export type { UserConfig } from "./user.js";

// Permissions
export {
	wrapFileSystem,
	filterEnv,
	checkChildProcess,
	allowAll,
	allowAllFs,
	allowAllNetwork,
	allowAllChildProcess,
	allowAllEnv,
} from "./permissions.js";

// Constants
export {
	O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND, O_CLOEXEC,
	F_DUPFD, F_GETFD, F_SETFD, F_GETFL, F_DUPFD_CLOEXEC, FD_CLOEXEC,
	SEEK_SET, SEEK_CUR, SEEK_END,
	FILETYPE_UNKNOWN, FILETYPE_CHARACTER_DEVICE, FILETYPE_DIRECTORY,
	FILETYPE_REGULAR_FILE, FILETYPE_SYMBOLIC_LINK, FILETYPE_PIPE,
	SIGHUP, SIGINT, SIGQUIT, SIGKILL, SIGPIPE, SIGALRM, SIGTERM, SIGCHLD, SIGCONT, SIGSTOP, SIGTSTP, SIGWINCH,
	WNOHANG,
} from "./types.js";

// POSIX wstatus encoding/decoding
export {
	encodeExitStatus, encodeSignalStatus,
	WIFEXITED, WEXITSTATUS, WIFSIGNALED, WTERMSIG,
} from "./wstatus.js";
