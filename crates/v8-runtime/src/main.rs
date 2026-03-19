// V8 runtime process entry point — UDS listener with socket path security

mod ipc;
mod isolate;
mod execution;
mod bridge;
mod host_call;
mod timeout;
mod stream;
mod session;

use std::fs;
use std::io::{self, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use ipc::HostMessage;
use session::SessionManager;

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
    match ipc::read_message::<_, HostMessage>(stream) {
        Ok(HostMessage::Authenticate { token }) => {
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
        // Read next message from connection
        let msg: HostMessage = match ipc::read_message(&mut stream) {
            Ok(msg) => msg,
            Err(ref e) if e.kind() == io::ErrorKind::UnexpectedEof => {
                // Client disconnected — clean up sessions
                break;
            }
            Err(e) => {
                eprintln!("connection {}: read error: {}", connection_id, e);
                break;
            }
        };

        // Dispatch message
        match msg {
            HostMessage::Authenticate { .. } => {
                eprintln!(
                    "connection {}: unexpected Authenticate after handshake",
                    connection_id
                );
                break;
            }
            HostMessage::CreateSession {
                session_id,
                heap_limit_mb,
                cpu_time_limit_ms: _,
            } => {
                let mut mgr = session_mgr.lock().unwrap();
                if let Err(e) = mgr.create_session(session_id.clone(), connection_id, heap_limit_mb)
                {
                    eprintln!(
                        "connection {}: create session {} failed: {}",
                        connection_id, session_id, e
                    );
                }
            }
            HostMessage::DestroySession { session_id } => {
                let mut mgr = session_mgr.lock().unwrap();
                if let Err(e) = mgr.destroy_session(&session_id, connection_id) {
                    eprintln!(
                        "connection {}: destroy session {} failed: {}",
                        connection_id, session_id, e
                    );
                }
            }
            // Forward session-scoped messages to the session thread
            msg @ (HostMessage::Execute { .. }
            | HostMessage::InjectGlobals { .. }
            | HostMessage::BridgeResponse { .. }
            | HostMessage::StreamEvent { .. }
            | HostMessage::TerminateExecution { .. }) => {
                let session_id = match &msg {
                    HostMessage::Execute { session_id, .. }
                    | HostMessage::InjectGlobals { session_id, .. }
                    | HostMessage::StreamEvent { session_id, .. }
                    | HostMessage::TerminateExecution { session_id } => session_id.clone(),
                    HostMessage::BridgeResponse { .. } => {
                        // BridgeResponse doesn't have session_id; routing handled later
                        // For now, skip
                        continue;
                    }
                    _ => unreachable!(),
                };
                let mgr = session_mgr.lock().unwrap();
                if let Err(e) = mgr.send_to_session(&session_id, connection_id, msg) {
                    eprintln!(
                        "connection {}: send to session {} failed: {}",
                        connection_id, session_id, e
                    );
                }
            }
        }
    }

    // Connection closed — clean up all sessions owned by this connection
    let mut mgr = session_mgr.lock().unwrap();
    mgr.destroy_connection_sessions(connection_id);
}

fn main() {
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

    // Create shared session manager
    let session_mgr = Arc::new(Mutex::new(SessionManager::new(max_concurrency)));

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
                // Set blocking for the auth handshake
                stream
                    .set_nonblocking(false)
                    .expect("failed to set stream blocking");

                // Require authentication as the first message
                if !authenticate_connection(&mut stream, &auth_token) {
                    drop(stream);
                    continue;
                }

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

    // Graceful shutdown: close listener, clean up remaining sessions, remove socket
    drop(listener);
    let mut mgr = session_mgr.lock().unwrap();
    // Destroy all sessions on shutdown
    let all_ids: Vec<(String, u64)> = mgr
        .all_sessions()
        .into_iter()
        .collect();
    for (sid, conn_id) in all_ids {
        let _ = mgr.destroy_session(&sid, conn_id);
    }
    drop(mgr);
    cleanup(&socket_path, &tmpdir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::net::UnixStream;

    /// Helper: bind a temp UDS listener and return (listener, socket_path, tmpdir)
    fn temp_listener() -> (UnixListener, PathBuf, PathBuf) {
        let (tmpdir, socket_path) = create_socket_dir().expect("create socket dir");
        let listener = UnixListener::bind(&socket_path).expect("bind");
        (listener, socket_path, tmpdir)
    }

    #[test]
    fn auth_accepts_valid_token() {
        let (listener, socket_path, tmpdir) = temp_listener();
        let token = "test-secret-token-abc123";

        // Client connects and sends valid Authenticate
        let mut client = UnixStream::connect(&socket_path).expect("connect");
        let (mut server_stream, _) = listener.accept().expect("accept");

        ipc::write_message(
            &mut client,
            &HostMessage::Authenticate {
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

        ipc::write_message(
            &mut client,
            &HostMessage::Authenticate {
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
        ipc::write_message(
            &mut client,
            &HostMessage::CreateSession {
                session_id: "1".into(),
                heap_limit_mb: None,
                cpu_time_limit_ms: None,
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
