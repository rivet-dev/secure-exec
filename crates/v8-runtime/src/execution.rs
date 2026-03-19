// Script compilation, CJS/ESM execution, module loading

use std::cell::RefCell;
use std::collections::HashMap;
use std::num::NonZeroI32;

use crate::host_call::BridgeCallContext;
use crate::ipc::{ExecutionError, OsConfig, ProcessConfig};

/// Callback that denies all WebAssembly code generation.
extern "C" fn deny_wasm_code_generation(
    _context: v8::Local<v8::Context>,
    _source: v8::Local<v8::String>,
) -> bool {
    false
}

/// Disable WebAssembly compilation on the isolate.
/// Must be called before any code execution.
pub fn disable_wasm(isolate: &mut v8::OwnedIsolate) {
    isolate.set_allow_wasm_code_generation_callback(deny_wasm_code_generation);
}

/// Inject `_processConfig` and `_osConfig` as frozen, non-writable, non-configurable
/// global properties, and harden the context (remove SharedArrayBuffer in freeze mode).
///
/// Must be called within a ContextScope.
pub fn inject_globals(
    scope: &mut v8::HandleScope,
    process_config: &ProcessConfig,
    os_config: &OsConfig,
) {
    let context = scope.get_current_context();
    let global = context.global(scope);
    // Build and freeze _processConfig
    let pc_obj = build_process_config(scope, process_config);
    pc_obj.set_integrity_level(scope, v8::IntegrityLevel::Frozen);
    let pc_key = v8::String::new(scope, "_processConfig").unwrap();
    let attr = v8::PropertyAttribute::READ_ONLY | v8::PropertyAttribute::DONT_DELETE;
    global.define_own_property(scope, pc_key.into(), pc_obj.into(), attr);

    // Build and freeze _osConfig
    let os_obj = build_os_config(scope, os_config);
    os_obj.set_integrity_level(scope, v8::IntegrityLevel::Frozen);
    let os_key = v8::String::new(scope, "_osConfig").unwrap();
    let attr = v8::PropertyAttribute::READ_ONLY | v8::PropertyAttribute::DONT_DELETE;
    global.define_own_property(scope, os_key.into(), os_obj.into(), attr);

    // Remove SharedArrayBuffer when timing_mitigation is 'freeze'
    if process_config.timing_mitigation == "freeze" {
        let sab_key = v8::String::new(scope, "SharedArrayBuffer").unwrap();
        global.delete(scope, sab_key.into());
    }
}

/// Execute user code as a CJS script (mode='exec').
///
/// Runs bridge_code as IIFE first (if non-empty), then compiles and runs user_code
/// via v8::Script. Returns (exit_code, error) — exit code 0 on success, 1 on error.
pub fn execute_script(
    scope: &mut v8::HandleScope,
    bridge_code: &str,
    user_code: &str,
) -> (i32, Option<ExecutionError>) {
    // Run bridge code IIFE
    if !bridge_code.is_empty() {
        let tc = &mut v8::TryCatch::new(scope);
        let source = match v8::String::new(tc, bridge_code) {
            Some(s) => s,
            None => {
                return (
                    1,
                    Some(ExecutionError {
                        error_type: "Error".into(),
                        message: "bridge code string too large for V8".into(),
                        stack: String::new(),
                        code: None,
                    }),
                )
            }
        };
        let script = match v8::Script::compile(tc, source, None) {
            Some(s) => s,
            None => {
                let exc = tc.exception();
                return (1, exc.map(|e| extract_error_info(tc, e)));
            }
        };
        if script.run(tc).is_none() {
            let exc = tc.exception();
            return (1, exc.map(|e| extract_error_info(tc, e)));
        }
    }

    // Run user code
    {
        let tc = &mut v8::TryCatch::new(scope);
        let source = match v8::String::new(tc, user_code) {
            Some(s) => s,
            None => {
                return (
                    1,
                    Some(ExecutionError {
                        error_type: "Error".into(),
                        message: "user code string too large for V8".into(),
                        stack: String::new(),
                        code: None,
                    }),
                )
            }
        };
        let script = match v8::Script::compile(tc, source, None) {
            Some(s) => s,
            None => {
                let exc = tc.exception();
                return (1, exc.map(|e| extract_error_info(tc, e)));
            }
        };
        if script.run(tc).is_none() {
            let exc = tc.exception();
            return (1, exc.map(|e| extract_error_info(tc, e)));
        }
    }

    (0, None)
}

/// Extract structured error information from a V8 exception value.
///
/// Reads constructor.name for error type, .message for the message,
/// .stack for the stack trace, and optional .code for Node-style error codes.
pub fn extract_error_info(
    scope: &mut v8::HandleScope,
    exception: v8::Local<v8::Value>,
) -> ExecutionError {
    if !exception.is_object() {
        // Non-object throw (e.g., `throw "string"`)
        return ExecutionError {
            error_type: "Error".into(),
            message: exception.to_rust_string_lossy(scope),
            stack: String::new(),
            code: None,
        };
    }

    let obj = v8::Local::<v8::Object>::try_from(exception).unwrap();

    // Error type from constructor.name
    let error_type = {
        let ctor_key = v8::String::new(scope, "constructor").unwrap();
        let name_key = v8::String::new(scope, "name").unwrap();
        obj.get(scope, ctor_key.into())
            .filter(|v| v.is_object())
            .and_then(|ctor| {
                let ctor_obj = v8::Local::<v8::Object>::try_from(ctor).ok()?;
                ctor_obj.get(scope, name_key.into())
            })
            .filter(|v| v.is_string())
            .map(|v| v.to_rust_string_lossy(scope))
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "Error".into())
    };

    // Message from error.message property
    let message = {
        let msg_key = v8::String::new(scope, "message").unwrap();
        obj.get(scope, msg_key.into())
            .filter(|v| v.is_string())
            .map(|v| v.to_rust_string_lossy(scope))
            .unwrap_or_else(|| exception.to_rust_string_lossy(scope))
    };

    // Stack trace from error.stack property
    let stack = {
        let stack_key = v8::String::new(scope, "stack").unwrap();
        obj.get(scope, stack_key.into())
            .filter(|v| v.is_string())
            .map(|v| v.to_rust_string_lossy(scope))
            .unwrap_or_default()
    };

    // Optional error code (e.g., ERR_MODULE_NOT_FOUND)
    let code = {
        let code_key = v8::String::new(scope, "code").unwrap();
        obj.get(scope, code_key.into())
            .filter(|v| v.is_string())
            .map(|v| v.to_rust_string_lossy(scope))
    };

    ExecutionError {
        error_type,
        message,
        stack,
        code,
    }
}

