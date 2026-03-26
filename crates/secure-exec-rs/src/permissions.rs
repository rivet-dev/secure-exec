// Permissions trait, AllowAll, and permission-wrapping adapters

use std::sync::Arc;

use crate::command::{CommandExecutor, OnOutput, SpawnOptions, SpawnedProcess};
use crate::fs::{DirEntry, FileStat, FileSystem};
use crate::network::{
    DnsResult, FetchOptions, FetchResponse, HttpRequestOptions, HttpResponse, NetworkAdapter,
};
use crate::{BoxFuture, Error, Result};

/// Result of a permission check.
#[derive(Clone, Debug)]
pub struct PermissionDecision {
    pub allow: bool,
    pub reason: Option<String>,
}

/// Filesystem operations that can be permission-checked.
#[derive(Clone, Debug)]
pub enum FsOp {
    Read,
    Write,
    Mkdir,
    CreateDir,
    Readdir,
    Stat,
    Rm,
    Rename,
    Exists,
    Chmod,
    Chown,
    Link,
    Symlink,
    Readlink,
    Truncate,
    Utimes,
}

/// A request to access the filesystem.
#[derive(Clone, Debug)]
pub struct FsAccessRequest {
    pub op: FsOp,
    pub path: String,
}

/// Network operations that can be permission-checked.
#[derive(Clone, Debug)]
pub enum NetworkOp {
    Fetch,
    Http,
    Dns,
    Listen,
    Connect,
}

/// A request to access the network.
#[derive(Clone, Debug)]
pub struct NetworkAccessRequest {
    pub op: NetworkOp,
    pub url: Option<String>,
    pub hostname: Option<String>,
    pub port: Option<u16>,
}

/// A request to spawn a child process.
#[derive(Clone, Debug)]
pub struct ChildProcessAccessRequest {
    pub command: String,
    pub args: Vec<String>,
}

/// Environment variable operations that can be permission-checked.
#[derive(Clone, Debug)]
pub enum EnvOp {
    Read,
    Write,
}

/// A request to access an environment variable.
#[derive(Clone, Debug)]
pub struct EnvAccessRequest {
    pub op: EnvOp,
    pub key: String,
    pub value: Option<String>,
}

/// Permission gate for sandbox operations.
///
/// All methods have default implementations that allow every request.
/// Implement individual methods to restrict access.
pub trait Permissions: Send + Sync {
    fn check_fs(&self, _request: &FsAccessRequest) -> PermissionDecision {
        PermissionDecision { allow: true, reason: None }
    }

    fn check_network(&self, _request: &NetworkAccessRequest) -> PermissionDecision {
        PermissionDecision { allow: true, reason: None }
    }

    fn check_child_process(&self, _request: &ChildProcessAccessRequest) -> PermissionDecision {
        PermissionDecision { allow: true, reason: None }
    }

    fn check_env(&self, _request: &EnvAccessRequest) -> PermissionDecision {
        PermissionDecision { allow: true, reason: None }
    }
}

/// Permissions implementation that allows all operations (uses trait defaults).
#[derive(Clone, Debug)]
pub struct AllowAll;

impl Permissions for AllowAll {}

// --- Permission-checking wrappers ---

fn perm_denied(reason: Option<String>) -> Error {
    Error::PermissionDenied {
        message: reason.unwrap_or_else(|| "permission denied".into()),
    }
}

/// Wrap a `FileSystem` with permission checks before each operation.
pub fn wrap_filesystem(
    fs: Box<dyn FileSystem>,
    perms: Arc<dyn Permissions>,
) -> Box<dyn FileSystem> {
    Box::new(PermissionWrappedFs { inner: fs, perms })
}

/// Wrap a `NetworkAdapter` with permission checks before each operation.
pub fn wrap_network(
    net: Box<dyn NetworkAdapter>,
    perms: Arc<dyn Permissions>,
) -> Box<dyn NetworkAdapter> {
    Box::new(PermissionWrappedNetwork { inner: net, perms })
}

/// Wrap a `CommandExecutor` with permission checks before each spawn.
pub fn wrap_command_executor(
    exec: Box<dyn CommandExecutor>,
    perms: Arc<dyn Permissions>,
) -> Box<dyn CommandExecutor> {
    Box::new(PermissionWrappedCommandExecutor { inner: exec, perms })
}

// --- PermissionWrappedFs ---

struct PermissionWrappedFs {
    inner: Box<dyn FileSystem>,
    perms: Arc<dyn Permissions>,
}

