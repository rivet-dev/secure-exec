use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::RwLock;

use crate::{BoxFuture, Error, Result};

/// A single directory entry returned by `read_dir_with_types`.
#[derive(Clone, Debug)]
pub struct DirEntry {
    pub name: String,
    pub is_directory: bool,
}

/// File metadata returned by `stat` and `lstat`.
#[derive(Clone, Debug)]
pub struct FileStat {
    pub mode: u32,
    pub size: u64,
    pub is_directory: bool,
    pub is_symbolic_link: bool,
    pub atime_ms: f64,
    pub mtime_ms: f64,
    pub ctime_ms: f64,
    pub birthtime_ms: f64,
}

/// Virtual filesystem trait mirroring TypeScript `VirtualFileSystem`.
///
/// All methods return `BoxFuture` for object safety, allowing use as
/// `Box<dyn FileSystem>` in `SystemDriver`.
pub trait FileSystem: Send + Sync {
    fn read_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<u8>>>;
    fn read_text_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>>;
    fn read_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<String>>>;
    fn read_dir_with_types<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<DirEntry>>>;
    fn write_file<'a>(&'a self, path: &'a str, content: &'a [u8]) -> BoxFuture<'a, Result<()>>;
    fn create_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn mkdir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn exists<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<bool>>;
    fn stat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>>;
    fn remove_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn remove_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn rename<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn symlink<'a>(&'a self, target: &'a str, link_path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn readlink<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>>;
    fn lstat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>>;
    fn link<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>>;
    fn chmod<'a>(&'a self, path: &'a str, mode: u32) -> BoxFuture<'a, Result<()>>;
    fn chown<'a>(&'a self, path: &'a str, uid: u32, gid: u32) -> BoxFuture<'a, Result<()>>;
    fn utimes<'a>(&'a self, path: &'a str, atime_ms: f64, mtime_ms: f64) -> BoxFuture<'a, Result<()>>;
    fn truncate<'a>(&'a self, path: &'a str, length: u64) -> BoxFuture<'a, Result<()>>;
}

// --- InMemoryFs implementation ---

struct InMemoryState {
    files: HashMap<String, Vec<u8>>,
    dirs: HashSet<String>,
    symlinks: HashMap<String, String>,
    modes: HashMap<String, u32>,
    owners: HashMap<String, (u32, u32)>,
    timestamps: HashMap<String, (f64, f64)>, // (atime_ms, mtime_ms)
}

/// Map-backed in-memory filesystem matching TypeScript InMemoryFileSystem semantics.
pub struct InMemoryFs {
    state: RwLock<InMemoryState>,
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

/// Normalize a path to POSIX-style: rooted at "/", no trailing slash,
/// collapsed multiple slashes.
fn normalize_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    let mut parts: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", parts.join("/"))
    }
}

/// Get the parent directory of a normalized path.
fn parent_path(path: &str) -> Option<String> {
    if path == "/" {
        return None;
    }
    match path.rfind('/') {
        Some(0) => Some("/".to_string()),
        Some(idx) => Some(path[..idx].to_string()),
        None => Some("/".to_string()),
    }
}

fn io_err(code: &str, message: impl Into<String>) -> Error {
    Error::Io {
        message: message.into(),
        code: Some(code.to_string()),
    }
}

impl InMemoryState {
    /// Resolve symlinks up to 16 levels deep.
    fn resolve_symlink(&self, path: &str) -> Result<String> {
        let mut current = path.to_string();
        for _ in 0..16 {
            if let Some(target) = self.symlinks.get(&current) {
                if target.starts_with('/') {
                    current = normalize_path(target);
                } else {
                    // Relative symlink: resolve relative to the symlink's parent
                    let parent = parent_path(&current).unwrap_or_else(|| "/".to_string());
                    current = normalize_path(&format!("{}/{}", parent, target));
                }
            } else {
                return Ok(current);
            }
        }
        Err(io_err("ELOOP", format!("too many levels of symbolic links: {}", path)))
    }

