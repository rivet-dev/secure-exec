i need to impl a test suite of common tools using the virtual machine. add a folder at ecosystem-tests/ that has a vitest test for each of these cli tools:

- npm (should not need to be installed, since it should be auto-provided by the virtual machien)
    - use all existing tests
    - also test `nmp install -g` and make sure the binaries are added to $PATH
- npx
- yarn
- pnpm
- tsc
- gh (the gh cli)
- @anthropic-ai/claude-code
- rivet

implement these tests. fix errors specific to npm, do not fix errors for others. report back with the reuslts.