/// Check fs permission synchronously, return Err on deny.
fn check_fs(perms: &dyn Permissions, op: FsOp, path: &str) -> Result<()> {
    let decision = perms.check_fs(&FsAccessRequest {
        op,
        path: path.to_string(),
    });
    if decision.allow {
        Ok(())
    } else {
        Err(perm_denied(decision.reason))
    }
}

impl FileSystem for PermissionWrappedFs {
    fn read_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<u8>>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Read, path)?;
            self.inner.read_file(path).await
        })
    }

    fn read_text_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Read, path)?;
            self.inner.read_text_file(path).await
        })
    }

    fn read_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<String>>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Readdir, path)?;
            self.inner.read_dir(path).await
        })
    }

    fn read_dir_with_types<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<DirEntry>>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Readdir, path)?;
            self.inner.read_dir_with_types(path).await
        })
    }

    fn write_file<'a>(&'a self, path: &'a str, content: &'a [u8]) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Write, path)?;
            self.inner.write_file(path, content).await
        })
    }

    fn create_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::CreateDir, path)?;
            self.inner.create_dir(path).await
        })
    }

    fn mkdir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Mkdir, path)?;
            self.inner.mkdir(path).await
        })
    }

    fn exists<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<bool>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Exists, path)?;
            self.inner.exists(path).await
        })
    }

    fn stat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Stat, path)?;
            self.inner.stat(path).await
        })
    }

    fn remove_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Rm, path)?;
            self.inner.remove_file(path).await
        })
    }

    fn remove_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Rm, path)?;
            self.inner.remove_dir(path).await
        })
    }

    fn rename<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Rename, old_path)?;
            self.inner.rename(old_path, new_path).await
        })
    }

    fn symlink<'a>(&'a self, target: &'a str, link_path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Symlink, link_path)?;
            self.inner.symlink(target, link_path).await
        })
    }

    fn readlink<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Readlink, path)?;
            self.inner.readlink(path).await
        })
    }

    fn lstat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Stat, path)?;
            self.inner.lstat(path).await
        })
    }

    fn link<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Link, old_path)?;
            self.inner.link(old_path, new_path).await
        })
    }

    fn chmod<'a>(&'a self, path: &'a str, mode: u32) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Chmod, path)?;
            self.inner.chmod(path, mode).await
        })
    }

    fn chown<'a>(&'a self, path: &'a str, uid: u32, gid: u32) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Chown, path)?;
            self.inner.chown(path, uid, gid).await
        })
    }

    fn utimes<'a>(&'a self, path: &'a str, atime_ms: f64, mtime_ms: f64) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Utimes, path)?;
            self.inner.utimes(path, atime_ms, mtime_ms).await
        })
    }

    fn truncate<'a>(&'a self, path: &'a str, length: u64) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            check_fs(&*self.perms, FsOp::Truncate, path)?;
            self.inner.truncate(path, length).await
        })
    }
}

// --- PermissionWrappedNetwork ---

struct PermissionWrappedNetwork {
    inner: Box<dyn NetworkAdapter>,
    perms: Arc<dyn Permissions>,
}

impl NetworkAdapter for PermissionWrappedNetwork {
    fn fetch<'a>(
        &'a self,
        url: &'a str,
        options: FetchOptions,
    ) -> BoxFuture<'a, Result<FetchResponse>> {
        Box::pin(async move {
            let decision = self.perms.check_network(&NetworkAccessRequest {
                op: NetworkOp::Fetch,
                url: Some(url.to_string()),
                hostname: None,
                port: None,
            });
            if !decision.allow {
                return Err(perm_denied(decision.reason));
            }
            self.inner.fetch(url, options).await
        })
    }

    fn dns_lookup<'a>(
        &'a self,
        hostname: &'a str,
    ) -> BoxFuture<'a, Result<DnsResult>> {
        Box::pin(async move {
            let decision = self.perms.check_network(&NetworkAccessRequest {
                op: NetworkOp::Dns,
                url: None,
                hostname: Some(hostname.to_string()),
                port: None,
            });
            if !decision.allow {
                return Err(perm_denied(decision.reason));
            }
            self.inner.dns_lookup(hostname).await
        })
    }

    fn http_request<'a>(
        &'a self,
        url: &'a str,
        options: HttpRequestOptions,
    ) -> BoxFuture<'a, Result<HttpResponse>> {
        Box::pin(async move {
            let decision = self.perms.check_network(&NetworkAccessRequest {
                op: NetworkOp::Http,
                url: Some(url.to_string()),
                hostname: None,
                port: None,
            });
            if !decision.allow {
                return Err(perm_denied(decision.reason));
            }
            self.inner.http_request(url, options).await
        })
    }
}

// --- PermissionWrappedCommandExecutor ---

