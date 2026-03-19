// V8 runtime process entry point — UDS listener with socket path security

mod ipc;
mod isolate;
mod execution;
mod bridge;
mod host_call;
mod timeout;
mod stream;

use std::fs;
use std::io::{self, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::UnixListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

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

fn main() {
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
            Ok((_stream, _addr)) => {
                // Connection handling — implemented in later stories
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

    // Graceful shutdown: close listener and remove socket
    drop(listener);
    cleanup(&socket_path, &tmpdir);
}
