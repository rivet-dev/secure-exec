/// Codex CLI for secure-exec WasmVM.
///
/// This is the WASI build skeleton for the OpenAI Codex agent. The full
/// implementation depends on codex-exec from the rivet-dev/codex fork
/// (wasi-support branch), which has cfg(target_os = "wasi") gates on
/// platform-specific subsystems:
///
/// - portable-pty (codex-utils-pty)
/// - codex-network-proxy
/// - codex-linux-sandbox / codex-windows-sandbox
/// - tokio process/signal/rt-multi-thread
///
/// Subsequent stories (US-100 through US-108) will progressively replace
/// these gated subsystems with host_process WASI FFI implementations,
/// enabling codex to spawn processes, manage PTYs, handle stdin/stdout,
/// and make HTTP requests within the WASI sandbox.
fn main() {
    eprintln!("codex: WASI runtime support is under development");
    eprintln!("  fork: github.com/rivet-dev/codex (branch: wasi-support)");
    eprintln!("  see US-100..US-108 for implementation roadmap");
    std::process::exit(1);
}
