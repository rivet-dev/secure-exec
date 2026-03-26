use std::collections::HashMap;

use crate::{BoxFuture, Error, Result};

/// Options for spawning a child process.
#[derive(Clone, Debug)]
pub struct SpawnOptions {
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

/// Handle to a spawned child process.
///
/// Implementations manage the lifecycle of a single child process
/// including stdin, signals, and waiting for exit.
pub trait SpawnedProcess: Send {
    fn write_stdin<'a>(&'a self, data: &'a [u8]) -> BoxFuture<'a, Result<()>>;
    fn close_stdin(&self) -> BoxFuture<'_, Result<()>>;
    fn kill(&self, signal: Option<i32>) -> BoxFuture<'_, Result<()>>;
    fn wait(&self) -> BoxFuture<'_, Result<i32>>;
}

/// Callback for child process stdout/stderr output.
pub type OnOutput = Box<dyn Fn(&[u8]) + Send + Sync>;

/// Command executor trait mirroring TypeScript `CommandExecutor`.
///
/// Provides the ability to spawn child processes from sandboxed code.
pub trait CommandExecutor: Send + Sync {
    fn spawn<'a>(
        &'a self,
        command: &'a str,
        args: &'a [String],
        options: SpawnOptions,
        on_stdout: Option<OnOutput>,
        on_stderr: Option<OnOutput>,
    ) -> BoxFuture<'a, Result<Box<dyn SpawnedProcess>>>;
}

/// Command executor that denies all spawn operations with permission denied errors.
pub struct DenyAllCommandExecutor;

/// Placeholder process type for DenyAllCommandExecutor (never constructed).
pub struct DeniedProcess;

impl SpawnedProcess for DeniedProcess {
    fn write_stdin<'a>(&'a self, _data: &'a [u8]) -> BoxFuture<'a, Result<()>> {
        Box::pin(async {
            Err(Error::PermissionDenied {
                message: "command execution not permitted".into(),
            })
        })
    }

    fn close_stdin(&self) -> BoxFuture<'_, Result<()>> {
        Box::pin(async {
            Err(Error::PermissionDenied {
                message: "command execution not permitted".into(),
            })
        })
    }

    fn kill(&self, _signal: Option<i32>) -> BoxFuture<'_, Result<()>> {
        Box::pin(async {
            Err(Error::PermissionDenied {
                message: "command execution not permitted".into(),
            })
        })
    }

    fn wait(&self) -> BoxFuture<'_, Result<i32>> {
        Box::pin(async {
            Err(Error::PermissionDenied {
                message: "command execution not permitted".into(),
            })
        })
    }
}

impl CommandExecutor for DenyAllCommandExecutor {
    fn spawn<'a>(
        &'a self,
        _command: &'a str,
        _args: &'a [String],
        _options: SpawnOptions,
        _on_stdout: Option<OnOutput>,
        _on_stderr: Option<OnOutput>,
    ) -> BoxFuture<'a, Result<Box<dyn SpawnedProcess>>> {
        Box::pin(async {
            Err(Error::PermissionDenied {
                message: "command execution not permitted".into(),
            })
        })
    }
}
