use std::collections::HashMap;
use std::env;
use std::io::{self, Read, Write};
use std::process::{exit, Child, Command, Stdio};

// Syscall imports for host_exec
#[link(wasm_import_module = "wasix_32v1")]
extern "C" {
    fn host_exec_start(
        request_ptr: *const u8,
        request_len: usize,
        session_ptr: *mut u64,
    ) -> i32;

    fn host_exec_write(
        session: u64,
        data_ptr: *const u8,
        data_len: usize,
    ) -> i32;

    fn host_exec_close_stdin(session: u64) -> i32;

    // Non-blocking read - returns EAGAIN (6) if no data
    fn host_exec_try_read(
        session: u64,
        type_ptr: *mut u32,
        data_ptr: *mut u8,
        data_len_ptr: *mut usize,
    ) -> i32;

    // Poll for data availability (non-blocking)
    fn host_exec_poll(
        session: u64,
        ready_ptr: *mut u32,
    ) -> i32;

    // Send child process output back to host
    fn host_exec_child_output(
        session: u64,
        child_id: u64,
        msg_type: u32,
        data_ptr: *const u8,
        data_len: usize,
    ) -> i32;
}

// WASI poll_oneoff - multiplexed I/O
#[link(wasm_import_module = "wasi_snapshot_preview1")]
extern "C" {
    fn poll_oneoff(
        in_ptr: *const Subscription,
        out_ptr: *mut Event,
        nsubscriptions: u32,
        nevents_ptr: *mut u32,
    ) -> i32;
}

// WASI types for poll_oneoff
#[repr(C)]
#[derive(Clone, Copy)]
struct Subscription {
    userdata: u64,
    u: SubscriptionU,
}

