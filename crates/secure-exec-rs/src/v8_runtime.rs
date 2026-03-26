// V8Runtime — spawns the secure-exec-v8 binary, connects over UDS,
// authenticates, and manages the connection lifecycle.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use secure_exec_ipc::{frame_to_bytes, BinaryFrame, ExecutionErrorBin, MAX_FRAME_SIZE};

use crate::driver::StdioHook;
use crate::error::{Error, Result};
use crate::{BoxFuture, ResourceBudgets};

/// Options for creating a `V8Runtime`.
#[derive(Default)]
pub struct V8RuntimeOptions {
    /// Path to the `secure-exec-v8` binary. Auto-detected if `None`.
    pub binary_path: Option<PathBuf>,
    /// Maximum number of concurrent sessions.
    pub max_sessions: Option<u32>,
    /// Bridge code to pre-warm snapshots with.
    pub warmup_bridge_code: Option<String>,
    /// Number of warm isolates to keep in the pool.
    pub warm_pool_size: Option<u32>,
}

/// Manages the `secure-exec-v8` child process and UDS connection.
///
/// Shared across all sessions via `Arc<V8Runtime>`.
pub struct V8Runtime {
    child: Mutex<Option<Child>>,
    reader: Mutex<tokio::net::unix::OwnedReadHalf>,
    writer: Mutex<tokio::net::unix::OwnedWriteHalf>,
    socket_path: PathBuf,
}

impl V8Runtime {
    /// Spawn the V8 binary, connect over UDS, and authenticate.
    pub async fn new(options: V8RuntimeOptions) -> Result<Self> {
        // Generate 128-bit random auth token
        let token = generate_auth_token();

        // Resolve binary path
        let binary_path = resolve_binary_path(options.binary_path)?;

        // Spawn the secure-exec-v8 binary
        let mut child = Command::new(&binary_path)
            .env("SECURE_EXEC_V8_TOKEN", &token)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| Error::Runtime(format!("failed to spawn {}: {}", binary_path.display(), e)))?;

        // Read socket path from child's stdout (first line)
        let stdout = child.stdout.take().ok_or_else(|| {
            Error::Runtime("failed to capture child stdout".to_string())
        })?;
        let mut stdout_reader = BufReader::new(stdout);
        let mut socket_line = String::new();
        stdout_reader.read_line(&mut socket_line).await.map_err(|e| {
            Error::Runtime(format!("failed to read socket path from child: {}", e))
        })?;
        let socket_path = PathBuf::from(socket_line.trim());
        if !socket_path.exists() {
            return Err(Error::Runtime(format!(
                "socket path does not exist: {}",
                socket_path.display()
            )));
        }

        // Connect to UDS
        let stream = UnixStream::connect(&socket_path).await.map_err(|e| {
            Error::Runtime(format!("failed to connect to UDS {}: {}", socket_path.display(), e))
        })?;
        let (reader, writer) = stream.into_split();
        let reader = Mutex::new(reader);
        let writer = Mutex::new(writer);

        // Send Authenticate frame
        send_frame_locked(&writer, &BinaryFrame::Authenticate {
            token,
        }).await?;

        // Send Init frame
        let bridge_code = options.warmup_bridge_code.unwrap_or_default();
        let warm_pool_size = options.warm_pool_size.unwrap_or(0);
        send_frame_locked(&writer, &BinaryFrame::Init {
            bridge_code,
            warm_pool_size,
            default_warm_heap_limit_mb: 0,
            default_warm_cpu_time_limit_ms: 0,
            wait_for_warm_pool: warm_pool_size > 0,
        }).await?;

        // Wait for InitReady
        let init_response = read_frame_async_locked(&reader).await?;
        match init_response {
            BinaryFrame::InitReady => {}
            other => {
                return Err(Error::Ipc(format!(
                    "expected InitReady, got {:?}",
                    std::mem::discriminant(&other)
                )));
            }
        }

