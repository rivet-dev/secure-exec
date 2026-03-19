// Session management: create/destroy sessions with V8 isolates on dedicated threads

use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;

use crossbeam_channel::{Receiver, Sender};

use crate::host_call::CallIdRouter;
use crate::ipc_binary::BinaryFrame;
#[cfg(not(test))]
use crate::host_call::BridgeCallContext;
#[cfg(not(test))]
use crate::ipc_binary::{self, ExecutionErrorBin};
#[cfg(not(test))]
use crate::{bridge, execution, isolate, stream};

/// Commands sent to a session thread
pub enum SessionCommand {
    /// Shut down the session and destroy the isolate
    Shutdown,
    /// Forward a binary frame to the session for processing
    Message(BinaryFrame),
}

/// Shared IPC writer for outgoing messages to the host.
/// Wrapped in Arc<Mutex<>> so multiple session threads can share a connection writer.
pub type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;

/// Internal entry for a running session
struct SessionEntry {
    /// Channel to send commands to the session thread
    tx: Sender<SessionCommand>,
    /// Connection that owns this session
    connection_id: u64,
    /// Thread join handle
    join_handle: Option<thread::JoinHandle<()>>,
}

/// Concurrency slot tracker shared across session threads
type SlotControl = Arc<(Mutex<usize>, Condvar)>;

/// Manages V8 sessions with concurrency limiting and connection binding.
///
/// Sessions are bound to the connection that created them. Other connections
/// cannot interact with a session they don't own. Each session runs on a
/// dedicated OS thread with its own V8 isolate.
pub struct SessionManager {
    sessions: HashMap<String, SessionEntry>,
    max_concurrency: usize,
    slot_control: SlotControl,
    /// Shared IPC writer for outgoing messages (all sessions on a connection)
    writer: SharedWriter,
    /// Call_id → session_id routing table for BridgeResponse dispatch
    call_id_router: CallIdRouter,
}

impl SessionManager {
    pub fn new(max_concurrency: usize, writer: SharedWriter, call_id_router: CallIdRouter) -> Self {
        SessionManager {
            sessions: HashMap::new(),
            max_concurrency,
            slot_control: Arc::new((Mutex::new(0), Condvar::new())),
            writer,
            call_id_router,
        }
    }

    /// Create a new session bound to the given connection.
    /// Spawns a dedicated thread with a V8 isolate. If max concurrency is
    /// reached, the session thread will block until a slot becomes available.
    pub fn create_session(
        &mut self,
        session_id: String,
        connection_id: u64,
        heap_limit_mb: Option<u32>,
        cpu_time_limit_ms: Option<u32>,
    ) -> Result<(), String> {
        if self.sessions.contains_key(&session_id) {
            return Err(format!("session {} already exists", session_id));
        }

        let (tx, rx) = crossbeam_channel::unbounded();
        let slot_control = Arc::clone(&self.slot_control);
        let max = self.max_concurrency;
        let writer = Arc::clone(&self.writer);
        let router = Arc::clone(&self.call_id_router);

        let name_prefix = if session_id.len() > 8 {
            &session_id[..8]
        } else {
            &session_id
        };
        let join_handle = thread::Builder::new()
            .name(format!("session-{}", name_prefix))
            .spawn(move || {
                session_thread(heap_limit_mb, cpu_time_limit_ms, rx, slot_control, max, writer, router);
            })
            .map_err(|e| format!("failed to spawn session thread: {}", e))?;

        self.sessions.insert(
            session_id,
            SessionEntry {
                tx,
                connection_id,
                join_handle: Some(join_handle),
            },
        );

        Ok(())
    }

    /// Destroy a session. Sends shutdown to the session thread and joins it.
    /// Returns an error if the session doesn't exist or belongs to another connection.
    pub fn destroy_session(
        &mut self,
        session_id: &str,
        connection_id: u64,
    ) -> Result<(), String> {
        let entry = self
            .sessions
            .get(session_id)
            .ok_or_else(|| format!("session {} does not exist", session_id))?;

        if entry.connection_id != connection_id {
            return Err(format!(
                "session {} is not owned by this connection",
                session_id
            ));
        }

        // Send shutdown and join
        let _ = entry.tx.send(SessionCommand::Shutdown);
        let mut entry = self.sessions.remove(session_id).unwrap();
        if let Some(handle) = entry.join_handle.take() {
            let _ = handle.join();
        }

        Ok(())
    }

