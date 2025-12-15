# future work

## fs-polyfill
- inline compiled code at build time instead of runtime fs.readFileSync()
- add dedicated test suite for the package
- implement watch(), watchFile(), unwatchFile() (currently no-ops)
- implement proper stream behavior for createReadStream/createWriteStream (backpressure, events)
- improve binary file handling (currently text-based internally)

## Node.js polyfills
- child_process - not available
- net, dgram, http, https - not available (no network in sandbox)
- worker_threads - not available
- crypto - limited polyfill (not full Node.js crypto)

## WASM/bash
- batch commands hang - `bash -c "echo hello"` never returns from instance.wait() in WASI/WASIX bash. interactive mode works fine
- WASM memory limits - memoryLimit is plumbed through but not yet enforced on WASM side

## other
- get claude code cli working in this emulator
- emulate npm
- native addon polyfills - npm packages with native C/C++ bindings won't work in isolated-vm. may need a polyfill registry mapping them to pure-JS alternatives (e.g. esbuild→esbuild-wasm, bcrypt→bcryptjs, sharp→sharp-wasm, sqlite3→sql.js)
- pre-build node-stdlib-browser polyfills - bundle all polyfills at build time instead of on-demand via esbuild, reduces runtime overhead and startup latency
- dynamically add packages from wasmer registry - allow installing WASM packages at runtime via `Wasmer.fromRegistry()` (e.g. python, ruby, ffmpeg)