/// Build the _processConfig JS object: { cwd, env, timing_mitigation, frozen_time_ms }
fn build_process_config<'s>(
    scope: &mut v8::HandleScope<'s>,
    config: &ProcessConfig,
) -> v8::Local<'s, v8::Object> {
    let obj = v8::Object::new(scope);

    // cwd
    let key = v8::String::new(scope, "cwd").unwrap();
    let val = v8::String::new(scope, &config.cwd).unwrap();
    obj.set(scope, key.into(), val.into());

    // env (frozen sub-object)
    let env_key = v8::String::new(scope, "env").unwrap();
    let env_obj = v8::Object::new(scope);
    for (k, v) in &config.env {
        let ek = v8::String::new(scope, k).unwrap();
        let ev = v8::String::new(scope, v).unwrap();
        env_obj.set(scope, ek.into(), ev.into());
    }
    env_obj.set_integrity_level(scope, v8::IntegrityLevel::Frozen);
    obj.set(scope, env_key.into(), env_obj.into());

    // timing_mitigation
    let key = v8::String::new(scope, "timing_mitigation").unwrap();
    let val = v8::String::new(scope, &config.timing_mitigation).unwrap();
    obj.set(scope, key.into(), val.into());

    // frozen_time_ms (number or null)
    let key = v8::String::new(scope, "frozen_time_ms").unwrap();
    let val: v8::Local<v8::Value> = match config.frozen_time_ms {
        Some(ms) => v8::Number::new(scope, ms).into(),
        None => v8::null(scope).into(),
    };
    obj.set(scope, key.into(), val);

    obj
}

/// Build the _osConfig JS object: { homedir, tmpdir, platform, arch }
fn build_os_config<'s>(
    scope: &mut v8::HandleScope<'s>,
    config: &OsConfig,
) -> v8::Local<'s, v8::Object> {
    let obj = v8::Object::new(scope);

    for (name, value) in [
        ("homedir", config.homedir.as_str()),
        ("tmpdir", config.tmpdir.as_str()),
        ("platform", config.platform.as_str()),
        ("arch", config.arch.as_str()),
    ] {
        let key = v8::String::new(scope, name).unwrap();
        let val = v8::String::new(scope, value).unwrap();
        obj.set(scope, key.into(), val.into());
    }

    obj
}

// --- ESM module loading ---

/// Thread-local state for module resolution during execute_module.
/// Avoids passing user data through V8's ResolveModuleCallback (which is a plain fn pointer).
struct ModuleResolveState {
    bridge_ctx: *const BridgeCallContext,
    /// identity_hash → resource_name for referrer lookup
    module_names: HashMap<NonZeroI32, String>,
    /// resolved_path → Global<Module> cache
    module_cache: HashMap<String, v8::Global<v8::Module>>,
}

// SAFETY: ModuleResolveState is only accessed from the session thread
// (single-threaded per session). The raw pointer is valid for the
// duration of execute_module.
unsafe impl Send for ModuleResolveState {}

thread_local! {
    static MODULE_RESOLVE_STATE: RefCell<Option<ModuleResolveState>> = RefCell::new(None);
}

fn clear_module_state() {
    MODULE_RESOLVE_STATE.with(|cell| {
        *cell.borrow_mut() = None;
    });
}

/// Execute user code as an ES module (mode='run').
///
/// Runs bridge_code as CJS IIFE first (if non-empty), then compiles and runs
/// user_code as a v8::Module. The ResolveModuleCallback sends sync-blocking IPC
/// calls via BridgeCallContext to resolve import specifiers and load sources.
/// Returns (exit_code, serialized_exports, error).
pub fn execute_module(
    scope: &mut v8::HandleScope,
    bridge_ctx: &BridgeCallContext,
    bridge_code: &str,
    user_code: &str,
    file_path: Option<&str>,
) -> (i32, Option<Vec<u8>>, Option<ExecutionError>) {
    // Set up thread-local resolve state
    MODULE_RESOLVE_STATE.with(|cell| {
        *cell.borrow_mut() = Some(ModuleResolveState {
            bridge_ctx: bridge_ctx as *const BridgeCallContext,
            module_names: HashMap::new(),
            module_cache: HashMap::new(),
        });
    });

    // Run bridge code IIFE (same as CJS mode)
    if !bridge_code.is_empty() {
        let tc = &mut v8::TryCatch::new(scope);
        let source = match v8::String::new(tc, bridge_code) {
            Some(s) => s,
            None => {
                clear_module_state();
                return (
                    1,
                    None,
                    Some(ExecutionError {
                        error_type: "Error".into(),
                        message: "bridge code string too large for V8".into(),
                        stack: String::new(),
                        code: None,
                    }),
                );
            }
        };
        let script = match v8::Script::compile(tc, source, None) {
            Some(s) => s,
            None => {
                let exc = tc.exception();
                clear_module_state();
                return (1, None, exc.map(|e| extract_error_info(tc, e)));
            }
        };
        if script.run(tc).is_none() {
            let exc = tc.exception();
            clear_module_state();
            return (1, None, exc.map(|e| extract_error_info(tc, e)));
        }
    }

    // Compile and evaluate as ES module
    {
        let tc = &mut v8::TryCatch::new(scope);
        let resource_name_str = file_path.unwrap_or("<user_module>");
        let resource = v8::String::new(tc, resource_name_str).unwrap();
        let origin = v8::ScriptOrigin::new(
            tc,
            resource.into(),
            0,
            0,
            false,
            -1,
            None,
            false,
            false,
            true, // is_module
            None,
        );

        let v8_source = match v8::String::new(tc, user_code) {
            Some(s) => s,
            None => {
                clear_module_state();
                return (
                    1,
                    None,
                    Some(ExecutionError {
                        error_type: "Error".into(),
                        message: "user code string too large for V8".into(),
                        stack: String::new(),
                        code: None,
                    }),
                );
            }
        };

        let mut source = v8::script_compiler::Source::new(v8_source, Some(&origin));
        let module = match v8::script_compiler::compile_module(tc, &mut source) {
            Some(m) => m,
            None => {
                let exc = tc.exception();
                clear_module_state();
                return (1, None, exc.map(|e| extract_error_info(tc, e)));
            }
        };

        // Store root module name for referrer lookup in resolve callback
        MODULE_RESOLVE_STATE.with(|cell| {
            if let Some(state) = cell.borrow_mut().as_mut() {
                state
                    .module_names
                    .insert(module.get_identity_hash(), resource_name_str.to_string());
            }
        });

        // Instantiate (calls resolve callback for each import)
        if module.instantiate_module(tc, module_resolve_callback).is_none() {
            let exc = tc.exception();
            clear_module_state();
            return (1, None, exc.map(|e| extract_error_info(tc, e)));
        }

        // Evaluate
        let eval_result = module.evaluate(tc);
        if eval_result.is_none() {
            let exc = tc.exception();
            clear_module_state();
            return (1, None, exc.map(|e| extract_error_info(tc, e)));
        }

        // Check module status for errors (handles TLA rejection case)
        if module.get_status() == v8::ModuleStatus::Errored {
            let exc = module.get_exception();
            clear_module_state();
            return (1, None, Some(extract_error_info(tc, exc)));
        }

        // Serialize module namespace (exports)
        let namespace = module.get_module_namespace();
        let exports_bytes = crate::bridge::v8_value_to_msgpack(tc, namespace);

        clear_module_state();
        (0, Some(exports_bytes), None)
    }
}

