// Sync-blocking bridge call: serialize, write to socket, block on read, deserialize

use std::collections::HashSet;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use crate::ipc::{self, HostMessage, RustMessage};

/// Context for sync-blocking bridge calls from a V8 session.
///
/// Holds the IPC writer and reader, session ID, call_id counter, and
/// pending-call tracking. Used by V8 FunctionTemplate callbacks to
/// implement the sync-blocking bridge pattern.
pub struct BridgeCallContext {
    /// Writer for sending BridgeCall messages to the host
    writer: Mutex<Box<dyn Write + Send>>,
    /// Reader for receiving BridgeResponse messages from the host
    reader: Mutex<Box<dyn Read + Send>>,
    /// Session ID included in every BridgeCall
    pub session_id: String,
    /// Monotonically increasing call_id counter
    next_call_id: AtomicU32,
    /// Set of in-flight call_ids (for duplicate rejection)
    pending_calls: Mutex<HashSet<u32>>,
}

impl BridgeCallContext {
    pub fn new(
        writer: Box<dyn Write + Send>,
        reader: Box<dyn Read + Send>,
        session_id: String,
    ) -> Self {
        BridgeCallContext {
            writer: Mutex::new(writer),
            reader: Mutex::new(reader),
            session_id,
            next_call_id: AtomicU32::new(1),
            pending_calls: Mutex::new(HashSet::new()),
        }
    }

    /// Perform a sync-blocking bridge call.
    ///
    /// Generates a unique call_id, sends a BridgeCall message over IPC,
    /// blocks on read() for the BridgeResponse, and returns the result.
    /// Error responses from the host are returned as Err.
    pub fn sync_call(&self, method: &str, args: Vec<u8>) -> Result<Option<Vec<u8>>, String> {
        let call_id = self.next_call_id.fetch_add(1, Ordering::Relaxed);

        // Register call_id in pending set (reject duplicates)
        {
            let mut pending = self.pending_calls.lock().unwrap();
            if !pending.insert(call_id) {
                return Err(format!("duplicate call_id: {}", call_id));
            }
        }

        // Send BridgeCall to host
        let bridge_call = RustMessage::BridgeCall {
            call_id,
            session_id: self.session_id.clone(),
            method: method.to_string(),
            args,
        };

        {
            let mut writer = self.writer.lock().unwrap();
            if let Err(e) = ipc::write_message(&mut *writer, &bridge_call) {
                self.pending_calls.lock().unwrap().remove(&call_id);
                return Err(format!("failed to write BridgeCall: {}", e));
            }
        }

        // Block on read for BridgeResponse
        let response: HostMessage = {
            let mut reader = self.reader.lock().unwrap();
            match ipc::read_message(&mut *reader) {
                Ok(msg) => msg,
                Err(e) => {
                    self.pending_calls.lock().unwrap().remove(&call_id);
                    return Err(format!("failed to read BridgeResponse: {}", e));
                }
            }
        };

        // Remove from pending
        self.pending_calls.lock().unwrap().remove(&call_id);

        // Validate and extract BridgeResponse
        match response {
            HostMessage::BridgeResponse {
                call_id: resp_id,
                result,
                error,
            } => {
                if resp_id != call_id {
                    return Err(format!(
                        "call_id mismatch: expected {}, got {}",
                        call_id, resp_id
                    ));
                }
                if let Some(err) = error {
                    Err(err)
                } else {
                    Ok(result)
                }
            }
            _ => Err("expected BridgeResponse, got different message type".into()),
        }
    }

    /// Check if a call_id is currently pending.
    pub fn is_call_pending(&self, call_id: u32) -> bool {
        self.pending_calls.lock().unwrap().contains(&call_id)
    }

    /// Number of pending calls.
    pub fn pending_count(&self) -> usize {
        self.pending_calls.lock().unwrap().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::Arc;

    /// Shared writer that captures output for test inspection
    struct SharedWriter(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().write(buf)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            self.0.lock().unwrap().flush()
        }
    }

    /// Serialize a BridgeResponse into length-prefixed bytes
    fn make_response_bytes(
        call_id: u32,
        result: Option<Vec<u8>>,
        error: Option<String>,
    ) -> Vec<u8> {
        let mut buf = Vec::new();
        ipc::write_message(
            &mut buf,
            &HostMessage::BridgeResponse {
                call_id,
                result,
                error,
            },
        )
        .unwrap();
        buf
    }

