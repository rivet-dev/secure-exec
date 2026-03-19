// Script compilation, CJS/ESM execution, module loading

use std::cell::RefCell;
use std::collections::HashMap;
use std::num::NonZeroI32;

use crate::bridge::{deserialize_v8_value, serialize_v8_value};
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

    // SharedArrayBuffer removal for timing mitigation is handled by the JS-side
    // bridge code (applyTimingMitigationFreeze), which runs AFTER the bridge bundle
    // loads. The bridge bundle depends on SharedArrayBuffer being available during
    // its initialization (whatwg-url/webidl-conversions uses it).
}

/// Inject globals from a V8-serialized payload containing { processConfig, osConfig }.
///
/// The payload is produced by node:v8.serialize() on the host side.
/// Deserializes into V8, extracts processConfig and osConfig, freezes them,
/// and sets them as non-writable, non-configurable global properties.
pub fn inject_globals_from_payload(
    scope: &mut v8::HandleScope,
    payload: &[u8],
) {
    let context = scope.get_current_context();
    let global = context.global(scope);

    // Deserialize the V8 payload { processConfig, osConfig }
    let config_val = match deserialize_v8_value(scope, payload) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("failed to deserialize InjectGlobals payload: {}", e);
            return;
        }
    };

    let config_obj = match config_val.to_object(scope) {
        Some(obj) => obj,
        None => {
            eprintln!("InjectGlobals payload is not an object");
            return;
        }
    };

    // Extract and set _processConfig
    let pc_key = v8::String::new(scope, "processConfig").unwrap();
    if let Some(pc_val) = config_obj.get(scope, pc_key.into()) {
        if let Some(pc_obj) = pc_val.to_object(scope) {
            pc_obj.set_integrity_level(scope, v8::IntegrityLevel::Frozen);
        }
        let global_key = v8::String::new(scope, "_processConfig").unwrap();
        let attr = v8::PropertyAttribute::READ_ONLY | v8::PropertyAttribute::DONT_DELETE;
        global.define_own_property(scope, global_key.into(), pc_val, attr);
    }

    // Extract and set _osConfig
    let oc_key = v8::String::new(scope, "osConfig").unwrap();
    if let Some(oc_val) = config_obj.get(scope, oc_key.into()) {
        if let Some(oc_obj) = oc_val.to_object(scope) {
            oc_obj.set_integrity_level(scope, v8::IntegrityLevel::Frozen);
        }
        let global_key = v8::String::new(scope, "_osConfig").unwrap();
        let attr = v8::PropertyAttribute::READ_ONLY | v8::PropertyAttribute::DONT_DELETE;
        global.define_own_property(scope, global_key.into(), oc_val, attr);
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
                return match tc.exception() {
                    Some(e) => { let (c, err) = exception_to_result(tc, e); (c, Some(err)) }
                    None => (1, None),
                };
            }
        };
        if script.run(tc).is_none() {
            return match tc.exception() {
                Some(e) => { let (c, err) = exception_to_result(tc, e); (c, Some(err)) }
                None => (1, None),
            };
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
                return match tc.exception() {
                    Some(e) => { let (c, err) = exception_to_result(tc, e); (c, Some(err)) }
                    None => (1, None),
                };
            }
        };
        if script.run(tc).is_none() {
            return match tc.exception() {
                Some(e) => { let (c, err) = exception_to_result(tc, e); (c, Some(err)) }
                None => (1, None),
            };
        }
    }

    (0, None)
}

/// Check if a V8 exception is a ProcessExitError (has `_isProcessExit: true` sentinel).
/// Returns `Some(exit_code)` if detected, `None` otherwise.
///
/// ProcessExitError is detected by sentinel property, not by regex matching on the
/// error message or constructor name.
pub fn extract_process_exit_code(
    scope: &mut v8::HandleScope,
    exception: v8::Local<v8::Value>,
) -> Option<i32> {
    if !exception.is_object() {
        return None;
    }
    let obj = v8::Local::<v8::Object>::try_from(exception).ok()?;
    let sentinel_key = v8::String::new(scope, "_isProcessExit")?;
    let sentinel_val = obj.get(scope, sentinel_key.into())?;
    if !sentinel_val.is_true() {
        return None;
    }
    // Extract numeric exit code from .code property
    let code_key = v8::String::new(scope, "code")?;
    let code_val = obj.get(scope, code_key.into())?;
    if code_val.is_number() {
        Some(code_val.int32_value(scope).unwrap_or(1))
    } else {
        Some(1)
    }
}

