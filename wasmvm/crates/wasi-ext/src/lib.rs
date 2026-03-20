//! Custom WASM import bindings for wasmVM host syscalls.
//!
//! Declares extern functions for `host_process` and `host_user` modules
//! that the JS host runtime provides. These extend standard WASI with
//! process management and user/group identity capabilities.
//!
//! Signatures match spec section 4.3.

#![no_std]

/// WASI-style errno type. 0 = success.
pub type Errno = u32;

// WASI errno constants
pub const ERRNO_SUCCESS: Errno = 0;
pub const ERRNO_BADF: Errno = 8;
pub const ERRNO_INVAL: Errno = 28;
pub const ERRNO_NOSYS: Errno = 52;
pub const ERRNO_NOENT: Errno = 44;
pub const ERRNO_SRCH: Errno = 71; // No such process
pub const ERRNO_CHILD: Errno = 10; // No child processes

// ============================================================
// host_process module — process management and FD operations
// ============================================================

#[link(wasm_import_module = "host_process")]
extern "C" {
    /// Spawn a child process.
    ///
    /// Arguments are serialized as a byte buffer pointed to by `argv_ptr`/`argv_len`.
    /// Environment is serialized similarly via `envp_ptr`/`envp_len`.
    /// File descriptors `stdin_fd`, `stdout_fd`, `stderr_fd` are inherited.
    /// Current working directory is passed as `cwd_ptr`/`cwd_len`.
    /// On success, the child's virtual PID is written to `ret_pid`.
    /// Returns errno.
    fn proc_spawn(
        argv_ptr: *const u8,
        argv_len: u32,
        envp_ptr: *const u8,
        envp_len: u32,
        stdin_fd: u32,
        stdout_fd: u32,
        stderr_fd: u32,
        cwd_ptr: *const u8,
        cwd_len: u32,
        ret_pid: *mut u32,
    ) -> Errno;

    /// Wait for a child process to exit.
    ///
    /// Blocks (via Atomics.wait on the host side) until the child exits.
    /// `options` is reserved (pass 0). Exit status is written to `ret_status`.
    /// The actual waited-for PID is written to `ret_pid` (important for pid=-1).
    /// Returns errno.
    fn proc_waitpid(pid: u32, options: u32, ret_status: *mut u32, ret_pid: *mut u32) -> Errno;

    /// Send a signal to a process.
    ///
    /// Only SIGTERM (15) and SIGKILL (9) are meaningful.
    /// Returns errno.
    fn proc_kill(pid: u32, signal: u32) -> Errno;

    /// Get the current process's virtual PID.
    ///
    /// Writes PID to `ret_pid`. Returns errno.
    fn proc_getpid(ret_pid: *mut u32) -> Errno;

    /// Get the parent process's virtual PID.
    ///
    /// Writes parent PID to `ret_pid`. Returns errno.
    fn proc_getppid(ret_pid: *mut u32) -> Errno;

    /// Create an anonymous pipe.
    ///
    /// Writes the read-end FD to `ret_read_fd` and write-end FD to `ret_write_fd`.
    /// Returns errno.
    fn fd_pipe(ret_read_fd: *mut u32, ret_write_fd: *mut u32) -> Errno;

    /// Duplicate a file descriptor.
    ///
    /// The new FD number is written to `ret_new_fd`. Returns errno.
    fn fd_dup(fd: u32, ret_new_fd: *mut u32) -> Errno;

    /// Duplicate a file descriptor to a specific number.
    ///
    /// `old_fd` is duplicated to `new_fd`. If `new_fd` is already open, it is closed first.
    /// Returns errno.
    fn fd_dup2(old_fd: u32, new_fd: u32) -> Errno;

    /// Sleep for the specified number of milliseconds.
    ///
    /// Blocks via Atomics.wait on the host side. Returns errno.
    fn sleep_ms(milliseconds: u32) -> Errno;
}

// ============================================================
// host_user module — user/group identity and terminal detection
// ============================================================

