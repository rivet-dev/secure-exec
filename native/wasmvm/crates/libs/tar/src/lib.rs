//! tar implementation — create, extract, and list tape archives.
//!
//! Supports -c create, -x extract, -t list.
//! Options: -f archive, -z gzip, -v verbose, -C directory, --strip-components=N.

use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

#[derive(PartialEq)]
enum Mode {
    None,
    Create,
    Extract,
    List,
}

/// Unified tar entry point.
pub fn main(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    if str_args.is_empty() {
        eprintln!("tar: must specify one of -c, -x, -t");
        return 1;
    }

    let mut mode = Mode::None;
    let mut archive_file: Option<String> = None;
    let mut gzip = false;
    let mut verbose = false;
    let mut directory: Option<String> = None;
    let mut strip_components: usize = 0;
    let mut paths: Vec<String> = Vec::new();

    let mut i = 0;
    let mut first_arg = true;

    while i < str_args.len() {
        let arg = &str_args[i];

        if arg.starts_with("--strip-components=") {
            if let Ok(n) = arg["--strip-components=".len()..].parse() {
                strip_components = n;
            }
            first_arg = false;
        } else if arg == "--strip-components" {
            i += 1;
            if i < str_args.len() {
                strip_components = str_args[i].parse().unwrap_or(0);
            }
            first_arg = false;
        } else if arg == "-C" || arg == "--directory" {
            i += 1;
            if i < str_args.len() {
                directory = Some(str_args[i].clone());
            }
            first_arg = false;
        } else if arg == "--help" {
            print_usage();
            return 0;
        } else if arg.starts_with('-') || first_arg {
            // tar's first argument can omit the leading dash (e.g., `tar czf`)
            let flags = if arg.starts_with('-') {
                &arg[1..]
            } else {
                &arg[..]
            };
            let mut chars = flags.chars().peekable();
            while let Some(ch) = chars.next() {
                match ch {
                    'c' => mode = Mode::Create,
                    'x' => mode = Mode::Extract,
                    't' => mode = Mode::List,
                    'z' => gzip = true,
                    'v' => verbose = true,
                    'f' => {
                        let rest: String = chars.collect();
                        if !rest.is_empty() {
                            archive_file = Some(rest);
                        } else {
                            i += 1;
                            if i < str_args.len() {
                                archive_file = Some(str_args[i].clone());
                            }
                        }
                        break;
                    }
                    'C' => {
                        let rest: String = chars.collect();
                        if !rest.is_empty() {
                            directory = Some(rest);
                        } else {
                            i += 1;
                            if i < str_args.len() {
                                directory = Some(str_args[i].clone());
                            }
                        }
                        break;
                    }
                    _ => {
                        eprintln!("tar: unknown option: {}", ch);
                        return 1;
                    }
                }
            }
            first_arg = false;
        } else {
            paths.push(arg.clone());
            first_arg = false;
        }

        i += 1;
    }

    // Auto-detect gzip from filename
    if !gzip {
        if let Some(ref f) = archive_file {
            if f.ends_with(".tar.gz") || f.ends_with(".tgz") {
                gzip = true;
            }
        }
    }

    // Change directory if -C specified
    if let Some(ref dir) = directory {
        if let Err(e) = std::env::set_current_dir(dir) {
            eprintln!("tar: {}: {}", dir, e);
            return 1;
        }
    }

    let result = match mode {
        Mode::Create => do_create(archive_file.as_deref(), gzip, verbose, &paths),
        Mode::Extract => do_extract(archive_file.as_deref(), gzip, verbose, strip_components),
        Mode::List => do_list(archive_file.as_deref(), gzip, verbose),
        Mode::None => {
            eprintln!("tar: must specify one of -c, -x, -t");
            return 1;
        }
    };

    match result {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("tar: {}", e);
            1
        }
    }
}

fn do_create(
    archive_file: Option<&str>,
    gzip: bool,
    verbose: bool,
    paths: &[String],
) -> io::Result<()> {
    if paths.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "cowardly refusing to create an empty archive",
        ));
    }

    let writer: Box<dyn Write> = match archive_file {
        Some("-") | None => Box::new(io::stdout()),
        Some(path) => Box::new(File::create(path)?),
    };

    if gzip {
        let gz = GzEncoder::new(writer, Compression::default());
        let mut builder = tar::Builder::new(gz);
        for path in paths {
            append_path(&mut builder, Path::new(path), verbose)?;
        }
        let gz = builder.into_inner()?;
        gz.finish()?;
    } else {
        let mut builder = tar::Builder::new(writer);
        for path in paths {
            append_path(&mut builder, Path::new(path), verbose)?;
        }
        builder.into_inner()?;
    }

    Ok(())
}

fn append_path<W: Write>(
    builder: &mut tar::Builder<W>,
    path: &Path,
    verbose: bool,
) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;

    if meta.is_dir() {
        append_dir(builder, path, verbose)?;
    } else if meta.is_file() {
        if verbose {
            eprintln!("{}", path.display());
        }
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Regular);
        header.set_size(meta.len());
        header.set_mode(0o644);
        header.set_cksum();
        let mut file = File::open(path)?;
        builder.append_data(&mut header, path, &mut file)?;
    } else if meta.file_type().is_symlink() {
        if verbose {
            eprintln!("{}", path.display());
        }
        let target = fs::read_link(path)?;
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header.set_cksum();
        builder.append_link(&mut header, path, &target)?;
    }

    Ok(())
}

