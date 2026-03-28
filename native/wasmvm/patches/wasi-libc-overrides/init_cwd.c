/**
 * Initialize process cwd from PWD environment variable.
 *
 * WASI processes start with __wasilibc_cwd = "/" (from preopened directory
 * scanning). The kernel sets PWD in each spawned process's environment to
 * match the intended cwd. This constructor reads PWD and calls chdir()
 * to synchronize wasi-libc's internal cwd state with the kernel's.
 *
 * Installed into the patched sysroot so ALL WASM programs get correct
 * initial cwd, not just test binaries.
 */

#include <stdlib.h>
#include <unistd.h>

__attribute__((constructor, used))
static void __init_cwd_from_pwd(void) {
    const char *pwd = getenv("PWD");
    if (pwd && pwd[0] == '/') {
        chdir(pwd);
    }
}
