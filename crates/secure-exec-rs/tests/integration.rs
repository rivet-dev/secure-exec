use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use secure_exec_rs::{
    create_node_driver, create_node_runtime_driver_factory, BoxFuture, DirEntry, FileStat,
    FileSystem, InMemoryFs, NodeDriverOptions, NodeRuntime, NodeRuntimeOptions, Result, V8Runtime,
    V8RuntimeOptions,
};

/// Resolve the secure-exec-v8 binary path, or return None if not built.
fn find_v8_binary() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("SECURE_EXEC_V8_BINARY") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    let candidates = [
        "crates/v8-runtime/target/release/secure-exec-v8",
        "crates/v8-runtime/target/debug/secure-exec-v8",
        "../v8-runtime/target/release/secure-exec-v8",
        "../v8-runtime/target/debug/secure-exec-v8",
    ];
    for rel in &candidates {
        let p = PathBuf::from(rel);
        if p.exists() {
            return Some(p);
        }
    }

    None
}

macro_rules! skip_unless_v8 {
    ($binary:ident) => {
        let $binary = match find_v8_binary() {
            Some(p) => p,
            None => {
                eprintln!(
                    "SKIPPED: secure-exec-v8 binary not built. \
                     Build with: cd crates/v8-runtime && cargo build --release"
                );
                return;
            }
        };
    };
}

async fn make_v8(binary: PathBuf) -> Arc<V8Runtime> {
    Arc::new(
        V8Runtime::new(V8RuntimeOptions {
            binary_path: Some(binary),
            ..Default::default()
        })
        .await
        .expect("failed to start V8Runtime"),
    )
}

fn make_runtime(v8: &Arc<V8Runtime>, fs: InMemoryFs) -> NodeRuntime {
    let system = create_node_driver(NodeDriverOptions {
        filesystem: Some(Box::new(fs)),
        ..Default::default()
    });
    let factory = create_node_runtime_driver_factory(Arc::clone(v8));

    NodeRuntime::new(NodeRuntimeOptions {
        system_driver: system,
        runtime_driver_factory: Box::new(factory),
        memory_limit: None,
        cpu_time_limit_ms: None,
        timing_mitigation: None,
        on_stdio: None,
        payload_limits: None,
        resource_budgets: None,
    })
}

/// Dispose NodeRuntime and V8Runtime, dropping all Arc references.
async fn cleanup(rt: NodeRuntime, v8: Arc<V8Runtime>) {
    rt.dispose();
    drop(rt);
    // Give the spawned dispose task a moment to complete
    tokio::task::yield_now().await;
    if let Ok(v8_owned) = Arc::try_unwrap(v8) {
        let _ = v8_owned.dispose().await;
    }
}

// ============================================================
// Tests
// ============================================================

#[tokio::test]
async fn exec_hello_world() {
    skip_unless_v8!(binary);
    let v8 = make_v8(binary).await;
    let rt = make_runtime(&v8, InMemoryFs::new());

    let result = rt.exec("console.log('hello')").await.unwrap();
    assert_eq!(result.code, 0, "exit code should be 0");
    assert!(
        result.stdout.contains("hello"),
        "stdout should contain 'hello', got: {:?}",
        result.stdout
    );

    cleanup(rt, v8).await;
}

#[tokio::test]
async fn exec_error_returns_nonzero() {
    skip_unless_v8!(binary);
    let v8 = make_v8(binary).await;
    let rt = make_runtime(&v8, InMemoryFs::new());

    let result = rt.exec("throw new Error('boom')").await.unwrap();
    assert_ne!(result.code, 0, "exit code should be non-zero for thrown error");
    assert!(
        result.error.is_some(),
        "error should be Some for thrown error"
    );
    let err = result.error.unwrap();
    assert!(
        err.message.contains("boom"),
        "error message should contain 'boom', got: {:?}",
        err.message
    );

    cleanup(rt, v8).await;
}

