use crate::driver::{RuntimeDriverFactory, RuntimeDriverOptions, StdioHook, TimingMitigation};
use crate::{ExecResult, PayloadLimits, ResourceBudgets, Result, RunResult};
use crate::system::SystemDriver;

/// Options for constructing a `NodeRuntime`.
pub struct NodeRuntimeOptions {
    pub system_driver: SystemDriver,
    pub runtime_driver_factory: Box<dyn RuntimeDriverFactory>,
    pub memory_limit: Option<u32>,
    pub cpu_time_limit_ms: Option<u32>,
    pub timing_mitigation: Option<TimingMitigation>,
    pub on_stdio: Option<Box<dyn StdioHook>>,
    pub payload_limits: Option<PayloadLimits>,
    pub resource_budgets: Option<ResourceBudgets>,
}

/// Public API facade for executing JS in the secure-exec sandbox.
///
/// Mirrors `NodeRuntime` from `packages/secure-exec-core/src/runtime.ts`.
pub struct NodeRuntime {
    driver: Box<dyn crate::driver::RuntimeDriver>,
}

impl NodeRuntime {
    /// Create a new NodeRuntime, applying defaults: cwd=/root, homedir=/root, tmpdir=/tmp.
    pub fn new(options: NodeRuntimeOptions) -> Self {
        // Clone runtime config from system driver and apply defaults
        let mut runtime_config = options.system_driver.runtime.clone();
        if runtime_config.process.cwd.is_none() {
            runtime_config.process.cwd = Some("/root".to_string());
        }
        if runtime_config.os.homedir.is_none() {
            runtime_config.os.homedir = Some("/root".to_string());
        }
        if runtime_config.os.tmpdir.is_none() {
            runtime_config.os.tmpdir = Some("/tmp".to_string());
        }

        // Create the runtime driver via the factory
        let driver = options
            .runtime_driver_factory
            .create_runtime_driver(RuntimeDriverOptions {
                system: options.system_driver,
                runtime: runtime_config,
                memory_limit: options.memory_limit,
                cpu_time_limit_ms: options.cpu_time_limit_ms,
                timing_mitigation: options.timing_mitigation,
                on_stdio: options.on_stdio,
                payload_limits: options.payload_limits,
                resource_budgets: options.resource_budgets,
            });

        NodeRuntime { driver }
    }

    /// Execute a CommonJS script and return the result.
    pub async fn exec(&self, code: &str) -> Result<ExecResult> {
        self.driver.exec(code).await
    }

    /// Run an ESM module and return the result with exports.
    pub async fn run(&self, code: &str) -> Result<RunResult> {
        self.driver.run(code).await
    }

    /// Dispose of the runtime, cleaning up the underlying driver.
    pub fn dispose(&self) {
        self.driver.dispose();
    }
}
