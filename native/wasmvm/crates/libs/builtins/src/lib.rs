//! Built-in implementations of commands that don't have
//! practical uutils replacements for wasm32-wasip1.
//!
//! - sleep: uses host_process.sleep_ms (Atomics.wait on host side)
//! - test/[: conditional expressions (uu_test has 17 unix errors)
//! - whoami: reads USER/LOGNAME env vars (uu_whoami needs unix)
//! - spawn-test: internal subprocess lifecycle test

use std::ffi::OsString;
use std::io::{self, Write};

/// Sleep: pause for N seconds via host_process.sleep_ms callback.
/// Uses Atomics.wait on the host side — no busy-waiting.
pub fn sleep(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    if str_args.is_empty() {
        eprintln!("sleep: missing operand");
        return 1;
    }

    let secs: f64 = match str_args[0].parse() {
        Ok(s) if s >= 0.0 => s,
        _ => {
            eprintln!("sleep: invalid time interval '{}'", str_args[0]);
            return 1;
        }
    };

    let millis = (secs * 1000.0) as u32;
    if let Err(_) = wasi_ext::host_sleep_ms(millis) {
        // Fallback to busy-wait if host doesn't support sleep_ms
        let start = std::time::Instant::now();
        let duration = std::time::Duration::from_secs_f64(secs);
        while start.elapsed() < duration {
            std::thread::yield_now();
        }
    }

    0
}

/// spawn-test: spawns a child process via std::process::Command and
/// prints its stdout. Used to verify subprocess lifecycle integration.
///
/// Usage: spawn-test <command> [args...]
/// Default: spawn-test echo hello
pub fn spawn_test(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    let program = str_args.first().map(|s| s.as_str()).unwrap_or("echo");
    let child_args: Vec<&str> = str_args.iter().skip(1).map(|s| s.as_str()).collect();

    let output = match std::process::Command::new(program)
        .args(&child_args)
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            eprintln!("spawn-test: failed to spawn '{}': {}", program, e);
            return 1;
        }
    };

    // Print child's stdout/stderr to our stdout/stderr
    let _ = io::stdout().write_all(&output.stdout);
    let _ = io::stderr().write_all(&output.stderr);

    output.status.code().unwrap_or(1)
}

/// Minimal test / [ command: evaluate conditional expressions.
/// Dispatches on argv[0] basename for standalone binary usage.
pub fn test_cmd(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    // Remove trailing ']' if invoked as '['
    let args: Vec<&str> = if !str_args.is_empty() && str_args.last().map(|s| s.as_str()) == Some("]") {
        str_args[..str_args.len() - 1].iter().map(|s| s.as_str()).collect()
    } else {
        str_args.iter().map(|s| s.as_str()).collect()
    };

    if args.is_empty() {
        return 1; // empty test is false
    }

    let result = eval_test(&args);
    if result { 0 } else { 1 }
}

fn eval_test(args: &[&str]) -> bool {
    match args.len() {
        0 => false,
        1 => !args[0].is_empty(),
        2 => match args[0] {
            "-n" => !args[1].is_empty(),
            "-z" => args[1].is_empty(),
            "-f" => std::fs::metadata(args[1]).map(|m| m.is_file()).unwrap_or(false),
            "-d" => std::fs::metadata(args[1]).map(|m| m.is_dir()).unwrap_or(false),
            "-e" => std::fs::metadata(args[1]).is_ok(),
            "-s" => std::fs::metadata(args[1]).map(|m| m.len() > 0).unwrap_or(false),
            "-r" | "-w" | "-x" => std::fs::metadata(args[1]).is_ok(), // simplified
            "!" => !eval_test(&args[1..]),
            _ => !args[0].is_empty(),
        },
        3 => match args[1] {
            "=" | "==" => args[0] == args[2],
            "!=" => args[0] != args[2],
            "-eq" => args[0].parse::<i64>().ok() == args[2].parse::<i64>().ok(),
            "-ne" => args[0].parse::<i64>().ok() != args[2].parse::<i64>().ok(),
            "-lt" => args[0].parse::<i64>().unwrap_or(0) < args[2].parse::<i64>().unwrap_or(0),
            "-le" => args[0].parse::<i64>().unwrap_or(0) <= args[2].parse::<i64>().unwrap_or(0),
            "-gt" => args[0].parse::<i64>().unwrap_or(0) > args[2].parse::<i64>().unwrap_or(0),
            "-ge" => args[0].parse::<i64>().unwrap_or(0) >= args[2].parse::<i64>().unwrap_or(0),
            "-nt" => false, // simplified: newer-than not supported
            "-ot" => false, // simplified: older-than not supported
            _ => false,
        },
        _ => {
            // Handle ! expr
            if args[0] == "!" {
                return !eval_test(&args[1..]);
            }
            // Handle compound expressions with -a and -o
            for (i, arg) in args.iter().enumerate() {
                if *arg == "-a" {
                    return eval_test(&args[..i]) && eval_test(&args[i + 1..]);
                }
            }
            for (i, arg) in args.iter().enumerate() {
                if *arg == "-o" {
                    return eval_test(&args[..i]) || eval_test(&args[i + 1..]);
                }
            }
            false
        }
    }
}

/// Minimal whoami: print the current user name.
pub fn whoami(_args: Vec<OsString>) -> i32 {
    // Try USER env var first, fall back to LOGNAME, then "user"
    let name = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "user".to_string());
    println!("{}", name);
    0
}
