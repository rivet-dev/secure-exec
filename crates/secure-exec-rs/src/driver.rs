use std::sync::Arc;

use tokio::sync::Mutex as TokioMutex;

use crate::bridge::BridgeDispatcher;
use crate::system::{DriverRuntimeConfig, SystemDriver};
use crate::v8_runtime::{ExecuteParams, ExecutionOutput, V8Runtime, V8Session, V8SessionOptions};
use crate::{BoxFuture, ExecError, ExecResult, PayloadLimits, ResourceBudgets, RunResult, BRIDGE_CODE};

/// IVM compat shim: adds .applySync/.applySyncPromise to native bridge fns.
///
/// The V8 binary's `replace_bridge_fns` installs raw V8 FunctionTemplate
/// callbacks without these methods. The bridge code's IIFE wraps them once
/// during first execution, but on snapshot-restored contexts the IIFE
/// doesn't re-run. Including this in the post-restore script ensures the
/// new functions are always wrapped before user code runs.
const IVM_COMPAT_SHIM: &str = r#"(function(){var keys=["_dynamicImport","_loadPolyfill","_resolveModule","_resolveModuleSync","_loadFile","_loadFileSync","_scheduleTimer","_cryptoRandomFill","_cryptoRandomUUID","_cryptoHashDigest","_cryptoHmacDigest","_cryptoPbkdf2","_cryptoScrypt","_cryptoCipheriv","_cryptoDecipheriv","_cryptoCipherivCreate","_cryptoCipherivUpdate","_cryptoCipherivFinal","_cryptoSign","_cryptoVerify","_cryptoGenerateKeyPairSync","_cryptoSubtle","_fsReadFile","_fsWriteFile","_fsReadFileBinary","_fsWriteFileBinary","_fsReadDir","_fsMkdir","_fsRmdir","_fsExists","_fsStat","_fsUnlink","_fsRename","_fsChmod","_fsChown","_fsLink","_fsSymlink","_fsReadlink","_fsLstat","_fsTruncate","_fsUtimes","_childProcessSpawnStart","_childProcessStdinWrite","_childProcessStdinClose","_childProcessKill","_childProcessSpawnSync","_networkFetchRaw","_networkDnsLookupRaw","_networkHttpRequestRaw","_networkHttpServerListenRaw","_networkHttpServerCloseRaw","_upgradeSocketWriteRaw","_upgradeSocketEndRaw","_upgradeSocketDestroyRaw","_netSocketConnectRaw","_netSocketWriteRaw","_netSocketEndRaw","_netSocketDestroyRaw","_netSocketUpgradeTlsRaw","_ptySetRawMode","_log","_error"];for(var i=0;i<keys.length;i++){var fn=globalThis[keys[i]];if(typeof fn!=='function')continue;fn.applySync=function(ctx,args){return this.call(null,...(args||[]));};fn.applySyncPromise=function(ctx,args){return this.call(null,...(args||[]));}}})();"#;

/// Timing mitigation mode for side-channel protection.
#[derive(Clone, Debug)]
pub enum TimingMitigation {
    /// No timing mitigation.
    None,
    /// Add random jitter to execution time.
    Jitter,
}

/// Hook for receiving stdout/stderr output from the sandbox.
pub trait StdioHook: Send + Sync {
    fn on_stdout(&self, data: &[u8]);
    fn on_stderr(&self, data: &[u8]);
}

/// Options for creating a RuntimeDriver instance.
pub struct RuntimeDriverOptions {
    pub system: SystemDriver,
    pub runtime: DriverRuntimeConfig,
    pub memory_limit: Option<u32>,
    pub cpu_time_limit_ms: Option<u32>,
    pub timing_mitigation: Option<TimingMitigation>,
    pub on_stdio: Option<Box<dyn StdioHook>>,
    pub payload_limits: Option<PayloadLimits>,
    pub resource_budgets: Option<ResourceBudgets>,
}

/// Trait for executing code in a sandboxed environment.
///
/// Each RuntimeDriver manages a single V8 session and handles
/// the bridge call loop between the sandbox and the host.
pub trait RuntimeDriver: Send + Sync {
    fn exec<'a>(&'a self, code: &'a str) -> BoxFuture<'a, crate::Result<ExecResult>>;
    fn run<'a>(&'a self, code: &'a str) -> BoxFuture<'a, crate::Result<RunResult>>;
    fn dispose(&self);
}