        Ok(V8Runtime {
            child: Mutex::new(Some(child)),
            reader,
            writer,
            socket_path,
        })
    }

    /// Send a frame over the UDS connection.
    pub(crate) async fn send_frame(&self, frame: &BinaryFrame) -> Result<()> {
        send_frame_locked(&self.writer, frame).await
    }

    /// Read a frame from the UDS connection.
    pub(crate) async fn read_frame(&self) -> Result<BinaryFrame> {
        read_frame_async_locked(&self.reader).await
    }

    /// Dispose of the V8 runtime — send SIGTERM, wait with timeout, clean up.
    pub async fn dispose(self) -> Result<()> {
        let mut child_guard = self.child.lock().await;
        if let Some(ref mut child) = *child_guard {
            // Send SIGTERM
            let pid = child.id();
            if let Some(pid) = pid {
                unsafe {
                    libc::kill(pid as libc::pid_t, libc::SIGTERM);
                }
            }

            // Wait with 5-second timeout
            let wait_result = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                child.wait(),
            ).await;

            match wait_result {
                Ok(Ok(_)) => {}
                Ok(Err(e)) => {
                    eprintln!("warning: error waiting for V8 process: {}", e);
                }
                Err(_) => {
                    // Timeout — force kill
                    let _ = child.kill().await;
                }
            }
        }
        *child_guard = None;

        // Clean up UDS socket and its parent directory
        let _ = tokio::fs::remove_file(&self.socket_path).await;
        if let Some(parent) = self.socket_path.parent() {
            let _ = tokio::fs::remove_dir(parent).await;
        }

        Ok(())
    }
}

/// Send a frame through a locked writer.
async fn send_frame_locked(
    writer: &Mutex<tokio::net::unix::OwnedWriteHalf>,
    frame: &BinaryFrame,
) -> Result<()> {
    let bytes = frame_to_bytes(frame).map_err(|e| Error::Ipc(format!("encode error: {}", e)))?;
    let mut w = writer.lock().await;
    w.write_all(&bytes)
        .await
        .map_err(|e| Error::Ipc(format!("write error: {}", e)))?;
    w.flush()
        .await
        .map_err(|e| Error::Ipc(format!("flush error: {}", e)))?;
    Ok(())
}

/// Read a frame asynchronously from a locked reader.
async fn read_frame_async_locked(
    reader: &Mutex<tokio::net::unix::OwnedReadHalf>,
) -> Result<BinaryFrame> {
    let mut r = reader.lock().await;

    // Read 4-byte length prefix
    let mut len_buf = [0u8; 4];
    r.read_exact(&mut len_buf)
        .await
        .map_err(|e| Error::Ipc(format!("read length error: {}", e)))?;
    let total_len = u32::from_be_bytes(len_buf);

    if total_len > MAX_FRAME_SIZE {
        return Err(Error::Ipc(format!(
            "frame size {} exceeds maximum {}",
            total_len, MAX_FRAME_SIZE
        )));
    }

    // Read frame body
    let mut body = vec![0u8; total_len as usize];
    r.read_exact(&mut body)
        .await
        .map_err(|e| Error::Ipc(format!("read body error: {}", e)))?;

    // Decode frame body
    secure_exec_ipc::decode_body(&body)
        .map_err(|e| Error::Ipc(format!("decode error: {}", e)))
}

