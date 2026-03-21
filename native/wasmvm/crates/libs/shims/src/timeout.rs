//! Shim implementation of the `timeout` command.
//!
//! Spawns a child process and kills it if it exceeds the timeout duration.
//! Uses std::process::Command (which delegates to wasi-ext proc_spawn)
//! with try_wait() for non-blocking wait and kill() for termination.
//!
//! Usage:
//!   timeout DURATION COMMAND [ARG]...
//!
//! DURATION is in seconds (fractional allowed, e.g. 0.5).
//! Exit codes:
//!   124 - command timed out
//!   125 - timeout itself failed
//!   126 - command found but not executable
//!   127 - command not found

use std::ffi::OsString;

pub fn timeout(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1) // skip argv[0] ("timeout")
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    if str_args.is_empty() {
        eprintln!("timeout: missing operand");
        return 125;
    }

    if str_args.len() < 2 {
        eprintln!("timeout: missing operand after '{}'", str_args[0]);
        return 125;
    }

    let duration_secs: f64 = match str_args[0].parse() {
        Ok(d) if d >= 0.0 => d,
        _ => {
            eprintln!("timeout: invalid time interval '{}'", str_args[0]);
            return 125;
        }
    };

    let program = &str_args[1];
    let child_args = &str_args[2..];

    let mut child = match std::process::Command::new(program)
        .args(child_args)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("timeout: failed to run command '{}': {}", program, e);
            return 127;
        }
    };

    let start = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs_f64(duration_secs);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // Child exited on its own
                return status.code().unwrap_or(1);
            }
            Ok(None) => {
                // Still running — check timeout
                if start.elapsed() >= timeout_duration {
                    // Timeout exceeded — kill the child
                    let _ = child.kill();
                    let _ = child.wait(); // reap
                    return 124;
                }
                // Yield briefly to avoid pure busy-wait
                // (In WASI Phase 1, sleep returns immediately but
                // Instant::now() still tracks real wall-clock time)
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
            Err(e) => {
                eprintln!("timeout: error waiting for command: {}", e);
                return 125;
            }
        }
    }
}
