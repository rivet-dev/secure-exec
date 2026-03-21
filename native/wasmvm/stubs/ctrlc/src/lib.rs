//! WASM-compatible stub for the ctrlc crate.
//! Signal handling is not available in WASM, so all handlers are no-ops.

use std::fmt;

/// Ctrl-C error.
#[derive(Debug)]
pub enum Error {
    /// Ctrl-C signal handler already registered.
    MultipleHandlers,
    /// Unexpected system error.
    System(std::io::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Error::MultipleHandlers => write!(f, "Ctrl-C signal handler already registered"),
            Error::System(e) => write!(f, "Ctrl-C system error: {}", e),
        }
    }
}

impl std::error::Error for Error {}

/// Platform-specific signal type (stub for WASM).
pub type Signal = i32;

/// Signal type enum.
#[derive(Debug)]
pub enum SignalType {
    /// Ctrl-C
    Ctrlc,
    /// Program termination
    Termination,
    /// Other signal
    Other(Signal),
}

/// Register signal handler for Ctrl-C (no-op on WASM).
pub fn set_handler<F>(_user_handler: F) -> Result<(), Error>
where
    F: FnMut() + 'static + Send,
{
    Ok(())
}

/// Register signal handler, erroring if one already exists (no-op on WASM).
pub fn try_set_handler<F>(_user_handler: F) -> Result<(), Error>
where
    F: FnMut() + 'static + Send,
{
    Ok(())
}
