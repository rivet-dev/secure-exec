// V8 isolate lifecycle: platform init, create, configure, destroy

use std::sync::Once;

static V8_INIT: Once = Once::new();

/// Initialize the V8 platform (once per process).
/// Safe to call multiple times; only the first call takes effect.
pub fn init_v8_platform() {
    V8_INIT.call_once(|| {
        let platform = v8::new_default_platform(0, false).make_shared();
        v8::V8::initialize_platform(platform);
        v8::V8::initialize();
    });
}

/// Create a new V8 isolate with an optional heap limit in MB.
pub fn create_isolate(heap_limit_mb: Option<u32>) -> v8::OwnedIsolate {
    let mut params = v8::CreateParams::default();
    if let Some(limit) = heap_limit_mb {
        let limit_bytes = (limit as usize) * 1024 * 1024;
        params = params.heap_limits(0, limit_bytes);
    }
    v8::Isolate::new(params)
}

/// Create a new V8 context on the given isolate.
/// Returns a Global handle so the context can be reused across scopes.
pub fn create_context(isolate: &mut v8::OwnedIsolate) -> v8::Global<v8::Context> {
    let scope = &mut v8::HandleScope::new(isolate);
    let context = v8::Context::new(scope, Default::default());
    v8::Global::new(scope, context)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: enter a context, run a script, return the string result.
    fn eval(isolate: &mut v8::OwnedIsolate, context: &v8::Global<v8::Context>, code: &str) -> String {
        let scope = &mut v8::HandleScope::new(isolate);
        let local = v8::Local::new(scope, context);
        let scope = &mut v8::ContextScope::new(scope, local);
        let source = v8::String::new(scope, code).unwrap();
        let script = v8::Script::compile(scope, source, None).unwrap();
        let result = script.run(scope).unwrap();
        result.to_rust_string_lossy(scope)
    }

    #[test]
    fn isolate_lifecycle() {
        init_v8_platform();

        // 1. Create and destroy 3 isolates sequentially without crash
        for i in 0..3 {
            let mut isolate = create_isolate(None);
            let context = create_context(&mut isolate);

            // Verify each context is usable
            let result = eval(&mut isolate, &context, &format!("{} + 1", i));
            assert_eq!(result, format!("{}", i + 1));
        }

        // 2. Isolate with heap limit works
        {
            let mut isolate = create_isolate(Some(16));
            let context = create_context(&mut isolate);

            let result = eval(&mut isolate, &context, "1 + 2");
            assert_eq!(result, "3");
        }

        // 3. Isolate without heap limit works
        {
            let mut isolate = create_isolate(None);
            let context = create_context(&mut isolate);

            let result = eval(&mut isolate, &context, "'hello' + ' world'");
            assert_eq!(result, "hello world");
        }

        // 4. Global context handle persists state across scopes
        {
            let mut isolate = create_isolate(None);
            let context = create_context(&mut isolate);

            eval(&mut isolate, &context, "var x = 42;");
            let result = eval(&mut isolate, &context, "x");
            assert_eq!(result, "42");
        }
    }
}
