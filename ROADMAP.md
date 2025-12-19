## tools

- expose syscalls for spawning commands from node (since command.create doesn't work)
- clean up compression base64 hacks for network requests to gzipped data
- move node-standbox to a separate package: sandboxed-node
- add comprenesive per-package tests
- update network adapter to implement ndoe lib
- update bridge to include the node-stdlib-polyfills lib too
    - need to understand how tf this works
- pre-install npm
- npm i -g
    - so pnpm works
- prompt about major missing pieces (specifically in node binding)
- get cc working
- get npm working
- get gh cli working
- get tsc working
- get nextjs working
- split out node sandbox in to its own package
- clean up polyfills
- misc tools
    - curl
        ```
        ⏺ No environment variable for --ca-native specifically, but curl supports a config file. You could:

          # Create a .curlrc config file
          echo "ca-native" > ~/.curlrc

          # Then run with home directory mapped
          wasmer run curl/curl --mapdir=/home:/Users/nathan -- https://example.com

          But that requires mapping. A simpler approach is a shell alias:

          # Add to ~/.zshrc or ~/.bashrc
          alias wcurl='wasmer run curl/curl -- --ca-native'

          # Then use
          wcurl https://example.com

          Or wrap it in a script at ~/bin/wcurl:

          #!/bin/bash
          wasmer run curl/curl -- --ca-native "$@"

          There's no CURL_CA_NATIVE=1 env var - the --ca-native flag was only added in curl 8.2.0 and doesn't have an environment variable equivalent.

        ```
    - grep
    - sed
    - etc


## compiled tools

- git

## experimentation

- x86 -> v86
- llm directory of compiled tools

## security

- isolate all bridged code in to single location for sensitive code
- determine network properties
- determine resource exhausting edge cases (ie allocating resources on the host)
    - set timeout
    - network requests
- plan out security model (compare to cf workers)

## projects

- wasm-llm-migrator
- node-sandbox
- nanosandbox
- nanosandbox-actor
- nanosandbox-mcp