/// Factory for creating RuntimeDriver instances.
///
/// Mirrors the factory pattern from `packages/secure-exec-core/src/runtime-driver.ts`.
pub trait RuntimeDriverFactory: Send + Sync {
    fn create_runtime_driver(&self, options: RuntimeDriverOptions) -> Box<dyn RuntimeDriver>;
}

// ============================================================
// V8-backed RuntimeDriverFactory / RuntimeDriver
// ============================================================

/// V8-backed RuntimeDriverFactory.
///
/// Creates `V8RuntimeDriver` instances backed by sessions from
/// a shared `V8Runtime` process.
pub(crate) struct V8RuntimeDriverFactory {
    v8_runtime: Arc<V8Runtime>,
}

impl V8RuntimeDriverFactory {
    pub fn new(v8_runtime: Arc<V8Runtime>) -> Self {
        Self { v8_runtime }
    }
}

impl RuntimeDriverFactory for V8RuntimeDriverFactory {
    fn create_runtime_driver(&self, options: RuntimeDriverOptions) -> Box<dyn RuntimeDriver> {
        Box::new(V8RuntimeDriver::new(
            Arc::clone(&self.v8_runtime),
            options,
        ))
    }
}

/// V8-backed RuntimeDriver that uses a V8Session for execution.
///
/// Created by `V8RuntimeDriverFactory`. Each driver manages a single
/// V8 session that is lazily created on first exec/run call.
struct V8RuntimeDriver {
    v8_runtime: Arc<V8Runtime>,
    session: TokioMutex<Option<V8Session>>,
    system: SystemDriver,
    runtime: DriverRuntimeConfig,
    memory_limit: Option<u32>,
    cpu_time_limit_ms: Option<u32>,
    on_stdio: Option<Box<dyn StdioHook>>,
    _payload_limits: Option<PayloadLimits>,
    resource_budgets: Option<ResourceBudgets>,
}

impl V8RuntimeDriver {
    fn new(v8_runtime: Arc<V8Runtime>, options: RuntimeDriverOptions) -> Self {
        Self {
            v8_runtime,
            session: TokioMutex::new(None),
            system: options.system,
            runtime: options.runtime,
            memory_limit: options.memory_limit,
            cpu_time_limit_ms: options.cpu_time_limit_ms,
            on_stdio: options.on_stdio,
            _payload_limits: options.payload_limits,
            resource_budgets: options.resource_budgets,
        }
    }

    /// Build the post-restore script with session-specific config.
    ///
    /// Mirrors the TypeScript `composePostRestoreScript` — overrides default
    /// budget values and applies per-execution config. Process/OS config
    /// (cwd, env, homedir, tmpdir) is also included for sessions that
    /// don't use InjectGlobals.
    fn build_post_restore_script(&self) -> String {
        let mut parts: Vec<String> = Vec::new();

        // Re-apply IVM compat shim: replace_bridge_fns installs new native
        // functions that lack .applySync/.applySyncPromise. The bridge IIFE
        // adds them but only runs once (on snapshot create or fresh context).
        // Re-running the shim here ensures the new functions are wrapped.
        parts.push(IVM_COMPAT_SHIM.to_string());

        // Override per-session resource budget values
        if let Some(ref budgets) = self.resource_budgets {
            if let Some(max_timers) = budgets.max_timers {
                parts.push(format!("globalThis._maxTimers = {};", max_timers));
            }
            if let Some(max_handles) = budgets.max_handles {
                parts.push(format!("globalThis._maxHandles = {};", max_handles));
            }
        }

        // Override initial cwd for module resolution
        if let Some(ref cwd) = self.runtime.process.cwd {
            parts.push(format!(
                "if (globalThis._currentModule) globalThis._currentModule.dirname = {};",
                serde_json::to_string(cwd).unwrap_or_else(|_| format!("\"{}\"", cwd))
            ));
        }

        // Reset mutable state from snapshot (guard: no-op on fresh context)
        parts.push("if (typeof globalThis.__runtimeResetProcessState === \"function\") globalThis.__runtimeResetProcessState();".to_string());

        // Process/OS config for bridge consumption
        if let Some(ref cwd) = self.runtime.process.cwd {
            parts.push(format!(
                "globalThis.__secureExecConfig = globalThis.__secureExecConfig || {{}};\
                 globalThis.__secureExecConfig.cwd = {};",
                serde_json::to_string(cwd).unwrap_or_else(|_| format!("\"{}\"", cwd))
            ));
        }
        if let Some(ref env) = self.runtime.process.env {
            parts.push(format!(
                "globalThis.__secureExecConfig = globalThis.__secureExecConfig || {{}};\
                 globalThis.__secureExecConfig.env = {};",
                serde_json::to_string(env).unwrap_or_else(|_| "{}".to_string())
            ));
        }
        if let Some(ref homedir) = self.runtime.os.homedir {
            parts.push(format!(
                "globalThis.__secureExecConfig = globalThis.__secureExecConfig || {{}};\
                 globalThis.__secureExecConfig.homedir = {};",
                serde_json::to_string(homedir).unwrap_or_else(|_| format!("\"{}\"", homedir))
            ));
        }
        if let Some(ref tmpdir) = self.runtime.os.tmpdir {
            parts.push(format!(
                "globalThis.__secureExecConfig = globalThis.__secureExecConfig || {{}};\
                 globalThis.__secureExecConfig.tmpdir = {};",
                serde_json::to_string(tmpdir).unwrap_or_else(|_| format!("\"{}\"", tmpdir))
            ));
        }

        parts.join("\n")
    }

