/// Codex CLI for secure-exec WasmVM.
///
/// Uses wasi-spawn for process spawning via host_process FFI, replacing
/// tokio::process::Command which is unavailable on wasm32-wasip1.
///
/// Uses wasi-http for HTTP/HTTPS requests via host_net TCP/TLS imports,
/// replacing reqwest which has no wasip1 target. The wasi-http client
/// supports GET, POST with JSON body, streaming SSE responses, and custom
/// headers — sufficient for OpenAI API communication. TLS certificate
/// verification is handled by the host runtime (Node.js tls.connect with
/// system CA certificates).
///
/// The full implementation depends on codex-exec from the rivet-dev/codex
/// fork (wasi-support branch). When the vendoring blocker is resolved,
/// codex-core will use:
///   - wasi_spawn::spawn_child for process spawning
///   - wasi_http::HttpClient for API requests (replacing reqwest)
///   - wasi_http::SseReader for streaming SSE responses
///
/// Currently demonstrates spawn + HTTP capability as a validation tool.
fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("codex: WASI runtime support is under development");
        eprintln!("  fork: github.com/rivet-dev/codex (branch: wasi-support)");
        eprintln!("  usage: codex <command> [args...]");
        eprintln!("  spawns a child process via host_process FFI");
        eprintln!("  makes HTTP requests via host_net TCP/TLS");
        std::process::exit(1);
    }

    // Built-in HTTP test subcommand (validates wasi-http integration)
    if args[1] == "--http-test" {
        return http_test(&args[2..]);
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

/// Built-in HTTP test: validates wasi-http works through host_net.
fn http_test(args: &[String]) {
    if args.is_empty() {
        eprintln!("usage: codex --http-test <url>");
        std::process::exit(1);
    }

    let url = &args[0];
    match wasi_http::get(url) {
        Ok(resp) => {
            println!("status: {}", resp.status);
            match resp.text() {
                Ok(body) => println!("body: {}", body),
                Err(e) => eprintln!("body decode error: {}", e),
            }
        }
        Err(e) => {
            eprintln!("http error: {}", e);
            std::process::exit(1);
        }
    }
}
