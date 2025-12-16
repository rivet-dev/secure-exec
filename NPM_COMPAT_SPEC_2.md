# NPM Compatibility Spec Phase 2: Running npm CLI

## Goal
Run actual npm commands inside the nanosandbox, working up from simple to complex.

## Test Plan (in order of difficulty)

### 1. `npm --version`
- **Tests**: Pure output, minimal dependencies
- **Expected**: Prints npm version string

### 2. `npm config list`
- **Tests**: Reads environment/config
- **Expected**: Shows npm configuration

### 3. `npm ls`
- **Tests**: Lists packages, reads package.json
- **Expected**: Shows empty or package tree

### 4. `npm init -y`
- **Tests**: Creates package.json, fs writes
- **Expected**: Generates package.json in cwd

### 5. `npm ping`
- **Tests**: Simplest network call, pings registry
- **Expected**: "Ping success" or similar

### 6. `npm view <package>`
- **Tests**: Fetches package metadata from registry
- **Expected**: Shows package info (name, version, description)

### 7. `npm pack`
- **Tests**: Creates tarball, more fs operations
- **Expected**: Creates .tgz file

### 8. `npm install <local.tgz>`
- **Tests**: Offline install from local tarball
- **Expected**: Installs package to node_modules

### 9. `npm install`
- **Tests**: Full network install with registry
- **Expected**: Resolves and installs all dependencies

## Prerequisites
- Copy npm package files into virtual filesystem
- Set up proper PATH and environment variables
- Ensure child_process.spawn works for npm's subprocesses