    #[test]
    fn sync_call_success_with_result() {
        let response_bytes = make_response_bytes(1, Some(vec![0x93, 0x01, 0x02, 0x03]), None);
        let writer_buf = Arc::new(Mutex::new(Vec::new()));

        let ctx = BridgeCallContext::new(
            Box::new(SharedWriter(Arc::clone(&writer_buf))),
            Box::new(Cursor::new(response_bytes)),
            "test-session-abc".into(),
        );

        let result = ctx.sync_call("_fsReadFile", vec![0x91, 0xa3, 0x66, 0x6f, 0x6f]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Some(vec![0x93, 0x01, 0x02, 0x03]));

        // Verify the BridgeCall was written correctly
        let written = writer_buf.lock().unwrap();
        let call: RustMessage = ipc::read_message(&mut Cursor::new(&*written)).unwrap();
        match call {
            RustMessage::BridgeCall {
                call_id,
                session_id,
                method,
                args,
            } => {
                assert_eq!(call_id, 1);
                assert_eq!(session_id, "test-session-abc");
                assert_eq!(method, "_fsReadFile");
                assert_eq!(args, vec![0x91, 0xa3, 0x66, 0x6f, 0x6f]);
            }
            _ => panic!("expected BridgeCall"),
        }
    }

    #[test]
    fn sync_call_success_null_result() {
        let response_bytes = make_response_bytes(1, None, None);
        let ctx = BridgeCallContext::new(
            Box::new(Vec::new()),
            Box::new(Cursor::new(response_bytes)),
            "session-1".into(),
        );

        let result = ctx.sync_call("_log", vec![0xc0]).unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn sync_call_error_response() {
        let response_bytes =
            make_response_bytes(1, None, Some("ENOENT: no such file".into()));
        let ctx = BridgeCallContext::new(
            Box::new(Vec::new()),
            Box::new(Cursor::new(response_bytes)),
            "session-1".into(),
        );

        let result = ctx.sync_call("_fsReadFile", vec![0xc0]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ENOENT: no such file");
    }

    #[test]
    fn sync_call_call_id_increments() {
        // Prepare two sequential responses
        let mut response_bytes = make_response_bytes(1, Some(vec![0xa1, 0x61]), None);
        response_bytes.extend_from_slice(&make_response_bytes(
            2,
            Some(vec![0xa1, 0x62]),
            None,
        ));

        let ctx = BridgeCallContext::new(
            Box::new(Vec::new()),
            Box::new(Cursor::new(response_bytes)),
            "session-1".into(),
        );

        let r1 = ctx.sync_call("_fn1", vec![]).unwrap();
        let r2 = ctx.sync_call("_fn2", vec![]).unwrap();
        assert_eq!(r1, Some(vec![0xa1, 0x61]));
        assert_eq!(r2, Some(vec![0xa1, 0x62]));
    }

    #[test]
    fn sync_call_pending_cleanup_on_read_error() {
        // Empty reader = EOF error; call_id should be cleaned up
        let ctx = BridgeCallContext::new(
            Box::new(Vec::new()),
            Box::new(Cursor::new(Vec::new())),
            "session-1".into(),
        );

        assert_eq!(ctx.pending_count(), 0);
        let _ = ctx.sync_call("_fn", vec![]);
        assert_eq!(ctx.pending_count(), 0);
    }

    #[test]
    fn sync_call_id_mismatch_rejected() {
        // Response has call_id=99 but expected call_id=1
        let response_bytes = make_response_bytes(99, Some(vec![0xc0]), None);
        let ctx = BridgeCallContext::new(
            Box::new(Vec::new()),
            Box::new(Cursor::new(response_bytes)),
            "session-1".into(),
        );

        let result = ctx.sync_call("_fn", vec![]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("call_id mismatch"));
    }

    #[test]
    fn sync_call_unexpected_message_type_rejected() {
        // Response is not a BridgeResponse
        let mut response_bytes = Vec::new();
        ipc::write_message(
            &mut response_bytes,
            &HostMessage::TerminateExecution {
                session_id: "session-1".into(),
            },
        )
        .unwrap();

        let ctx = BridgeCallContext::new(
            Box::new(Vec::new()),
            Box::new(Cursor::new(response_bytes)),
            "session-1".into(),
        );

        let result = ctx.sync_call("_fn", vec![]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("expected BridgeResponse"));
    }
}
