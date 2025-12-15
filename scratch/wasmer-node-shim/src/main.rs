use std::env;
use std::fs;
use std::thread;
use std::time::Duration;

const IPC_DIR: &str = "/ipc";
const REQUEST_FILE: &str = "/ipc/request.txt";
const RESPONSE_FILE: &str = "/ipc/response.txt";
const SCRIPT_FILE: &str = "/ipc/script.js";
const MAX_POLLS: u32 = 500;
const POLL_INTERVAL_MS: u64 = 20;

fn main() {
    let args: Vec<String> = env::args().collect();

    eprintln!("[wasmer-node-shim] Starting with args: {:?}", &args[1..]);

    // Create IPC directory if it doesn't exist
    let _ = fs::create_dir_all(IPC_DIR);

    // Clean up any old files
    let _ = fs::remove_file(RESPONSE_FILE);
    let _ = fs::remove_file(SCRIPT_FILE);

    // Parse arguments
    let mut request_lines: Vec<String> = Vec::new();
    let mut i = 1;

    while i < args.len() {
        let arg = &args[i];

        if arg == "-e" || arg == "--eval" {
            // Inline code: -e "code"
            if i + 1 < args.len() {
                request_lines.push("-e".to_string());
                request_lines.push(args[i + 1].clone());
                i += 2;
            } else {
                eprintln!("[wasmer-node-shim] -e requires an argument");
                std::process::exit(1);
            }
        } else if !arg.starts_with("-") {
            // Script file path - read and copy to /ipc/script.js
            let script_path = arg;
            match fs::read_to_string(script_path) {
                Ok(content) => {
                    eprintln!("[wasmer-node-shim] Read script from {}", script_path);
                    // Write script content to /ipc/script.js (syncs to JS!)
                    if let Err(e) = fs::write(SCRIPT_FILE, &content) {
                        eprintln!("[wasmer-node-shim] Failed to write script to IPC: {}", e);
                        std::process::exit(1);
                    }
                    // Tell JS to read from /ipc/script.js
                    request_lines.push("--ipc-script".to_string());
                }
                Err(e) => {
                    eprintln!("[wasmer-node-shim] Cannot read '{}': {}", script_path, e);
                    std::process::exit(1);
                }
            }
            i += 1;
        } else {
            // Other flag, pass through
            request_lines.push(arg.clone());
            i += 1;
        }
    }

    if request_lines.is_empty() {
        eprintln!("[wasmer-node-shim] No code or script provided");
        std::process::exit(1);
    }

    // Write request
    let request_content = request_lines.join("\n") + "\n";
    eprintln!("[wasmer-node-shim] Writing request to {}", REQUEST_FILE);

    if let Err(e) = fs::write(REQUEST_FILE, &request_content) {
        eprintln!("[wasmer-node-shim] Failed to write request: {}", e);
        std::process::exit(1);
    }
    eprintln!("[wasmer-node-shim] Request written, polling for response...");

    // Poll for response
    let mut polls = 0;
    loop {
        polls += 1;

        if polls > MAX_POLLS {
            eprintln!("[wasmer-node-shim] Timeout waiting for response after {} polls", MAX_POLLS);
            std::process::exit(124);
        }

        match fs::read_to_string(RESPONSE_FILE) {
            Ok(content) => {
                eprintln!("[wasmer-node-shim] Got response after {} polls", polls);

                let mut lines = content.lines();
                let exit_code: i32 = lines
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1);

                let stdout: String = lines.collect::<Vec<_>>().join("\n");

                if !stdout.is_empty() {
                    println!("{}", stdout);
                }

                // Clean up
                let _ = fs::remove_file(REQUEST_FILE);
                let _ = fs::remove_file(RESPONSE_FILE);
                let _ = fs::remove_file(SCRIPT_FILE);

                std::process::exit(exit_code);
            }
            Err(_) => {
                thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
            }
        }
    }
}
