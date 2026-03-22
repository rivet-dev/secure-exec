// V8 isolate lifecycle: platform init, create, configure, destroy

use std::sync::Once;

static V8_INIT: Once = Once::new();

/// Initialize the V8 platform (once per process).
/// Safe to call multiple times; only the first call takes effect.
pub fn init_v8_platform() {
    V8_INIT.call_once(|| {
        let platform = v8::new_default_platform(0, false).make_shared();
        v8::V8::initialize_platform(platform);
        // Set V8 flags before initialization.
        // Increase V8's internal stack limit to match the 32 MiB thread stack.
        // Default V8 stack limit is ~1 MB which is insufficient for deep
        // microtask chains from TUI frameworks (Ink/React).
        v8::V8::set_flags_from_string("--stack-size=16384");
        if std::env::var("SECURE_EXEC_V8_JITLESS").is_ok() {
            v8::V8::set_flags_from_string("--jitless");
        }
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

// V8 lifecycle tests are consolidated in execution::tests to avoid
// inter-test SIGSEGV from V8 global state issues.
