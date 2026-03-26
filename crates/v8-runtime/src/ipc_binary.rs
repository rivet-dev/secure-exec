// Re-export all IPC binary framing from the shared crate.
//
// The implementation lives in crates/secure-exec-ipc/ so both
// secure-exec-v8 (this binary) and secure-exec-rs (host library)
// use identical encode/decode logic.

pub use secure_exec_ipc::*;
