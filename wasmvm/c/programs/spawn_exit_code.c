/* spawn_exit_code.c -- spawn child that exits non-zero, verify exit code */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#ifdef __wasi__
typedef struct { int __pad0[2]; void *__actions; int __pad[16]; } posix_spawn_file_actions_t;
typedef struct { int __dummy; } posix_spawnattr_t;
int posix_spawnp(pid_t *restrict, const char *restrict,
    const posix_spawn_file_actions_t *,
    const posix_spawnattr_t *restrict,
    char *const[restrict], char *const[restrict]);
pid_t waitpid(pid_t, int *, int);
#define WEXITSTATUS(s) (((s) & 0xff00) >> 8)
#define WIFEXITED(s)   (!((s) & 0x7f))
#else
#include <spawn.h>
#include <sys/wait.h>
#endif

extern char **environ;

int main(void) {
    /* Spawn: sh -c 'exit 7' */
    char *argv[] = {"sh", "-c", "exit 7", NULL};
    pid_t child;
    int err = posix_spawnp(&child, "sh", NULL, NULL, argv, environ);
    if (err != 0) {
        fprintf(stderr, "posix_spawn failed: %d\n", err);
        return 1;
    }

    int status;
    waitpid(child, &status, 0);

    int exited = WIFEXITED(status);
    int code = exited ? WEXITSTATUS(status) : -1;

    printf("child_exited: %s\n", exited ? "yes" : "no");
    printf("child_exit_code: %d\n", code);
    printf("expected: 7\n");
    printf("match: %s\n", (exited && code == 7) ? "yes" : "no");

    return 0;
}