/// Generate a 128-bit random hex auth token.
fn generate_auth_token() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    hex_encode(&bytes)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Resolve the binary path: use provided path, or auto-detect.
fn resolve_binary_path(provided: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(path) = provided {
        if path.exists() {
            return Ok(path);
        }
        return Err(Error::Runtime(format!(
            "specified binary not found: {}",
            path.display()
        )));
    }

    // Auto-detect: check common locations

    // 1. Check PATH via `which`
    if let Ok(path) = which_binary("secure-exec-v8") {
        return Ok(path);
    }

    // 2. Check relative to this crate's known location in the repo
    //    crates/v8-runtime/target/release/secure-exec-v8
    let repo_paths = [
        "crates/v8-runtime/target/release/secure-exec-v8",
        "crates/v8-runtime/target/debug/secure-exec-v8",
    ];
    for rel in &repo_paths {
        // Try from current working directory
        let path = PathBuf::from(rel);
        if path.exists() {
            return Ok(path);
        }
    }

    // 3. Check SECURE_EXEC_V8_BINARY env var
    if let Ok(path) = std::env::var("SECURE_EXEC_V8_BINARY") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(Error::Runtime(
        "secure-exec-v8 binary not found. Set SECURE_EXEC_V8_BINARY env var, \
         provide binary_path in V8RuntimeOptions, or build with: \
         cd crates/v8-runtime && cargo build --release"
            .to_string(),
    ))
}