    fn file_stat(&self, path: &str, follow_symlinks: bool) -> Result<FileStat> {
        let is_symlink = self.symlinks.contains_key(path);
        let resolved = if follow_symlinks && is_symlink {
            self.resolve_symlink(path)?
        } else {
            path.to_string()
        };

        let is_directory = self.dirs.contains(&resolved);
        let is_file = self.files.contains_key(&resolved);
        let is_symbolic_link = !follow_symlinks && is_symlink;

        if !is_directory && !is_file && !is_symbolic_link {
            return Err(io_err("ENOENT", format!("no such file or directory: {}", path)));
        }

        let size = if is_file {
            self.files.get(&resolved).map(|f| f.len() as u64).unwrap_or(0)
        } else {
            0
        };

        let mode = self.modes.get(&resolved).copied().unwrap_or(if is_directory {
            0o755
        } else if is_symbolic_link {
            0o777
        } else {
            0o644
        });

        let (atime_ms, mtime_ms) = self.timestamps.get(&resolved).copied().unwrap_or_else(|| {
            let now = now_ms();
            (now, now)
        });
        let now = now_ms();

        Ok(FileStat {
            mode,
            size,
            is_directory,
            is_symbolic_link,
            atime_ms,
            mtime_ms,
            ctime_ms: now,
            birthtime_ms: now,
        })
    }

    /// List immediate children of a directory.
    fn list_children(&self, dir_path: &str) -> Vec<(String, bool)> {
        let prefix = if dir_path == "/" {
            "/".to_string()
        } else {
            format!("{}/", dir_path)
        };

        let mut seen = HashSet::new();
        let mut entries = Vec::new();

        // Check files
        for key in self.files.keys() {
            if let Some(rest) = key.strip_prefix(&prefix) {
                if !rest.contains('/') && !rest.is_empty() {
                    if seen.insert(rest.to_string()) {
                        entries.push((rest.to_string(), false));
                    }
                }
            }
        }

        // Check subdirectories
        for key in &self.dirs {
            if let Some(rest) = key.strip_prefix(&prefix) {
                if !rest.contains('/') && !rest.is_empty() {
                    if seen.insert(rest.to_string()) {
                        entries.push((rest.to_string(), true));
                    }
                }
            }
        }

        // Check symlinks
        for key in self.symlinks.keys() {
            if let Some(rest) = key.strip_prefix(&prefix) {
                if !rest.contains('/') && !rest.is_empty() {
                    if seen.insert(rest.to_string()) {
                        entries.push((rest.to_string(), false));
                    }
                }
            }
        }

        entries.sort_by(|a, b| a.0.cmp(&b.0));
        entries
    }

    /// Recursively create directory and all parents (mkdir -p).
    fn mkdir_recursive(&mut self, path: &str) {
        if path == "/" || self.dirs.contains(path) {
            return;
        }
        if let Some(parent) = parent_path(path) {
            self.mkdir_recursive(&parent);
        }
        self.dirs.insert(path.to_string());
        let now = now_ms();
        self.timestamps.insert(path.to_string(), (now, now));
    }
}

impl InMemoryFs {
    /// Create an empty in-memory filesystem with root directory "/".
    pub fn new() -> Self {
        let mut dirs = HashSet::new();
        dirs.insert("/".to_string());
        InMemoryFs {
            state: RwLock::new(InMemoryState {
                files: HashMap::new(),
                dirs,
                symlinks: HashMap::new(),
                modes: HashMap::new(),
                owners: HashMap::new(),
                timestamps: HashMap::new(),
            }),
        }
    }

    /// Pre-populate a file at the given path, creating parent directories.
    pub async fn add_file(&self, path: &str, content: impl Into<Vec<u8>>) {
        let path = normalize_path(path);
        let mut state = self.state.write().await;
        if let Some(parent) = parent_path(&path) {
            state.mkdir_recursive(&parent);
        }
        state.files.insert(path.clone(), content.into());
        let now = now_ms();
        state.timestamps.insert(path, (now, now));
    }
}

impl Default for InMemoryFs {
    fn default() -> Self {
        Self::new()
    }
}