#[link(wasm_import_module = "host_user")]
extern "C" {
    /// Get the real user ID. Writes to `ret_uid`. Returns errno.
    fn getuid(ret_uid: *mut u32) -> Errno;

    /// Get the real group ID. Writes to `ret_gid`. Returns errno.
    fn getgid(ret_gid: *mut u32) -> Errno;

    /// Get the effective user ID. Writes to `ret_uid`. Returns errno.
    fn geteuid(ret_uid: *mut u32) -> Errno;

    /// Get the effective group ID. Writes to `ret_gid`. Returns errno.
    fn getegid(ret_gid: *mut u32) -> Errno;

    /// Check if a file descriptor refers to a terminal.
    ///
    /// Writes 1 (true) or 0 (false) to `ret_bool`. Returns errno.
    fn isatty(fd: u32, ret_bool: *mut u32) -> Errno;

    /// Get passwd entry for a user ID.
    ///
    /// Serialized passwd string (username:x:uid:gid:gecos:home:shell) is written
    /// to `buf_ptr` with max length `buf_len`. Actual length written to `ret_len`.
    /// Returns errno.
    fn getpwuid(uid: u32, buf_ptr: *mut u8, buf_len: u32, ret_len: *mut u32) -> Errno;
}

// ============================================================
// Safe Rust wrappers — host_process
// ============================================================

/// Spawn a child process with the given arguments, environment, stdio FDs, and working directory.
///
/// Returns `Ok(pid)` on success, `Err(errno)` on failure.
pub fn spawn(
    argv: &[u8],
    envp: &[u8],
    stdin_fd: u32,
    stdout_fd: u32,
    stderr_fd: u32,
    cwd: &[u8],
) -> Result<u32, Errno> {
    let mut pid: u32 = 0;
    let errno = unsafe {
        proc_spawn(
            argv.as_ptr(),
            argv.len() as u32,
            envp.as_ptr(),
            envp.len() as u32,
            stdin_fd,
            stdout_fd,
            stderr_fd,
            cwd.as_ptr(),
            cwd.len() as u32,
            &mut pid,
        )
    };
    if errno == ERRNO_SUCCESS {
        Ok(pid)
    } else {
        Err(errno)
    }
}

/// Wait for a child process to exit.
///
/// Returns `Ok((exit_status, actual_pid))` on success, `Err(errno)` on failure.
/// The actual_pid is the PID of the child that exited (relevant for pid=0xFFFFFFFF / -1).
pub fn waitpid(pid: u32, options: u32) -> Result<(u32, u32), Errno> {
    let mut status: u32 = 0;
    let mut actual_pid: u32 = 0;
    let errno = unsafe { proc_waitpid(pid, options, &mut status, &mut actual_pid) };
    if errno == ERRNO_SUCCESS {
        Ok((status, actual_pid))
    } else {
        Err(errno)
    }
}

/// Send a signal to a process.
///
/// Returns `Ok(())` on success, `Err(errno)` on failure.
pub fn kill(pid: u32, signal: u32) -> Result<(), Errno> {
    let errno = unsafe { proc_kill(pid, signal) };
    if errno == ERRNO_SUCCESS {
        Ok(())
    } else {
        Err(errno)
    }
}

/// Get the current process's virtual PID.
///
/// Returns `Ok(pid)` on success, `Err(errno)` on failure.
pub fn getpid() -> Result<u32, Errno> {
    let mut pid: u32 = 0;
    let errno = unsafe { proc_getpid(&mut pid) };
    if errno == ERRNO_SUCCESS {
        Ok(pid)
    } else {
        Err(errno)
    }
}

/// Get the parent process's virtual PID.
///
/// Returns `Ok(pid)` on success, `Err(errno)` on failure.
pub fn getppid() -> Result<u32, Errno> {
    let mut pid: u32 = 0;
    let errno = unsafe { proc_getppid(&mut pid) };
    if errno == ERRNO_SUCCESS {
        Ok(pid)
    } else {
        Err(errno)
    }
}

/// Create an anonymous pipe.
///
/// Returns `Ok((read_fd, write_fd))` on success, `Err(errno)` on failure.
pub fn pipe() -> Result<(u32, u32), Errno> {
    let mut read_fd: u32 = 0;
    let mut write_fd: u32 = 0;
    let errno = unsafe { fd_pipe(&mut read_fd, &mut write_fd) };
    if errno == ERRNO_SUCCESS {
        Ok((read_fd, write_fd))
    } else {
        Err(errno)
    }
}

