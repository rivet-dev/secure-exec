//! tree -- list directory contents in a tree-like format
//!
//! Recursive directory walk with box-drawing characters.
//! Supports -a (show hidden), -d (dirs only), -L depth, -I exclude pattern.

use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::Path;

pub fn main(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    let mut show_hidden = false;
    let mut dirs_only = false;
    let mut max_depth: Option<usize> = None;
    let mut exclude_pattern: Option<String> = None;
    let mut paths: Vec<String> = Vec::new();

    let mut i = 0;
    while i < str_args.len() {
        match str_args[i].as_str() {
            "-a" => show_hidden = true,
            "-d" => dirs_only = true,
            "-L" => {
                i += 1;
                if i >= str_args.len() {
                    eprintln!("tree: option '-L' requires an argument");
                    return 1;
                }
                match str_args[i].parse::<usize>() {
                    Ok(d) => max_depth = Some(d),
                    Err(_) => {
                        eprintln!("tree: invalid level '{}'", str_args[i]);
                        return 1;
                    }
                }
            }
            "-I" => {
                i += 1;
                if i >= str_args.len() {
                    eprintln!("tree: option '-I' requires an argument");
                    return 1;
                }
                exclude_pattern = Some(str_args[i].clone());
            }
            s if s.starts_with('-') => {
                eprintln!("tree: unknown option '{}'", s);
                return 1;
            }
            _ => paths.push(str_args[i].clone()),
        }
        i += 1;
    }

    if paths.is_empty() {
        paths.push(".".to_string());
    }

    let stdout = io::stdout();
    let mut out = stdout.lock();
    let mut dir_count: usize = 0;
    let mut file_count: usize = 0;

    for (idx, path) in paths.iter().enumerate() {
        let _ = writeln!(out, "{}", path);
        walk_tree(
            Path::new(path),
            "",
            1,
            max_depth,
            show_hidden,
            dirs_only,
            exclude_pattern.as_deref(),
            &mut dir_count,
            &mut file_count,
            &mut out,
        );
        if idx + 1 < paths.len() {
            let _ = writeln!(out);
        }
    }

    let _ = writeln!(out);
    if dirs_only {
        let _ = writeln!(
            out,
            "{} director{}",
            dir_count,
            if dir_count == 1 { "y" } else { "ies" }
        );
    } else {
        let _ = writeln!(
            out,
            "{} director{}, {} file{}",
            dir_count,
            if dir_count == 1 { "y" } else { "ies" },
            file_count,
            if file_count == 1 { "" } else { "s" }
        );
    }

    0
}

fn matches_exclude(name: &str, pattern: &str) -> bool {
    // Simple glob matching: supports * as wildcard
    if pattern.contains('*') {
        let parts: Vec<&str> = pattern.split('*').collect();
        if parts.len() == 2 {
            let (prefix, suffix) = (parts[0], parts[1]);
            return name.starts_with(prefix) && name.ends_with(suffix);
        }
        // Fallback: check if any non-wildcard part matches
        parts.iter().all(|p| p.is_empty() || name.contains(p))
    } else {
        name == pattern
    }
}

fn walk_tree<W: Write>(
    dir: &Path,
    prefix: &str,
    depth: usize,
    max_depth: Option<usize>,
    show_hidden: bool,
    dirs_only: bool,
    exclude: Option<&str>,
    dir_count: &mut usize,
    file_count: &mut usize,
    out: &mut W,
) {
    if let Some(max) = max_depth {
        if depth > max {
            return;
        }
    }

    let mut entries: Vec<fs::DirEntry> = match fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(e) => {
            let _ = writeln!(out, "{}[error opening dir: {}]", prefix, e);
            return;
        }
    };

    // Sort entries alphabetically
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    // Filter entries
    let entries: Vec<&fs::DirEntry> = entries
        .iter()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            // Skip hidden unless -a
            if !show_hidden && name.starts_with('.') {
                return false;
            }
            // Skip excluded patterns
            if let Some(pat) = exclude {
                if matches_exclude(&name, pat) {
                    return false;
                }
            }
            // Skip files if -d
            if dirs_only {
                if let Ok(ft) = e.file_type() {
                    if !ft.is_dir() {
                        return false;
                    }
                }
            }
            true
        })
        .collect();

    let count = entries.len();

    for (idx, entry) in entries.iter().enumerate() {
        let is_last = idx + 1 == count;
        let connector = if is_last {
            "\u{2514}\u{2500}\u{2500} " // └──
        } else {
            "\u{251c}\u{2500}\u{2500} " // ├──
        };

        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

        let _ = write!(out, "{}{}", prefix, connector);
        let _ = writeln!(out, "{}", name);

        if is_dir {
            *dir_count += 1;
            let child_prefix = if is_last {
                format!("{}    ", prefix)
            } else {
                format!("{}\u{2502}   ", prefix) // │
            };
            walk_tree(
                &dir.join(&name),
                &child_prefix,
                depth + 1,
                max_depth,
                show_hidden,
                dirs_only,
                exclude,
                dir_count,
                file_count,
                out,
            );
        } else {
            *file_count += 1;
        }
    }
}