    /// Send a message to a session, verifying connection ownership.
    pub fn send_to_session(
        &self,
        session_id: &str,
        connection_id: u64,
        msg: BinaryFrame,
    ) -> Result<(), String> {
        let entry = self
            .sessions
            .get(session_id)
            .ok_or_else(|| format!("session {} does not exist", session_id))?;

        if entry.connection_id != connection_id {
            return Err(format!(
                "session {} is not owned by this connection",
                session_id
            ));
        }

        entry
            .tx
            .send(SessionCommand::Message(msg))
            .map_err(|e| format!("session thread disconnected: {}", e))
    }

    /// Destroy all sessions belonging to a connection (called on disconnect).
    pub fn destroy_connection_sessions(&mut self, connection_id: u64) {
        let session_ids: Vec<String> = self
            .sessions
            .iter()
            .filter(|(_, entry)| entry.connection_id == connection_id)
            .map(|(id, _)| id.clone())
            .collect();

        for sid in session_ids {
            let _ = self.destroy_session(&sid, connection_id);
        }
    }

    /// Number of registered sessions (including those waiting for a slot).
    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    /// Return all session IDs with their owning connection IDs.
    pub fn all_sessions(&self) -> Vec<(String, u64)> {
        self.sessions
            .iter()
            .map(|(id, entry)| (id.clone(), entry.connection_id))
            .collect()
    }

    /// Number of sessions that have acquired a concurrency slot.
    pub fn active_slot_count(&self) -> usize {
        let (lock, _) = &*self.slot_control;
        *lock.lock().unwrap()
    }

    /// Get the call_id routing table for BridgeResponse dispatch.
    pub fn call_id_router(&self) -> &CallIdRouter {
        &self.call_id_router
    }
}

/// Write a BinaryFrame to the shared IPC writer.
#[cfg(not(test))]
fn send_message(writer: &SharedWriter, frame: &BinaryFrame) {
    let mut w = writer.lock().unwrap();
    if let Err(e) = ipc_binary::write_frame(&mut *w, frame) {
        eprintln!("failed to write IPC message: {}", e);
    }
}

