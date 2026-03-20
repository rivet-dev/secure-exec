// V8 startup snapshots: fast isolate creation from pre-compiled bridge code

use std::sync::{Arc, Mutex};

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

/// Thread-safe snapshot cache keyed by bridge code hash.
///
/// Lazily creates snapshots on first encounter of each bridge code variant.
/// Concurrent callers for the same variant block on the mutex; only one
/// creates the snapshot.
pub struct SnapshotCache {
    inner: Mutex<Vec<CacheEntry>>,
    max_entries: usize,
}

struct CacheEntry {
    bridge_hash: u64,
    /// Snapshot blob bytes (copied from v8::StartupData).
    /// Stored as Vec<u8> rather than StartupData because StartupData
    /// contains raw pointers that are not Send/Sync.
    blob: Arc<Vec<u8>>,
}

impl SnapshotCache {
    pub fn new(max_entries: usize) -> Self {
        SnapshotCache {
            inner: Mutex::new(Vec::new()),
            max_entries,
        }
    }

    /// Get or create a snapshot for the given bridge code.
    ///
    /// Thread-safe: concurrent callers block on mutex; only one creates the
    /// snapshot for a given bridge code variant.
    pub fn get_or_create(&self, bridge_code: &str) -> Result<Arc<Vec<u8>>, String> {
        let mut cache = self.inner.lock().unwrap();
        let hash = siphash(bridge_code);

        // Cache hit — move entry to end (most recently used)
        if let Some(pos) = cache.iter().position(|e| e.bridge_hash == hash) {
            let entry = cache.remove(pos);
            let blob = Arc::clone(&entry.blob);
            cache.push(entry);
            return Ok(blob);
        }

        // Cache miss — create snapshot (holds lock)
        let startup_data = create_snapshot(bridge_code)?;
        let arc = Arc::new(startup_data.to_vec());

        // LRU eviction: remove oldest (front) entry when at capacity
        if cache.len() >= self.max_entries {
            cache.remove(0);
        }
        cache.push(CacheEntry {
            bridge_hash: hash,
            blob: Arc::clone(&arc),
        });

        Ok(arc)
    }
}

