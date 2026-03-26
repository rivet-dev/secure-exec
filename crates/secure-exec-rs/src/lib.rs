use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub mod bridge;
pub mod command;
pub mod driver;
pub mod error;
pub mod fs;
pub mod ipc;
pub mod network;
pub mod permissions;
pub mod runtime;
pub mod system;
pub mod v8_runtime;

/// Boxed future type for object-safe async trait methods.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Pre-built bridge JS bundle embedded at compile time.
///
/// This is the static bridge IIFE composed from the isolate-runtime sources
/// and the raw bridge bundle (`packages/secure-exec-core`). It is sent in
/// Execute frames as `bridge_code` and used for snapshot warmup.
pub const BRIDGE_CODE: &str = include_str!("../bridge/bridge.js");

pub use command::{CommandExecutor, DenyAllCommandExecutor, SpawnOptions, SpawnedProcess};
pub use driver::{
    RuntimeDriver, RuntimeDriverFactory, RuntimeDriverOptions, StdioHook, TimingMitigation,
};
pub use error::{Error, Result};
pub use fs::{DirEntry, FileStat, FileSystem, InMemoryFs};
pub use network::{
    DenyAllNetwork, DnsResult, FetchOptions, FetchResponse, HttpRequestOptions, HttpResponse,
    NetworkAdapter,
};
pub use permissions::{
    wrap_command_executor, wrap_filesystem, wrap_network, AllowAll, ChildProcessAccessRequest,
    EnvAccessRequest, EnvOp, FsAccessRequest, FsOp, NetworkAccessRequest, NetworkOp,
    PermissionDecision, Permissions,
};
pub use runtime::{NodeRuntime, NodeRuntimeOptions};
pub use system::{DriverRuntimeConfig, OsConfig, ProcessConfig, SystemDriver};
pub use v8_runtime::{V8Runtime, V8RuntimeOptions, V8Session, V8SessionOptions};

/// Error details from a failed script execution inside the V8 sandbox.
#[derive(Clone, Debug)]
pub struct ExecError {
    pub error_type: String,
    pub message: String,
    pub stack: String,
    pub code: Option<String>,
}

/// Result of executing a CJS script via `NodeRuntime::exec`.
#[derive(Clone, Debug)]
pub struct ExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<ExecError>,
}

/// Result of running an ESM module via `NodeRuntime::run`.
#[derive(Clone, Debug)]
pub struct RunResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub exports: Option<Vec<u8>>,
    pub error: Option<ExecError>,
}

/// Limits on payload sizes for IPC transfers.
#[derive(Clone, Debug)]
pub struct PayloadLimits {
    pub base64_transfer_bytes: Option<usize>,
    pub json_payload_bytes: Option<usize>,
}

/// Budgets for sandbox resource consumption.
#[derive(Clone, Debug)]
pub struct ResourceBudgets {
    pub max_output_bytes: Option<usize>,
    pub max_bridge_calls: Option<usize>,
    pub max_timers: Option<usize>,
    pub max_child_processes: Option<usize>,
    pub max_handles: Option<usize>,
}

/// Create a V8-backed `RuntimeDriverFactory`.
///
/// Mirrors `createNodeRuntimeDriverFactory` from
/// `packages/secure-exec-node/src/driver.ts`.
pub fn create_node_runtime_driver_factory(
    v8_runtime: Arc<V8Runtime>,
) -> impl RuntimeDriverFactory {
    driver::V8RuntimeDriverFactory::new(v8_runtime)
}

/// Options for creating a `SystemDriver` via `create_node_driver`.
///
/// All fields default to `None`. When `None`, `create_node_driver` supplies
/// sensible defaults (InMemoryFs, DenyAllNetwork, DenyAllCommandExecutor, AllowAll).
pub struct NodeDriverOptions {
    pub filesystem: Option<Box<dyn FileSystem>>,
    pub network_adapter: Option<Box<dyn NetworkAdapter>>,
    pub command_executor: Option<Box<dyn CommandExecutor>>,
    pub permissions: Option<Box<dyn Permissions>>,
    pub process_config: Option<ProcessConfig>,
    pub os_config: Option<OsConfig>,
}

impl Default for NodeDriverOptions {
    fn default() -> Self {
        Self {
            filesystem: None,
            network_adapter: None,
            command_executor: None,
            permissions: None,
            process_config: None,
            os_config: None,
        }
    }
}

/// Create a `SystemDriver` with sensible defaults for the Node.js runtime.
///
/// Wraps filesystem, network, and command adapters with permission checks
/// before returning. Mirrors `createNodeDriver` from
/// `packages/secure-exec-node/src/driver.ts`.
pub fn create_node_driver(options: NodeDriverOptions) -> SystemDriver {
    let perms: Arc<dyn Permissions> = Arc::from(
        options
            .permissions
            .unwrap_or_else(|| Box::new(AllowAll)),
    );

    let fs = wrap_filesystem(
        options
            .filesystem
            .unwrap_or_else(|| Box::new(InMemoryFs::new())),
        Arc::clone(&perms),
    );
    let net = wrap_network(
        options
            .network_adapter
            .unwrap_or_else(|| Box::new(DenyAllNetwork)),
        Arc::clone(&perms),
    );
    let cmd = wrap_command_executor(
        options
            .command_executor
            .unwrap_or_else(|| Box::new(DenyAllCommandExecutor)),
        Arc::clone(&perms),
    );

    SystemDriver {
        filesystem: Some(fs),
        network: Some(net),
        command_executor: Some(cmd),
        permissions: Some(Box::new(AllowAll)), // already applied via wrappers
        runtime: DriverRuntimeConfig {
            process: options.process_config.unwrap_or_default(),
            os: options.os_config.unwrap_or_default(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_node_driver_with_defaults() {
        let driver = create_node_driver(NodeDriverOptions::default());

        // All adapters should be Some (filled with defaults)
        assert!(driver.filesystem.is_some());
        assert!(driver.network.is_some());
        assert!(driver.command_executor.is_some());
        assert!(driver.permissions.is_some());
    }

    #[tokio::test]
    async fn create_node_driver_default_fs_is_in_memory() {
        let driver = create_node_driver(NodeDriverOptions::default());
        let fs = driver.filesystem.as_ref().unwrap();

        // Write and read back to verify it's a working in-memory filesystem
        fs.write_file("/test.txt", b"hello").await.unwrap();
        let data = fs.read_file("/test.txt").await.unwrap();
        assert_eq!(data, b"hello");
    }

    #[test]
    fn create_node_driver_with_custom_process_config() {
        let driver = create_node_driver(NodeDriverOptions {
            process_config: Some(ProcessConfig {
                cwd: Some("/custom".to_string()),
                env: None,
            }),
            ..NodeDriverOptions::default()
        });

        assert_eq!(driver.runtime.process.cwd.as_deref(), Some("/custom"));
    }
}