struct PermissionWrappedCommandExecutor {
    inner: Box<dyn CommandExecutor>,
    perms: Arc<dyn Permissions>,
}

impl CommandExecutor for PermissionWrappedCommandExecutor {
    fn spawn<'a>(
        &'a self,
        command: &'a str,
        args: &'a [String],
        options: SpawnOptions,
        on_stdout: Option<OnOutput>,
        on_stderr: Option<OnOutput>,
    ) -> BoxFuture<'a, Result<Box<dyn SpawnedProcess>>> {
        Box::pin(async move {
            let decision =
                self.perms
                    .check_child_process(&ChildProcessAccessRequest {
                        command: command.to_string(),
                        args: args.to_vec(),
                    });
            if !decision.allow {
                return Err(perm_denied(decision.reason));
            }
            self.inner
                .spawn(command, args, options, on_stdout, on_stderr)
                .await
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs::InMemoryFs;

    /// Permissions impl that denies all filesystem operations.
    struct DenyAllFs;

    impl Permissions for DenyAllFs {
        fn check_fs(&self, _request: &FsAccessRequest) -> PermissionDecision {
            PermissionDecision {
                allow: false,
                reason: Some("fs access denied by policy".into()),
            }
        }
    }

    #[tokio::test]
    async fn deny_all_permissions_rejects_fs_read() {
        let fs = InMemoryFs::new();
        fs.add_file("/secret.txt", b"classified".to_vec()).await;

        let perms: Arc<dyn Permissions> = Arc::new(DenyAllFs);
        let wrapped = wrap_filesystem(Box::new(fs), perms);

        let err = wrapped.read_file("/secret.txt").await.unwrap_err();
        match &err {
            Error::PermissionDenied { message } => {
                assert!(message.contains("fs access denied by policy"));
            }
            other => panic!("expected PermissionDenied, got: {:?}", other),
        }
    }

    #[tokio::test]
    async fn deny_all_permissions_rejects_fs_write() {
        let fs = InMemoryFs::new();
        let perms: Arc<dyn Permissions> = Arc::new(DenyAllFs);
        let wrapped = wrap_filesystem(Box::new(fs), perms);

        let err = wrapped.write_file("/test.txt", b"data").await.unwrap_err();
        match &err {
            Error::PermissionDenied { message } => {
                assert!(message.contains("fs access denied by policy"));
            }
            other => panic!("expected PermissionDenied, got: {:?}", other),
        }
    }

    #[tokio::test]
    async fn allow_all_permissions_passes_through() {
        let fs = InMemoryFs::new();
        fs.add_file("/hello.txt", b"world".to_vec()).await;

        let perms: Arc<dyn Permissions> = Arc::new(AllowAll);
        let wrapped = wrap_filesystem(Box::new(fs), perms);

        let data = wrapped.read_file("/hello.txt").await.unwrap();
        assert_eq!(data, b"world");

        wrapped.write_file("/new.txt", b"data").await.unwrap();
        let data = wrapped.read_file("/new.txt").await.unwrap();
        assert_eq!(data, b"data");
    }

    #[tokio::test]
    async fn deny_all_permissions_rejects_fs_stat() {
        let fs = InMemoryFs::new();
        fs.add_file("/file.txt", b"data".to_vec()).await;

        let perms: Arc<dyn Permissions> = Arc::new(DenyAllFs);
        let wrapped = wrap_filesystem(Box::new(fs), perms);

        let err = wrapped.stat("/file.txt").await.unwrap_err();
        assert!(matches!(err, Error::PermissionDenied { .. }));
    }

    #[tokio::test]
    async fn deny_all_permissions_rejects_command_spawn() {
        // Permissions impl that denies all child process spawns
        struct DenyAllCmd;
        impl Permissions for DenyAllCmd {
            fn check_child_process(
                &self,
                _request: &ChildProcessAccessRequest,
            ) -> PermissionDecision {
                PermissionDecision {
                    allow: false,
                    reason: Some("spawn denied".into()),
                }
            }
        }

        let perms: Arc<dyn Permissions> = Arc::new(DenyAllCmd);
        let wrapped = wrap_command_executor(
            Box::new(crate::command::DenyAllCommandExecutor),
            perms,
        );

        let result = wrapped
            .spawn("ls", &[], SpawnOptions { cwd: None, env: None }, None, None)
            .await;
        match result {
            Err(Error::PermissionDenied { message }) => {
                assert!(message.contains("spawn denied"));
            }
            Err(other) => panic!("expected PermissionDenied, got: {:?}", other),
            Ok(_) => panic!("expected error, got Ok"),
        }
    }
}
