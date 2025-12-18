# future work

## short term

- impl process.cwd & integration with subprocesses
- get npm working in terminal
- remove use of runCommand, make it all run with ipc
- clean up polyfills to get compiled in bridge
- check if there is an issue running multiple wasix instances in the same machine

## fs-polyfill
- inline compiled code at build time instead of runtime fs.readFileSync()
- add dedicated test suite for the package
- implement watch(), watchFile(), unwatchFile() (currently throws "not implemented")
- implement proper stream behavior for createReadStream/createWriteStream (backpressure, events)
- implement fs.compose() (currently throws "not implemented")
- improve binary file handling (currently text-based internally)

## Node.js polyfills
- worker_threads - not available
- crypto.subtle (Web Crypto API) - requires native crypto, not available in isolated-vm
- module.SourceMap - source map parsing not implemented (currently throws "not implemented")
- child_process streams - stdin/stdout/stderr are simplified stubs (buffer everything, emit on completion)
- read Node.js API docs (https://nodejs.org/api/all.json) and write a script to verify import/exports match official Node.js modules (could use TypeScript types)

## Intentionally not implemented (sandbox security)
- child_process.fork - IPC between processes not supported
- http.createServer / https.createServer - no server mode in sandbox
- process.dlopen - dynamic loading not supported
- .node native extensions - native modules not supported

## WASM/bash
- batch commands hang - `bash -c "echo hello"` never returns from instance.wait() in WASI/WASIX bash. interactive mode works fine
- WASM memory limits - memoryLimit is plumbed through but not yet enforced on WASM side
- wasmer-js Directory.writeFile missing truncate(true) - overwriting a file with shorter content leaves old bytes at the end. Bug is in wasmer-js src/fs/directory.rs: open_options uses .write(true).create(true) but not .truncate(true). Workaround: delete file before writing. See virtual-filesystem.ts

## other
- get claude code cli working in this emulator
- emulate npm
- native addon polyfills - npm packages with native C/C++ bindings won't work in isolated-vm. may need a polyfill registry mapping them to pure-JS alternatives (e.g. esbuild→esbuild-wasm, bcrypt→bcryptjs, sharp→sharp-wasm, sqlite3→sql.js)
- pre-build node-stdlib-browser polyfills - bundle all polyfills at build time instead of on-demand via esbuild, reduces runtime overhead and startup latency
- dynamically add packages from wasmer registry - allow installing WASM packages at runtime via `Wasmer.fromRegistry()` (e.g. python, ruby, ffmpeg)
- set nano as $EDITOR
- improve default shell/bashrc
- switch to zsh instead of bash
- replace use of wasmer sdk with direct use of wasmer rust lib so we can:
     - have better fs interop
     - write to host fs
- replace isolated-vm with our own rust implementation that's integrated with WASIX
- why does chmod not work
- integrate pino
- snapshots/live migration

## better isolation

- share the same virtual network/io/fs between js and wasm
