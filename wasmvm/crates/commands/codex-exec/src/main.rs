/// Codex headless agent for secure-exec WasmVM.
///
/// This is the non-interactive entry point that takes a prompt on stdin
/// or as a CLI argument and runs the agent loop. Unlike the `codex` TUI
/// binary, codex-exec operates without a terminal UI — suitable for
/// scripting, CI/CD pipelines, and programmatic invocation.
///
/// Uses wasi-spawn for process spawning via host_process FFI and
/// wasi-http for HTTP/HTTPS requests via host_net TCP/TLS imports.

const VERSION: &str = env!("CARGO_PKG_VERSION");

// Validate WASI stub crates compile by referencing key types
use codex_network_proxy::NetworkProxy;
use codex_otel::SessionTelemetry;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Handle --help
    if args.iter().any(|a| a == "--help" || a == "-h") {
        print_help();
        return;
    }

    // Handle --version
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("codex-exec {}", VERSION);
        return;
    }

    // Built-in HTTP test subcommand (validates wasi-http integration)
    if args.get(1).map(|s| s.as_str()) == Some("--http-test") {
        return http_test(&args[2..]);
    }

    // Stub validation subcommand (validates WASI stub crates)
    if args.get(1).map(|s| s.as_str()) == Some("--stub-test") {
        return stub_test();
    }

    // Headless agent mode: read prompt from args or stdin
    let prompt = if args.len() > 1 {
        args[1..].join(" ")
    } else {
        // Read from stdin
        let mut input = String::new();
        match std::io::Read::read_to_string(&mut std::io::stdin(), &mut input) {
            Ok(_) => input.trim().to_string(),
            Err(e) => {
                eprintln!("codex-exec: failed to read stdin: {}", e);
                std::process::exit(1);
            }
        }
    };

    if prompt.is_empty() {
        eprintln!("codex-exec: no prompt provided");
        eprintln!("usage: codex-exec <prompt>  or  echo '<prompt>' | codex-exec");
        std::process::exit(1);
    }

    // Agent loop placeholder — full implementation will use codex-core
    // from rivet-dev/codex fork when the vendoring blocker is resolved.
    eprintln!("codex-exec: headless agent mode is under development");
    eprintln!("prompt: {}", prompt);
    std::process::exit(0);
}

fn print_help() {
    println!("codex-exec {} — headless Codex agent for secure-exec WasmVM", VERSION);
    println!();
    println!("USAGE:");
    println!("    codex-exec [OPTIONS] [PROMPT]");
    println!("    echo '<prompt>' | codex-exec");
    println!();
    println!("OPTIONS:");
    println!("    -h, --help       Print this help message");
    println!("    -V, --version    Print version information");
    println!("    --http-test URL  Test HTTP client via host_net");
    println!("    --stub-test      Validate WASI stub crates");
    println!();
    println!("DESCRIPTION:");
    println!("    Headless (non-TUI) entry point for the Codex agent.");
    println!("    Takes a prompt on stdin or as a CLI argument and");
    println!("    runs the agent loop without a terminal UI.");
}

fn stub_test() {
    let proxy = NetworkProxy;
    let mut env = std::collections::HashMap::new();
    proxy.apply_to_env(&mut env);
    println!("network-proxy: NetworkProxy is zero-size, apply_to_env is no-op");

    let telemetry = SessionTelemetry::new();
    telemetry.counter("test.counter", 1, &[]);
    telemetry.histogram("test.histogram", 42, &[]);
    println!("otel: SessionTelemetry metrics are no-ops");

    let global = codex_otel::metrics::global();
    assert!(global.is_none(), "global metrics should be None on WASI");
    println!("otel: global() returns None (no exporter on WASI)");

    println!("stub-test: all stubs validated successfully");
}

fn http_test(args: &[String]) {
    if args.is_empty() {
        eprintln!("usage: codex-exec --http-test <url>");
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