#[tokio::test]
async fn run_returns_exports() {
    skip_unless_v8!(binary);
    let v8 = make_v8(binary).await;
    let rt = make_runtime(&v8, InMemoryFs::new());

    let result = rt.run("export const x = 42;").await.unwrap();
    assert_eq!(result.code, 0, "exit code should be 0");
    assert!(
        result.exports.is_some(),
        "exports should be Some for ESM with exports"
    );

    cleanup(rt, v8).await;
}

#[tokio::test]
async fn multiple_runtimes_share_v8_process() {
    skip_unless_v8!(binary);
    let v8 = make_v8(binary).await;

    // Execute on two separate NodeRuntimes that share the same V8 process.
    // Sessions run sequentially (the single UDS connection can't multiplex
    // concurrent sessions yet), but both use the same child process.
    let rt1 = make_runtime(&v8, InMemoryFs::new());
    let res1 = rt1.exec("console.log('from-rt1')").await.unwrap();
    assert_eq!(res1.code, 0);
    assert!(
        res1.stdout.contains("from-rt1"),
        "rt1 stdout: {:?}",
        res1.stdout
    );
    cleanup(rt1, Arc::clone(&v8)).await;

    let rt2 = make_runtime(&v8, InMemoryFs::new());
    let res2 = rt2.exec("console.log('from-rt2')").await.unwrap();
    assert_eq!(res2.code, 0);
    assert!(
        res2.stdout.contains("from-rt2"),
        "rt2 stdout: {:?}",
        res2.stdout
    );
    cleanup(rt2, v8).await;
}

// ============================================================
// US-018 — Filesystem bridge round-trip tests
// ============================================================

#[tokio::test]
async fn fs_read_write_roundtrip() {
    skip_unless_v8!(binary);
    let v8 = make_v8(binary).await;

    // Pre-populate the in-memory filesystem with a file
    let fs = InMemoryFs::new();
    fs.add_file("/root/input.txt", b"hello from rust").await;
    let rt = make_runtime(&v8, fs);

    // Call global bridge functions directly via .applySync().
    // Note: the _fs facade holds stale snapshot stubs — use globals instead.
    let result = rt
        .exec(
            r#"
            const data = _fsReadFile.applySync(null, ['/root/input.txt']);
            console.log('READ:' + data);
            _fsWriteFile.applySync(null, ['/root/output.txt', 'written-by-js']);
            const out = _fsReadFile.applySync(null, ['/root/output.txt']);
            console.log('WROTE:' + out);
            "#,
        )
        .await
        .unwrap();

    assert_eq!(
        result.code, 0,
        "exit code should be 0, error: {:?}",
        result.error
    );
    assert!(
        result.stdout.contains("READ:hello from rust"),
        "stdout should contain file contents, got: {:?}",
        result.stdout
    );
    assert!(
        result.stdout.contains("WROTE:written-by-js"),
        "stdout should confirm write round-trip, got: {:?}",
        result.stdout
    );

    cleanup(rt, v8).await;
}

// --- SpyFs: records all calls, delegates to InMemoryFs ---

#[derive(Clone, Debug)]
struct SpyCall {
    method: String,
    path: String,
}

struct SpyFs {
    calls: Arc<Mutex<Vec<SpyCall>>>,
    inner: InMemoryFs,
}

impl SpyFs {
    fn new() -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
            inner: InMemoryFs::new(),
        }
    }

    fn record(&self, method: &str, path: &str) {
        self.calls.lock().unwrap().push(SpyCall {
            method: method.to_string(),
            path: path.to_string(),
        });
    }

}