fn append_dir<W: Write>(
    builder: &mut tar::Builder<W>,
    dir: &Path,
    verbose: bool,
) -> io::Result<()> {
    if verbose {
        eprintln!("{}/", dir.display());
    }

    let mut header = tar::Header::new_gnu();
    header.set_entry_type(tar::EntryType::Directory);
    header.set_size(0);
    header.set_mode(0o755);
    header.set_cksum();
    builder.append_data(&mut header, dir, io::empty())?;

    let mut entries: Vec<_> = fs::read_dir(dir)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        append_path(builder, &entry.path(), verbose)?;
    }

    Ok(())
}

fn do_extract(
    archive_file: Option<&str>,
    gzip: bool,
    verbose: bool,
    strip_components: usize,
) -> io::Result<()> {
    let reader = open_read(archive_file, gzip)?;
    let mut archive = tar::Archive::new(reader);

    for entry_result in archive.entries()? {
        let mut entry = entry_result?;
        let orig_path = entry.path()?.into_owned();

        let dest = match strip_path_components(&orig_path, strip_components) {
            Some(p) if !p.as_os_str().is_empty() => p,
            _ => continue,
        };

        if verbose {
            eprintln!("{}", orig_path.display());
        }

        match entry.header().entry_type() {
            tar::EntryType::Directory => {
                fs::create_dir_all(&dest)?;
            }
            tar::EntryType::Regular | tar::EntryType::GNUSparse => {
                if let Some(parent) = dest.parent() {
                    if !parent.as_os_str().is_empty() {
                        fs::create_dir_all(parent)?;
                    }
                }
                let mut file = File::create(&dest)?;
                io::copy(&mut entry, &mut file)?;
            }
            tar::EntryType::Symlink => {
                if let Some(target) = entry.link_name()? {
                    if let Some(parent) = dest.parent() {
                        if !parent.as_os_str().is_empty() {
                            fs::create_dir_all(parent)?;
                        }
                    }
                    #[allow(deprecated)]
                    let _ = std::fs::soft_link(target.as_ref(), &dest);
                }
            }
            _ => {
                // Skip hard links, char/block devices, etc.
            }
        }
    }

    Ok(())
}

fn do_list(
    archive_file: Option<&str>,
    gzip: bool,
    verbose: bool,
) -> io::Result<()> {
    let reader = open_read(archive_file, gzip)?;
    let mut archive = tar::Archive::new(reader);

    for entry_result in archive.entries()? {
        let entry = entry_result?;
        let path = entry.path()?;

        if verbose {
            let h = entry.header();
            let size = h.size().unwrap_or(0);
            let mode = h.mode().unwrap_or(0o644);
            let type_ch = match h.entry_type() {
                tar::EntryType::Directory => 'd',
                tar::EntryType::Symlink => 'l',
                _ => '-',
            };
            println!(
                "{}{} {:>8} {}",
                type_ch,
                format_mode(mode),
                size,
                path.display()
            );
        } else {
            println!("{}", path.display());
        }
    }

    Ok(())
}

fn open_read(archive_file: Option<&str>, gzip: bool) -> io::Result<Box<dyn Read>> {
    let reader: Box<dyn Read> = match archive_file {
        Some("-") | None => Box::new(io::stdin()),
        Some(path) => Box::new(File::open(path)?),
    };
    if gzip {
        Ok(Box::new(GzDecoder::new(reader)))
    } else {
        Ok(reader)
    }
}

fn strip_path_components(path: &Path, n: usize) -> Option<PathBuf> {
    if n == 0 {
        return Some(path.to_path_buf());
    }
    let components: Vec<_> = path.components().collect();
    if components.len() <= n {
        return None;
    }
    Some(components[n..].iter().collect())
}

fn format_mode(mode: u32) -> String {
    let mut s = String::with_capacity(9);
    for &(bit, ch) in &[
        (0o400, 'r'),
        (0o200, 'w'),
        (0o100, 'x'),
        (0o040, 'r'),
        (0o020, 'w'),
        (0o010, 'x'),
        (0o004, 'r'),
        (0o002, 'w'),
        (0o001, 'x'),
    ] {
        s.push(if mode & bit != 0 { ch } else { '-' });
    }
    s
}

fn print_usage() {
    eprintln!("Usage: tar [options] [files...]");
    eprintln!("  -c              create archive");
    eprintln!("  -x              extract archive");
    eprintln!("  -t              list archive contents");
    eprintln!("  -f FILE         archive filename (- for stdin/stdout)");
    eprintln!("  -z              gzip compress/decompress");
    eprintln!("  -v              verbose");
    eprintln!("  -C DIR          change directory");
    eprintln!("  --strip-components=N");
    eprintln!("                  strip N leading components on extract");
}