/// Session thread: acquires a concurrency slot, creates a V8 isolate, and
/// processes commands until shutdown.
fn session_thread(
    #[cfg_attr(test, allow(unused_variables))] heap_limit_mb: Option<u32>,
    #[cfg_attr(test, allow(unused_variables))] cpu_time_limit_ms: Option<u32>,
    rx: Receiver<SessionCommand>,
    slot_control: SlotControl,
    max_concurrency: usize,
    #[cfg_attr(test, allow(unused_variables))] writer: SharedWriter,
    #[cfg_attr(test, allow(unused_variables))] call_id_router: CallIdRouter,
) {
    // Acquire concurrency slot (blocks if at capacity)
    {
        let (lock, cvar) = &*slot_control;
        let mut count = lock.lock().unwrap();
        while *count >= max_concurrency {
            count = cvar.wait(count).unwrap();
        }
        *count += 1;
    }

    // Create V8 isolate and context
    // In test mode, skip V8 to avoid inter-test SIGSEGV (V8 lifecycle tested in isolate::tests)
    #[cfg(not(test))]
    let (mut v8_isolate, _v8_context) = {
        isolate::init_v8_platform();
        let mut iso = isolate::create_isolate(heap_limit_mb);
        // Disable WASM compilation before any code execution
        execution::disable_wasm(&mut iso);
        let ctx = isolate::create_context(&mut iso);
        (iso, ctx)
    };

    #[cfg(not(test))]
    let pending = bridge::PendingPromises::new();

    // Store latest InjectGlobals V8 payload for re-injection into fresh contexts
    #[cfg(not(test))]
    let mut last_globals_payload: Option<Vec<u8>> = None;

    // Process commands until shutdown or channel close
    loop {
        match rx.recv() {
            Ok(SessionCommand::Shutdown) | Err(_) => break,
            Ok(SessionCommand::Message(_msg)) => {
                #[cfg(not(test))]
                match _msg {
                    BinaryFrame::InjectGlobals {
                        payload,
                        ..
                    } => {
                        // Store V8-serialized config for injection into fresh context at Execute time
                        last_globals_payload = Some(payload);
                    }
                    BinaryFrame::Execute {
                        session_id,
                        bridge_code,
                        user_code,
                        mode,
                        file_path,
                    } => {
                        // Create a fresh V8 context per execution (clean global scope)
                        let exec_context = isolate::create_context(&mut v8_isolate);

                        // Inject globals from last InjectGlobals payload into the fresh context
                        if let Some(ref payload) = last_globals_payload {
                            let scope = &mut v8::HandleScope::new(&mut v8_isolate);
                            let ctx = v8::Local::new(scope, &exec_context);
                            let scope = &mut v8::ContextScope::new(scope, ctx);
                            execution::inject_globals_from_payload(scope, payload);
                        }

                        // Create abort channel for timeout enforcement
                        let (maybe_abort_tx, maybe_abort_rx) = if cpu_time_limit_ms.is_some() {
                            let (tx, rx) = crossbeam_channel::bounded::<()>(0);
                            (Some(tx), Some(rx))
                        } else {
                            (None, None)
                        };

                        // Create BridgeCallContext with real IPC writer and channel-based reader
                        let channel_reader = match maybe_abort_rx {
                            Some(ref arx) => ChannelMessageReader::with_abort(rx.clone(), arx.clone()),
                            None => ChannelMessageReader::new(rx.clone()),
                        };
                        let bridge_ctx = BridgeCallContext::with_router(
                            Box::new(MutexWriter(Arc::clone(&writer))),
                            Box::new(channel_reader),
                            session_id.clone(),
                            Arc::clone(&call_id_router),
                        );

                        // Register sync and async bridge functions
                        let _sync_store;
                        let _async_store;
                        {
                            let scope = &mut v8::HandleScope::new(&mut v8_isolate);
                            let ctx = v8::Local::new(scope, &exec_context);
                            let scope = &mut v8::ContextScope::new(scope, ctx);

                            _sync_store = bridge::register_sync_bridge_fns(
                                scope,
                                &bridge_ctx as *const BridgeCallContext,
                                &SYNC_BRIDGE_FNS,
                            );

                            _async_store = bridge::register_async_bridge_fns(
                                scope,
                                &bridge_ctx as *const BridgeCallContext,
                                &pending as *const bridge::PendingPromises,
                                &ASYNC_BRIDGE_FNS,
                            );
                        }

                        // Start timeout guard before execution
                        let mut timeout_guard = match (cpu_time_limit_ms, maybe_abort_tx) {
                            (Some(ms), Some(abort_tx)) => {
                                let handle = v8_isolate.thread_safe_handle();
                                Some(crate::timeout::TimeoutGuard::new(ms, handle, abort_tx))
                            }
                            _ => None,
                        };

                        // Execute code (fresh context per execution)
                        let file_path_opt = if file_path.is_empty() { None } else { Some(file_path.as_str()) };
                        let (code, exports, error) = if mode == 0 {
                            let scope = &mut v8::HandleScope::new(&mut v8_isolate);
                            let ctx = v8::Local::new(scope, &exec_context);
                            let scope = &mut v8::ContextScope::new(scope, ctx);
                            let (c, e) =
                                execution::execute_script(scope, &bridge_code, &user_code);
                            (c, None, e)
                        } else {
                            let scope = &mut v8::HandleScope::new(&mut v8_isolate);
                            let ctx = v8::Local::new(scope, &exec_context);
                            let scope = &mut v8::ContextScope::new(scope, ctx);
                            execution::execute_module(
                                scope,
                                &bridge_ctx,
                                &bridge_code,
                                &user_code,
                                file_path_opt,
                            )
                        };

                        // Run event loop if there are pending async promises
                        let terminated = if pending.len() > 0 {
                            let scope = &mut v8::HandleScope::new(&mut v8_isolate);
                            let ctx = v8::Local::new(scope, &exec_context);
                            let scope = &mut v8::ContextScope::new(scope, ctx);
                            !run_event_loop(scope, &rx, &pending, maybe_abort_rx.as_ref())
                        } else {
                            false
                        };

                        // Check if timeout fired
                        let timed_out = timeout_guard.as_ref().map_or(false, |g| g.timed_out());

                        // Cancel timeout guard (joins timer thread)
                        if let Some(ref mut guard) = timeout_guard {
                            guard.cancel();
                        }
                        drop(timeout_guard);

                        // Send ExecutionResult
                        let result_frame = if timed_out {
                            BinaryFrame::ExecutionResult {
                                session_id,
                                exit_code: 1,
                                exports: None,
                                error: Some(ExecutionErrorBin {
                                    error_type: "Error".into(),
                                    message: "Script execution timed out".into(),
                                    stack: String::new(),
                                    code: "ERR_SCRIPT_EXECUTION_TIMEOUT".into(),
                                }),
                            }
                        } else if terminated {
                            BinaryFrame::ExecutionResult {
                                session_id,
                                exit_code: 1,
                                exports: None,
                                error: Some(ExecutionErrorBin {
                                    error_type: "Error".into(),
                                    message: "Execution terminated".into(),
                                    stack: String::new(),
                                    code: String::new(),
                                }),
                            }
                        } else {
                            BinaryFrame::ExecutionResult {
                                session_id,
                                exit_code: code,
                                exports,
                                error: error.map(|e| ExecutionErrorBin {
                                    error_type: e.error_type,
                                    message: e.message,
                                    stack: e.stack,
                                    code: e.code.unwrap_or_default(),
                                }),
                            }
                        };

                        send_message(&writer, &result_frame);
                    }
                    _ => {
                        // Other messages handled in later stories
                    }
                }
            }
        }
    }

    // Drop V8 resources (only present in non-test mode)
    #[cfg(not(test))]
    {
        drop(_v8_context);
        drop(v8_isolate);
    }

    // Release concurrency slot
    {
        let (lock, cvar) = &*slot_control;
        let mut count = lock.lock().unwrap();
        *count -= 1;
        cvar.notify_one();
    }
}

