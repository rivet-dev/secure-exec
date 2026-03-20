# wasmvm/c/Makefile — Build C programs to standalone WASM binaries
#
# Targets:
#   wasi-sdk    Download and cache wasi-sdk toolchain
#   programs    Compile all .c files in programs/ to WASM binaries
#   sysroot     Build patched wasi-libc sysroot (invokes patch-wasi-libc.sh)
#   install     Copy opted-in real commands to COMMANDS_DIR
#   native      Compile all .c files to native binaries (for parity testing)
#   clean       Remove build output
#
# The vanilla (unpatched) wasi-sdk sysroot is used by default.
# After US-025 adds patch-wasi-libc.sh, `make sysroot` builds a patched one.

# wasi-sdk version and platform detection
WASI_SDK_VERSION := 25
WASI_SDK_MAJOR   := 25.0

UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_S),Linux)
  WASI_SDK_PLATFORM := linux
else ifeq ($(UNAME_S),Darwin)
  WASI_SDK_PLATFORM := macos
else
  WASI_SDK_PLATFORM := linux
endif

ifeq ($(UNAME_M),arm64)
  WASI_SDK_ARCH := arm64
else ifeq ($(UNAME_M),aarch64)
  WASI_SDK_ARCH := arm64
else
  WASI_SDK_ARCH := x86_64
endif

WASI_SDK_TARBALL := wasi-sdk-$(WASI_SDK_MAJOR)-$(WASI_SDK_ARCH)-$(WASI_SDK_PLATFORM).tar.gz
WASI_SDK_URL     := https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$(WASI_SDK_VERSION)/$(WASI_SDK_TARBALL)

# Directories
VENDOR_DIR   := vendor
WASI_SDK_DIR := $(VENDOR_DIR)/wasi-sdk
BUILD_DIR    := build
NATIVE_DIR   := build/native

# Toolchain
CC           := $(WASI_SDK_DIR)/bin/clang
NATIVE_CC    := $(shell command -v cc 2>/dev/null || command -v gcc 2>/dev/null || command -v clang 2>/dev/null)

# Sysroot: use patched sysroot if built, otherwise use wasi-sdk's vanilla sysroot
PATCHED_SYSROOT := sysroot
ifeq ($(wildcard $(PATCHED_SYSROOT)/lib/wasm32-wasi/libc.a),)
  SYSROOT := $(WASI_SDK_DIR)/share/wasi-sysroot
else
  SYSROOT := $(PATCHED_SYSROOT)
endif

# Compile flags
WASM_CFLAGS  := --target=wasm32-wasip1 --sysroot=$(SYSROOT) -O2 -flto
NATIVE_CFLAGS := -O0 -g

# COMMANDS_DIR for install target (configurable, matches Rust binary output)
COMMANDS_DIR ?= ../target/wasm32-wasip1/release/commands

# Real commands to install (initially empty — add command names as they are opted in)
COMMANDS :=

# Programs requiring patched sysroot (Tier 2+ custom host imports)
PATCHED_PROGRAMS := isatty_test getpid_test getppid_test getppid_verify userinfo pipe_test dup_test spawn_child spawn_exit_code pipeline kill_child waitpid_return syscall_coverage getpwuid_test signal_tests

