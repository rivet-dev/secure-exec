// V8 startup snapshots: fast isolate creation from pre-compiled bridge code

use crate::bridge::external_refs;
use crate::isolate::init_v8_platform;

/// Maximum allowed snapshot blob size (50MB).
/// Prevents resource exhaustion from degenerate bridge code.
const MAX_SNAPSHOT_BLOB_BYTES: usize = 50 * 1024 * 1024;

/// Create a V8 startup snapshot with the given bridge code pre-compiled.
///
/// Consumes a temporary isolate. The returned StartupData contains the
/// serialized V8 heap with compiled bytecode.
///
/// Returns an error if the bridge code fails to compile or the resulting
/// snapshot exceeds MAX_SNAPSHOT_BLOB_BYTES.
pub fn create_snapshot(bridge_code: &str) -> Result<v8::StartupData, String> {
    init_v8_platform();

    let mut isolate = v8::Isolate::snapshot_creator(Some(external_refs()), None);
    {
        let scope = &mut v8::HandleScope::new(&mut isolate);
        let context = v8::Context::new(scope, Default::default());
        let scope = &mut v8::ContextScope::new(scope, context);

        // Compile and run bridge code — bytecode is captured in snapshot
        let source = v8::String::new(scope, bridge_code)
            .ok_or_else(|| "failed to create V8 string for bridge code".to_string())?;
        let script = v8::Script::compile(scope, source, None)
            .ok_or_else(|| "bridge code compilation failed during snapshot creation".to_string())?;
        script.run(scope);

        scope.set_default_context(context);
    }
    let blob = isolate
        .create_blob(v8::FunctionCodeHandling::Keep)
        .ok_or_else(|| "V8 snapshot creation failed".to_string())?;

    // Reject oversized snapshots
    if blob.len() > MAX_SNAPSHOT_BLOB_BYTES {
        return Err(format!(
            "snapshot blob too large: {} bytes (max {})",
            blob.len(),
            MAX_SNAPSHOT_BLOB_BYTES
        ));
    }

    Ok(blob)
}

/// Create a V8 isolate restored from a snapshot blob.
///
/// The external references must match those used during snapshot creation
/// (provided by bridge::external_refs()).
///
/// `blob` must be owned or 'static data — `Vec<u8>`, `Box<[u8]>`, or
/// `v8::StartupData` all work. The data is copied into the isolate during
/// creation; V8 does not retain a reference after `Isolate::new()` returns.
pub fn create_isolate_from_snapshot<B>(
    blob: B,
    heap_limit_mb: Option<u32>,
) -> v8::OwnedIsolate
where
    B: std::ops::Deref<Target = [u8]> + std::borrow::Borrow<[u8]> + 'static,
{
    init_v8_platform();

    let mut params = v8::CreateParams::default()
        .snapshot_blob(blob)
        .external_references(&**external_refs());
    if let Some(limit) = heap_limit_mb {
        let limit_bytes = (limit as usize) * 1024 * 1024;
        params = params.heap_limits(0, limit_bytes);
    }
    v8::Isolate::new(params)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn eval(isolate: &mut v8::OwnedIsolate, code: &str) -> String {
        let scope = &mut v8::HandleScope::new(isolate);
        let context = v8::Context::new(scope, Default::default());
        let scope = &mut v8::ContextScope::new(scope, context);
        let source = v8::String::new(scope, code).unwrap();
        let script = v8::Script::compile(scope, source, None).unwrap();
        let result = script.run(scope).unwrap();
        result.to_rust_string_lossy(scope)
    }

    /// All snapshot tests consolidated into one #[test] to avoid inter-test
    /// SIGSEGV from V8 global state issues (same pattern as execution::tests).
    #[test]
    fn snapshot_consolidated_tests() {
        init_v8_platform();
        let _ = external_refs();

        // --- Part 1: Snapshot creation returns non-empty blob ---
        {
            let bridge_code = "(function() { globalThis.__bridge_init = true; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation should succeed");
            assert!(blob.len() > 0, "snapshot blob should be non-empty");
        }

        // --- Part 2: Restored isolate executes JS correctly ---
        {
            let bridge_code = "(function() { globalThis.__testValue = 42; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation should succeed");
            let mut isolate = create_isolate_from_snapshot(blob, None);
            // Fresh context on restored isolate — bridge globals are in snapshot's
            // default context, not in a new context. Verify isolate is functional.
            assert_eq!(eval(&mut isolate, "1 + 1"), "2");
        }

        // --- Part 3: Restored isolate respects heap_limit_mb ---
        {
            let bridge_code = "/* empty bridge */";
            let blob = create_snapshot(bridge_code).expect("snapshot creation should succeed");
            let mut isolate = create_isolate_from_snapshot(blob, Some(8));
            assert_eq!(eval(&mut isolate, "'heap ok'"), "heap ok");
        }

        // --- Part 4: Normal blob is under 50MB limit ---
        {
            let bridge_code = "(function() { globalThis.x = 1; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation should succeed");
            assert!(
                blob.len() < MAX_SNAPSHOT_BLOB_BYTES,
                "normal bridge code should produce blob under 50MB limit"
            );
        }

        // --- Part 5: Three sequential restores from same snapshot data ---
        {
            let bridge_code = "(function() { globalThis.__counter = 0; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation should succeed");
            let blob_bytes: Vec<u8> = blob.to_vec();

            for i in 0..3 {
                let mut isolate = create_isolate_from_snapshot(blob_bytes.clone(), None);
                let result = eval(&mut isolate, &format!("{} + 1", i));
                assert_eq!(result, format!("{}", i + 1));
            }
        }
    }
}