/// Duplicate a file descriptor.
///
/// Returns `Ok(new_fd)` on success, `Err(errno)` on failure.
pub fn dup(fd: u32) -> Result<u32, Errno> {
    let mut new_fd: u32 = 0;
    let errno = unsafe { fd_dup(fd, &mut new_fd) };
    if errno == ERRNO_SUCCESS {
        Ok(new_fd)
    } else {
        Err(errno)
    }
}

/// Duplicate a file descriptor to a specific number.
///
/// Returns `Ok(())` on success, `Err(errno)` on failure.
pub fn dup2(old_fd: u32, new_fd: u32) -> Result<(), Errno> {
    let errno = unsafe { fd_dup2(old_fd, new_fd) };
    if errno == ERRNO_SUCCESS {
        Ok(())
    } else {
        Err(errno)
    }
}

/// Sleep for the specified number of milliseconds.
///
/// Blocks via Atomics.wait on the host side instead of busy-waiting.
/// Returns `Ok(())` on success, `Err(errno)` on failure.
pub fn host_sleep_ms(milliseconds: u32) -> Result<(), Errno> {
    let errno = unsafe { sleep_ms(milliseconds) };
    if errno == ERRNO_SUCCESS {
        Ok(())
    } else {
        Err(errno)
    }
}

// ============================================================
// Safe Rust wrappers — host_user
// ============================================================

/// Get the real user ID.
///
/// Returns `Ok(uid)` on success, `Err(errno)` on failure.
pub fn get_uid() -> Result<u32, Errno> {
    let mut uid: u32 = 0;
    let errno = unsafe { getuid(&mut uid) };
    if errno == ERRNO_SUCCESS {
        Ok(uid)
    } else {
        Err(errno)
    }
}

/// Get the real group ID.
///
/// Returns `Ok(gid)` on success, `Err(errno)` on failure.
pub fn get_gid() -> Result<u32, Errno> {
    let mut gid: u32 = 0;
    let errno = unsafe { getgid(&mut gid) };
    if errno == ERRNO_SUCCESS {
        Ok(gid)
    } else {
        Err(errno)
    }
}

/// Get the effective user ID.
///
/// Returns `Ok(uid)` on success, `Err(errno)` on failure.
pub fn get_euid() -> Result<u32, Errno> {
    let mut uid: u32 = 0;
    let errno = unsafe { geteuid(&mut uid) };
    if errno == ERRNO_SUCCESS {
        Ok(uid)
    } else {
        Err(errno)
    }
}

/// Get the effective group ID.
///
/// Returns `Ok(gid)` on success, `Err(errno)` on failure.
pub fn get_egid() -> Result<u32, Errno> {
    let mut gid: u32 = 0;
    let errno = unsafe { getegid(&mut gid) };
    if errno == ERRNO_SUCCESS {
        Ok(gid)
    } else {
        Err(errno)
    }
}

/// Check if a file descriptor is a terminal.
///
/// Returns `Ok(true)` if it's a terminal, `Ok(false)` otherwise, `Err(errno)` on failure.
pub fn is_atty(fd: u32) -> Result<bool, Errno> {
    let mut result: u32 = 0;
    let errno = unsafe { isatty(fd, &mut result) };
    if errno == ERRNO_SUCCESS {
        Ok(result != 0)
    } else {
        Err(errno)
    }
}

/// Get the passwd entry for a user ID.
///
/// Writes the serialized passwd entry into `buf` and returns the number of bytes written.
/// Returns `Ok(len)` on success, `Err(errno)` on failure.
pub fn get_pwuid(uid: u32, buf: &mut [u8]) -> Result<u32, Errno> {
    let mut len: u32 = 0;
    let errno = unsafe { getpwuid(uid, buf.as_mut_ptr(), buf.len() as u32, &mut len) };
    if errno == ERRNO_SUCCESS {
        Ok(len)
    } else {
        Err(errno)
    }
}