/// V8 ResolveModuleCallback — called during instantiate_module for each import.
///
/// Sends sync-blocking IPC calls to resolve specifiers and load source code,
/// compiles resolved modules, and caches them.
fn module_resolve_callback<'a>(
    context: v8::Local<'a, v8::Context>,
    specifier: v8::Local<'a, v8::String>,
    _import_attributes: v8::Local<'a, v8::FixedArray>,
    referrer: v8::Local<'a, v8::Module>,
) -> Option<v8::Local<'a, v8::Module>> {
    // SAFETY: CallbackScope can be constructed from Local<Context> within a V8 callback
    let scope = &mut unsafe { v8::CallbackScope::new(context) };

    let specifier_str = specifier.to_rust_string_lossy(scope);
    let referrer_hash = referrer.get_identity_hash();

    // Phase 1: Check cache by specifier (brief borrow, released before V8 work)
    let cached_global = MODULE_RESOLVE_STATE.with(|cell| {
        let borrow = cell.borrow();
        let state = borrow.as_ref()?;
        state.module_cache.get(&specifier_str).cloned()
    });
    if let Some(cached) = cached_global {
        return Some(v8::Local::new(scope, &cached));
    }

    // Phase 2: Get context data (brief borrow)
    let (bridge_ctx_ptr, referrer_name) = MODULE_RESOLVE_STATE.with(|cell| {
        let borrow = cell.borrow();
        let state = borrow.as_ref().expect("module resolve state not set");
        (
            state.bridge_ctx,
            state
                .module_names
                .get(&referrer_hash)
                .cloned()
                .unwrap_or_default(),
        )
    });

    let ctx = unsafe { &*bridge_ctx_ptr };

    // Phase 3: Resolve module via sync-blocking IPC
    let resolved_path = resolve_module_via_ipc(scope, ctx, &specifier_str, &referrer_name)?;

    // Phase 4: Check cache by resolved path (brief borrow)
    let cached_global = MODULE_RESOLVE_STATE.with(|cell| {
        let borrow = cell.borrow();
        let state = borrow.as_ref()?;
        state.module_cache.get(&resolved_path).cloned()
    });
    if let Some(cached) = cached_global {
        return Some(v8::Local::new(scope, &cached));
    }

    // Phase 5: Load module source via sync-blocking IPC
    let source_code = load_module_via_ipc(scope, ctx, &resolved_path)?;

    // Phase 6: Compile as ES module
    let resource = v8::String::new(scope, &resolved_path)?;
    let origin = v8::ScriptOrigin::new(
        scope,
        resource.into(),
        0,
        0,
        false,
        -1,
        None,
        false,
        false,
        true, // is_module
        None,
    );
    let v8_source = match v8::String::new(scope, &source_code) {
        Some(s) => s,
        None => {
            throw_module_error(scope, "module source too large for V8");
            return None;
        }
    };
    let mut compiled = v8::script_compiler::Source::new(v8_source, Some(&origin));
    let module = v8::script_compiler::compile_module(scope, &mut compiled)?;

    // Phase 7: Cache the module (brief borrow)
    MODULE_RESOLVE_STATE.with(|cell| {
        if let Some(state) = cell.borrow_mut().as_mut() {
            state
                .module_names
                .insert(module.get_identity_hash(), resolved_path.clone());
            let global = v8::Global::new(scope, module);
            state.module_cache.insert(resolved_path, global);
        }
    });

    Some(module)
}

/// Send _resolveModule(specifier, referrer_path) via sync-blocking IPC.
fn resolve_module_via_ipc(
    scope: &mut v8::HandleScope,
    ctx: &BridgeCallContext,
    specifier: &str,
    referrer: &str,
) -> Option<String> {
    let mut args = Vec::new();
    rmpv::encode::write_value(
        &mut args,
        &rmpv::Value::Array(vec![
            rmpv::Value::String(specifier.into()),
            rmpv::Value::String(referrer.into()),
        ]),
    )
    .unwrap();

    match ctx.sync_call("_resolveModule", args) {
        Ok(Some(bytes)) => match rmpv::decode::read_value(&mut &bytes[..]) {
            Ok(rmpv::Value::String(s)) => match s.as_str() {
                Some(path) => Some(path.to_string()),
                None => {
                    throw_module_error(scope, "invalid UTF-8 in resolved module path");
                    None
                }
            },
            Ok(_) => {
                throw_module_error(
                    scope,
                    &format!("_resolveModule returned non-string for '{}'", specifier),
                );
                None
            }
            Err(e) => {
                throw_module_error(scope, &format!("_resolveModule decode error: {}", e));
                None
            }
        },
        Ok(None) => {
            throw_module_error(scope, &format!("Cannot resolve module '{}'", specifier));
            None
        }
        Err(e) => {
            throw_module_error(scope, &e);
            None
        }
    }
}

/// Send _loadFile(resolved_path) via sync-blocking IPC.
fn load_module_via_ipc(
    scope: &mut v8::HandleScope,
    ctx: &BridgeCallContext,
    resolved_path: &str,
) -> Option<String> {
    let mut args = Vec::new();
    rmpv::encode::write_value(
        &mut args,
        &rmpv::Value::Array(vec![rmpv::Value::String(resolved_path.into())]),
    )
    .unwrap();

    match ctx.sync_call("_loadFile", args) {
        Ok(Some(bytes)) => match rmpv::decode::read_value(&mut &bytes[..]) {
            Ok(rmpv::Value::String(s)) => match s.as_str() {
                Some(src) => Some(src.to_string()),
                None => {
                    throw_module_error(scope, "invalid UTF-8 in module source");
                    None
                }
            },
            Ok(_) => {
                throw_module_error(
                    scope,
                    &format!("_loadFile returned non-string for '{}'", resolved_path),
                );
                None
            }
            Err(e) => {
                throw_module_error(scope, &format!("_loadFile decode error: {}", e));
                None
            }
        },
        Ok(None) => {
            throw_module_error(scope, &format!("Cannot load module '{}'", resolved_path));
            None
        }
        Err(e) => {
            throw_module_error(scope, &e);
            None
        }
    }
}