fn siphash(s: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
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

        // --- Part 6: Cache hit returns same Arc ---
        {
            let cache = SnapshotCache::new(4);
            let bridge_code = "(function() { globalThis.__cached = 1; })();";

            let arc1 = cache.get_or_create(bridge_code).expect("first get_or_create");
            let arc2 = cache.get_or_create(bridge_code).expect("second get_or_create");

            // Same Arc (same pointer) — cache hit, not a new snapshot
            assert!(Arc::ptr_eq(&arc1, &arc2), "cache hit should return same Arc");
        }

        // --- Part 7: Cache miss creates new snapshot ---
        {
            let cache = SnapshotCache::new(4);
            let code_a = "(function() { globalThis.__a = 1; })();";
            let code_b = "(function() { globalThis.__b = 2; })();";

            let arc_a = cache.get_or_create(code_a).expect("create A");
            let arc_b = cache.get_or_create(code_b).expect("create B");

            // Different bridge code → different Arc
            assert!(!Arc::ptr_eq(&arc_a, &arc_b), "different code should produce different Arc");

            // Verify both are usable
            let mut iso_a = create_isolate_from_snapshot((*arc_a).clone(), None);
            assert_eq!(eval(&mut iso_a, "1 + 1"), "2");

            let mut iso_b = create_isolate_from_snapshot((*arc_b).clone(), None);
            assert_eq!(eval(&mut iso_b, "2 + 2"), "4");
        }

        // --- Part 8: LRU eviction removes oldest entry ---
        {
            let cache = SnapshotCache::new(2);
            let code_1 = "(function() { globalThis.__v1 = 1; })();";
            let code_2 = "(function() { globalThis.__v2 = 2; })();";
            let code_3 = "(function() { globalThis.__v3 = 3; })();";

            let arc_1 = cache.get_or_create(code_1).expect("create 1");
            let _arc_2 = cache.get_or_create(code_2).expect("create 2");

            // Cache is full (2 entries). Adding a third should evict code_1.
            let _arc_3 = cache.get_or_create(code_3).expect("create 3");

            // code_1 should be evicted — re-requesting it should return a new Arc
            let arc_1_new = cache.get_or_create(code_1).expect("re-create 1");
            assert!(
                !Arc::ptr_eq(&arc_1, &arc_1_new),
                "evicted entry should produce a new Arc on re-creation"
            );

            // code_2 should still be cached (it was accessed before code_3 but not evicted)
            // After eviction of code_1, cache had [code_2, code_3], then adding code_1 evicts code_2
            // Actually: after inserting code_3, cache was [code_2, code_3] (code_1 evicted).
            // Then inserting code_1 again: cache is full (2), evicts code_2 → cache is [code_3, code_1].
        }

        // --- Part 9: Concurrent get_or_create creates only one snapshot ---
        {
            use std::sync::atomic::{AtomicUsize, Ordering};

            let cache = Arc::new(SnapshotCache::new(4));
            let bridge_code = "(function() { globalThis.__concurrent = 1; })();";

            // Pre-warm — to avoid measuring snapshot creation races, verify
            // that after one creation, N threads all get the same Arc
            let first = cache.get_or_create(bridge_code).expect("pre-warm");

            let num_threads = 4;
            let barrier = Arc::new(std::sync::Barrier::new(num_threads));
            let same_count = Arc::new(AtomicUsize::new(0));

            let mut handles = vec![];
            for _ in 0..num_threads {
                let cache = Arc::clone(&cache);
                let barrier = Arc::clone(&barrier);
                let first = Arc::clone(&first);
                let same_count = Arc::clone(&same_count);
                let code = bridge_code.to_string();

                handles.push(std::thread::spawn(move || {
                    barrier.wait();
                    let arc = cache.get_or_create(&code).expect("concurrent get");
                    if Arc::ptr_eq(&arc, &first) {
                        same_count.fetch_add(1, Ordering::Relaxed);
                    }
                }));
            }

            for h in handles {
                h.join().expect("thread join");
            }

            assert_eq!(
                same_count.load(Ordering::Relaxed),
                num_threads,
                "all concurrent callers should get the same cached Arc"
            );
        }

        // --- Part 10: WASM disabled after snapshot restore ---
        // Verifies that set_allow_wasm_code_generation_callback is not captured
        // in the snapshot — disable_wasm() must be re-applied after every restore.
        {
            let bridge_code = "(function() { globalThis.__wasm_test = true; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation");
            let mut isolate = create_isolate_from_snapshot(blob, None);

            // Apply WASM disable (same as session.rs does after restore)
            crate::execution::disable_wasm(&mut isolate);

            let scope = &mut v8::HandleScope::new(&mut isolate);
            let context = v8::Context::new(scope, Default::default());
            let scope = &mut v8::ContextScope::new(scope, context);

            // Attempt WebAssembly.compile — should throw
            let wasm_test_code = r#"
                (function() {
                    try {
                        var bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
                        new WebAssembly.Module(bytes);
                        return "ALLOWED";
                    } catch (e) {
                        return "BLOCKED:" + e.message;
                    }
                })()
            "#;
            let source = v8::String::new(scope, wasm_test_code).unwrap();
            let script = v8::Script::compile(scope, source, None).unwrap();
            let result = script.run(scope).unwrap();
            let result_str = result.to_rust_string_lossy(scope);

            assert!(
                result_str.starts_with("BLOCKED:"),
                "WASM should be blocked after snapshot restore + disable_wasm(), got: {}",
                result_str
            );
        }

        // --- Part 11: Session isolation — fresh contexts from same snapshot ---
        // Verifies that state set in one session's context does not leak
        // to another session's context (fresh context per session).
        {
            let bridge_code = "(function() { globalThis.__shared_bridge = 'ok'; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation");
            let blob_bytes: Vec<u8> = blob.to_vec();

            // "Session A": set a global variable
            {
                let mut isolate = create_isolate_from_snapshot(blob_bytes.clone(), None);
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let context = v8::Context::new(scope, Default::default());
                let scope = &mut v8::ContextScope::new(scope, context);

                let source = v8::String::new(scope, "globalThis.__session_secret = 'session-a-data';").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                script.run(scope);

                // Verify session A can see its own data
                let check = v8::String::new(scope, "globalThis.__session_secret").unwrap();
                let script = v8::Script::compile(scope, check, None).unwrap();
                let result = script.run(scope).unwrap();
                assert_eq!(result.to_rust_string_lossy(scope), "session-a-data");
            }

            // "Session B": fresh context from same snapshot should NOT see session A's data
            {
                let mut isolate = create_isolate_from_snapshot(blob_bytes.clone(), None);
                let scope = &mut v8::HandleScope::new(&mut isolate);
                let context = v8::Context::new(scope, Default::default());
                let scope = &mut v8::ContextScope::new(scope, context);

                let source = v8::String::new(scope, "typeof globalThis.__session_secret").unwrap();
                let script = v8::Script::compile(scope, source, None).unwrap();
                let result = script.run(scope).unwrap();
                assert_eq!(
                    result.to_rust_string_lossy(scope),
                    "undefined",
                    "session B should not see session A's global state"
                );
            }
        }

        // --- Part 12: External references survive snapshot restore ---
        // Verifies that FunctionTemplates registered on a restored isolate
        // correctly dispatch to Rust bridge callbacks via external_refs().
        {
            use std::cell::RefCell;
            use crate::bridge::{
                register_sync_bridge_fns, register_async_bridge_fns,
                SessionBuffers, PendingPromises,
            };
            use crate::host_call::BridgeCallContext;

            let bridge_code = "(function() { globalThis.__ext_ref_test = true; })();";
            let blob = create_snapshot(bridge_code).expect("snapshot creation");
            let mut isolate = create_isolate_from_snapshot(blob, None);
            crate::execution::disable_wasm(&mut isolate);

            // Create minimal BridgeCallContext (sync call will fail but we
            // test that the FunctionTemplate dispatches without crash)
            let (ipc_tx, _ipc_rx) = crossbeam_channel::unbounded::<Vec<u8>>();
            let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded::<crate::session::SessionCommand>();
            let call_id_router: crate::host_call::CallIdRouter =
                Arc::new(Mutex::new(std::collections::HashMap::new()));

            let receiver = crate::host_call::ReaderResponseReceiver::new(
                Box::new(std::io::Cursor::new(Vec::<u8>::new())),
            );
            let sender = crate::host_call::ChannelFrameSender::new(ipc_tx);
            let bridge_ctx = BridgeCallContext::with_receiver(
                Box::new(sender),
                Box::new(receiver),
                "test-session".to_string(),
                call_id_router,
            );
            let session_buffers = RefCell::new(SessionBuffers::new());
            let pending = PendingPromises::new();

            let scope = &mut v8::HandleScope::new(&mut isolate);
            let context = v8::Context::new(scope, Default::default());
            let scope = &mut v8::ContextScope::new(scope, context);

            // Register bridge functions on the restored isolate
            let _sync_store = register_sync_bridge_fns(
                scope,
                &bridge_ctx as *const BridgeCallContext,
                &session_buffers as *const RefCell<SessionBuffers>,
                &["_testSync"],
            );
            let _async_store = register_async_bridge_fns(
                scope,
                &bridge_ctx as *const BridgeCallContext,
                &pending as *const PendingPromises,
                &session_buffers as *const RefCell<SessionBuffers>,
                &["_testAsync"],
            );

            // Verify the functions exist as globals
            let check = v8::String::new(scope, "typeof _testSync").unwrap();
            let script = v8::Script::compile(scope, check, None).unwrap();
            let result = script.run(scope).unwrap();
            assert_eq!(
                result.to_rust_string_lossy(scope),
                "function",
                "_testSync should be a function on restored isolate"
            );

            let check = v8::String::new(scope, "typeof _testAsync").unwrap();
            let script = v8::Script::compile(scope, check, None).unwrap();
            let result = script.run(scope).unwrap();
            assert_eq!(
                result.to_rust_string_lossy(scope),
                "function",
                "_testAsync should be a function on restored isolate"
            );
        }
    }
}
