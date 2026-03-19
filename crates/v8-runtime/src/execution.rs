// Script compilation, CJS/ESM execution, module loading

use crate::ipc::{OsConfig, ProcessConfig};

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
    use crate::isolate;
    use std::collections::HashMap;

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
    fn v8_inject_globals_and_hardening() {
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
    }
}
