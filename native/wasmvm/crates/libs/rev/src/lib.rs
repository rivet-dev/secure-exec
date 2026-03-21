//! rev -- reverse characters in each line (UTF-8 aware)

use std::ffi::OsString;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};

pub fn main(args: Vec<OsString>) -> i32 {
    let filenames: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    let stdout = io::stdout();
    let mut out = stdout.lock();

    if filenames.is_empty() {
        // Read from stdin
        if let Err(e) = process_reader(io::stdin().lock(), &mut out) {
            eprintln!("rev: {}", e);
            return 1;
        }
    } else {
        for filename in &filenames {
            match File::open(filename) {
                Ok(f) => {
                    if let Err(e) = process_reader(BufReader::new(f), &mut out) {
                        eprintln!("rev: {}: {}", filename, e);
                        return 1;
                    }
                }
                Err(e) => {
                    eprintln!("rev: {}: {}", filename, e);
                    return 1;
                }
            }
        }
    }

    0
}

fn process_reader<R: BufRead, W: Write>(reader: R, out: &mut W) -> io::Result<()> {
    for line in reader.lines() {
        let line = line?;
        let reversed: String = line.chars().rev().collect();
        writeln!(out, "{}", reversed)?;
    }
    Ok(())
}
