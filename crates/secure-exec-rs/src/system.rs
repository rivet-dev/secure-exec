use std::collections::HashMap;

use crate::command::CommandExecutor;
use crate::fs::FileSystem;
use crate::network::NetworkAdapter;
use crate::permissions::Permissions;

/// Runtime configuration for process and OS environment.
#[derive(Clone, Debug, Default)]
pub struct DriverRuntimeConfig {
    pub process: ProcessConfig,
    pub os: OsConfig,
}

/// Process-level configuration (cwd, env).
#[derive(Clone, Debug, Default)]
pub struct ProcessConfig {
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

/// OS-level configuration (homedir, tmpdir, platform, arch).
#[derive(Clone, Debug, Default)]
pub struct OsConfig {
    pub homedir: Option<String>,
    pub tmpdir: Option<String>,
    pub platform: Option<String>,
    pub arch: Option<String>,
}

/// Bundles all system capabilities provided to a sandboxed runtime.
///
/// Mirrors `SystemDriver` from `packages/secure-exec-core/src/runtime-driver.ts`.
pub struct SystemDriver {
    pub filesystem: Option<Box<dyn FileSystem>>,
    pub network: Option<Box<dyn NetworkAdapter>>,
    pub command_executor: Option<Box<dyn CommandExecutor>>,
    pub permissions: Option<Box<dyn Permissions>>,
    pub runtime: DriverRuntimeConfig,
}
