// Session management: create/destroy sessions with V8 isolates on dedicated threads

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;

use crossbeam_channel::{Receiver, Sender};

use crate::ipc::HostMessage;
#[cfg(not(test))]
use crate::{execution, isolate};

/// Commands sent to a session thread
pub enum SessionCommand {
    /// Shut down the session and destroy the isolate
    Shutdown,
    /// Forward a host message to the session for processing
    Message(HostMessage),
}

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
}

impl SessionManager {
    pub fn new(max_concurrency: usize) -> Self {
        SessionManager {
            sessions: HashMap::new(),
            max_concurrency,
            slot_control: Arc::new((Mutex::new(0), Condvar::new())),
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
    ) -> Result<(), String> {
        if self.sessions.contains_key(&session_id) {
            return Err(format!("session {} already exists", session_id));
        }

        let (tx, rx) = crossbeam_channel::unbounded();
        let slot_control = Arc::clone(&self.slot_control);
        let max = self.max_concurrency;

        let name_prefix = if session_id.len() > 8 {
            &session_id[..8]
        } else {
            &session_id
        };
        let join_handle = thread::Builder::new()
            .name(format!("session-{}", name_prefix))
            .spawn(move || {
                session_thread(heap_limit_mb, rx, slot_control, max);
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
        msg: HostMessage,
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
}

/// Session thread: acquires a concurrency slot, creates a V8 isolate, and
/// processes commands until shutdown.
fn session_thread(
    #[cfg_attr(test, allow(unused_variables))] heap_limit_mb: Option<u32>,
    rx: Receiver<SessionCommand>,
    slot_control: SlotControl,
    max_concurrency: usize,
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
    let (mut v8_isolate, v8_context) = {
        isolate::init_v8_platform();
        let mut iso = isolate::create_isolate(heap_limit_mb);
        // Disable WASM compilation before any code execution
        execution::disable_wasm(&mut iso);
        let ctx = isolate::create_context(&mut iso);
        (iso, ctx)
    };

    // Process commands until shutdown or channel close
    loop {
        match rx.recv() {
            Ok(SessionCommand::Shutdown) | Err(_) => break,
            Ok(SessionCommand::Message(_msg)) => {
                #[cfg(not(test))]
                match _msg {
                    HostMessage::InjectGlobals {
                        process_config,
                        os_config,
                        ..
                    } => {
                        let scope = &mut v8::HandleScope::new(&mut v8_isolate);
                        let ctx = v8::Local::new(scope, &v8_context);
                        let scope = &mut v8::ContextScope::new(scope, ctx);
                        execution::inject_globals(scope, &process_config, &os_config);
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
        drop(v8_context);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_management() {
        // Consolidated test to avoid V8 inter-test SIGSEGV issues.
        // Covers: lifecycle, connection binding, concurrency queuing, multi-connection.

        // --- Part 1: Single session create/destroy ---
        {
            let mut mgr = SessionManager::new(4);

            mgr.create_session("session-aaa".into(), 1, None)
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
            let mut mgr = SessionManager::new(4);

            mgr.create_session("session-bbb".into(), 1, None)
                .expect("create session B");
            mgr.create_session("session-ccc".into(), 1, Some(16))
                .expect("create session C");
            assert_eq!(mgr.session_count(), 2);

            std::thread::sleep(std::time::Duration::from_millis(200));

            // Duplicate session ID is rejected
            let err = mgr.create_session("session-bbb".into(), 1, None);
            assert!(err.is_err());
            assert!(err.unwrap_err().contains("already exists"));

            // Connection binding: connection 2 cannot destroy connection 1's session
            let err = mgr.destroy_session("session-bbb", 2);
            assert!(err.is_err());
            assert!(err.unwrap_err().contains("not owned"));

            // Connection binding: cannot send to another connection's session
            let err = mgr.send_to_session(
                "session-bbb",
                2,
                HostMessage::TerminateExecution {
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
            let mut mgr = SessionManager::new(2);

            mgr.create_session("s1".into(), 1, None).expect("create s1");
            mgr.create_session("s2".into(), 1, None).expect("create s2");
            mgr.create_session("s3".into(), 1, None).expect("create s3");

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
            let mut mgr = SessionManager::new(4);

            mgr.create_session("conn1-s1".into(), 100, None)
                .expect("create");
            mgr.create_session("conn2-s1".into(), 200, None)
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