    /// Execute code with the given mode (0=exec, 1=run).
    async fn execute_internal(&self, code: &str, mode: u8) -> crate::Result<ExecutionOutput> {
        let mut guard = self.session.lock().await;

        // Create session lazily on first call
        let is_first_execute = guard.is_none();
        if is_first_execute {
            let session = self
                .v8_runtime
                .create_session(V8SessionOptions {
                    memory_limit: self.memory_limit,
                    cpu_time_limit_ms: self.cpu_time_limit_ms,
                    resource_budgets: self.resource_budgets.clone(),
                })
                .await?;
            *guard = Some(session);
        }

        let session = guard.as_ref().unwrap();
        let dispatcher = BridgeDispatcher {
            system: &self.system,
        };
        let stdio_hook = self.on_stdio.as_deref();

        // Send bridge code on first execute; empty string tells V8 to reuse cached
        let bridge_code = if is_first_execute {
            BRIDGE_CODE.to_string()
        } else {
            String::new()
        };

        let params = ExecuteParams {
            mode,
            bridge_code,
            post_restore_script: self.build_post_restore_script(),
            user_code: code.to_string(),
            file_path: if mode == 0 {
                "<exec>".to_string()
            } else {
                "<run>".to_string()
            },
            inject_globals_payload: Vec::new(),
        };

        session.execute(params, &dispatcher, stdio_hook).await
    }
}

/// Convert IPC ExecutionErrorBin to public ExecError.
fn convert_error(err: Option<secure_exec_ipc::ExecutionErrorBin>) -> Option<ExecError> {
    err.map(|e| ExecError {
        error_type: e.error_type,
        message: e.message,
        stack: e.stack,
        code: if e.code.is_empty() { None } else { Some(e.code) },
    })
}

impl RuntimeDriver for V8RuntimeDriver {
    fn exec<'a>(&'a self, code: &'a str) -> BoxFuture<'a, crate::Result<ExecResult>> {
        Box::pin(async move {
            let output = self.execute_internal(code, 0).await?;
            Ok(ExecResult {
                code: output.exit_code,
                stdout: output.stdout,
                stderr: output.stderr,
                error: convert_error(output.error),
            })
        })
    }

    fn run<'a>(&'a self, code: &'a str) -> BoxFuture<'a, crate::Result<RunResult>> {
        Box::pin(async move {
            let output = self.execute_internal(code, 1).await?;
            Ok(RunResult {
                code: output.exit_code,
                stdout: output.stdout,
                stderr: output.stderr,
                exports: output.exports,
                error: convert_error(output.error),
            })
        })
    }

    fn dispose(&self) {
        // Spawn async cleanup — dispose is sync but session.destroy() is async
        if let Ok(mut guard) = self.session.try_lock() {
            if let Some(session) = guard.take() {
                tokio::spawn(async move {
                    let _ = session.destroy().await;
                });
            }
        }
    }
}