#[repr(C)]
#[derive(Clone, Copy)]
union SubscriptionU {
    clock: SubscriptionClock,
    fd_read: SubscriptionFdReadwrite,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SubscriptionClock {
    tag: u8,           // 0 for clock
    _pad: [u8; 7],
    id: u32,           // clock id (0 = realtime, 1 = monotonic)
    _pad2: [u8; 4],
    timeout: u64,      // timeout in nanoseconds
    precision: u64,    // precision
    flags: u16,        // 0 = relative, 1 = absolute
    _pad3: [u8; 6],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SubscriptionFdReadwrite {
    tag: u8,           // 1 for fd_read, 2 for fd_write
    _pad: [u8; 3],
    fd: u32,           // file descriptor
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Event {
    userdata: u64,
    error: u16,
    event_type: u8,
    _pad: [u8; 5],
    fd_readwrite: EventFdReadwrite,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct EventFdReadwrite {
    nbytes: u64,
    flags: u16,
    _pad: [u8; 6],
}

// Message type constants - Host to WASM (stdout/stderr/exit from Node.js)
const HOST_EXEC_STDOUT: u32 = 1;
const HOST_EXEC_STDERR: u32 = 2;
const HOST_EXEC_EXIT: u32 = 3;

// Message type constants - Node to WASM (child process requests)
const MSG_TYPE_SPAWN_REQUEST: u32 = 10;
const MSG_TYPE_SPAWN_STDIN: u32 = 11;
const MSG_TYPE_SPAWN_CLOSE_STDIN: u32 = 12;
const MSG_TYPE_SPAWN_KILL: u32 = 13;

// Message type constants - WASM to Node (child process output)
const MSG_TYPE_CHILD_STDOUT: u32 = 20;
const MSG_TYPE_CHILD_STDERR: u32 = 21;
const MSG_TYPE_CHILD_EXIT: u32 = 22;

// WASI errno
const ERRNO_AGAIN: i32 = 6;  // EAGAIN - try again

#[derive(serde::Serialize)]
struct Request {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: String,
}

#[derive(serde::Deserialize)]
struct SpawnRequest {
    child_id: u64,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: String,
}

/// Information about a running child process (spawned natively in WASIX)
struct ChildProcess {
    child: Child,
    parent_session: u64, // Session to send output back to
}

fn main() {
    // Debug: very first thing - flush to ensure output is visible
    use std::io::Write;
    eprintln!("[wasix-shim] MAIN ENTRY");
    let _ = io::stderr().flush();

    let args: Vec<String> = env::args().collect();
    let command = env::var("HOST_EXEC_COMMAND").unwrap_or_else(|_| "node".to_string());

    eprintln!("[wasix-shim] Starting with command: {} args: {:?}", command, &args[1..]);
    let _ = io::stderr().flush();

    // Build request
    let request = Request {
        command,
        args: args[1..].to_vec(),
        env: env::vars().collect(),
        cwd: env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string()),
    };

    let request_json = match serde_json::to_vec(&request) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("[wasix-shim] Failed to serialize request: {}", e);
            exit(1);
        }
    };

    // Start host execution
    let mut session: u64 = 0;
    let errno = unsafe {
        host_exec_start(
            request_json.as_ptr(),
            request_json.len(),
            &mut session,
        )
    };

    if errno != 0 {
        eprintln!("[wasix-shim] host_exec_start failed with errno {}", errno);
        let _ = io::stderr().flush();
        exit(1);
    }

    eprintln!("[wasix-shim] Session started: {}", session);
    let _ = io::stderr().flush();

    // Main event loop using poll_oneoff for stdin multiplexing
    run_event_loop(session);
}

fn run_event_loop(session: u64) {
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let mut host_buf = vec![0u8; 64 * 1024]; // 64KB buffer for host output
    let mut stdin_buf = vec![0u8; 4096];     // 4KB buffer for stdin

    // Child process management (spawned natively in WASIX)
    let mut children: HashMap<u64, ChildProcess> = HashMap::new();
    let mut child_output_buf = vec![0u8; 8192]; // Buffer for reading child output

    // In host_exec mode, stdin is not used - the IPC channel is separate.
    // Skip the stdin availability check which can hang due to poll_oneoff issues
    // with timeout=0 in the JS environment.
    #[allow(unused_mut)]
    let mut stdin_closed = true;

    // Subscriptions for poll_oneoff:
    // [0] = stdin (fd 0) for reading
    // [1] = timeout (10ms) for checking host output
    let subscriptions = [
        // stdin read subscription
        Subscription {
            userdata: 0,
            u: SubscriptionU {
                fd_read: SubscriptionFdReadwrite {
                    tag: 1,  // fd_read
                    _pad: [0; 3],
                    fd: 0,   // stdin
                },
            },
        },
        // timeout subscription (10ms = 10_000_000 ns)
        Subscription {
            userdata: 1,
            u: SubscriptionU {
                clock: SubscriptionClock {
                    tag: 0,  // clock
                    _pad: [0; 7],
                    id: 1,   // monotonic clock
                    _pad2: [0; 4],
                    timeout: 10_000_000,  // 10ms in nanoseconds
                    precision: 1_000_000, // 1ms precision
                    flags: 0,  // relative timeout
                    _pad3: [0; 6],
                },
            },
        },
    ];

    let mut events = [Event {
        userdata: 0,
        error: 0,
        event_type: 0,
        _pad: [0; 5],
        fd_readwrite: EventFdReadwrite {
            nbytes: 0,
            flags: 0,
            _pad: [0; 6],
        },
    }; 2];

    eprintln!("[wasix-shim] Entering event loop, stdin_closed={}", stdin_closed);

    loop {
        // First, always check for host output (non-blocking)
        loop {
            let mut ready: u32 = 0;
            let errno = unsafe { host_exec_poll(session, &mut ready) };

            if errno != 0 {
                eprintln!("[wasix-shim] host_exec_poll failed with errno {}", errno);
                break;
            }

            eprintln!("[wasix-shim] poll ready={}", ready);

            if ready == 0 {
                // No data available from host
                break;
            }

            // Data available - read it
            let mut msg_type: u32 = 0;
            let mut data_len = host_buf.len();

            let errno = unsafe {
                host_exec_try_read(
                    session,
                    &mut msg_type,
                    host_buf.as_mut_ptr(),
                    &mut data_len,
                )
            };

            if errno == ERRNO_AGAIN {
                // Race condition - no data after all
                break;
            } else if errno != 0 {
                eprintln!("[wasix-shim] host_exec_try_read failed with errno {}", errno);
                exit(1);
            }

            match msg_type {
                HOST_EXEC_STDOUT => {
                    if let Err(e) = stdout.write_all(&host_buf[..data_len]) {
                        eprintln!("[wasix-shim] stdout write error: {}", e);
                    }
                    let _ = stdout.flush();
                }
                HOST_EXEC_STDERR => {
                    if let Err(e) = stderr.write_all(&host_buf[..data_len]) {
                        eprintln!("[wasix-shim] stderr write error: {}", e);
                    }
                    let _ = stderr.flush();
                }
                HOST_EXEC_EXIT => {
                    let exit_code = data_len as i32;
                    eprintln!("[wasix-shim] Exiting with code {}", exit_code);
                    exit(exit_code);
                }
                MSG_TYPE_SPAWN_REQUEST => {
                    handle_spawn_request(session, &host_buf[..data_len], &mut children);
                }
                MSG_TYPE_SPAWN_STDIN => {
                    handle_spawn_stdin(&host_buf[..data_len], &mut children);
                }
                MSG_TYPE_SPAWN_CLOSE_STDIN => {
                    handle_spawn_close_stdin(&host_buf[..data_len], &mut children);
                }
                MSG_TYPE_SPAWN_KILL => {
                    handle_spawn_kill(session, &host_buf[..data_len], &mut children);
                }
                _ => {
                    eprintln!("[wasix-shim] Unknown message type: {}", msg_type);
                    // Don't exit - just ignore unknown messages
                }
            }
        }

        // Check child processes for output
        check_child_processes(&mut children, &mut child_output_buf);

        // Now wait for stdin or timeout using poll_oneoff
        let num_subs = if stdin_closed { 1 } else { 2 };
        let sub_ptr = if stdin_closed {
            &subscriptions[1] as *const Subscription  // Only timeout
        } else {
            &subscriptions[0] as *const Subscription  // stdin + timeout
        };

        eprintln!("[wasix-shim] calling poll_oneoff with {} subscriptions", num_subs);

        let mut nevents: u32 = 0;
        let errno = unsafe {
            poll_oneoff(
                sub_ptr,
                events.as_mut_ptr(),
                num_subs as u32,
                &mut nevents,
            )
        };

        eprintln!("[wasix-shim] poll_oneoff returned errno={}, nevents={}", errno, nevents);

        if errno != 0 {
            eprintln!("[wasix-shim] poll_oneoff failed with errno {}", errno);
            exit(1);
        }

        // Process events
        for i in 0..(nevents as usize) {
            let event = &events[i];

            if event.userdata == 0 && !stdin_closed {
                // stdin is readable
                if event.error != 0 {
                    // Error on stdin - treat as EOF
                    eprintln!("[wasix-shim] stdin error, closing");
                    unsafe { host_exec_close_stdin(session) };
                    stdin_closed = true;
                    continue;
                }

                let nbytes = event.fd_readwrite.nbytes as usize;
                if nbytes == 0 {
                    // EOF on stdin
                    eprintln!("[wasix-shim] stdin EOF, closing");
                    unsafe { host_exec_close_stdin(session) };
                    stdin_closed = true;
                    continue;
                }

                // Read from stdin
                let to_read = nbytes.min(stdin_buf.len());
                match io::stdin().read(&mut stdin_buf[..to_read]) {
                    Ok(0) => {
                        // EOF
                        eprintln!("[wasix-shim] stdin read returned 0, closing");
                        unsafe { host_exec_close_stdin(session) };
                        stdin_closed = true;
                    }
                    Ok(n) => {
                        // Send to host process
                        let errno = unsafe {
                            host_exec_write(session, stdin_buf.as_ptr(), n)
                        };
                        if errno != 0 {
                            eprintln!("[wasix-shim] host_exec_write failed with errno {}", errno);
                        }
                    }
                    Err(e) => {
                        eprintln!("[wasix-shim] stdin read error: {}", e);
                        unsafe { host_exec_close_stdin(session) };
                        stdin_closed = true;
                    }
                }
            }
            // userdata == 1 is just the timeout - we'll check host output at the top of the loop
        }
    }
}

/// Handle a SPAWN_REQUEST message - spawn a new child process natively in WASIX
fn handle_spawn_request(
    parent_session: u64,
    data: &[u8],
    children: &mut HashMap<u64, ChildProcess>,
) {
    let spawn_req: SpawnRequest = match serde_json::from_slice(data) {
        Ok(req) => req,
        Err(e) => {
            eprintln!("[wasix-shim] Failed to parse SPAWN_REQUEST: {}", e);
            return;
        }
    };

    eprintln!(
        "[wasix-shim] Spawning child {}: {} {:?}",
        spawn_req.child_id, spawn_req.command, spawn_req.args
    );

    // WASIX requires PATH to be set to /bin for subprocess spawning to work
    // This is where coreutils binaries are located
    std::env::set_var("PATH", "/bin");

    // Check if we should skip the `which` hack to test wasmer's PATH resolution
    // Prefix command with "nowhich:" to test without the which hack
    // e.g., "nowhich:echo" will spawn "echo" without resolving via which
    let (skip_which, command) = if spawn_req.command.starts_with("nowhich:") {
        (true, spawn_req.command.strip_prefix("nowhich:").unwrap().to_string())
    } else {
        (false, spawn_req.command.clone())
    };

    // Resolve command using PATH
    let command_path = if command.starts_with('/') {
        // Already absolute path
        std::path::PathBuf::from(&command)
    } else if skip_which {
        // TEST MODE: Skip `which` hack to test wasmer's proc_spawn2 PATH resolution
        // When this is set, Command::new("echo") relies on posix_spawnp which
        // should search PATH via wasmer's find_executable_in_path()
        // Note: This is known to be broken - see docs/specs/WASIX_LIBC_PATH_FIX.md
        eprintln!("[wasix-shim] nowhich: testing - using relative path: {}", command);
        std::path::PathBuf::from(&command)
    } else {
        // Use `which` to search PATH (workaround for wasmer PATH resolution bug)
        // See docs/specs/WASIX_LIBC_PATH_FIX.md for details
        match which::which(&command) {
            Ok(path) => path,
            Err(e) => {
                let error_msg = format!(
                    "[wasix-shim] Command not found: {} (PATH=/bin, error: {})\n",
                    command, e
                );
                eprintln!("{}", error_msg);

                // Send error to child's stderr
                unsafe {
                    host_exec_child_output(
                        parent_session,
                        spawn_req.child_id,
                        MSG_TYPE_CHILD_STDERR,
                        error_msg.as_ptr(),
                        error_msg.len(),
                    );
                }

                // Send exit code 127 (command not found)
                let exit_code: i32 = 127;
                let exit_data = exit_code.to_le_bytes();
                unsafe {
                    host_exec_child_output(
                        parent_session,
                        spawn_req.child_id,
                        MSG_TYPE_CHILD_EXIT,
                        exit_data.as_ptr(),
                        exit_data.len(),
                    );
                }
                return;
            }
        }
    };

    // Spawn the command - WASIX provides commands from dependencies (coreutils, bash)
    // as WASM modules that can be executed via Command::new with absolute paths
    let result = Command::new(&command_path)
        .args(&spawn_req.args)
        .envs(&spawn_req.env)
        .current_dir(if spawn_req.cwd.is_empty() { "/" } else { &spawn_req.cwd })
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    match result {
        Ok(child) => {
            eprintln!("[wasix-shim] Child {} spawned successfully", spawn_req.child_id);
            children.insert(spawn_req.child_id, ChildProcess {
                child,
                parent_session,
            });
        }
        Err(e) => {
            let error_msg = format!(
                "[wasix-shim] Failed to spawn child {} ({}): {}\n",
                spawn_req.child_id, command, e
            );
            eprintln!("{}", error_msg);

            // Send error to child's stderr so it's visible in test output
            unsafe {
                host_exec_child_output(
                    parent_session,
                    spawn_req.child_id,
                    MSG_TYPE_CHILD_STDERR,
                    error_msg.as_ptr(),
                    error_msg.len(),
                );
            }

            // Send exit code 127 (command not found)
            let exit_code: i32 = 127;
            let exit_data = exit_code.to_le_bytes();
            unsafe {
                host_exec_child_output(
                    parent_session,
                    spawn_req.child_id,
                    MSG_TYPE_CHILD_EXIT,
                    exit_data.as_ptr(),
                    exit_data.len(),
                );
            }
        }
    }
}

/// Handle SPAWN_STDIN message - write data to child's stdin
fn handle_spawn_stdin(data: &[u8], children: &mut HashMap<u64, ChildProcess>) {
    if data.len() < 8 {
        eprintln!("[wasix-shim] SPAWN_STDIN data too short");
        return;
    }

    let child_id = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let stdin_data = &data[8..];

    if let Some(child_proc) = children.get_mut(&child_id) {
        if let Some(ref mut stdin) = child_proc.child.stdin {
            if let Err(e) = stdin.write_all(stdin_data) {
                eprintln!("[wasix-shim] Failed to write to child {} stdin: {}", child_id, e);
            }
        }
    } else {
        eprintln!("[wasix-shim] SPAWN_STDIN for unknown child {}", child_id);
    }
}

/// Handle SPAWN_CLOSE_STDIN message - close child's stdin
fn handle_spawn_close_stdin(data: &[u8], children: &mut HashMap<u64, ChildProcess>) {
    if data.len() < 8 {
        eprintln!("[wasix-shim] SPAWN_CLOSE_STDIN data too short");
        return;
    }

    let child_id = u64::from_le_bytes(data[0..8].try_into().unwrap());

    if let Some(child_proc) = children.get_mut(&child_id) {
        // Drop stdin to close it
        child_proc.child.stdin.take();
        eprintln!("[wasix-shim] Closed stdin for child {}", child_id);
    } else {
        eprintln!("[wasix-shim] SPAWN_CLOSE_STDIN for unknown child {}", child_id);
    }
}

/// Handle SPAWN_KILL message - send signal to child
fn handle_spawn_kill(
    session: u64,
    data: &[u8],
    children: &mut HashMap<u64, ChildProcess>,
) {
    if data.len() < 12 {
        eprintln!("[wasix-shim] SPAWN_KILL data too short");
        return;
    }

    let child_id = u64::from_le_bytes(data[0..8].try_into().unwrap());
    let _signal = u32::from_le_bytes(data[8..12].try_into().unwrap());

    if let Some(child_proc) = children.get_mut(&child_id) {
        // In WASIX, kill() will send the signal
        if let Err(e) = child_proc.child.kill() {
            eprintln!("[wasix-shim] Failed to kill child {}: {}", child_id, e);
        } else {
            eprintln!("[wasix-shim] Killed child {}", child_id);
        }
    } else {
        // Child might have already exited - send exit code
        eprintln!("[wasix-shim] SPAWN_KILL for unknown child {}", child_id);
        let exit_code: i32 = -1;
        let exit_data = exit_code.to_le_bytes();
        unsafe {
            host_exec_child_output(
                session,
                child_id,
                MSG_TYPE_CHILD_EXIT,
                exit_data.as_ptr(),
                exit_data.len(),
            );
        }
    }
}

/// Check all child processes for output and exit status
fn check_child_processes(
    children: &mut HashMap<u64, ChildProcess>,
    buf: &mut [u8],
) {
    // Collect child IDs that have exited (can't modify while iterating)
    let mut exited: Vec<(u64, i32, u64)> = Vec::new(); // (child_id, exit_code, parent_session)

    for (child_id, child_proc) in children.iter_mut() {
        let parent_session = child_proc.parent_session;

        // Check for stdout
        if let Some(ref mut stdout) = child_proc.child.stdout {
            // Try to read (non-blocking in WASIX)
            match stdout.read(buf) {
                Ok(0) => {
                    // EOF on stdout - might be exiting
                }
                Ok(n) => {
                    // Send stdout data to host
                    unsafe {
                        host_exec_child_output(
                            parent_session,
                            *child_id,
                            MSG_TYPE_CHILD_STDOUT,
                            buf.as_ptr(),
                            n,
                        );
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                    // No data available, that's OK
                }
                Err(e) => {
                    eprintln!("[wasix-shim] Error reading child {} stdout: {}", child_id, e);
                }
            }
        }

        // Check for stderr
        if let Some(ref mut stderr) = child_proc.child.stderr {
            match stderr.read(buf) {
                Ok(0) => {
                    // EOF on stderr
                }
                Ok(n) => {
                    // Send stderr data to host
                    unsafe {
                        host_exec_child_output(
                            parent_session,
                            *child_id,
                            MSG_TYPE_CHILD_STDERR,
                            buf.as_ptr(),
                            n,
                        );
                    }
                }
                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                    // No data available
                }
                Err(e) => {
                    eprintln!("[wasix-shim] Error reading child {} stderr: {}", child_id, e);
                }
            }
        }

        // Check if child has exited
        match child_proc.child.try_wait() {
            Ok(Some(status)) => {
                let exit_code = status.code().unwrap_or(-1);
                eprintln!("[wasix-shim] Child {} exited with code {}", child_id, exit_code);
                exited.push((*child_id, exit_code, parent_session));
            }
            Ok(None) => {
                // Still running
            }
            Err(e) => {
                eprintln!("[wasix-shim] Error checking child {} status: {}", child_id, e);
            }
        }
    }

    // Remove exited children and send exit notifications
    for (child_id, exit_code, parent_session) in exited {
        children.remove(&child_id);
        let exit_data = exit_code.to_le_bytes();
        unsafe {
            host_exec_child_output(
                parent_session,
                child_id,
                MSG_TYPE_CHILD_EXIT,
                exit_data.as_ptr(),
                exit_data.len(),
            );
        }
    }
}

