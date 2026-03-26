use std::fmt;

/// Crate-level error type for secure-exec-rs operations.
#[derive(Clone, Debug)]
pub enum Error {
    /// I/O or filesystem error (with optional errno-style code).
    Io { message: String, code: Option<String> },
    /// IPC protocol or framing error.
    Ipc(String),
    /// V8 runtime lifecycle error (spawn, connect, auth).
    Runtime(String),
    /// Permission denied by the Permissions trait.
    PermissionDenied { message: String },
    /// Operation not supported (e.g. missing adapter).
    NotSupported(String),
    /// Serialization/deserialization error.
    Serialization(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io { message, code } => {
                if let Some(code) = code {
                    write!(f, "[{}] {}", code, message)
                } else {
                    write!(f, "{}", message)
                }
            }
            Error::Ipc(msg) => write!(f, "IPC error: {}", msg),
            Error::Runtime(msg) => write!(f, "Runtime error: {}", msg),
            Error::PermissionDenied { message } => write!(f, "Permission denied: {}", message),
            Error::NotSupported(msg) => write!(f, "Not supported: {}", msg),
            Error::Serialization(msg) => write!(f, "Serialization error: {}", msg),
        }
    }
}

impl std::error::Error for Error {}

/// Crate-level Result type alias.
pub type Result<T> = std::result::Result<T, Error>;