impl FileSystem for InMemoryFs {
    fn read_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<u8>>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            let resolved = state.resolve_symlink(&path)?;
            state
                .files
                .get(&resolved)
                .cloned()
                .ok_or_else(|| io_err("ENOENT", format!("no such file or directory: {}", path)))
        })
    }

    fn read_text_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>> {
        Box::pin(async move {
            let bytes = self.read_file(path).await?;
            String::from_utf8(bytes).map_err(|e| Error::Io {
                message: e.to_string(),
                code: None,
            })
        })
    }

    fn read_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<String>>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            let resolved = state.resolve_symlink(&path)?;
            if !state.dirs.contains(&resolved) {
                return Err(io_err("ENOENT", format!("no such directory: {}", path)));
            }
            Ok(state.list_children(&resolved).into_iter().map(|(name, _)| name).collect())
        })
    }

    fn read_dir_with_types<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<Vec<DirEntry>>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            let resolved = state.resolve_symlink(&path)?;
            if !state.dirs.contains(&resolved) {
                return Err(io_err("ENOENT", format!("no such directory: {}", path)));
            }
            Ok(state
                .list_children(&resolved)
                .into_iter()
                .map(|(name, is_directory)| DirEntry { name, is_directory })
                .collect())
        })
    }

    fn write_file<'a>(&'a self, path: &'a str, content: &'a [u8]) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            let resolved = state.resolve_symlink(&path)?;
            if state.dirs.contains(&resolved) {
                return Err(io_err("EISDIR", format!("is a directory: {}", path)));
            }
            // Auto-create parent directories
            if let Some(parent) = parent_path(&resolved) {
                state.mkdir_recursive(&parent);
            }
            state.files.insert(resolved.clone(), content.to_vec());
            let now = now_ms();
            state.timestamps.insert(resolved, (now, now));
            Ok(())
        })
    }

    fn create_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            // Single-level: parent must exist
            if let Some(parent) = parent_path(&path) {
                if !state.dirs.contains(&parent) {
                    return Err(io_err("ENOENT", format!("no such directory: {}", parent)));
                }
            }
            if state.dirs.contains(&path) {
                return Err(io_err("EEXIST", format!("directory already exists: {}", path)));
            }
            state.dirs.insert(path.clone());
            let now = now_ms();
            state.timestamps.insert(path, (now, now));
            Ok(())
        })
    }

    fn mkdir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            state.mkdir_recursive(&path);
            Ok(())
        })
    }

    fn exists<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<bool>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            Ok(state.files.contains_key(&path)
                || state.dirs.contains(&path)
                || state.symlinks.contains_key(&path))
        })
    }

    fn stat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            state.file_stat(&path, true)
        })
    }

    fn remove_file<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            if state.dirs.contains(&path) {
                return Err(io_err("EISDIR", format!("is a directory: {}", path)));
            }
            if state.symlinks.remove(&path).is_some() {
                state.modes.remove(&path);
                state.owners.remove(&path);
                state.timestamps.remove(&path);
                return Ok(());
            }
            if state.files.remove(&path).is_some() {
                state.modes.remove(&path);
                state.owners.remove(&path);
                state.timestamps.remove(&path);
                return Ok(());
            }
            Err(io_err("ENOENT", format!("no such file or directory: {}", path)))
        })
    }

    fn remove_dir<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            if path == "/" {
                return Err(io_err("EPERM", "cannot remove root directory"));
            }
            let mut state = self.state.write().await;
            if !state.dirs.contains(&path) {
                return Err(io_err("ENOENT", format!("no such directory: {}", path)));
            }
            // Check if directory is empty
            if !state.list_children(&path).is_empty() {
                return Err(io_err("ENOTEMPTY", format!("directory not empty: {}", path)));
            }
            state.dirs.remove(&path);
            state.modes.remove(&path);
            state.owners.remove(&path);
            state.timestamps.remove(&path);
            Ok(())
        })
    }

    fn rename<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let old_path = normalize_path(old_path);
            let new_path = normalize_path(new_path);
            if old_path == "/" {
                return Err(io_err("EPERM", "cannot rename root directory"));
            }
            if new_path.starts_with(&format!("{}/", old_path)) {
                return Err(io_err("EINVAL", "cannot rename to a subdirectory of itself"));
            }

            let mut state = self.state.write().await;

            // Check destination doesn't exist
            if state.files.contains_key(&new_path) || state.dirs.contains(&new_path) {
                return Err(io_err("EEXIST", format!("destination already exists: {}", new_path)));
            }

            // Rename a file or symlink
            if let Some(data) = state.files.remove(&old_path) {
                // Auto-create parent of new path
                if let Some(parent) = parent_path(&new_path) {
                    state.mkdir_recursive(&parent);
                }
                state.files.insert(new_path.clone(), data);
                // Move metadata
                if let Some(m) = state.modes.remove(&old_path) {
                    state.modes.insert(new_path.clone(), m);
                }
                if let Some(o) = state.owners.remove(&old_path) {
                    state.owners.insert(new_path.clone(), o);
                }
                if let Some(t) = state.timestamps.remove(&old_path) {
                    state.timestamps.insert(new_path.clone(), t);
                }
                return Ok(());
            }

            if let Some(target) = state.symlinks.remove(&old_path) {
                state.symlinks.insert(new_path.clone(), target);
                if let Some(m) = state.modes.remove(&old_path) {
                    state.modes.insert(new_path.clone(), m);
                }
                if let Some(o) = state.owners.remove(&old_path) {
                    state.owners.insert(new_path.clone(), o);
                }
                if let Some(t) = state.timestamps.remove(&old_path) {
                    state.timestamps.insert(new_path.clone(), t);
                }
                return Ok(());
            }

            // Rename a directory (recursively move contents)
            if state.dirs.contains(&old_path) {
                let old_prefix = format!("{}/", old_path);

                // Collect all paths to move
                let file_keys: Vec<String> = state
                    .files
                    .keys()
                    .filter(|k| k.starts_with(&old_prefix))
                    .cloned()
                    .collect();
                let dir_keys: Vec<String> = state
                    .dirs
                    .iter()
                    .filter(|k| k.starts_with(&old_prefix))
                    .cloned()
                    .collect();
                let symlink_keys: Vec<String> = state
                    .symlinks
                    .keys()
                    .filter(|k| k.starts_with(&old_prefix))
                    .cloned()
                    .collect();

                // Auto-create parent of new path
                if let Some(parent) = parent_path(&new_path) {
                    state.mkdir_recursive(&parent);
                }

                // Move the directory itself
                state.dirs.remove(&old_path);
                state.dirs.insert(new_path.clone());

                // Move metadata for the directory
                if let Some(m) = state.modes.remove(&old_path) {
                    state.modes.insert(new_path.clone(), m);
                }
                if let Some(o) = state.owners.remove(&old_path) {
                    state.owners.insert(new_path.clone(), o);
                }
                if let Some(t) = state.timestamps.remove(&old_path) {
                    state.timestamps.insert(new_path.clone(), t);
                }

                // Move files
                for key in file_keys {
                    let new_key = format!("{}{}", new_path, &key[old_path.len()..]);
                    if let Some(data) = state.files.remove(&key) {
                        state.files.insert(new_key.clone(), data);
                    }
                    if let Some(m) = state.modes.remove(&key) {
                        state.modes.insert(new_key.clone(), m);
                    }
                    if let Some(o) = state.owners.remove(&key) {
                        state.owners.insert(new_key.clone(), o);
                    }
                    if let Some(t) = state.timestamps.remove(&key) {
                        state.timestamps.insert(new_key, t);
                    }
                }

                // Move subdirectories
                for key in dir_keys {
                    let new_key = format!("{}{}", new_path, &key[old_path.len()..]);
                    state.dirs.remove(&key);
                    state.dirs.insert(new_key.clone());
                    if let Some(m) = state.modes.remove(&key) {
                        state.modes.insert(new_key.clone(), m);
                    }
                    if let Some(o) = state.owners.remove(&key) {
                        state.owners.insert(new_key.clone(), o);
                    }
                    if let Some(t) = state.timestamps.remove(&key) {
                        state.timestamps.insert(new_key, t);
                    }
                }

                // Move symlinks
                for key in symlink_keys {
                    let new_key = format!("{}{}", new_path, &key[old_path.len()..]);
                    if let Some(target) = state.symlinks.remove(&key) {
                        state.symlinks.insert(new_key.clone(), target);
                    }
                    if let Some(m) = state.modes.remove(&key) {
                        state.modes.insert(new_key.clone(), m);
                    }
                    if let Some(o) = state.owners.remove(&key) {
                        state.owners.insert(new_key.clone(), o);
                    }
                    if let Some(t) = state.timestamps.remove(&key) {
                        state.timestamps.insert(new_key, t);
                    }
                }

                return Ok(());
            }

            Err(io_err("ENOENT", format!("no such file or directory: {}", old_path)))
        })
    }

    fn symlink<'a>(&'a self, target: &'a str, link_path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let link_path = normalize_path(link_path);
            let mut state = self.state.write().await;
            if state.files.contains_key(&link_path)
                || state.dirs.contains(&link_path)
                || state.symlinks.contains_key(&link_path)
            {
                return Err(io_err("EEXIST", format!("path already exists: {}", link_path)));
            }
            // Store the raw target (not normalized) to support relative symlinks
            state.symlinks.insert(link_path.clone(), target.to_string());
            state.modes.insert(link_path.clone(), 0o777);
            let now = now_ms();
            state.timestamps.insert(link_path, (now, now));
            Ok(())
        })
    }

    fn readlink<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<String>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            state
                .symlinks
                .get(&path)
                .cloned()
                .ok_or_else(|| io_err("EINVAL", format!("not a symbolic link: {}", path)))
        })
    }

    fn lstat<'a>(&'a self, path: &'a str) -> BoxFuture<'a, Result<FileStat>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let state = self.state.read().await;
            state.file_stat(&path, false)
        })
    }

    fn link<'a>(&'a self, old_path: &'a str, new_path: &'a str) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let old_path = normalize_path(old_path);
            let new_path = normalize_path(new_path);
            let mut state = self.state.write().await;
            let resolved = state.resolve_symlink(&old_path)?;
            let data = state
                .files
                .get(&resolved)
                .cloned()
                .ok_or_else(|| io_err("ENOENT", format!("no such file: {}", old_path)))?;
            if state.files.contains_key(&new_path) || state.dirs.contains(&new_path) {
                return Err(io_err("EEXIST", format!("path already exists: {}", new_path)));
            }
            state.files.insert(new_path.clone(), data);
            let now = now_ms();
            state.timestamps.insert(new_path, (now, now));
            Ok(())
        })
    }

    fn chmod<'a>(&'a self, path: &'a str, mode: u32) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            let resolved = state.resolve_symlink(&path)?;
            if !state.files.contains_key(&resolved)
                && !state.dirs.contains(&resolved)
                && !state.symlinks.contains_key(&resolved)
            {
                return Err(io_err("ENOENT", format!("no such file or directory: {}", path)));
            }
            state.modes.insert(resolved, mode);
            Ok(())
        })
    }

    fn chown<'a>(&'a self, path: &'a str, uid: u32, gid: u32) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            let resolved = state.resolve_symlink(&path)?;
            if !state.files.contains_key(&resolved)
                && !state.dirs.contains(&resolved)
                && !state.symlinks.contains_key(&resolved)
            {
                return Err(io_err("ENOENT", format!("no such file or directory: {}", path)));
            }
            state.owners.insert(resolved, (uid, gid));
            Ok(())
        })
    }

    fn utimes<'a>(&'a self, path: &'a str, atime_ms: f64, mtime_ms: f64) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            let resolved = state.resolve_symlink(&path)?;
            if !state.files.contains_key(&resolved)
                && !state.dirs.contains(&resolved)
                && !state.symlinks.contains_key(&resolved)
            {
                return Err(io_err("ENOENT", format!("no such file or directory: {}", path)));
            }
            state.timestamps.insert(resolved, (atime_ms, mtime_ms));
            Ok(())
        })
    }

    fn truncate<'a>(&'a self, path: &'a str, length: u64) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let path = normalize_path(path);
            let mut state = self.state.write().await;
            let resolved = state.resolve_symlink(&path)?;
            let data = state
                .files
                .get_mut(&resolved)
                .ok_or_else(|| io_err("ENOENT", format!("no such file: {}", path)))?;
            let len = length as usize;
            if len < data.len() {
                data.truncate(len);
            } else if len > data.len() {
                data.resize(len, 0);
            }
            let now = now_ms();
            state.timestamps.insert(resolved, (now, now));
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn read_write_round_trip() {
        let fs = InMemoryFs::new();
        fs.add_file("/hello.txt", b"hello world".to_vec()).await;
        let data = fs.read_file("/hello.txt").await.unwrap();
        assert_eq!(data, b"hello world");
        let text = fs.read_text_file("/hello.txt").await.unwrap();
        assert_eq!(text, "hello world");
    }

    #[tokio::test]
    async fn write_file_creates_parents() {
        let fs = InMemoryFs::new();
        fs.write_file("/a/b/c/file.txt", b"data").await.unwrap();
        assert!(fs.exists("/a").await.unwrap());
        assert!(fs.exists("/a/b").await.unwrap());
        assert!(fs.exists("/a/b/c").await.unwrap());
        assert!(fs.exists("/a/b/c/file.txt").await.unwrap());
    }

    #[tokio::test]
    async fn mkdir_recursive() {
        let fs = InMemoryFs::new();
        fs.mkdir("/a/b/c").await.unwrap();
        assert!(fs.exists("/a").await.unwrap());
        assert!(fs.exists("/a/b").await.unwrap());
        assert!(fs.exists("/a/b/c").await.unwrap());
        // Calling again is a no-op
        fs.mkdir("/a/b/c").await.unwrap();
    }

    #[tokio::test]
    async fn create_dir_single_level() {
        let fs = InMemoryFs::new();
        // Parent exists (root)
        fs.create_dir("/mydir").await.unwrap();
        assert!(fs.exists("/mydir").await.unwrap());
        // Fails if parent missing
        let err = fs.create_dir("/x/y").await.unwrap_err();
        assert!(err.to_string().contains("ENOENT"));
        // Fails if already exists
        let err = fs.create_dir("/mydir").await.unwrap_err();
        assert!(err.to_string().contains("EEXIST"));
    }

    #[tokio::test]
    async fn exists_and_stat() {
        let fs = InMemoryFs::new();
        assert!(!fs.exists("/nonexistent").await.unwrap());
        fs.add_file("/root/file.txt", b"data".to_vec()).await;

        let stat = fs.stat("/root/file.txt").await.unwrap();
        assert!(!stat.is_directory);
        assert!(!stat.is_symbolic_link);
        assert_eq!(stat.size, 4);
        assert_eq!(stat.mode, 0o644);

        let stat = fs.stat("/root").await.unwrap();
        assert!(stat.is_directory);
        assert_eq!(stat.mode, 0o755);
    }

    #[tokio::test]
    async fn remove_file_and_dir() {
        let fs = InMemoryFs::new();
        fs.add_file("/tmp/file.txt", b"data".to_vec()).await;
        fs.remove_file("/tmp/file.txt").await.unwrap();
        assert!(!fs.exists("/tmp/file.txt").await.unwrap());

        // Directory must be empty to remove
        fs.mkdir("/a/b").await.unwrap();
        let err = fs.remove_dir("/a").await.unwrap_err();
        assert!(err.to_string().contains("ENOTEMPTY"));
        fs.remove_dir("/a/b").await.unwrap();
        fs.remove_dir("/a").await.unwrap();
        assert!(!fs.exists("/a").await.unwrap());
    }

    #[tokio::test]
    async fn rename_file() {
        let fs = InMemoryFs::new();
        fs.add_file("/old.txt", b"content".to_vec()).await;
        fs.rename("/old.txt", "/new.txt").await.unwrap();
        assert!(!fs.exists("/old.txt").await.unwrap());
        let data = fs.read_file("/new.txt").await.unwrap();
        assert_eq!(data, b"content");
    }

    #[tokio::test]
    async fn rename_directory() {
        let fs = InMemoryFs::new();
        fs.add_file("/dir/sub/file.txt", b"data".to_vec()).await;
        fs.rename("/dir", "/newdir").await.unwrap();
        assert!(!fs.exists("/dir").await.unwrap());
        let data = fs.read_file("/newdir/sub/file.txt").await.unwrap();
        assert_eq!(data, b"data");
    }

    #[tokio::test]
    async fn read_dir_listing() {
        let fs = InMemoryFs::new();
        fs.add_file("/root/a.txt", b"a".to_vec()).await;
        fs.add_file("/root/b.txt", b"b".to_vec()).await;
        fs.mkdir("/root/subdir").await.unwrap();

        let entries = fs.read_dir("/root").await.unwrap();
        assert!(entries.contains(&"a.txt".to_string()));
        assert!(entries.contains(&"b.txt".to_string()));
        assert!(entries.contains(&"subdir".to_string()));

        let typed = fs.read_dir_with_types("/root").await.unwrap();
        let subdir_entry = typed.iter().find(|e| e.name == "subdir").unwrap();
        assert!(subdir_entry.is_directory);
        let file_entry = typed.iter().find(|e| e.name == "a.txt").unwrap();
        assert!(!file_entry.is_directory);
    }

    #[tokio::test]
    async fn symlink_operations() {
        let fs = InMemoryFs::new();
        fs.add_file("/target.txt", b"data".to_vec()).await;
        fs.symlink("/target.txt", "/link.txt").await.unwrap();

        // Read through symlink
        let data = fs.read_file("/link.txt").await.unwrap();
        assert_eq!(data, b"data");

        // readlink returns raw target
        let target = fs.readlink("/link.txt").await.unwrap();
        assert_eq!(target, "/target.txt");

        // stat follows symlinks
        let stat = fs.stat("/link.txt").await.unwrap();
        assert!(!stat.is_symbolic_link);
        assert_eq!(stat.size, 4);

        // lstat does not follow symlinks
        let lstat = fs.lstat("/link.txt").await.unwrap();
        assert!(lstat.is_symbolic_link);
    }

    #[tokio::test]
    async fn hard_link() {
        let fs = InMemoryFs::new();
        fs.add_file("/original.txt", b"hello".to_vec()).await;
        fs.link("/original.txt", "/linked.txt").await.unwrap();
        let data = fs.read_file("/linked.txt").await.unwrap();
        assert_eq!(data, b"hello");
    }

    #[tokio::test]
    async fn chmod_and_chown() {
        let fs = InMemoryFs::new();
        fs.add_file("/file.txt", b"data".to_vec()).await;
        fs.chmod("/file.txt", 0o755).await.unwrap();
        let stat = fs.stat("/file.txt").await.unwrap();
        assert_eq!(stat.mode, 0o755);

        fs.chown("/file.txt", 1000, 1000).await.unwrap();
        // chown doesn't affect stat mode
        let stat = fs.stat("/file.txt").await.unwrap();
        assert_eq!(stat.mode, 0o755);
    }

    #[tokio::test]
    async fn utimes() {
        let fs = InMemoryFs::new();
        fs.add_file("/file.txt", b"data".to_vec()).await;
        fs.utimes("/file.txt", 1000.0, 2000.0).await.unwrap();
        let stat = fs.stat("/file.txt").await.unwrap();
        assert_eq!(stat.atime_ms, 1000.0);
        assert_eq!(stat.mtime_ms, 2000.0);
    }

    #[tokio::test]
    async fn truncate_file() {
        let fs = InMemoryFs::new();
        fs.add_file("/file.txt", b"hello world".to_vec()).await;
        // Shrink
        fs.truncate("/file.txt", 5).await.unwrap();
        let data = fs.read_file("/file.txt").await.unwrap();
        assert_eq!(data, b"hello");
        // Extend with zeros
        fs.truncate("/file.txt", 8).await.unwrap();
        let data = fs.read_file("/file.txt").await.unwrap();
        assert_eq!(data, b"hello\0\0\0");
    }

    #[tokio::test]
    async fn path_normalization() {
        let fs = InMemoryFs::new();
        fs.add_file("/a/../b/./c.txt", b"data".to_vec()).await;
        assert!(fs.exists("/b/c.txt").await.unwrap());
        let data = fs.read_file("/b/c.txt").await.unwrap();
        assert_eq!(data, b"data");
    }

    #[tokio::test]
    async fn enoent_errors() {
        let fs = InMemoryFs::new();
        let err = fs.read_file("/nonexistent").await.unwrap_err();
        assert!(err.to_string().contains("ENOENT"));
        let err = fs.stat("/nonexistent").await.unwrap_err();
        assert!(err.to_string().contains("ENOENT"));
        let err = fs.remove_file("/nonexistent").await.unwrap_err();
        assert!(err.to_string().contains("ENOENT"));
    }
}