/// Sync and async bridge function names registered on the V8 global.
/// These match the bridge contract (bridge-contract.ts HOST_BRIDGE_GLOBAL_KEYS).
///
/// Sync functions block V8 while the host processes the call (applySync/applySyncPromise).
/// Async functions return a Promise to V8, resolved when the host responds (apply).
#[cfg(not(test))]
const SYNC_BRIDGE_FNS: [&str; 31] = [
    // Console
    "_log",
    "_error",
    // Module loading (syncPromise — host resolves async, Rust blocks)
    "_resolveModule",
    "_loadFile",
    "_loadPolyfill",
    // Crypto
    "_cryptoRandomFill",
    "_cryptoRandomUUID",
    // Filesystem (all syncPromise)
    "_fsReadFile",
    "_fsWriteFile",
    "_fsReadFileBinary",
    "_fsWriteFileBinary",
    "_fsReadDir",
    "_fsMkdir",
    "_fsRmdir",
    "_fsExists",
    "_fsStat",
    "_fsUnlink",
    "_fsRename",
    "_fsChmod",
    "_fsChown",
    "_fsLink",
    "_fsSymlink",
    "_fsReadlink",
    "_fsLstat",
    "_fsTruncate",
    "_fsUtimes",
    // Child process (sync)
    "_childProcessSpawnStart",
    "_childProcessStdinWrite",
    "_childProcessStdinClose",
    "_childProcessKill",
    "_childProcessSpawnSync",
];

#[cfg(not(test))]
const ASYNC_BRIDGE_FNS: [&str; 7] = [
    // Module loading (async)
    "_dynamicImport",
    // Timer
    "_scheduleTimer",
    // Network (async)
    "_networkFetchRaw",
    "_networkDnsLookupRaw",
    "_networkHttpRequestRaw",
    "_networkHttpServerListenRaw",
    "_networkHttpServerCloseRaw",
];

/// Run the session event loop: dispatch incoming messages to V8.
///
/// Called after script/module execution when there are pending async promises.
/// Polls the session channel for BridgeResponse, StreamEvent, and
/// TerminateExecution messages, dispatching each into V8 with microtask flush.
///
/// When `abort_rx` is provided (timeout is configured), uses `select!` to
/// also monitor the abort channel — if the timeout fires and drops the sender,
/// the abort channel unblocks and terminates execution.
///
/// Returns true if execution completed normally, false if terminated.
pub(crate) fn run_event_loop(
    scope: &mut v8::HandleScope,
    rx: &Receiver<SessionCommand>,
    pending: &crate::bridge::PendingPromises,
    abort_rx: Option<&crossbeam_channel::Receiver<()>>,
) -> bool {
    while pending.len() > 0 {
        // Receive next command, with optional abort monitoring
        let cmd = if let Some(abort) = abort_rx {
            crossbeam_channel::select! {
                recv(rx) -> result => match result {
                    Ok(cmd) => cmd,
                    Err(_) => return false,
                },
                recv(abort) -> _ => {
                    // Timeout fired — abort channel closed
                    scope.terminate_execution();
                    return false;
                },
            }
        } else {
            match rx.recv() {
                Ok(cmd) => cmd,
                Err(_) => return false,
            }
        };

        match cmd {
            SessionCommand::Message(frame) => match frame {
                BinaryFrame::BridgeResponse {
                    call_id,
                    status,
                    payload,
                    ..
                } => {
                    let (result, error) = if status == 1 {
                        (None, Some(String::from_utf8_lossy(&payload).to_string()))
                    } else if !payload.is_empty() {
                        // status=0: V8-serialized, status=2: raw binary (Uint8Array)
                        (Some(payload), None)
                    } else {
                        (None, None)
                    };
                    let _ = crate::bridge::resolve_pending_promise(
                        scope, pending, call_id, result, error,
                    );
                    // Microtasks already flushed in resolve_pending_promise
                }
                BinaryFrame::StreamEvent {
                    event_type,
                    payload,
                    ..
                } => {
                    crate::stream::dispatch_stream_event(scope, &event_type, &payload);
                    scope.perform_microtask_checkpoint();
                }
                BinaryFrame::TerminateExecution { .. } => {
                    scope.terminate_execution();
                    return false;
                }
                _ => {
                    // Ignore other messages during event loop
                }
            },
            SessionCommand::Shutdown => return false,
        }
    }
    true
}