/// Throw a V8 exception for module resolution errors.
fn throw_module_error(scope: &mut v8::HandleScope, message: &str) {
    let msg = v8::String::new(scope, message).unwrap();
    let exc = v8::Exception::error(scope, msg);
    scope.throw_exception(exc);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge;
    use crate::host_call::BridgeCallContext;
    use crate::isolate;
    use std::collections::HashMap;
use std::num::NonZeroI32;
    use std::io::{Cursor, Write};
    use std::sync::{Arc, Mutex};

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

    /// Enter a context, run JS, return the string result.
    fn eval(isolate: &mut v8::OwnedIsolate, context: &v8::Global<v8::Context>, code: &str) -> String {
        let scope = &mut v8::HandleScope::new(isolate);
        let local = v8::Local::new(scope, context);
        let scope = &mut v8::ContextScope::new(scope, local);
        let source = v8::String::new(scope, code).unwrap();
        let script = v8::Script::compile(scope, source, None).unwrap();
        let result = script.run(scope).unwrap();
        result.to_rust_string_lossy(scope)
    }

    /// Enter a context, run JS, return true if the result is truthy.
    fn eval_bool(isolate: &mut v8::OwnedIsolate, context: &v8::Global<v8::Context>, code: &str) -> bool {
        let scope = &mut v8::HandleScope::new(isolate);
        let local = v8::Local::new(scope, context);
        let scope = &mut v8::ContextScope::new(scope, local);
        let source = v8::String::new(scope, code).unwrap();
        let script = v8::Script::compile(scope, source, None).unwrap();
        let result = script.run(scope).unwrap();
        result.boolean_value(scope)
    }

    /// Enter a context, run JS, return true if an exception was thrown.
    fn eval_throws(isolate: &mut v8::OwnedIsolate, context: &v8::Global<v8::Context>, code: &str) -> bool {
        let scope = &mut v8::HandleScope::new(isolate);
        let local = v8::Local::new(scope, context);
        let scope = &mut v8::ContextScope::new(scope, local);
        let tc = &mut v8::TryCatch::new(scope);
        let source = v8::String::new(tc, code).unwrap();
        if let Some(script) = v8::Script::compile(tc, source, None) {
            script.run(tc);
        }
        tc.has_caught()
    }

    #[test]
    fn v8_consolidated_tests() {
        isolate::init_v8_platform();

        // --- Isolate lifecycle (moved from isolate::tests to consolidate V8 tests) ---
        // Create and destroy 3 isolates sequentially without crash
        for i in 0..3 {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);
            let result = eval(&mut isolate, &context, &format!("{} + 1", i));
            assert_eq!(result, format!("{}", i + 1));
        }
        // Isolate with heap limit
        {
            let mut isolate = isolate::create_isolate(Some(16));
            let context = isolate::create_context(&mut isolate);
            assert_eq!(eval(&mut isolate, &context, "1 + 2"), "3");
        }
        // Isolate without heap limit
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);
            assert_eq!(eval(&mut isolate, &context, "'hello' + ' world'"), "hello world");
        }
        // Global context handle persists state
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);
            eval(&mut isolate, &context, "var x = 42;");
            assert_eq!(eval(&mut isolate, &context, "x"), "42");
        }

        // --- Part 1: InjectGlobals sets _processConfig and _osConfig ---
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);

            let mut env = HashMap::new();
            env.insert("HOME".into(), "/home/user".into());
            env.insert("PATH".into(), "/usr/bin".into());

            let process_config = ProcessConfig {
                cwd: "/app".into(),
                env,
                timing_mitigation: "none".into(),
                frozen_time_ms: Some(1700000000000.0),
            };
            let os_config = OsConfig {
                homedir: "/home/user".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            };

            // Inject globals
            {
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let ctx = v8::Local::new(scope, &context);
                let scope = &mut v8::ContextScope::new(scope, ctx);
                inject_globals(scope, &process_config, &os_config);
            }

            // Verify _processConfig values
            assert_eq!(eval(&mut isolate, &context, "_processConfig.cwd"), "/app");
            assert_eq!(
                eval(&mut isolate, &context, "_processConfig.timing_mitigation"),
                "none"
            );
            assert_eq!(
                eval(&mut isolate, &context, "_processConfig.frozen_time_ms"),
                "1700000000000"
            );
            assert_eq!(
                eval(&mut isolate, &context, "_processConfig.env.HOME"),
                "/home/user"
            );
            assert_eq!(
                eval(&mut isolate, &context, "_processConfig.env.PATH"),
                "/usr/bin"
            );

            // Verify _osConfig values
            assert_eq!(eval(&mut isolate, &context, "_osConfig.homedir"), "/home/user");
            assert_eq!(eval(&mut isolate, &context, "_osConfig.tmpdir"), "/tmp");
            assert_eq!(eval(&mut isolate, &context, "_osConfig.platform"), "linux");
            assert_eq!(eval(&mut isolate, &context, "_osConfig.arch"), "x64");
        }

        // --- Part 2: frozen_time_ms null when None ---
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);

            let process_config = ProcessConfig {
                cwd: "/".into(),
                env: HashMap::new(),
                timing_mitigation: "none".into(),
                frozen_time_ms: None,
            };
            let os_config = OsConfig {
                homedir: "/root".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            };

            {
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let ctx = v8::Local::new(scope, &context);
                let scope = &mut v8::ContextScope::new(scope, ctx);
                inject_globals(scope, &process_config, &os_config);
            }

            assert_eq!(
                eval(&mut isolate, &context, "_processConfig.frozen_time_ms === null"),
                "true"
            );
        }

        // --- Part 3: Objects are frozen (immutable) ---
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);

            let process_config = ProcessConfig {
                cwd: "/app".into(),
                env: HashMap::new(),
                timing_mitigation: "none".into(),
                frozen_time_ms: None,
            };
            let os_config = OsConfig {
                homedir: "/home".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            };

            {
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let ctx = v8::Local::new(scope, &context);
                let scope = &mut v8::ContextScope::new(scope, ctx);
                inject_globals(scope, &process_config, &os_config);
            }

            // Verify Object.isFrozen
            assert!(eval_bool(
                &mut isolate,
                &context,
                "Object.isFrozen(_processConfig)"
            ));
            assert!(eval_bool(
                &mut isolate,
                &context,
                "Object.isFrozen(_osConfig)"
            ));
            assert!(eval_bool(
                &mut isolate,
                &context,
                "Object.isFrozen(_processConfig.env)"
            ));

            // Verify non-writable: assignment in strict mode throws
            assert!(eval_throws(
                &mut isolate,
                &context,
                "'use strict'; _processConfig.cwd = '/hacked'"
            ));
            assert!(eval_throws(
                &mut isolate,
                &context,
                "'use strict'; _osConfig.platform = 'hacked'"
            ));

            // Verify non-configurable: cannot delete or redefine
            assert!(eval_throws(
                &mut isolate,
                &context,
                "'use strict'; delete _processConfig"
            ));
            assert!(eval_throws(
                &mut isolate,
                &context,
                "Object.defineProperty(globalThis, '_processConfig', { value: {} })"
            ));
            assert!(eval_throws(
                &mut isolate,
                &context,
                "Object.defineProperty(globalThis, '_osConfig', { value: {} })"
            ));
        }

        // --- Part 4: SharedArrayBuffer removed in freeze mode ---
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);

            // Verify SharedArrayBuffer exists before injection
            assert!(eval_bool(
                &mut isolate,
                &context,
                "typeof SharedArrayBuffer !== 'undefined'"
            ));

            let process_config = ProcessConfig {
                cwd: "/".into(),
                env: HashMap::new(),
                timing_mitigation: "freeze".into(),
                frozen_time_ms: None,
            };
            let os_config = OsConfig {
                homedir: "/root".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            };

            {
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let ctx = v8::Local::new(scope, &context);
                let scope = &mut v8::ContextScope::new(scope, ctx);
                inject_globals(scope, &process_config, &os_config);
            }

            // SharedArrayBuffer should now be removed
            assert!(eval_bool(
                &mut isolate,
                &context,
                "typeof SharedArrayBuffer === 'undefined'"
            ));
        }

        // --- Part 5: SharedArrayBuffer preserved when timing_mitigation is not 'freeze' ---
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);

            let process_config = ProcessConfig {
                cwd: "/".into(),
                env: HashMap::new(),
                timing_mitigation: "none".into(),
                frozen_time_ms: None,
            };
            let os_config = OsConfig {
                homedir: "/root".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            };

            {
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let ctx = v8::Local::new(scope, &context);
                let scope = &mut v8::ContextScope::new(scope, ctx);
                inject_globals(scope, &process_config, &os_config);
            }

            // SharedArrayBuffer should still exist
            assert!(eval_bool(
                &mut isolate,
                &context,
                "typeof SharedArrayBuffer !== 'undefined'"
            ));
        }

        // --- Part 6: WASM disabled ---
        {
            let mut isolate = isolate::create_isolate(None);
            disable_wasm(&mut isolate);
            let context = isolate::create_context(&mut isolate);

            // Attempting to compile WASM should throw
            assert!(eval_throws(
                &mut isolate,
                &context,
                "new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))"
            ));
        }

        // --- Part 7: WASM works without disable_wasm ---
        {
            let mut isolate = isolate::create_isolate(None);
            let context = isolate::create_context(&mut isolate);

            // WASM should work by default (minimal valid WASM module)
            assert!(!eval_throws(
                &mut isolate,
                &context,
                "new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))"
            ));
        }

        // --- Part 8: Sync bridge call returns value ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            // Prepare BridgeResponse: call_id=1, result="hello world"
            let mut result_msgpack = Vec::new();
            rmpv::encode::write_value(
                &mut result_msgpack,
                &rmpv::Value::String("hello world".into()),
            )
            .unwrap();

            let mut response_buf = Vec::new();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(result_msgpack),
                    error: None,
                },
            )
            .unwrap();

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(response_buf)),
                "test-session".into(),
            );

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_sync_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &["_testBridge"],
                );
            }

            assert_eq!(eval(&mut iso, &ctx, "_testBridge('arg1')"), "hello world");
        }

        // --- Part 9: Bridge call error throws V8 exception ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let mut response_buf = Vec::new();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: None,
                    error: Some("ENOENT: file not found".into()),
                },
            )
            .unwrap();

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(response_buf)),
                "test-session".into(),
            );

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_sync_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &["_testBridge"],
                );
            }

            assert!(eval_throws(&mut iso, &ctx, "_testBridge('arg')"));
        }

        // --- Part 10: Multiple bridge functions with argument passing ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            // Prepare two BridgeResponses (call_id=1 for _fn1, call_id=2 for _fn2)
            let mut r1_bytes = Vec::new();
            rmpv::encode::write_value(
                &mut r1_bytes,
                &rmpv::Value::String("result-one".into()),
            )
            .unwrap();
            let mut r2_bytes = Vec::new();
            rmpv::encode::write_value(
                &mut r2_bytes,
                &rmpv::Value::Integer(rmpv::Integer::from(42i64)),
            )
            .unwrap();

            let mut response_buf = Vec::new();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r1_bytes),
                    error: None,
                },
            )
            .unwrap();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 2,
                    result: Some(r2_bytes),
                    error: None,
                },
            )
            .unwrap();

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(response_buf)),
                "test-session".into(),
            );

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_sync_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &["_fn1", "_fn2"],
                );
            }

            assert_eq!(eval(&mut iso, &ctx, "_fn1('x')"), "result-one");
            assert_eq!(eval(&mut iso, &ctx, "_fn2(1, 2, 3)"), "42");
        }

        // --- Part 11: Bridge call with null result returns undefined ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let mut response_buf = Vec::new();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: None,
                    error: None,
                },
            )
            .unwrap();

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(response_buf)),
                "test-session".into(),
            );

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_sync_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &["_testBridge"],
                );
            }

            assert!(eval_bool(
                &mut iso,
                &ctx,
                "_testBridge() === undefined"
            ));
        }

        // --- Part 12: Async bridge call returns pending promise, resolved successfully ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let writer_buf = Arc::new(Mutex::new(Vec::new()));
            let bridge_ctx = BridgeCallContext::new(
                Box::new(SharedWriter(Arc::clone(&writer_buf))),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Call the async function
            eval(&mut iso, &ctx, "var _promise = _asyncFn('arg1')");

            // Verify a BridgeCall was sent
            {
                let written = writer_buf.lock().unwrap();
                let call: crate::ipc::RustMessage =
                    crate::ipc::read_message(&mut Cursor::new(&*written)).unwrap();
                match call {
                    crate::ipc::RustMessage::BridgeCall {
                        call_id, method, ..
                    } => {
                        assert_eq!(call_id, 1);
                        assert_eq!(method, "_asyncFn");
                    }
                    _ => panic!("expected BridgeCall"),
                }
            }

            // Promise should be pending with 1 pending promise
            assert_eq!(pending.len(), 1);
            assert!(eval_bool(&mut iso, &ctx, "_promise instanceof Promise"));

            // Resolve the promise
            let mut result_msgpack = Vec::new();
            rmpv::encode::write_value(
                &mut result_msgpack,
                &rmpv::Value::String("async result".into()),
            )
            .unwrap();

            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(
                    scope,
                    &pending,
                    1,
                    Some(result_msgpack),
                    None,
                )
                .unwrap();
            }

            assert_eq!(pending.len(), 0);

            // Verify promise is fulfilled with correct value
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let source = v8::String::new(scope, "_promise").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                let result = script.run(scope).unwrap();
                let promise = v8::Local::<v8::Promise>::try_from(result).unwrap();
                assert_eq!(promise.state(), v8::PromiseState::Fulfilled);
                assert_eq!(
                    promise.result(scope).to_rust_string_lossy(scope),
                    "async result"
                );
            }
        }

        // --- Part 13: Async bridge call promise rejected on error ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            eval(&mut iso, &ctx, "var _promise = _asyncFn('arg')");
            assert_eq!(pending.len(), 1);

            // Reject the promise
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(
                    scope,
                    &pending,
                    1,
                    None,
                    Some("ENOENT: file not found".into()),
                )
                .unwrap();
            }

            assert_eq!(pending.len(), 0);

            // Verify promise is rejected with error
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let source = v8::String::new(scope, "_promise").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                let result = script.run(scope).unwrap();
                let promise = v8::Local::<v8::Promise>::try_from(result).unwrap();
                assert_eq!(promise.state(), v8::PromiseState::Rejected);
                let rejection = promise.result(scope);
                let obj = v8::Local::<v8::Object>::try_from(rejection).unwrap();
                let msg_key = v8::String::new(scope, "message").unwrap();
                let msg_val = obj.get(scope, msg_key.into()).unwrap();
                assert_eq!(
                    msg_val.to_rust_string_lossy(scope),
                    "ENOENT: file not found"
                );
            }
        }

        // --- Part 14: Multiple async functions with out-of-order resolution ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_fetch", "_dns"],
                );
            }

            eval(
                &mut iso,
                &ctx,
                "var _p1 = _fetch('url'); var _p2 = _dns('host')",
            );
            assert_eq!(pending.len(), 2);

            // Resolve in reverse order (p2 first, then p1)
            let mut r2 = Vec::new();
            rmpv::encode::write_value(
                &mut r2,
                &rmpv::Value::String("dns-result".into()),
            )
            .unwrap();
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(scope, &pending, 2, Some(r2), None)
                    .unwrap();
            }
            assert_eq!(pending.len(), 1);

            let mut r1 = Vec::new();
            rmpv::encode::write_value(
                &mut r1,
                &rmpv::Value::String("fetch-result".into()),
            )
            .unwrap();
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(scope, &pending, 1, Some(r1), None)
                    .unwrap();
            }
            assert_eq!(pending.len(), 0);

            // Verify both promises fulfilled correctly
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);

                let source = v8::String::new(scope, "_p1").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                let result = script.run(scope).unwrap();
                let promise = v8::Local::<v8::Promise>::try_from(result).unwrap();
                assert_eq!(promise.state(), v8::PromiseState::Fulfilled);
                assert_eq!(
                    promise.result(scope).to_rust_string_lossy(scope),
                    "fetch-result"
                );

                let source = v8::String::new(scope, "_p2").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                let result = script.run(scope).unwrap();
                let promise = v8::Local::<v8::Promise>::try_from(result).unwrap();
                assert_eq!(promise.state(), v8::PromiseState::Fulfilled);
                assert_eq!(
                    promise.result(scope).to_rust_string_lossy(scope),
                    "dns-result"
                );
            }
        }

        // --- Part 15: Async bridge call with null result resolves to undefined ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            eval(&mut iso, &ctx, "var _promise = _asyncFn()");

            // Resolve with None (null result)
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(scope, &pending, 1, None, None)
                    .unwrap();
            }

            // Promise should be fulfilled with undefined
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let source = v8::String::new(scope, "_promise").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                let result = script.run(scope).unwrap();
                let promise = v8::Local::<v8::Promise>::try_from(result).unwrap();
                assert_eq!(promise.state(), v8::PromiseState::Fulfilled);
                assert!(promise.result(scope).is_undefined());
            }
        }

        // --- Part 16: Microtasks flushed after promise resolution ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Set up .then handler that sets a global variable
            eval(
                &mut iso,
                &ctx,
                "var _thenRan = false; _asyncFn().then(function() { _thenRan = true; })",
            );

            // Before resolution, _thenRan should be false
            assert!(eval_bool(&mut iso, &ctx, "_thenRan === false"));

            // Resolve the promise (microtasks flushed inside resolve_pending_promise)
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(scope, &pending, 1, None, None)
                    .unwrap();
            }

            // After resolution + microtask flush, _thenRan should be true
            assert!(eval_bool(&mut iso, &ctx, "_thenRan === true"));
        }

        // --- Part 17: CJS execution — successful execution returns exit code 0 ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "var x = 1 + 2;")
            };

            assert_eq!(code, 0);
            assert!(error.is_none());
            // Verify the code actually ran
            assert_eq!(eval(&mut iso, &ctx, "x"), "3");
        }

        // --- Part 18: Bridge code IIFE executed before user code ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge = "(function() { globalThis._bridgeReady = true; })()";
            let user = "var _sawBridge = _bridgeReady;";
            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, bridge, user)
            };

            assert_eq!(code, 0);
            assert!(error.is_none());
            assert!(eval_bool(&mut iso, &ctx, "_sawBridge === true"));
            assert!(eval_bool(&mut iso, &ctx, "_bridgeReady === true"));
        }

        // --- Part 19: SyntaxError in user code returns structured error ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "var x = {;")
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "SyntaxError");
            assert!(!err.message.is_empty());
        }

        // --- Part 20: Runtime TypeError returns structured error ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "null.foo")
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "TypeError");
            assert!(!err.message.is_empty());
            assert!(!err.stack.is_empty());
        }

        // --- Part 21: SyntaxError in bridge code returns error ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "function {", "var x = 1;")
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "SyntaxError");
            // User code should NOT have run
            assert!(eval_bool(&mut iso, &ctx, "typeof x === 'undefined'"));
        }

        // --- Part 22: Empty bridge code is skipped ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "'hello'")
            };

            assert_eq!(code, 0);
            assert!(error.is_none());
        }

        // --- Part 23: Runtime error with error code ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(
                    scope,
                    "",
                    "var e = new Error('not found'); e.code = 'ERR_MODULE_NOT_FOUND'; throw e;",
                )
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "Error");
            assert_eq!(err.message, "not found");
            assert_eq!(err.code, Some("ERR_MODULE_NOT_FOUND".into()));
        }

        // --- Part 24: Thrown string (non-Error object) handled ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "throw 'raw string error';")
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "Error");
            assert_eq!(err.message, "raw string error");
            assert!(err.stack.is_empty());
            assert!(err.code.is_none());
        }

        // --- Part 25: ESM — simple module with exports ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );

            let user_code = "export const x = 42;\nexport const msg = 'hello';";
            let (code, exports, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_module(scope, &bridge_ctx, "", user_code, None)
            };

            assert_eq!(code, 0);
            assert!(error.is_none());
            let exports = exports.unwrap();
            let val: rmpv::Value =
                rmpv::decode::read_value(&mut &exports[..]).unwrap();
            let map = val.as_map().unwrap();
            let find = |key: &str| -> rmpv::Value {
                map.iter()
                    .find(|(k, _)| k.as_str() == Some(key))
                    .map(|(_, v)| v.clone())
                    .unwrap()
            };
            assert_eq!(find("x").as_u64(), Some(42));
            assert_eq!(find("msg").as_str(), Some("hello"));
        }

        // --- Part 26: ESM — default export ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );

            let (code, exports, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_module(scope, &bridge_ctx, "", "export default 'world';", None)
            };

            assert_eq!(code, 0);
            assert!(error.is_none());
            let exports = exports.unwrap();
            let val: rmpv::Value =
                rmpv::decode::read_value(&mut &exports[..]).unwrap();
            let map = val.as_map().unwrap();
            let default_val = map
                .iter()
                .find(|(k, _)| k.as_str() == Some("default"))
                .map(|(_, v)| v)
                .unwrap();
            assert_eq!(default_val.as_str(), Some("world"));
        }

        // --- Part 27: ESM — SyntaxError ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );

            let (code, _exports, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_module(scope, &bridge_ctx, "", "export const x = {;", None)
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "SyntaxError");
        }

        // --- Part 28: ESM — runtime TypeError ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );

            let (code, _exports, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_module(
                    scope,
                    &bridge_ctx,
                    "",
                    "const x = null; x.foo;",
                    None,
                )
            };

            assert_eq!(code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "TypeError");
        }

        // --- Part 29: ESM — bridge code IIFE runs before module ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );

            let bridge = "(function() { globalThis._bridgeReady = true; })()";
            let user = "export const saw = _bridgeReady;";
            let (code, exports, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_module(scope, &bridge_ctx, bridge, user, None)
            };

            assert_eq!(code, 0);
            assert!(error.is_none());
            let exports = exports.unwrap();
            let val: rmpv::Value =
                rmpv::decode::read_value(&mut &exports[..]).unwrap();
            let map = val.as_map().unwrap();
            let saw_val = map
                .iter()
                .find(|(k, _)| k.as_str() == Some("saw"))
                .map(|(_, v)| v)
                .unwrap();
            assert_eq!(saw_val.as_bool(), Some(true));
        }

        // --- Part 30: ESM — import from dependency via resolve callback ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            // Prepare BridgeResponse messages for _resolveModule and _loadFile
            let mut response_buf = Vec::new();

            // Response 1: _resolveModule returns "/dep.mjs"
            let mut resolve_result = Vec::new();
            rmpv::encode::write_value(
                &mut resolve_result,
                &rmpv::Value::String("/dep.mjs".into()),
            )
            .unwrap();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(resolve_result),
                    error: None,
                },
            )
            .unwrap();

            // Response 2: _loadFile returns the dependency source
            let mut load_result = Vec::new();
            rmpv::encode::write_value(
                &mut load_result,
                &rmpv::Value::String("export const dep_val = 99;".into()),
            )
            .unwrap();
            crate::ipc::write_message(
                &mut response_buf,
                &crate::ipc::HostMessage::BridgeResponse {
                    call_id: 2,
                    result: Some(load_result),
                    error: None,
                },
            )
            .unwrap();

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(response_buf)),
                "test-session".into(),
            );

            let user_code =
                "import { dep_val } from './dep.mjs';\nexport const result = dep_val + 1;";
            let (code, exports, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_module(
                    scope,
                    &bridge_ctx,
                    "",
                    user_code,
                    Some("/app/main.mjs"),
                )
            };

            assert_eq!(code, 0, "error: {:?}", error);
            assert!(error.is_none());
            let exports = exports.unwrap();
            let val: rmpv::Value =
                rmpv::decode::read_value(&mut &exports[..]).unwrap();
            let map = val.as_map().unwrap();
            let result_val = map
                .iter()
                .find(|(k, _)| k.as_str() == Some("result"))
                .map(|(_, v)| v)
                .unwrap();
            assert_eq!(result_val.as_u64(), Some(100));
        }

        // --- Part 31: Event loop — BridgeResponse resolves pending promise ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            // Register async bridge function
            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Call async function from V8 — creates pending promise
            eval(
                &mut iso,
                &ctx,
                "var _eventLoopResult = 'pending'; _asyncFn('test').then(function(v) { _eventLoopResult = v; })",
            );
            assert_eq!(pending.len(), 1);
            assert_eq!(eval(&mut iso, &ctx, "_eventLoopResult"), "pending");

            // Create channel and send BridgeResponse
            let (tx, rx) = crossbeam_channel::unbounded();
            let mut result_msgpack = Vec::new();
            rmpv::encode::write_value(
                &mut result_msgpack,
                &rmpv::Value::String("event-loop-resolved".into()),
            )
            .unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(result_msgpack),
                    error: None,
                },
            ))
            .unwrap();

            // Run event loop
            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed, "event loop should complete normally");
            assert_eq!(pending.len(), 0);
            assert_eq!(eval(&mut iso, &ctx, "_eventLoopResult"), "event-loop-resolved");
        }

        // --- Part 32: Event loop — multiple BridgeResponses resolved in sequence ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_fetch", "_dns"],
                );
            }

            // Create two pending promises
            eval(
                &mut iso,
                &ctx,
                "var _r1 = 'pending'; var _r2 = 'pending'; \
                 _fetch('url').then(function(v) { _r1 = v; }); \
                 _dns('host').then(function(v) { _r2 = v; })",
            );
            assert_eq!(pending.len(), 2);

            // Create channel and send both responses
            let (tx, rx) = crossbeam_channel::unbounded();
            // Resolve in reverse order
            let mut r2 = Vec::new();
            rmpv::encode::write_value(&mut r2, &rmpv::Value::String("dns-result".into())).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 2,
                    result: Some(r2),
                    error: None,
                },
            ))
            .unwrap();
            let mut r1 = Vec::new();
            rmpv::encode::write_value(&mut r1, &rmpv::Value::String("fetch-result".into())).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r1),
                    error: None,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
            assert_eq!(pending.len(), 0);
            assert_eq!(eval(&mut iso, &ctx, "_r1"), "fetch-result");
            assert_eq!(eval(&mut iso, &ctx, "_r2"), "dns-result");
        }

        // --- Part 33: Event loop — TerminateExecution breaks loop ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            eval(&mut iso, &ctx, "_asyncFn('test')");
            assert_eq!(pending.len(), 1);

            // Send TerminateExecution
            let (tx, rx) = crossbeam_channel::unbounded();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::TerminateExecution {
                    session_id: "test-session".into(),
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(!completed, "event loop should return false on termination");
            // Promise is still pending (not resolved)
            assert_eq!(pending.len(), 1);

            // Cancel termination so isolate is usable again
            iso.cancel_terminate_execution();
        }

        // --- Part 34: Event loop — Shutdown breaks loop ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            eval(&mut iso, &ctx, "_asyncFn('test')");
            assert_eq!(pending.len(), 1);

            // Send Shutdown
            let (tx, rx) = crossbeam_channel::unbounded();
            tx.send(crate::session::SessionCommand::Shutdown).unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(!completed, "event loop should return false on shutdown");
        }

        // --- Part 35: Event loop — exits immediately when no pending promises ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let pending = bridge::PendingPromises::new();

            let (_tx, rx) = crossbeam_channel::unbounded::<crate::session::SessionCommand>();

            // No pending promises — event loop should exit immediately
            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
        }

        // --- Part 36: Event loop — StreamEvent dispatches to V8 callback ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Register dispatch callback and create pending promise
            eval(
                &mut iso,
                &ctx,
                "var _streamEvents = []; \
                 globalThis._childProcessDispatch = function(eventType, payload) { \
                     _streamEvents.push({ type: eventType, data: payload }); \
                 }; \
                 _asyncFn('keep-alive')",
            );
            assert_eq!(pending.len(), 1);

            // Send StreamEvent followed by BridgeResponse
            let (tx, rx) = crossbeam_channel::unbounded();

            // Encode payload as MessagePack string
            let mut payload_bytes = Vec::new();
            rmpv::encode::write_value(
                &mut payload_bytes,
                &rmpv::Value::String("hello from child".into()),
            )
            .unwrap();

            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stdout".into(),
                    payload: payload_bytes,
                },
            ))
            .unwrap();

            // Resolve the pending promise to exit the event loop
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
            assert_eq!(pending.len(), 0);

            // Verify stream event was dispatched
            assert_eq!(eval(&mut iso, &ctx, "_streamEvents.length"), "1");
            assert_eq!(eval(&mut iso, &ctx, "_streamEvents[0].type"), "child_stdout");
            assert_eq!(
                eval(&mut iso, &ctx, "_streamEvents[0].data"),
                "hello from child"
            );
        }

        // --- Part 37: Event loop — microtasks flushed after BridgeResponse ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Set up .then handler that mutates global state
            eval(
                &mut iso,
                &ctx,
                "var _microtaskRan = false; \
                 _asyncFn('test').then(function() { _microtaskRan = true; })",
            );
            assert!(eval_bool(&mut iso, &ctx, "_microtaskRan === false"));

            let (tx, rx) = crossbeam_channel::unbounded();
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending);
            }

            // .then handler should have run (microtasks flushed)
            assert!(eval_bool(&mut iso, &ctx, "_microtaskRan === true"));
        }

        // --- Part 38: StreamEvent dispatches child_stderr and child_exit ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Register child process dispatch and create pending promise
            eval(
                &mut iso,
                &ctx,
                "var _childEvents = []; \
                 globalThis._childProcessDispatch = function(eventType, payload) { \
                     _childEvents.push({ type: eventType, data: payload }); \
                 }; \
                 _asyncFn('keep-alive')",
            );
            assert_eq!(pending.len(), 1);

            let (tx, rx) = crossbeam_channel::unbounded();

            // Send child_stderr event
            let mut stderr_payload = Vec::new();
            rmpv::encode::write_value(
                &mut stderr_payload,
                &rmpv::Value::String("error output".into()),
            )
            .unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stderr".into(),
                    payload: stderr_payload,
                },
            ))
            .unwrap();

            // Send child_exit event with exit code
            let mut exit_payload = Vec::new();
            rmpv::encode::write_value(
                &mut exit_payload,
                &rmpv::Value::Integer(rmpv::Integer::from(1i64)),
            )
            .unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_exit".into(),
                    payload: exit_payload,
                },
            ))
            .unwrap();

            // Resolve the pending promise to exit the event loop
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
            assert_eq!(eval(&mut iso, &ctx, "_childEvents.length"), "2");
            assert_eq!(eval(&mut iso, &ctx, "_childEvents[0].type"), "child_stderr");
            assert_eq!(eval(&mut iso, &ctx, "_childEvents[0].data"), "error output");
            assert_eq!(eval(&mut iso, &ctx, "_childEvents[1].type"), "child_exit");
            assert_eq!(eval(&mut iso, &ctx, "_childEvents[1].data"), "1");
        }

        // --- Part 39: StreamEvent dispatches http_request to _httpServerDispatch ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Register HTTP dispatch and create pending promise
            eval(
                &mut iso,
                &ctx,
                "var _httpEvents = []; \
                 globalThis._httpServerDispatch = function(eventType, payload) { \
                     _httpEvents.push({ type: eventType, data: payload }); \
                 }; \
                 _asyncFn('keep-alive')",
            );
            assert_eq!(pending.len(), 1);

            let (tx, rx) = crossbeam_channel::unbounded();

            // Send http_request event with request data
            let mut http_payload = Vec::new();
            rmpv::encode::write_value(
                &mut http_payload,
                &rmpv::Value::Map(vec![
                    (
                        rmpv::Value::String("method".into()),
                        rmpv::Value::String("GET".into()),
                    ),
                    (
                        rmpv::Value::String("url".into()),
                        rmpv::Value::String("/api/test".into()),
                    ),
                ]),
            )
            .unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "http_request".into(),
                    payload: http_payload,
                },
            ))
            .unwrap();

            // Resolve the pending promise to exit the event loop
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
            assert_eq!(eval(&mut iso, &ctx, "_httpEvents.length"), "1");
            assert_eq!(eval(&mut iso, &ctx, "_httpEvents[0].type"), "http_request");
            assert_eq!(eval(&mut iso, &ctx, "_httpEvents[0].data.method"), "GET");
            assert_eq!(eval(&mut iso, &ctx, "_httpEvents[0].data.url"), "/api/test");
        }

        // --- Part 40: StreamEvent with unknown event_type is ignored ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            eval(
                &mut iso,
                &ctx,
                "var _anyDispatched = false; \
                 globalThis._childProcessDispatch = function() { _anyDispatched = true; }; \
                 globalThis._httpServerDispatch = function() { _anyDispatched = true; }; \
                 _asyncFn('keep-alive')",
            );
            assert_eq!(pending.len(), 1);

            let (tx, rx) = crossbeam_channel::unbounded();

            // Send unknown event type
            let mut payload = Vec::new();
            rmpv::encode::write_value(&mut payload, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "unknown_event".into(),
                    payload,
                },
            ))
            .unwrap();

            // Resolve pending promise to exit loop
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
            // Unknown event should NOT have dispatched to any handler
            assert!(eval_bool(&mut iso, &ctx, "_anyDispatched === false"));
        }

        // --- Part 41: StreamEvent dispatch with missing callback is safe (no crash) ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // No dispatch functions registered, just create a pending promise
            eval(&mut iso, &ctx, "_asyncFn('keep-alive')");
            assert_eq!(pending.len(), 1);

            let (tx, rx) = crossbeam_channel::unbounded();

            // Send child_stdout without _childProcessDispatch registered
            let mut payload = Vec::new();
            rmpv::encode::write_value(&mut payload, &rmpv::Value::String("data".into())).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stdout".into(),
                    payload,
                },
            ))
            .unwrap();

            // Resolve pending promise
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            // Should not crash even without dispatch function registered
            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending)
            };

            assert!(completed);
        }

        // --- Part 42: StreamEvent microtasks flushed after dispatch ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let bridge_ctx = BridgeCallContext::new(
                Box::new(Vec::new()),
                Box::new(Cursor::new(Vec::new())),
                "test-session".into(),
            );
            let pending = bridge::PendingPromises::new();

            let _fn_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _fn_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_asyncFn"],
                );
            }

            // Set up dispatch that enqueues a microtask via Promise.resolve().then()
            eval(
                &mut iso,
                &ctx,
                "var _microtaskRanFromStream = false; \
                 globalThis._childProcessDispatch = function(eventType, payload) { \
                     Promise.resolve().then(function() { _microtaskRanFromStream = true; }); \
                 }; \
                 _asyncFn('keep-alive')",
            );
            assert_eq!(pending.len(), 1);

            let (tx, rx) = crossbeam_channel::unbounded();

            let mut payload = Vec::new();
            rmpv::encode::write_value(&mut payload, &rmpv::Value::String("data".into())).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stdout".into(),
                    payload,
                },
            ))
            .unwrap();

            // Resolve pending promise
            let mut r = Vec::new();
            rmpv::encode::write_value(&mut r, &rmpv::Value::Nil).unwrap();
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc::HostMessage::BridgeResponse {
                    call_id: 1,
                    result: Some(r),
                    error: None,
                },
            ))
            .unwrap();

            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending);
            }

            // Microtask enqueued by the dispatch callback should have run
            assert!(eval_bool(&mut iso, &ctx, "_microtaskRanFromStream === true"));
        }
    }
}