/// Extract error info and exit code from a V8 exception.
/// For ProcessExitError (detected via _isProcessExit sentinel), returns the error's exit code.
/// For other errors, returns exit code 1.
fn exception_to_result(
    scope: &mut v8::HandleScope,
    exception: v8::Local<v8::Value>,
) -> (i32, ExecutionError) {
    let exit_code = extract_process_exit_code(scope, exception).unwrap_or(1);
    let error = extract_error_info(scope, exception);
    (exit_code, error)
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
                clear_module_state();
                return match tc.exception() {
                    Some(e) => { let (c, err) = exception_to_result(tc, e); (c, None, Some(err)) }
                    None => (1, None, None),
                };
            }
        };
        if script.run(tc).is_none() {
            clear_module_state();
            return match tc.exception() {
                Some(e) => { let (c, err) = exception_to_result(tc, e); (c, None, Some(err)) }
                None => (1, None, None),
            };
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
                clear_module_state();
                return match tc.exception() {
                    Some(e) => { let (c, err) = exception_to_result(tc, e); (c, None, Some(err)) }
                    None => (1, None, None),
                };
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
            clear_module_state();
            return match tc.exception() {
                Some(e) => { let (c, err) = exception_to_result(tc, e); (c, None, Some(err)) }
                None => (1, None, None),
            };
        }

        // Evaluate
        let eval_result = module.evaluate(tc);
        if eval_result.is_none() {
            clear_module_state();
            return match tc.exception() {
                Some(e) => { let (c, err) = exception_to_result(tc, e); (c, None, Some(err)) }
                None => (1, None, None),
            };
        }

        // Check module status for errors (handles TLA rejection case)
        if module.get_status() == v8::ModuleStatus::Errored {
            let exc = module.get_exception();
            clear_module_state();
            let (exit_code, err) = exception_to_result(tc, exc);
            return (exit_code, None, Some(err));
        }

        // Serialize module namespace (exports)
        // If the ESM namespace is empty, fall back to globalThis.module.exports
        // for CJS compatibility (code using module.exports = {...}).
        // The module namespace is a V8 exotic object that ValueSerializer can't
        // handle directly, so we copy its properties into a plain object.
        let namespace = module.get_module_namespace();
        let namespace_obj = namespace.to_object(tc).unwrap();
        let prop_names = namespace_obj
            .get_own_property_names(tc, v8::GetPropertyNamesArgs::default())
            .unwrap();
        let exports_val: v8::Local<v8::Value> = if prop_names.length() == 0 {
            // No ESM exports — check CJS module.exports fallback
            let ctx = tc.get_current_context();
            let global = ctx.global(tc);
            let module_key = v8::String::new(tc, "module").unwrap();
            let cjs_exports = global
                .get(tc, module_key.into())
                .and_then(|m| m.to_object(tc))
                .and_then(|m| {
                    let exports_key = v8::String::new(tc, "exports").unwrap();
                    m.get(tc, exports_key.into())
                })
                .filter(|v| !v.is_undefined() && !v.is_null_or_undefined());
            match cjs_exports {
                Some(val) => val,
                None => {
                    // Empty namespace, empty CJS — return empty object
                    v8::Object::new(tc).into()
                }
            }
        } else {
            // Copy namespace properties to a plain object for serialization
            let plain = v8::Object::new(tc);
            for i in 0..prop_names.length() {
                let key = prop_names.get_index(tc, i).unwrap();
                let val = namespace_obj.get(tc, key).unwrap_or_else(|| v8::undefined(tc).into());
                plain.set(tc, key, val);
            }
            plain.into()
        };
        let exports_bytes = match serialize_v8_value(tc, exports_val) {
            Ok(bytes) => bytes,
            Err(e) => {
                clear_module_state();
                return (1, None, Some(ExecutionError {
                    error_type: "Error".into(),
                    message: format!("failed to serialize exports: {}", e),
                    stack: String::new(),
                    code: None,
                }));
            }
        };

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
    // Serialize [specifier, referrer] as V8 Array
    let spec_v8 = v8::String::new(scope, specifier).unwrap();
    let ref_v8 = v8::String::new(scope, referrer).unwrap();
    let arr = v8::Array::new(scope, 2);
    arr.set_index(scope, 0, spec_v8.into());
    arr.set_index(scope, 1, ref_v8.into());
    let args = match serialize_v8_value(scope, arr.into()) {
        Ok(bytes) => bytes,
        Err(e) => {
            throw_module_error(scope, &format!("_resolveModule serialize error: {}", e));
            return None;
        }
    };

    match ctx.sync_call("_resolveModule", args) {
        Ok(Some(bytes)) => match deserialize_v8_value(scope, &bytes) {
            Ok(val) => {
                if val.is_string() {
                    Some(val.to_rust_string_lossy(scope))
                } else {
                    throw_module_error(
                        scope,
                        &format!("_resolveModule returned non-string for '{}'", specifier),
                    );
                    None
                }
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
    // Serialize [resolved_path] as V8 Array
    let path_v8 = v8::String::new(scope, resolved_path).unwrap();
    let arr = v8::Array::new(scope, 1);
    arr.set_index(scope, 0, path_v8.into());
    let args = match serialize_v8_value(scope, arr.into()) {
        Ok(bytes) => bytes,
        Err(e) => {
            throw_module_error(scope, &format!("_loadFile serialize error: {}", e));
            return None;
        }
    };

    match ctx.sync_call("_loadFile", args) {
        Ok(Some(bytes)) => match deserialize_v8_value(scope, &bytes) {
            Ok(val) => {
                if val.is_string() {
                    Some(val.to_rust_string_lossy(scope))
                } else {
                    throw_module_error(
                        scope,
                        &format!("_loadFile returned non-string for '{}'", resolved_path),
                    );
                    None
                }
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

    /// Helper: serialize a V8 string value for test BridgeResponse payloads
    fn v8_serialize_str(iso: &mut v8::OwnedIsolate, ctx: &v8::Global<v8::Context>, s: &str) -> Vec<u8> {
        let scope = &mut v8::HandleScope::new(iso);
        let local = v8::Local::new(scope, ctx);
        let scope = &mut v8::ContextScope::new(scope, local);
        let val = v8::String::new(scope, s).unwrap();
        crate::bridge::serialize_v8_value(scope, val.into()).unwrap()
    }

    /// Helper: serialize a V8 integer value for test BridgeResponse payloads
    fn v8_serialize_int(iso: &mut v8::OwnedIsolate, ctx: &v8::Global<v8::Context>, n: i64) -> Vec<u8> {
        let scope = &mut v8::HandleScope::new(iso);
        let local = v8::Local::new(scope, ctx);
        let scope = &mut v8::ContextScope::new(scope, local);
        let val = v8::Number::new(scope, n as f64);
        crate::bridge::serialize_v8_value(scope, val.into()).unwrap()
    }

    /// Helper: serialize a V8 null value for test BridgeResponse payloads
    fn v8_serialize_null(iso: &mut v8::OwnedIsolate, ctx: &v8::Global<v8::Context>) -> Vec<u8> {
        let scope = &mut v8::HandleScope::new(iso);
        let local = v8::Local::new(scope, ctx);
        let scope = &mut v8::ContextScope::new(scope, local);
        let val = v8::null(scope);
        crate::bridge::serialize_v8_value(scope, val.into()).unwrap()
    }

    /// Helper: serialize a V8 object (from JS expression) for test BridgeResponse payloads
    fn v8_serialize_eval(iso: &mut v8::OwnedIsolate, ctx: &v8::Global<v8::Context>, expr: &str) -> Vec<u8> {
        let scope = &mut v8::HandleScope::new(iso);
        let local = v8::Local::new(scope, ctx);
        let scope = &mut v8::ContextScope::new(scope, local);
        let source = v8::String::new(scope, expr).unwrap();
        let script = v8::Script::compile(scope, source, None).unwrap();
        let val = script.run(scope).unwrap();
        crate::bridge::serialize_v8_value(scope, val).unwrap()
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
            let result_v8 = v8_serialize_str(&mut iso, &ctx, "hello world");

            let mut response_buf = Vec::new();
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: result_v8,
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
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 1,
                    payload: "ENOENT: file not found".as_bytes().to_vec(),
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
            let r1_bytes = v8_serialize_str(&mut iso, &ctx, "result-one");
            let r2_bytes = v8_serialize_int(&mut iso, &ctx, 42);

            let mut response_buf = Vec::new();
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r1_bytes,
                },
            )
            .unwrap();
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 2,
                    status: 0,
                    payload: r2_bytes,
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
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: vec![],
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
                let call = crate::ipc_binary::read_frame(&mut Cursor::new(&*written)).unwrap();
                match call {
                    crate::ipc_binary::BinaryFrame::BridgeCall {
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
            let result_v8 = v8_serialize_str(&mut iso, &ctx, "async result");

            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(
                    scope,
                    &pending,
                    1,
                    Some(result_v8),
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
            let r2 = v8_serialize_str(&mut iso, &ctx, "dns-result");
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                bridge::resolve_pending_promise(scope, &pending, 2, Some(r2), None)
                    .unwrap();
            }
            assert_eq!(pending.len(), 1);

            let r1 = v8_serialize_str(&mut iso, &ctx, "fetch-result");
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
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let val = crate::bridge::deserialize_v8_value(scope, &exports).unwrap();
                assert!(val.is_object());
                let obj = v8::Local::<v8::Object>::try_from(val).unwrap();
                let k = v8::String::new(scope, "x").unwrap();
                assert_eq!(obj.get(scope, k.into()).unwrap().int32_value(scope).unwrap(), 42);
                let k = v8::String::new(scope, "msg").unwrap();
                assert_eq!(obj.get(scope, k.into()).unwrap().to_rust_string_lossy(scope), "hello");
            }
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
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let val = crate::bridge::deserialize_v8_value(scope, &exports).unwrap();
                assert!(val.is_object());
                let obj = v8::Local::<v8::Object>::try_from(val).unwrap();
                let k = v8::String::new(scope, "default").unwrap();
                assert_eq!(obj.get(scope, k.into()).unwrap().to_rust_string_lossy(scope), "world");
            }
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
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let val = crate::bridge::deserialize_v8_value(scope, &exports).unwrap();
                assert!(val.is_object());
                let obj = v8::Local::<v8::Object>::try_from(val).unwrap();
                let k = v8::String::new(scope, "saw").unwrap();
                assert!(obj.get(scope, k.into()).unwrap().is_true());
            }
        }

        // --- Part 30: ESM — import from dependency via resolve callback ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            // Prepare BridgeResponse messages for _resolveModule and _loadFile
            let mut response_buf = Vec::new();

            // Response 1: _resolveModule returns "/dep.mjs"
            let resolve_result = v8_serialize_str(&mut iso, &ctx, "/dep.mjs");
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: resolve_result,
                },
            )
            .unwrap();

            // Response 2: _loadFile returns the dependency source
            let load_result = v8_serialize_str(&mut iso, &ctx, "export const dep_val = 99;");
            crate::ipc_binary::write_frame(
                &mut response_buf,
                &crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 2,
                    status: 0,
                    payload: load_result,
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
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                let val = crate::bridge::deserialize_v8_value(scope, &exports).unwrap();
                assert!(val.is_object());
                let obj = v8::Local::<v8::Object>::try_from(val).unwrap();
                let k = v8::String::new(scope, "result").unwrap();
                assert_eq!(obj.get(scope, k.into()).unwrap().int32_value(scope).unwrap(), 100);
            }
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
            let result_v8 = v8_serialize_str(&mut iso, &ctx, "event-loop-resolved");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: result_v8,
                },
            ))
            .unwrap();

            // Run event loop
            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
            let r2 = v8_serialize_str(&mut iso, &ctx, "dns-result");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 2,
                    status: 0,
                    payload: r2,
                },
            ))
            .unwrap();
            let r1 = v8_serialize_str(&mut iso, &ctx, "fetch-result");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r1,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
                crate::ipc_binary::BinaryFrame::TerminateExecution {
                    session_id: "test-session".into(),
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
                crate::session::run_event_loop(scope, &rx, &pending, None)
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

            // Encode payload as V8-serialized string
            let payload_bytes = v8_serialize_str(&mut iso, &ctx, "hello from child");

            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stdout".into(),
                    payload: payload_bytes,
                },
            ))
            .unwrap();

            // Resolve the pending promise to exit the event loop
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None);
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
            let stderr_payload = v8_serialize_str(&mut iso, &ctx, "error output");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stderr".into(),
                    payload: stderr_payload,
                },
            ))
            .unwrap();

            // Send child_exit event with exit code
            let exit_payload = v8_serialize_int(&mut iso, &ctx, 1);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_exit".into(),
                    payload: exit_payload,
                },
            ))
            .unwrap();

            // Resolve the pending promise to exit the event loop
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
            let http_payload = v8_serialize_eval(&mut iso, &ctx, "({method: 'GET', url: '/api/test'})");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "http_request".into(),
                    payload: http_payload,
                },
            ))
            .unwrap();

            // Resolve the pending promise to exit the event loop
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
            let payload = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "unknown_event".into(),
                    payload,
                },
            ))
            .unwrap();

            // Resolve pending promise to exit loop
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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
            let payload = v8_serialize_str(&mut iso, &ctx, "data");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stdout".into(),
                    payload,
                },
            ))
            .unwrap();

            // Resolve pending promise
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            // Should not crash even without dispatch function registered
            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None)
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

            let payload = v8_serialize_str(&mut iso, &ctx, "data");
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::StreamEvent {
                    session_id: "test-session".into(),
                    event_type: "child_stdout".into(),
                    payload,
                },
            ))
            .unwrap();

            // Resolve pending promise
            let r = v8_serialize_null(&mut iso, &ctx);
            tx.send(crate::session::SessionCommand::Message(
                crate::ipc_binary::BinaryFrame::BridgeResponse {
                    session_id: String::new(),
                    call_id: 1,
                    status: 0,
                    payload: r,
                },
            ))
            .unwrap();

            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &rx, &pending, None);
            }

            // Microtask enqueued by the dispatch callback should have run
            assert!(eval_bool(&mut iso, &ctx, "_microtaskRanFromStream === true"));
        }

        // --- Part 43: Timeout terminates infinite loop ---
        {
            let mut iso = isolate::create_isolate(None);
            disable_wasm(&mut iso);
            let ctx = isolate::create_context(&mut iso);

            // Create abort channel for timeout
            let (abort_tx, _abort_rx) = crossbeam_channel::bounded::<()>(0);

            // Get isolate handle for the timeout guard
            let iso_handle = iso.thread_safe_handle();

            // Start a 50ms timeout
            let mut guard = crate::timeout::TimeoutGuard::new(50, iso_handle, abort_tx);

            // Run an infinite loop — timeout should terminate it
            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "while(true) {}")
            };

            assert!(guard.timed_out(), "timeout should have fired");
            // V8 termination causes an error
            assert_eq!(code, 1);
            assert!(error.is_some());

            guard.cancel();
        }

        // --- Part 44: Timeout cancelled when execution completes before deadline ---
        {
            let mut iso = isolate::create_isolate(None);
            disable_wasm(&mut iso);
            let ctx = isolate::create_context(&mut iso);

            let (abort_tx, _abort_rx) = crossbeam_channel::bounded::<()>(0);
            let iso_handle = iso.thread_safe_handle();

            // 5 second timeout — execution completes well before
            let mut guard = crate::timeout::TimeoutGuard::new(5000, iso_handle, abort_tx);

            let (code, error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "1 + 1")
            };

            assert!(!guard.timed_out(), "timeout should not have fired");
            assert_eq!(code, 0);
            assert!(error.is_none());

            guard.cancel();
        }

        // --- Part 45: Timeout fires during sync bridge call (unblocks channel reader) ---
        {
            let mut iso = isolate::create_isolate(None);
            disable_wasm(&mut iso);
            let ctx = isolate::create_context(&mut iso);

            // Set up abort channel for timeout
            let (abort_tx, abort_rx) = crossbeam_channel::bounded::<()>(0);
            let iso_handle = iso.thread_safe_handle();

            // Create a BridgeCallContext with a channel reader that monitors abort_rx
            // Simulate: JS calls a sync bridge function, but no response comes back.
            // The timeout should unblock the reader via abort channel.
            let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded::<crate::session::SessionCommand>();

            // Writer goes to a buffer (we don't care about outgoing messages)
            let writer_buf = Arc::new(Mutex::new(Vec::new()));

            // Create the bridge context with a channel-based reader
            // We can't use ChannelMessageReader directly (it's #[cfg(not(test))])
            // Instead, test the abort_rx behavior through run_event_loop

            let pending = bridge::PendingPromises::new();

            // Register an async bridge function that sends a BridgeCall
            let bridge_ctx = BridgeCallContext::new(
                Box::new(SharedWriter(Arc::clone(&writer_buf))),
                Box::new(Cursor::new(Vec::new())), // unused for async
                "test-session".into(),
            );
            let _async_store;
            {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                _async_store = bridge::register_async_bridge_fns(
                    scope,
                    &bridge_ctx as *const BridgeCallContext,
                    &pending as *const bridge::PendingPromises,
                    &["_slowFn"],
                );
            }

            // Execute code that calls async bridge function (creates a pending promise)
            let (_code, _error) = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                execute_script(scope, "", "_slowFn('never-responds')")
            };

            assert_eq!(pending.len(), 1, "should have 1 pending promise");

            // Start a 50ms timeout
            let mut guard = crate::timeout::TimeoutGuard::new(50, iso_handle, abort_tx);

            // Run event loop — it should be terminated by the timeout
            // (no messages on cmd_rx, so it blocks until abort_rx fires)
            let completed = {
                let scope = &mut v8::HandleScope::new(&mut iso);
                let local = v8::Local::new(scope, &ctx);
                let scope = &mut v8::ContextScope::new(scope, local);
                crate::session::run_event_loop(scope, &cmd_rx, &pending, Some(&abort_rx))
            };

            assert!(!completed, "event loop should have been terminated");
            assert!(guard.timed_out(), "timeout should have fired");

            guard.cancel();
            drop(cmd_tx); // clean up
        }

        // --- Part 46: Timeout error message structure ---
        {
            // Verify that the timeout error produced by the session matches expectations.
            // This tests the ipc::ExecutionError structure, not V8 directly.
            let err = crate::ipc::ExecutionError {
                error_type: "Error".into(),
                message: "Script execution timed out".into(),
                stack: String::new(),
                code: Some("ERR_SCRIPT_EXECUTION_TIMEOUT".into()),
            };
            assert_eq!(err.error_type, "Error");
            assert_eq!(err.message, "Script execution timed out");
            assert_eq!(err.code, Some("ERR_SCRIPT_EXECUTION_TIMEOUT".into()));
        }

        // --- Part 47: ProcessExitError detected via _isProcessExit sentinel ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Simulate ProcessExitError: an Error object with _isProcessExit: true and code: 42
            let code = r#"
                var err = new Error("process.exit(42)");
                err._isProcessExit = true;
                err.code = 42;
                throw err;
            "#;

            let (exit_code, error) = execute_script(scope, "", code);
            assert_eq!(exit_code, 42, "ProcessExitError should return the error's exit code");
            let err = error.unwrap();
            assert_eq!(err.error_type, "Error");
            assert!(err.message.contains("process.exit(42)"));
            // Numeric .code should NOT appear in the string code field
            assert_eq!(err.code, None);
        }

        // --- Part 48: ProcessExitError with exit code 0 ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            let code = r#"
                var err = new Error("process.exit(0)");
                err._isProcessExit = true;
                err.code = 0;
                throw err;
            "#;

            let (exit_code, error) = execute_script(scope, "", code);
            assert_eq!(exit_code, 0, "ProcessExitError code 0 should return exit code 0");
            assert!(error.is_some());
        }

        // --- Part 49: Non-ProcessExitError returns exit code 1 ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Regular error without _isProcessExit sentinel
            let code = r#"throw new TypeError("not a process exit")"#;

            let (exit_code, error) = execute_script(scope, "", code);
            assert_eq!(exit_code, 1, "Regular errors should return exit code 1");
            let err = error.unwrap();
            assert_eq!(err.error_type, "TypeError");
            assert_eq!(err.message, "not a process exit");
        }

        // --- Part 50: ProcessExitError with custom constructor name ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Custom ProcessExitError class
            let code = r#"
                class ProcessExitError extends Error {
                    constructor(exitCode) {
                        super("process exited with code " + exitCode);
                        this._isProcessExit = true;
                        this.code = exitCode;
                    }
                }
                throw new ProcessExitError(7);
            "#;

            let (exit_code, error) = execute_script(scope, "", code);
            assert_eq!(exit_code, 7);
            let err = error.unwrap();
            assert_eq!(err.error_type, "ProcessExitError");
            assert!(err.message.contains("process exited with code 7"));
        }

        // --- Part 51: extract_process_exit_code returns None for non-objects ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Thrown string — not an object, should not be detected as ProcessExitError
            let code = r#"throw "just a string""#;
            let (exit_code, error) = execute_script(scope, "", code);
            assert_eq!(exit_code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "Error");
            assert_eq!(err.message, "just a string");

            // Object without _isProcessExit sentinel
            let code2 = r#"
                var obj = new Error("no sentinel");
                obj._isProcessExit = false;
                obj.code = 99;
                throw obj;
            "#;
            let (exit_code2, error2) = execute_script(scope, "", code2);
            assert_eq!(exit_code2, 1, "_isProcessExit:false should not be detected");
            assert!(error2.is_some());
        }

        // --- Part 52: Error with string code field (Node-style) preserved ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            let code = r#"
                var err = new Error("Cannot find module './missing'");
                err.code = "ERR_MODULE_NOT_FOUND";
                throw err;
            "#;

            let (exit_code, error) = execute_script(scope, "", code);
            assert_eq!(exit_code, 1);
            let err = error.unwrap();
            assert_eq!(err.error_type, "Error");
            assert_eq!(err.code, Some("ERR_MODULE_NOT_FOUND".into()));
        }

        // --- Part 53: Error type from constructor name for standard errors ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // SyntaxError
            let (_, err) = execute_script(scope, "", "eval('function(')");
            let err = err.unwrap();
            assert_eq!(err.error_type, "SyntaxError");

            // RangeError
            let (_, err2) = execute_script(scope, "", "new Array(-1)");
            let err2 = err2.unwrap();
            assert_eq!(err2.error_type, "RangeError");

            // ReferenceError
            let (_, err3) = execute_script(scope, "", "undefinedVariable");
            let err3 = err3.unwrap();
            assert_eq!(err3.error_type, "ReferenceError");
        }

        // --- Part 54: Stack trace extracted from error.stack property ---
        {
            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);

            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            let code = r#"
                function innerFn() { throw new Error("deep error"); }
                function outerFn() { innerFn(); }
                outerFn();
            "#;

            let (_, error) = execute_script(scope, "", code);
            let err = error.unwrap();
            assert_eq!(err.error_type, "Error");
            assert_eq!(err.message, "deep error");
            assert!(err.stack.contains("innerFn"), "stack should contain innerFn");
            assert!(err.stack.contains("outerFn"), "stack should contain outerFn");
        }

        // --- V8 ValueSerializer/ValueDeserializer round-trip tests ---

        // Part 55: Primitives round-trip (null, undefined, true, false, integers, floats)
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // null
            let null_val = v8::null(scope).into();
            let bytes = serialize_v8_value(scope, null_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_null());

            // undefined
            let undef_val = v8::undefined(scope).into();
            let bytes = serialize_v8_value(scope, undef_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_undefined());

            // true
            let bool_val = v8::Boolean::new(scope, true).into();
            let bytes = serialize_v8_value(scope, bool_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_true());

            // false
            let bool_val = v8::Boolean::new(scope, false).into();
            let bytes = serialize_v8_value(scope, bool_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_false());

            // integer
            let num_val: v8::Local<v8::Value> = v8::Integer::new(scope, 42).into();
            let bytes = serialize_v8_value(scope, num_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert_eq!(out.int32_value(scope).unwrap(), 42);

            // negative integer
            let num_val: v8::Local<v8::Value> = v8::Integer::new(scope, -7).into();
            let bytes = serialize_v8_value(scope, num_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert_eq!(out.int32_value(scope).unwrap(), -7);

            // float
            let num_val: v8::Local<v8::Value> = v8::Number::new(scope, 3.14).into();
            let bytes = serialize_v8_value(scope, num_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!((out.number_value(scope).unwrap() - 3.14).abs() < 1e-10);
        }

        // Part 56: Strings round-trip
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // ASCII string
            let s = v8::String::new(scope, "hello world").unwrap();
            let bytes = serialize_v8_value(scope, s.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_string());
            assert_eq!(out.to_rust_string_lossy(scope), "hello world");

            // Empty string
            let s = v8::String::new(scope, "").unwrap();
            let bytes = serialize_v8_value(scope, s.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_string());
            assert_eq!(out.to_rust_string_lossy(scope), "");

            // Unicode string
            let s = v8::String::new(scope, "hello 🌍 world").unwrap();
            let bytes = serialize_v8_value(scope, s.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert_eq!(out.to_rust_string_lossy(scope), "hello 🌍 world");
        }

        // Part 57: Arrays round-trip
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // [1, "two", true, null]
            let arr = v8::Array::new(scope, 4);
            let v1: v8::Local<v8::Value> = v8::Integer::new(scope, 1).into();
            let v2: v8::Local<v8::Value> = v8::String::new(scope, "two").unwrap().into();
            let v3: v8::Local<v8::Value> = v8::Boolean::new(scope, true).into();
            let v4: v8::Local<v8::Value> = v8::null(scope).into();
            arr.set_index(scope, 0, v1);
            arr.set_index(scope, 1, v2);
            arr.set_index(scope, 2, v3);
            arr.set_index(scope, 3, v4);

            let bytes = serialize_v8_value(scope, arr.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_array());
            let out_arr = v8::Local::<v8::Array>::try_from(out).unwrap();
            assert_eq!(out_arr.length(), 4);
            assert_eq!(out_arr.get_index(scope, 0).unwrap().int32_value(scope).unwrap(), 1);
            assert_eq!(out_arr.get_index(scope, 1).unwrap().to_rust_string_lossy(scope), "two");
            assert!(out_arr.get_index(scope, 2).unwrap().is_true());
            assert!(out_arr.get_index(scope, 3).unwrap().is_null());

            // Empty array
            let empty_arr = v8::Array::new(scope, 0);
            let bytes = serialize_v8_value(scope, empty_arr.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_array());
            assert_eq!(v8::Local::<v8::Array>::try_from(out).unwrap().length(), 0);
        }

        // Part 58: Objects round-trip
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // { name: "test", count: 42, active: true }
            let obj = v8::Object::new(scope);
            let k1 = v8::String::new(scope, "name").unwrap();
            let v1: v8::Local<v8::Value> = v8::String::new(scope, "test").unwrap().into();
            let k2 = v8::String::new(scope, "count").unwrap();
            let v2: v8::Local<v8::Value> = v8::Integer::new(scope, 42).into();
            let k3 = v8::String::new(scope, "active").unwrap();
            let v3: v8::Local<v8::Value> = v8::Boolean::new(scope, true).into();
            obj.set(scope, k1.into(), v1);
            obj.set(scope, k2.into(), v2);
            obj.set(scope, k3.into(), v3);

            let bytes = serialize_v8_value(scope, obj.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_object());
            let out_obj = v8::Local::<v8::Object>::try_from(out).unwrap();
            let k = v8::String::new(scope, "name").unwrap();
            assert_eq!(out_obj.get(scope, k.into()).unwrap().to_rust_string_lossy(scope), "test");
            let k = v8::String::new(scope, "count").unwrap();
            assert_eq!(out_obj.get(scope, k.into()).unwrap().int32_value(scope).unwrap(), 42);
            let k = v8::String::new(scope, "active").unwrap();
            assert!(out_obj.get(scope, k.into()).unwrap().is_true());
        }

        // Part 59: Uint8Array round-trip
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            let data = vec![0u8, 1, 2, 255, 128, 64];
            let ab = v8::ArrayBuffer::new(scope, data.len());
            {
                let bs = ab.get_backing_store();
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        data.as_ptr(),
                        bs.data().unwrap().as_ptr() as *mut u8,
                        data.len(),
                    );
                }
            }
            let u8arr = v8::Uint8Array::new(scope, ab, 0, data.len()).unwrap();

            let bytes = serialize_v8_value(scope, u8arr.into()).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_uint8_array());
            let out_arr = v8::Local::<v8::Uint8Array>::try_from(out).unwrap();
            assert_eq!(out_arr.byte_length(), 6);
            let mut buf = vec![0u8; 6];
            out_arr.copy_contents(&mut buf);
            assert_eq!(buf, vec![0, 1, 2, 255, 128, 64]);
        }

        // Part 60: Nested structures round-trip
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Build via JS: { items: [1, { nested: "value" }], flag: false }
            let code = r#"
                ({
                    items: [1, { nested: "value" }],
                    flag: false
                })
            "#;
            let source = v8::String::new(scope, code).unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let val = script.run(scope).unwrap();

            let bytes = serialize_v8_value(scope, val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_object());
            let out_obj = v8::Local::<v8::Object>::try_from(out).unwrap();

            // Check items array
            let k = v8::String::new(scope, "items").unwrap();
            let items = out_obj.get(scope, k.into()).unwrap();
            assert!(items.is_array());
            let items_arr = v8::Local::<v8::Array>::try_from(items).unwrap();
            assert_eq!(items_arr.length(), 2);
            assert_eq!(items_arr.get_index(scope, 0).unwrap().int32_value(scope).unwrap(), 1);
            let inner = items_arr.get_index(scope, 1).unwrap();
            assert!(inner.is_object());
            let inner_obj = v8::Local::<v8::Object>::try_from(inner).unwrap();
            let k = v8::String::new(scope, "nested").unwrap();
            assert_eq!(inner_obj.get(scope, k.into()).unwrap().to_rust_string_lossy(scope), "value");

            // Check flag
            let k = v8::String::new(scope, "flag").unwrap();
            assert!(out_obj.get(scope, k.into()).unwrap().is_false());
        }

        // Part 61: Date, RegExp, Map, Set, Error round-trip via JS eval
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Date
            let source = v8::String::new(scope, "new Date(1700000000000)").unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let date_val = script.run(scope).unwrap();
            let bytes = serialize_v8_value(scope, date_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_date());
            let date = v8::Local::<v8::Date>::try_from(out).unwrap();
            assert_eq!(date.value_of(), 1700000000000.0);

            // RegExp
            let source = v8::String::new(scope, "/abc/gi").unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let re_val = script.run(scope).unwrap();
            let bytes = serialize_v8_value(scope, re_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_reg_exp());

            // Map
            let source = v8::String::new(scope, "new Map([['a', 1], ['b', 2]])").unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let map_val = script.run(scope).unwrap();
            let bytes = serialize_v8_value(scope, map_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_map());
            let map = v8::Local::<v8::Map>::try_from(out).unwrap();
            assert_eq!(map.size(), 2);

            // Set
            let source = v8::String::new(scope, "new Set([10, 20, 30])").unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let set_val = script.run(scope).unwrap();
            let bytes = serialize_v8_value(scope, set_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_set());
            let set = v8::Local::<v8::Set>::try_from(out).unwrap();
            assert_eq!(set.size(), 3);

            // Error
            let source = v8::String::new(scope, "new TypeError('oops')").unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let err_val = script.run(scope).unwrap();
            let bytes = serialize_v8_value(scope, err_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            // Error is serialized as a plain object with message property
            assert!(out.is_object());
            let out_obj = v8::Local::<v8::Object>::try_from(out).unwrap();
            let k = v8::String::new(scope, "message").unwrap();
            let msg = out_obj.get(scope, k.into()).unwrap();
            assert_eq!(msg.to_rust_string_lossy(scope), "oops");
        }

        // Part 62: Circular references round-trip
        {
            use crate::bridge::{serialize_v8_value, deserialize_v8_value};

            let mut iso = isolate::create_isolate(None);
            let ctx = isolate::create_context(&mut iso);
            let scope = &mut v8::HandleScope::new(&mut iso);
            let local = v8::Local::new(scope, &ctx);
            let scope = &mut v8::ContextScope::new(scope, local);

            // Build circular reference via JS
            let source = v8::String::new(scope, "var o = { a: 1 }; o.self = o; o").unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let circ_val = script.run(scope).unwrap();

            let bytes = serialize_v8_value(scope, circ_val).unwrap();
            let out = deserialize_v8_value(scope, &bytes).unwrap();
            assert!(out.is_object());
            let out_obj = v8::Local::<v8::Object>::try_from(out).unwrap();

            // Verify the self-reference resolves
            let k = v8::String::new(scope, "a").unwrap();
            assert_eq!(out_obj.get(scope, k.into()).unwrap().int32_value(scope).unwrap(), 1);
            let k = v8::String::new(scope, "self").unwrap();
            let self_ref = out_obj.get(scope, k.into()).unwrap();
            assert!(self_ref.is_object());
            // The self reference should point back to the same structure
            let self_obj = v8::Local::<v8::Object>::try_from(self_ref).unwrap();
            let k = v8::String::new(scope, "a").unwrap();
            assert_eq!(self_obj.get(scope, k.into()).unwrap().int32_value(scope).unwrap(), 1);
        }
    }
}
