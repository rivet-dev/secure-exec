// Script compilation, CJS/ESM execution, module loading

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
    }
}
