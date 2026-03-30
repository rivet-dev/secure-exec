# Glossary

- **Isolate** — a V8 isolate (Node/Bun) or Web Worker (browser). The unit of code execution and memory isolation. Each execution gets its own isolate.
- **Runtime** — the full `secure-exec` execution environment including the isolate, bridge, and resource controls. `NodeRuntime` and `PythonRuntime` are the public entry points.
- **Bridge** — the narrow layer between the isolate and the host that mediates all privileged operations. Untrusted code can only reach host capabilities through the bridge.
- **SystemDriver** — config object that bundles what the isolate can access (filesystem, network, command executor, permissions). Deny-by-default. Built by `createNodeDriver()` or `createBrowserDriver()`.
- **Execution Driver** — host-side engine that owns the isolate lifecycle. `NodeExecutionDriver` (V8 isolate), `BrowserRuntimeDriver` (Web Worker), `PyodideRuntimeDriver` (Pyodide in a Node worker).
