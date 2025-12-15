# lightweight sandbox

## overview

goal: design an emulated linux machine using WebAssembly.sh for Linux emulation and isolated-vm for the node emulation. thses are both bound to the same core "virtual machine" for filesystem & network & etc. this allows for emulating a linux environment without sacrificing performance (mostly, polyfills have some overhead) on the NodeJS app since it's in an isoalte.

the closest prior art is WebContainers, OpenWebContainers, and Nodebox. however, these all use web or WASM.

## project structure

- use typescript
- keep all in a single package in src/
- add a script check-types to check that types are working
- use vitest to test your work

loosely follow this structure, keep things simple:

```
src/
    vm/
        index.ts  # class VirtualMachine
        fs.ts  # class FileSystemManager
        ...etc...
    node-process/
        index.ts  # class NodeProcess (using isolated-vm)
        ...etc...
    wasix/
        index.ts  # class Wasix
        node-shim.ts  # handles shim between wasix <-> node-process (using isolated-vm)
    ...etc...
```

the end user api looks like:

```
const vm = new VirtualMachine("/path/to/local/fs");
const output = await vm.spawn("ls", ["/"]);
console.log('output', output.stdout, output.stderr, output.code)
```

by the end of this project, we should be able to do:

```
const shCode = `
#!/bin/sh
node script.js
`;

const jsCode = `
const fs = require("fs");
const path = require("path");

// test ms package (simple, no deps)
const ms = require("ms");
console.log("1 hour in ms:", ms("1h"));

// test jsonfile package (uses fs internally)
const jsonfile = require("jsonfile");
const testFile = "/test.json";
jsonfile.writeFileSync(testFile, { hello: "world" });

// read back using native fs to verify
const raw = fs.readFileSync(testFile, "utf8");
console.log("read back:", JSON.parse(raw));
`;

const vm = new VirtualMachine("/path/to/local/fs");

// write scripts to the vm filesystem
await vm.writeFile("/test.sh", shCode);
await vm.writeFile("/script.js", jsCode);

// run the shell script (assumes npm install jsonfile ms was run on host)
const output = await vm.spawn("sh", ["/test.sh"]);
console.log('output', output.stdout, output.stderr, output.code)
```

## components

### virtual machine

this vm will be bound to BOTH the node shim. we only care about the file system for now, nothing else.

### node shim

runs Node.js code in an isolated-vm isolate. provides polyfilled node stdlib (fs, path, etc) and supports requiring packages from node_modules.

### wasix vm

uses WebAssembly.sh to emulate a Linux shell environment. provides shell commands (ls, cd, etc) and hooks into the node shim when running `node` commands.

## steps

1. implement a basic virtual machine with a fake file system. expose methods on this that forwards to a dedicated folder for this vm. keep this simple and add as needed.
2. get basic isolates & bindings working using isolated-vm
3. impl nodejs require with polyfill for node stdlib
    - impl basic test suite for this
4. get basic wasix shell working
5. get wasix file system bindings working (test ls, cd, etc)
6. implement package imports using the code in node_modules
    - try to import & use a simple package (TBD what we should test)
7. auto-install `node` program in wasix/webassembly.sh to kick out to the nodejs shim that will spawn the isolate

## future work

- terminal emulation
- get claude code cli working in this emulator
- emulate npm
- use node_modules instead of pulling packages from cdn

