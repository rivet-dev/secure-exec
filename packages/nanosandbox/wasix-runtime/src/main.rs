use std::collections::HashMap;
use std::env;
use std::io::{self, Read, Write};
use std::process::exit;

// Syscall imports for host_exec
#[link(wasm_import_module = "wasix_32v1")]
extern "C" {
    fn host_exec_start(
        request_ptr: *const u8,
        request_len: usize,
        session_ptr: *mut u64,
    ) -> i32;

    fn host_exec_read(
        session: u64,
        type_ptr: *mut u32,
        data_ptr: *mut u8,
        data_len_ptr: *mut usize,
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

// Message type constants
const HOST_EXEC_STDOUT: u32 = 1;
const HOST_EXEC_STDERR: u32 = 2;
const HOST_EXEC_EXIT: u32 = 3;

// WASI errno
const ERRNO_AGAIN: i32 = 6;  // EAGAIN - try again

#[derive(serde::Serialize)]
struct Request {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let command = env::var("HOST_EXEC_COMMAND").unwrap_or_else(|_| "node".to_string());

    eprintln!("[wasix-shim] Starting with command: {} args: {:?}", command, &args[1..]);

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
        exit(1);
    }

    eprintln!("[wasix-shim] Session started: {}", session);

    // Main event loop using poll_oneoff for stdin multiplexing
    run_event_loop(session);
}

fn run_event_loop(session: u64) {
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let mut host_buf = vec![0u8; 64 * 1024]; // 64KB buffer for host output
    let mut stdin_buf = vec![0u8; 4096];     // 4KB buffer for stdin
    let mut stdin_closed = false;

    // Subscriptions for poll_oneoff:
    // [0] = stdin (fd 0) for reading
    // [1] = timeout (10ms) for checking host output
    let mut subscriptions = [
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

    loop {
        // First, always check for host output (non-blocking)
        loop {
            let mut ready: u32 = 0;
            let errno = unsafe { host_exec_poll(session, &mut ready) };

            if errno != 0 {
                eprintln!("[wasix-shim] host_exec_poll failed with errno {}", errno);
                break;
            }

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
                _ => {
                    eprintln!("[wasix-shim] Unknown message type: {}", msg_type);
                    exit(1);
                }
            }
        }

        // Now wait for stdin or timeout using poll_oneoff
        let num_subs = if stdin_closed { 1 } else { 2 };
        let sub_ptr = if stdin_closed {
            &subscriptions[1] as *const Subscription  // Only timeout
        } else {
            &subscriptions[0] as *const Subscription  // stdin + timeout
        };

        let mut nevents: u32 = 0;
        let errno = unsafe {
            poll_oneoff(
                sub_ptr,
                events.as_mut_ptr(),
                num_subs as u32,
                &mut nevents,
            )
        };

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