# Discover all .c source files in programs/
ALL_SOURCES := $(wildcard programs/*.c)

# Exclude patched-sysroot programs when only vanilla sysroot is available
ifeq ($(wildcard $(PATCHED_SYSROOT)/lib/wasm32-wasi/libc.a),)
  EXCLUDED := $(addsuffix .c,$(addprefix programs/,$(PATCHED_PROGRAMS)))
  SOURCES := $(filter-out $(EXCLUDED),$(ALL_SOURCES))
else
  SOURCES := $(ALL_SOURCES)
endif

# Program names (without .c extension)
PROG_NAMES := $(basename $(notdir $(SOURCES)))

# Default WASM output targets
WASM_OUTPUTS := $(addprefix $(BUILD_DIR)/,$(PROG_NAMES))
# Native output targets
NATIVE_OUTPUTS := $(addprefix $(NATIVE_DIR)/,$(PROG_NAMES))

.PHONY: all wasi-sdk programs sysroot install native clean wasm-opt-check

all: programs

# --- wasi-sdk download and cache ---

wasi-sdk: $(WASI_SDK_DIR)/bin/clang

$(WASI_SDK_DIR)/bin/clang:
	@echo "=== Downloading wasi-sdk $(WASI_SDK_MAJOR) ==="
	@mkdir -p $(VENDOR_DIR)
	@if command -v curl >/dev/null 2>&1; then \
		curl -fSL "$(WASI_SDK_URL)" -o "$(VENDOR_DIR)/$(WASI_SDK_TARBALL)"; \
	elif command -v wget >/dev/null 2>&1; then \
		wget -q "$(WASI_SDK_URL)" -O "$(VENDOR_DIR)/$(WASI_SDK_TARBALL)"; \
	else \
		echo "Error: neither curl nor wget found"; exit 1; \
	fi
	@echo "Extracting..."
	@tar -xzf "$(VENDOR_DIR)/$(WASI_SDK_TARBALL)" -C "$(VENDOR_DIR)"
	@mv "$(VENDOR_DIR)/wasi-sdk-$(WASI_SDK_MAJOR)-$(WASI_SDK_ARCH)-$(WASI_SDK_PLATFORM)" "$(WASI_SDK_DIR)"
	@rm -f "$(VENDOR_DIR)/$(WASI_SDK_TARBALL)"
	@echo "wasi-sdk $(WASI_SDK_MAJOR) installed to $(WASI_SDK_DIR)"

# --- Patched sysroot (delegates to patch-wasi-libc.sh) ---

sysroot: wasi-sdk
	../scripts/patch-wasi-libc.sh

# --- wasm-opt check ---

wasm-opt-check:
	@if ! command -v wasm-opt >/dev/null 2>&1; then \
		echo "Error: wasm-opt (binaryen) is not installed."; \
		echo "Install it via your package manager:"; \
		echo "  apt: sudo apt install binaryen"; \
		echo "  brew: brew install binaryen"; \
		echo "  cargo: cargo install wasm-opt"; \
		exit 1; \
	fi

# --- Compile all C programs to WASM ---

programs: wasi-sdk wasm-opt-check $(WASM_OUTPUTS)
	@echo ""
	@echo "=== C WASM Build Report ==="
	@echo "Programs: $(words $(PROG_NAMES)) compiled"
	@echo "Sysroot:  $(SYSROOT)"
	@echo "Output:   $(BUILD_DIR)/"
	@echo "=== Build complete ==="

# Default rule: single-file programs
$(BUILD_DIR)/%: programs/%.c $(WASI_SDK_DIR)/bin/clang
	@mkdir -p $(BUILD_DIR)
	$(CC) $(WASM_CFLAGS) -o $@.wasm $<
	wasm-opt -O3 --strip-debug $@.wasm -o $@
	@rm -f $@.wasm

# --- Per-program override rules for multi-file compilation ---
# Add overrides here for programs that link vendored libraries.

# json_parse: links cJSON library
$(BUILD_DIR)/json_parse: programs/json_parse.c libs/cjson/cJSON.c $(WASI_SDK_DIR)/bin/clang
	@mkdir -p $(BUILD_DIR)
	$(CC) $(WASM_CFLAGS) -Ilibs/cjson -o $@.wasm programs/json_parse.c libs/cjson/cJSON.c
	wasm-opt -O3 --strip-debug $@.wasm -o $@
	@rm -f $@.wasm

$(NATIVE_DIR)/json_parse: programs/json_parse.c libs/cjson/cJSON.c
	@mkdir -p $(NATIVE_DIR)
	$(NATIVE_CC) $(NATIVE_CFLAGS) -Ilibs/cjson -o $@ programs/json_parse.c libs/cjson/cJSON.c

# sqlite3_mem: links SQLite amalgamation
SQLITE_COMMON  := -DSQLITE_OMIT_WAL -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_THREADSAFE=0 \
                  -DSQLITE_OMIT_LOCALTIME
SQLITE_WASM    := -DSQLITE_OS_OTHER $(SQLITE_COMMON) -lwasi-emulated-signal -lwasi-emulated-mman
SQLITE_NATIVE  := $(SQLITE_COMMON)

$(BUILD_DIR)/sqlite3_mem: programs/sqlite3_mem.c libs/sqlite3/sqlite3.c $(WASI_SDK_DIR)/bin/clang
	@mkdir -p $(BUILD_DIR)
	$(CC) $(WASM_CFLAGS) $(SQLITE_WASM) -Ilibs/sqlite3 -o $@.wasm \
	    programs/sqlite3_mem.c libs/sqlite3/sqlite3.c
	wasm-opt -O3 --strip-debug $@.wasm -o $@
	@rm -f $@.wasm

$(NATIVE_DIR)/sqlite3_mem: programs/sqlite3_mem.c libs/sqlite3/sqlite3.c
	@mkdir -p $(NATIVE_DIR)
	$(NATIVE_CC) $(NATIVE_CFLAGS) $(SQLITE_NATIVE) -Ilibs/sqlite3 -o $@ \
	    programs/sqlite3_mem.c libs/sqlite3/sqlite3.c -lm -lpthread

# --- Compile all C programs to native binaries (for parity testing) ---

native: $(NATIVE_OUTPUTS)
	@echo ""
	@echo "=== Native Build Report ==="
	@echo "Programs: $(words $(PROG_NAMES)) compiled"
	@echo "Output:   $(NATIVE_DIR)/"
	@echo "=== Build complete ==="

$(NATIVE_DIR)/%: programs/%.c
	@mkdir -p $(NATIVE_DIR)
	$(NATIVE_CC) $(NATIVE_CFLAGS) -o $@ $<

# --- Install opted-in commands to COMMANDS_DIR ---

install:
	@if [ -z "$(COMMANDS)" ]; then \
		echo "No C commands opted in for install (COMMANDS is empty)"; \
		exit 0; \
	fi
	@if [ ! -d "$(BUILD_DIR)" ]; then \
		echo "Error: $(BUILD_DIR) not found. Run 'make programs' first."; \
		exit 1; \
	fi
	@mkdir -p $(COMMANDS_DIR)
	@INSTALLED=0; \
	for cmd in $(COMMANDS); do \
		if [ -f "$(BUILD_DIR)/$$cmd" ]; then \
			cp "$(BUILD_DIR)/$$cmd" "$(COMMANDS_DIR)/$$cmd"; \
			INSTALLED=$$((INSTALLED + 1)); \
		else \
			echo "Warning: $(BUILD_DIR)/$$cmd not found — skipping"; \
		fi; \
	done; \
	echo "Installed $$INSTALLED C command(s) to $(COMMANDS_DIR)"

# --- Clean ---

clean:
	rm -rf $(BUILD_DIR)