/// Search PATH for a binary.
fn which_binary(name: &str) -> std::result::Result<PathBuf, ()> {
    if let Ok(paths) = std::env::var("PATH") {
        for dir in paths.split(':') {
            let candidate = PathBuf::from(dir).join(name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }
    Err(())
}

/// Generate a 128-bit random hex session ID.
fn generate_session_id() -> String {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    hex_encode(&bytes)
}

// -- V8 Session types --

/// Options for creating a V8 session.
#[derive(Default)]
pub struct V8SessionOptions {
    /// Memory limit for the V8 isolate in MB.
    pub memory_limit: Option<u32>,
    /// CPU time limit in milliseconds.
    pub cpu_time_limit_ms: Option<u32>,
    /// Resource consumption budgets.
    pub resource_budgets: Option<ResourceBudgets>,
}

/// Parameters for a single execution within a V8 session.
pub(crate) struct ExecuteParams {
    pub mode: u8, // 0 = exec, 1 = run
    pub bridge_code: String,
    pub post_restore_script: String,
    pub user_code: String,
    pub file_path: String,
    pub inject_globals_payload: Vec<u8>,
}

/// Output from a V8 session execution.
pub(crate) struct ExecutionOutput {
    pub exit_code: i32,
    pub exports: Option<Vec<u8>>,
    pub error: Option<ExecutionErrorBin>,
    pub stdout: String,
    pub stderr: String,
}

/// Handler for bridge calls from the V8 sandbox.
///
/// Implemented by the bridge dispatcher (US-012) to route calls
/// to the appropriate SystemDriver adapter.
pub(crate) trait BridgeCallHandler: Send + Sync {
    fn handle_bridge_call<'a>(
        &'a self,
        method: &'a str,
        payload: &'a [u8],
    ) -> BoxFuture<'a, Result<Vec<u8>>>;
}

/// A session within a V8Runtime, representing an isolated V8 isolate.
///
/// Created via `V8Runtime::create_session`. Sessions are reused across
/// multiple exec/run calls on the same NodeRuntime.
pub struct V8Session {
    session_id: String,
    runtime: Arc<V8Runtime>,
}

impl V8Runtime {
    /// Create a new session in this V8 runtime.
    ///
    /// Sends a `CreateSession` frame with a 128-bit random session ID nonce.
    pub async fn create_session(
        self: &Arc<Self>,
        options: V8SessionOptions,
    ) -> Result<V8Session> {
        let session_id = generate_session_id();

        let heap_limit_mb = options.memory_limit.unwrap_or(0);
        let cpu_time_limit_ms = options.cpu_time_limit_ms.unwrap_or(0);

        self.send_frame(&BinaryFrame::CreateSession {
            session_id: session_id.clone(),
            heap_limit_mb,
            cpu_time_limit_ms,
        })
        .await?;

        Ok(V8Session {
            session_id,
            runtime: Arc::clone(self),
        })
    }
}

impl V8Session {
    /// Get the session ID.
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    /// Execute code in this session.
    ///
    /// Sends InjectGlobals + Execute frames, then enters the bridge call loop.
    /// BridgeCalls are dispatched via the handler, Log frames are forwarded
    /// to the stdio hook (and buffered), ExecutionResult breaks the loop.
    pub(crate) async fn execute(
        &self,
        params: ExecuteParams,
        bridge_handler: &dyn BridgeCallHandler,
        stdio_hook: Option<&dyn StdioHook>,
    ) -> Result<ExecutionOutput> {
        // Send InjectGlobals (skip when payload is empty — the V8 binary
        // keeps last_globals_payload as None and skips injection)
        if !params.inject_globals_payload.is_empty() {
            self.runtime
                .send_frame(&BinaryFrame::InjectGlobals {
                    session_id: self.session_id.clone(),
                    payload: params.inject_globals_payload,
                })
                .await?;
        }

        // Send Execute
        self.runtime
            .send_frame(&BinaryFrame::Execute {
                session_id: self.session_id.clone(),
                mode: params.mode,
                file_path: params.file_path,
                bridge_code: params.bridge_code,
                post_restore_script: params.post_restore_script,
                user_code: params.user_code,
            })
            .await?;

        // Bridge call loop — process frames until ExecutionResult
        let mut stdout = String::new();
        let mut stderr = String::new();

        loop {
            let frame = self.runtime.read_frame().await?;

            match frame {
                BinaryFrame::BridgeCall {
                    session_id,
                    call_id,
                    method,
                    payload,
                } => {
                    if session_id != self.session_id {
                        continue;
                    }

                    // Intercept _log/_error for stdout/stderr capture
                    let (status, response_payload) = if method == "_log" || method == "_error" {
                        // Extract formatted message from V8-serialized args
                        if let Ok(msg) = crate::bridge::extract_log_message(&payload) {
                            if method == "_log" {
                                if let Some(hook) = stdio_hook {
                                    hook.on_stdout(msg.as_bytes());
                                }
                                stdout.push_str(&msg);
                            } else {
                                if let Some(hook) = stdio_hook {
                                    hook.on_stderr(msg.as_bytes());
                                }
                                stderr.push_str(&msg);
                            }
                        }
                        (0u8, Vec::new())
                    } else {
                        // Dispatch to bridge handler
                        let result = bridge_handler
                            .handle_bridge_call(&method, &payload)
                            .await;
                        match result {
                            Ok(data) => (0u8, data),
                            Err(e) => (1u8, e.to_string().into_bytes()),
                        }
                    };

                    self.runtime
                        .send_frame(&BinaryFrame::BridgeResponse {
                            session_id: self.session_id.clone(),
                            call_id,
                            status,
                            payload: response_payload,
                        })
                        .await?;
                }
                BinaryFrame::Log {
                    session_id,
                    channel,
                    message,
                } => {
                    if session_id != self.session_id {
                        continue;
                    }

                    // Forward to stdio hook and buffer
                    match channel {
                        0 => {
                            if let Some(hook) = stdio_hook {
                                hook.on_stdout(message.as_bytes());
                            }
                            stdout.push_str(&message);
                        }
                        1 => {
                            if let Some(hook) = stdio_hook {
                                hook.on_stderr(message.as_bytes());
                            }
                            stderr.push_str(&message);
                        }
                        _ => {}
                    }
                }
                BinaryFrame::ExecutionResult {
                    session_id,
                    exit_code,
                    exports,
                    error,
                } => {
                    if session_id != self.session_id {
                        continue;
                    }

                    return Ok(ExecutionOutput {
                        exit_code,
                        exports,
                        error,
                        stdout,
                        stderr,
                    });
                }
                _ => {
                    // Ignore unexpected frame types
                }
            }
        }
    }

    /// Destroy this session, releasing its V8 isolate.
    pub async fn destroy(&self) -> Result<()> {
        self.runtime
            .send_frame(&BinaryFrame::DestroySession {
                session_id: self.session_id.clone(),
            })
            .await
    }
}
