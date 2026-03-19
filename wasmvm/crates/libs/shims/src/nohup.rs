//! Shim implementation of the `nohup` command.
//!
//! In WASI, there are no signals, so nohup just runs the command directly.
//!
//! Usage: nohup COMMAND [ARG]...

use std::ffi::OsString;
use std::io::Write;

pub fn nohup(args: Vec<OsString>) -> i32 {
    let str_args: Vec<String> = args
        .iter()
        .skip(1)
        .map(|a| a.to_string_lossy().to_string())
        .collect();

    if str_args.is_empty() {
        eprintln!("nohup: missing operand");
        return 127;
    }

    let program = &str_args[0];
    let child_args = &str_args[1..];

    match std::process::Command::new(program)
        .args(child_args)
        .output()
    {
        Ok(output) => {
            let _ = std::io::stdout().write_all(&output.stdout);
            let _ = std::io::stderr().write_all(&output.stderr);
            output.status.code().unwrap_or(1)
        }
        Err(e) => {
            eprintln!("nohup: failed to run command '{}': {}", program, e);
            127
        }
    }
}
