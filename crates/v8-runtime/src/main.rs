// V8 runtime process entry point — UDS listener with socket path security

mod ipc;
mod ipc_binary;
mod isolate;
mod execution;
mod bridge;
mod host_call;
mod timeout;
mod stream;
mod session;

use std::collections::HashMap;
use std::fs;
use std::io::{self, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use host_call::CallIdRouter;
use ipc_binary::BinaryFrame;
use session::{SessionManager, SharedWriter};

/// Close all file descriptors > 2 (stdin/stdout/stderr preserved).
/// Called at process startup to prevent the parent from leaking FDs into the V8 runtime.
fn close_inherited_fds() {
    // Collect open FDs from /proc/self/fd, then close all > 2
    let fds: Vec<i32> = fs::read_dir("/proc/self/fd")
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().to_string_lossy().parse::<i32>().ok())
        .filter(|&fd| fd > 2)
        .collect();
    for fd in fds {
        unsafe { libc::close(fd); }
    }
}

/// Set FD_CLOEXEC on a file descriptor so it won't be inherited by child processes.
fn set_cloexec(fd: i32) -> io::Result<()> {
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    if unsafe { libc::fcntl(fd, libc::F_SETFD, flags | libc::FD_CLOEXEC) } < 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

/// Generate a 128-bit random hex string from /dev/urandom
fn random_hex_128() -> io::Result<String> {
    let mut buf = [0u8; 16];
    let mut f = fs::File::open("/dev/urandom")?;
    f.read_exact(&mut buf)?;
    Ok(buf.iter().map(|b| format!("{:02x}", b)).collect())
}

/// Create a secure tmpdir with 0700 permissions and return the socket path inside it
fn create_socket_dir() -> io::Result<(PathBuf, PathBuf)> {
    let suffix = random_hex_128()?;
    let tmpdir = std::env::temp_dir().join(format!("secure-exec-{}", suffix));
    fs::create_dir(&tmpdir)?;
    fs::set_permissions(&tmpdir, fs::Permissions::from_mode(0o700))?;
    let socket_path = tmpdir.join("secure-exec.sock");
    Ok((tmpdir, socket_path))
}

/// Clean up socket file and directory
fn cleanup(socket_path: &PathBuf, tmpdir: &PathBuf) {
    let _ = fs::remove_file(socket_path);
    let _ = fs::remove_dir(tmpdir);
}

/// Authenticate a new connection by reading the first message as an Authenticate token.
/// Returns true if authentication succeeds, false otherwise.
fn authenticate_connection(stream: &mut UnixStream, expected_token: &str) -> bool {
    // Connection is blocking — read the first message
    match ipc_binary::read_frame(stream) {
        Ok(BinaryFrame::Authenticate { token }) => {
            if token == expected_token {
                true
            } else {
                eprintln!("auth failed: invalid token");
                false
            }
        }
        Ok(_) => {
            eprintln!("auth failed: first message must be Authenticate");
            false
        }
        Err(e) => {
            eprintln!("auth failed: read error: {}", e);
            false
        }
    }
}

/// Global connection ID counter
static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

/// Handle an authenticated connection: read messages and dispatch to sessions.
fn handle_connection(
    mut stream: UnixStream,
    connection_id: u64,
    session_mgr: Arc<Mutex<SessionManager>>,
) {
    loop {
        // Read next binary frame from connection
        let frame = match ipc_binary::read_frame(&mut stream) {
            Ok(f) => f,
            Err(ref e) if e.kind() == io::ErrorKind::UnexpectedEof => {
                // Client disconnected — clean up sessions
                break;
            }
            Err(e) => {
                eprintln!("connection {}: read error: {}", connection_id, e);
                break;
            }
        };

        // Dispatch frame
        match frame {
            BinaryFrame::Authenticate { .. } => {
                eprintln!(
                    "connection {}: unexpected Authenticate after handshake",
                    connection_id
                );
                break;
            }
            BinaryFrame::CreateSession {
                session_id,
                heap_limit_mb,
                cpu_time_limit_ms,
            } => {
                let hlm = if heap_limit_mb == 0 { None } else { Some(heap_limit_mb) };
                let ctl = if cpu_time_limit_ms == 0 { None } else { Some(cpu_time_limit_ms) };
                let mut mgr = session_mgr.lock().unwrap();
                if let Err(e) = mgr.create_session(session_id.clone(), connection_id, hlm, ctl)
                {
                    eprintln!(
                        "connection {}: create session {} failed: {}",
                        connection_id, session_id, e
                    );
                }
            }
            BinaryFrame::DestroySession { session_id } => {
                let mut mgr = session_mgr.lock().unwrap();
                if let Err(e) = mgr.destroy_session(&session_id, connection_id) {
                    eprintln!(
                        "connection {}: destroy session {} failed: {}",
                        connection_id, session_id, e
                    );
                }
            }
            // Route BridgeResponse via call_id → session_id routing table
            BinaryFrame::BridgeResponse { call_id, .. } => {
                let mgr = session_mgr.lock().unwrap();
                let router = mgr.call_id_router();
                let session_id = router.lock().unwrap().remove(&call_id);

                if let Some(sid) = session_id {
                    if let Err(e) = mgr.send_to_session(&sid, connection_id, frame) {
                        eprintln!(
                            "connection {}: route BridgeResponse call_id={} to session {} failed: {}",
                            connection_id, call_id, sid, e
                        );
                    }
                } else {
                    eprintln!(
                        "connection {}: no session found for BridgeResponse call_id={}",
                        connection_id, call_id
                    );
                }
            }
            // Forward session-scoped messages to the session thread
            frame @ (BinaryFrame::Execute { .. }
            | BinaryFrame::InjectGlobals { .. }
            | BinaryFrame::StreamEvent { .. }
            | BinaryFrame::TerminateExecution { .. }) => {
                let session_id = match &frame {
                    BinaryFrame::Execute { session_id, .. }
                    | BinaryFrame::InjectGlobals { session_id, .. }
                    | BinaryFrame::StreamEvent { session_id, .. }
                    | BinaryFrame::TerminateExecution { session_id } => session_id.clone(),
                    _ => unreachable!(),
                };
                let mgr = session_mgr.lock().unwrap();
                if let Err(e) = mgr.send_to_session(&session_id, connection_id, frame) {
                    eprintln!(
                        "connection {}: send to session {} failed: {}",
                        connection_id, session_id, e
                    );
                }
            }
            _ => {
                eprintln!("connection {}: unexpected frame type", connection_id);
            }
        }
    }

    // Connection closed — clean up all sessions owned by this connection
    let mut mgr = session_mgr.lock().unwrap();
    mgr.destroy_connection_sessions(connection_id);
}

fn main() {
    // Close all inherited FDs > 2 before doing anything else
    close_inherited_fds();

    // Initialize V8 platform on the main thread before any session threads
    isolate::init_v8_platform();

    // Read auth token from environment
    let auth_token = std::env::var("SECURE_EXEC_V8_TOKEN")
        .expect("SECURE_EXEC_V8_TOKEN environment variable must be set");

    // Determine max concurrency from env or default to available CPUs
    let max_concurrency = std::env::var("SECURE_EXEC_V8_MAX_SESSIONS")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or_else(|| {
            std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4)
        });

    // Create socket directory with 128-bit random suffix and 0700 permissions
    let (tmpdir, socket_path) = create_socket_dir().expect("failed to create socket directory");

    // Bind UDS listener
    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            cleanup(&socket_path, &tmpdir);
            panic!("failed to bind UDS: {}", e);
        }
    };
    set_cloexec(listener.as_raw_fd()).expect("failed to set CLOEXEC on listener");

    // Print socket path to stdout so host process can connect
    println!("{}", socket_path.display());
    io::stdout().flush().expect("failed to flush stdout");

    // Set up graceful shutdown on SIGTERM and SIGINT
    let running = Arc::new(AtomicBool::new(true));
    signal_hook::flag::register(signal_hook::consts::SIGTERM, Arc::clone(&running))
        .expect("failed to register SIGTERM handler");
    signal_hook::flag::register(signal_hook::consts::SIGINT, Arc::clone(&running))
        .expect("failed to register SIGINT handler");

    // Set non-blocking so we can poll the shutdown flag
    listener
        .set_nonblocking(true)
        .expect("failed to set non-blocking");

    // Accept connections
    while running.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _addr)) => {
                // Set CLOEXEC on accepted connection
                set_cloexec(stream.as_raw_fd()).expect("failed to set CLOEXEC on connection");

                // Set blocking for the auth handshake
                stream
                    .set_nonblocking(false)
                    .expect("failed to set stream blocking");

                // Require authentication as the first message
                if !authenticate_connection(&mut stream, &auth_token) {
                    drop(stream);
                    continue;
                }

                // Create per-connection shared writer and routing table
                let writer_stream = stream.try_clone().expect("failed to clone UDS stream");
                set_cloexec(writer_stream.as_raw_fd())
                    .expect("failed to set CLOEXEC on cloned stream");
                let conn_writer: SharedWriter =
                    Arc::new(Mutex::new(Box::new(writer_stream)));
                let call_id_router: CallIdRouter = Arc::new(Mutex::new(HashMap::new()));

                // Create shared session manager for this connection
                let session_mgr = Arc::new(Mutex::new(SessionManager::new(
                    max_concurrency,
                    conn_writer,
                    call_id_router,
                )));

                // Authenticated — spawn connection handler thread
                let conn_id = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
                let mgr = Arc::clone(&session_mgr);
                std::thread::Builder::new()
                    .name(format!("conn-{}", conn_id))
                    .spawn(move || {
                        handle_connection(stream, conn_id, mgr);
                    })
                    .expect("failed to spawn connection handler");
            }
            Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(e) => {
                eprintln!("accept error: {}", e);
                break;
            }
        }
    }

    // Graceful shutdown: close listener, remove socket
    drop(listener);
    cleanup(&socket_path, &tmpdir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::io::AsRawFd;
    use std::os::unix::net::UnixStream;

    /// Helper: bind a temp UDS listener and return (listener, socket_path, tmpdir)
    fn temp_listener() -> (UnixListener, PathBuf, PathBuf) {
        let (tmpdir, socket_path) = create_socket_dir().expect("create socket dir");
        let listener = UnixListener::bind(&socket_path).expect("bind");
        (listener, socket_path, tmpdir)
    }

    #[test]
    fn set_cloexec_sets_flag_on_fd() {
        // pipe() does NOT set CLOEXEC, so this is a good test target
        let mut fds = [0i32; 2];
        assert_eq!(unsafe { libc::pipe(fds.as_mut_ptr()) }, 0);

        let flags_before = unsafe { libc::fcntl(fds[0], libc::F_GETFD) };
        assert_eq!(
            flags_before & libc::FD_CLOEXEC,
            0,
            "pipe should not have CLOEXEC initially"
        );

        set_cloexec(fds[0]).expect("set_cloexec");

        let flags_after = unsafe { libc::fcntl(fds[0], libc::F_GETFD) };
        assert_ne!(
            flags_after & libc::FD_CLOEXEC,
            0,
            "CLOEXEC should be set after set_cloexec"
        );

        unsafe {
            libc::close(fds[0]);
            libc::close(fds[1]);
        }
    }

    #[test]
    fn set_cloexec_returns_error_for_bad_fd() {
        assert!(set_cloexec(-1).is_err());
        assert!(set_cloexec(9999).is_err());
    }

    #[test]
    fn listener_has_cloexec_after_set() {
        let (listener, socket_path, tmpdir) = temp_listener();
        set_cloexec(listener.as_raw_fd()).expect("set cloexec on listener");

        let flags = unsafe { libc::fcntl(listener.as_raw_fd(), libc::F_GETFD) };
        assert!(flags >= 0, "fcntl should succeed");
        assert_ne!(
            flags & libc::FD_CLOEXEC,
            0,
            "listener should have CLOEXEC"
        );

        cleanup(&socket_path, &tmpdir);
    }

    #[test]
    fn accepted_stream_has_cloexec_after_set() {
        let (listener, socket_path, tmpdir) = temp_listener();

        let _client = UnixStream::connect(&socket_path).expect("connect");
        let (stream, _) = listener.accept().expect("accept");
        set_cloexec(stream.as_raw_fd()).expect("set cloexec on stream");

        let flags = unsafe { libc::fcntl(stream.as_raw_fd(), libc::F_GETFD) };
        assert!(flags >= 0, "fcntl should succeed");
        assert_ne!(
            flags & libc::FD_CLOEXEC,
            0,
            "accepted stream should have CLOEXEC"
        );

        cleanup(&socket_path, &tmpdir);
    }

    #[test]
    fn cloned_stream_has_cloexec_after_set() {
        let (listener, socket_path, tmpdir) = temp_listener();

        let _client = UnixStream::connect(&socket_path).expect("connect");
        let (stream, _) = listener.accept().expect("accept");
        let clone = stream.try_clone().expect("clone");
        set_cloexec(clone.as_raw_fd()).expect("set cloexec on clone");

        let flags = unsafe { libc::fcntl(clone.as_raw_fd(), libc::F_GETFD) };
        assert!(flags >= 0, "fcntl should succeed");
        assert_ne!(
            flags & libc::FD_CLOEXEC,
            0,
            "cloned stream should have CLOEXEC"
        );

        cleanup(&socket_path, &tmpdir);
    }

    #[test]
    fn auth_accepts_valid_token() {
        let (listener, socket_path, tmpdir) = temp_listener();
        let token = "test-secret-token-abc123";

        // Client connects and sends valid Authenticate
        let mut client = UnixStream::connect(&socket_path).expect("connect");
        let (mut server_stream, _) = listener.accept().expect("accept");

        ipc_binary::write_frame(
            &mut client,
            &BinaryFrame::Authenticate {
                token: token.into(),
            },
        )
        .expect("write auth");

        assert!(authenticate_connection(&mut server_stream, token));

        cleanup(&socket_path, &tmpdir);
    }

    #[test]
    fn auth_rejects_wrong_token() {
        let (listener, socket_path, tmpdir) = temp_listener();

        let mut client = UnixStream::connect(&socket_path).expect("connect");
        let (mut server_stream, _) = listener.accept().expect("accept");

        ipc_binary::write_frame(
            &mut client,
            &BinaryFrame::Authenticate {
                token: "wrong-token".into(),
            },
        )
        .expect("write auth");

        assert!(!authenticate_connection(&mut server_stream, "correct-token"));

        cleanup(&socket_path, &tmpdir);
    }

    #[test]
    fn auth_rejects_non_authenticate_message() {
        let (listener, socket_path, tmpdir) = temp_listener();

        let mut client = UnixStream::connect(&socket_path).expect("connect");
        let (mut server_stream, _) = listener.accept().expect("accept");

        // Send a CreateSession instead of Authenticate
        ipc_binary::write_frame(
            &mut client,
            &BinaryFrame::CreateSession {
                session_id: "1".into(),
                heap_limit_mb: 0,
                cpu_time_limit_ms: 0,
            },
        )
        .expect("write");

        assert!(!authenticate_connection(&mut server_stream, "any-token"));

        cleanup(&socket_path, &tmpdir);
    }

    #[test]
    fn auth_rejects_empty_connection() {
        let (listener, socket_path, tmpdir) = temp_listener();

        let client = UnixStream::connect(&socket_path).expect("connect");
        let (mut server_stream, _) = listener.accept().expect("accept");

        // Drop client immediately — server will get EOF
        drop(client);

        assert!(!authenticate_connection(&mut server_stream, "any-token"));

        cleanup(&socket_path, &tmpdir);
    }
}