/// Writer adapter that wraps Arc<Mutex<Box<dyn Write + Send>>> for BridgeCallContext.
#[cfg(not(test))]
struct MutexWriter(SharedWriter);

#[cfg(not(test))]
impl std::io::Write for MutexWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.0.lock().unwrap().flush()
    }
}

/// Reader adapter that wraps a crossbeam Receiver<SessionCommand> as a Read.
///
/// When sync_call reads from this, it blocks on the channel waiting for the next
/// message. The message is serialized into the internal buffer and bytes are
/// served from there. This allows BridgeCallContext.sync_call() to work unchanged
/// while reading from the session's channel instead of a raw socket.
///
/// When `abort_rx` is set (timeout configured), uses `select!` to also monitor
/// the abort channel. If the timeout fires, the abort sender is dropped, which
/// unblocks the select and returns a TimedOut error.
#[cfg(not(test))]
struct ChannelMessageReader {
    rx: Receiver<SessionCommand>,
    abort_rx: Option<crossbeam_channel::Receiver<()>>,
    buf: Vec<u8>,
    pos: usize,
}

#[cfg(not(test))]
impl ChannelMessageReader {
    fn new(rx: Receiver<SessionCommand>) -> Self {
        ChannelMessageReader {
            rx,
            abort_rx: None,
            buf: Vec::new(),
            pos: 0,
        }
    }

    fn with_abort(rx: Receiver<SessionCommand>, abort_rx: crossbeam_channel::Receiver<()>) -> Self {
        ChannelMessageReader {
            rx,
            abort_rx: Some(abort_rx),
            buf: Vec::new(),
            pos: 0,
        }
    }
}

