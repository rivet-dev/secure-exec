/* getpid_test.c — print PID (must NOT be hardcoded 42 in WASM) */
#include <stdio.h>
#include <unistd.h>

int main(void) {
    pid_t pid = getpid();
    printf("pid=%d\n", pid);
    /* Vanilla wasi-libc returns hardcoded 42; patched returns real PID */
    printf("pid_positive=%s\n", pid > 0 ? "yes" : "no");
    printf("pid_not_42=%s\n", pid != 42 ? "yes" : "no");
    return 0;
}