impl FileSystem for SpyFs {
    fn read_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<u8>>> {
        self.record("read_file", path);
        self.inner.read_file(path)
    }
    fn read_text_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>> {
        self.record("read_text_file", path);
        self.inner.read_text_file(path)
    }
    fn read_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<String>>> {
        self.record("read_dir", path);
        self.inner.read_dir(path)
    }
    fn read_dir_with_types<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<DirEntry>>> {
        self.record("read_dir_with_types", path);
        self.inner.read_dir_with_types(path)
    }
    fn write_file<'a>(&'a self, path: &'a str, content: &'a [u8]) -> BoxFuture<'a, Result<()>> {
        self.record("write_file", path);
        self.inner.write_file(path, content)
    }
    fn create_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("create_dir", path);
        self.inner.create_dir(path)
    }
    fn mkdir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("mkdir", path);
        self.inner.mkdir(path)
    }
    fn exists<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<bool>> {
        self.record("exists", path);
        self.inner.exists(path)
    }
    fn stat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>> {
        self.record("stat", path);
        self.inner.stat(path)
    }
    fn remove_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("remove_file", path);
        self.inner.remove_file(path)
    }
    fn remove_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("remove_dir", path);
        self.inner.remove_dir(path)
    }
    fn rename<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("rename", old_path);
        self.inner.rename(old_path, new_path)
    }
    fn symlink<'a>(&'a self, target: &'a str, link_path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("symlink", target);
        self.inner.symlink(target, link_path)
    }
    fn readlink<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>> {
        self.record("readlink", path);
        self.inner.readlink(path)
    }
    fn lstat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>> {
        self.record("lstat", path);
        self.inner.lstat(path)
    }
    fn link<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>> {
        self.record("link", old_path);
        self.inner.link(old_path, new_path)
    }
    fn chmod<'a>(&'a self, path: &'a str, mode: u32) -> BoxFuture<'a, Result<()>> {
        self.record("chmod", path);
        self.inner.chmod(path, mode)
    }
    fn chown<'a>(&'a self, path: &'a str, uid: u32, gid: u32) -> BoxFuture<'a, Result<()>> {
        self.record("chown", path);
        self.inner.chown(path, uid, gid)
    }
    fn utimes<'a>(&'a self, path: &'a str, atime_ms: f64, mtime_ms: f64) -> BoxFuture<'a, Result<()>> {
        self.record("utimes", path);
        self.inner.utimes(path, atime_ms, mtime_ms)
    }
    fn truncate<'a>(&'a self, path: &'a str, length: u64) -> BoxFuture<'a, Result<()>> {
        self.record("truncate", path);
        self.inner.truncate(path, length)
    }
}

fn make_runtime_with_spy_fs(v8: &Arc<V8Runtime>, spy_fs: SpyFs) -> NodeRuntime {
    let system = create_node_driver(NodeDriverOptions {
        filesystem: Some(Box::new(spy_fs)),
        ..Default::default()
    });
    let factory = create_node_runtime_driver_factory(Arc::clone(v8));

    NodeRuntime::new(NodeRuntimeOptions {
        system_driver: system,
        runtime_driver_factory: Box::new(factory),
        memory_limit: None,
        cpu_time_limit_ms: None,
        timing_mitigation: None,
        on_stdio: None,
        payload_limits: None,
        resource_budgets: None,
    })
}

#[tokio::test]
async fn custom_filesystem_receives_calls() {
    skip_unless_v8!(binary);
    let v8 = make_v8(binary).await;

    let spy = SpyFs::new();
    spy.inner.add_file("/root/spy-test.txt", b"spy-content").await;
    let calls_handle = Arc::clone(&spy.calls);
    let rt = make_runtime_with_spy_fs(&v8, spy);

    let result = rt
        .exec(
            r#"
            const data = _fsReadFile.applySync(null, ['/root/spy-test.txt']);
            console.log(data);
            "#,
        )
        .await
        .unwrap();

    assert_eq!(result.code, 0, "exit code should be 0, error: {:?}", result.error);
    assert!(
        result.stdout.contains("spy-content"),
        "stdout should contain file contents, got: {:?}",
        result.stdout
    );

    // Verify SpyFs recorded the read call
    let calls = calls_handle.lock().unwrap();
    let read_calls: Vec<_> = calls
        .iter()
        .filter(|c| c.method == "read_text_file" && c.path == "/root/spy-test.txt")
        .collect();
    assert!(
        !read_calls.is_empty(),
        "SpyFs should have recorded a read_text_file call for /root/spy-test.txt, got calls: {:?}",
        *calls
    );

    drop(calls);
    cleanup(rt, v8).await;
}