#[cfg(not(test))]
impl std::io::Read for ChannelMessageReader {
    fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
        // Serve bytes from buffered message
        if self.pos < self.buf.len() {
            let available = self.buf.len() - self.pos;
            let n = std::cmp::min(output.len(), available);
            output[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
            self.pos += n;
            return Ok(n);
        }

        // Wait for next message, with optional abort monitoring
        let cmd = if let Some(ref abort) = self.abort_rx {
            crossbeam_channel::select! {
                recv(self.rx) -> result => match result {
                    Ok(cmd) => cmd,
                    Err(_) => return Err(std::io::Error::new(
                        std::io::ErrorKind::UnexpectedEof,
                        "channel closed",
                    )),
                },
                recv(abort) -> _ => {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::TimedOut,
                        "execution timed out",
                    ));
                },
            }
        } else {
            match self.rx.recv() {
                Ok(cmd) => cmd,
                Err(_) => return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "channel closed",
                )),
            }
        };

        match cmd {
            SessionCommand::Message(frame) => {
                self.buf.clear();
                self.pos = 0;
                // Serialize the BinaryFrame with length-prefixed framing
                ipc_binary::write_frame(&mut self.buf, &frame)?;
                // Serve from buffer
                let n = std::cmp::min(output.len(), self.buf.len());
                output[..n].copy_from_slice(&self.buf[..n]);
                self.pos = n;
                Ok(n)
            }
            SessionCommand::Shutdown => Err(std::io::Error::new(
                std::io::ErrorKind::ConnectionAborted,
                "session shutdown",
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Helper to create a SessionManager for tests
    fn test_manager(max: usize) -> SessionManager {
        let writer: SharedWriter = Arc::new(Mutex::new(Box::new(Vec::<u8>::new())));
        let router: CallIdRouter = Arc::new(Mutex::new(HashMap::new()));
        SessionManager::new(max, writer, router)
    }

    #[test]
    fn session_management() {
        // Consolidated test to avoid V8 inter-test SIGSEGV issues.
        // Covers: lifecycle, connection binding, concurrency queuing, multi-connection.

        // --- Part 1: Single session create/destroy ---
        {
            let mut mgr = test_manager(4);

            mgr.create_session("session-aaa".into(), 1, None, None)
                .expect("create session A");
            assert_eq!(mgr.session_count(), 1);

            // Wait for thread to acquire slot and create isolate
            std::thread::sleep(std::time::Duration::from_millis(200));

            // Destroy session A
            mgr.destroy_session("session-aaa", 1)
                .expect("destroy session A");
            assert_eq!(mgr.session_count(), 0);
        }

        // --- Part 2: Multiple sessions + connection binding ---
        {
            let mut mgr = test_manager(4);

            mgr.create_session("session-bbb".into(), 1, None, None)
                .expect("create session B");
            mgr.create_session("session-ccc".into(), 1, Some(16), None)
                .expect("create session C");
            assert_eq!(mgr.session_count(), 2);

            std::thread::sleep(std::time::Duration::from_millis(200));

            // Duplicate session ID is rejected
            let err = mgr.create_session("session-bbb".into(), 1, None, None);            assert!(err.is_err());
            assert!(err.unwrap_err().contains("already exists"));

            // Connection binding: connection 2 cannot destroy connection 1's session
            let err = mgr.destroy_session("session-bbb", 2);
            assert!(err.is_err());
            assert!(err.unwrap_err().contains("not owned"));

            // Connection binding: cannot send to another connection's session
            let err = mgr.send_to_session(
                "session-bbb",
                2,
                BinaryFrame::TerminateExecution {
                    session_id: "session-bbb".into(),
                },
            );
            assert!(err.is_err());
            assert!(err.unwrap_err().contains("not owned"));

            // Destroy non-existent session
            let err = mgr.destroy_session("no-such-session", 1);
            assert!(err.is_err());
            assert!(err.unwrap_err().contains("does not exist"));

            // Destroy remaining on disconnect
            mgr.destroy_connection_sessions(1);
            assert_eq!(mgr.session_count(), 0);
        }

        // --- Part 3: Max concurrency queuing ---
        {
            let mut mgr = test_manager(2);

            mgr.create_session("s1".into(), 1, None, None).expect("create s1");
            mgr.create_session("s2".into(), 1, None, None).expect("create s2");
            mgr.create_session("s3".into(), 1, None, None).expect("create s3");

            // Allow threads to acquire slots
            std::thread::sleep(std::time::Duration::from_millis(300));

            // Only 2 slots active (s3 is queued)
            assert_eq!(mgr.active_slot_count(), 2);
            assert_eq!(mgr.session_count(), 3);

            // Destroy s1 — releases slot, s3 acquires it
            mgr.destroy_session("s1", 1).expect("destroy s1");
            std::thread::sleep(std::time::Duration::from_millis(300));
            assert_eq!(mgr.active_slot_count(), 2);
            assert_eq!(mgr.session_count(), 2);

            // Destroy remaining
            mgr.destroy_connection_sessions(1);
            std::thread::sleep(std::time::Duration::from_millis(100));
            assert_eq!(mgr.session_count(), 0);
            assert_eq!(mgr.active_slot_count(), 0);
        }

        // --- Part 4: Multiple connections ---
        {
            let mut mgr = test_manager(4);

            mgr.create_session("conn1-s1".into(), 100, None, None)
                .expect("create");
            mgr.create_session("conn2-s1".into(), 200, None, None)
                .expect("create");

            std::thread::sleep(std::time::Duration::from_millis(200));

            // Connection 100 cannot touch connection 200's session
            let err = mgr.destroy_session("conn2-s1", 100);
            assert!(err.is_err());

            // destroy_connection_sessions only cleans up the given connection
            mgr.destroy_connection_sessions(100);
            assert_eq!(mgr.session_count(), 1);

            mgr.destroy_session("conn2-s1", 200).expect("destroy");
            assert_eq!(mgr.session_count(), 0);
        }
    }
}
