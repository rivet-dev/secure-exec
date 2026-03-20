/// Codex CLI for secure-exec WasmVM.
///
/// Uses wasi-spawn for process spawning via host_process FFI, replacing
/// tokio::process::Command which is unavailable on wasm32-wasip1.
///
/// The full implementation depends on codex-exec from the rivet-dev/codex
/// fork (wasi-support branch). When the vendoring blocker is resolved,
/// codex-core will use WasiChild from wasi-spawn for:
///   - spawn_child_async → wasi_spawn::spawn_child
///   - consume_output → WasiChild::consume_output
///   - process kill → WasiChild::kill
///
/// Currently demonstrates spawn capability as a validation tool.
fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("codex: WASI runtime support is under development");
        eprintln!("  fork: github.com/rivet-dev/codex (branch: wasi-support)");
        eprintln!("  usage: codex <command> [args...]");
        eprintln!("  spawns a child process via host_process FFI");
        std::process::exit(1);
    }

    // Build argv for child: command + args
    let child_argv: Vec<&str> = args[1..].iter().map(|s| s.as_str()).collect();

    let mut child = match wasi_spawn::spawn_child(&child_argv, &[], "/") {
        Ok(c) => c,
        Err(e) => {
            eprintln!("codex: spawn failed: {}", e);
            std::process::exit(127);
        }
    };

    match child.consume_output() {
        Ok(output) => {
            use std::io::Write;
            let _ = std::io::stdout().write_all(&output.stdout);
            let _ = std::io::stderr().write_all(&output.stderr);
            std::process::exit(output.exit_code);
        }
        Err(e) => {
            eprintln!("codex: output error: {}", e);
            std::process::exit(1);
        }
    }
}
