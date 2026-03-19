/* kill_child.c -- spawn long-running child, kill it, verify it terminated */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <time.h>

#ifdef __wasi__
typedef struct { int __pad0[2]; void *__actions; int __pad[16]; } posix_spawn_file_actions_t;
typedef struct { int __dummy; } posix_spawnattr_t;
int posix_spawnp(pid_t *restrict, const char *restrict,
    const posix_spawn_file_actions_t *,
    const posix_spawnattr_t *restrict,
    char *const[restrict], char *const[restrict]);
pid_t waitpid(pid_t, int *, int);
int kill(pid_t, int);
#define SIGTERM 15
#else
#include <spawn.h>
#include <sys/wait.h>
#include <signal.h>
#endif

extern char **environ;

int main(void) {
    /* Spawn 'sleep 999' -- long-running child we'll kill */
    char *argv[] = {"sleep", "999", NULL};
    pid_t child;
    int err = posix_spawnp(&child, "sleep", NULL, NULL, argv, environ);
    if (err != 0) {
        fprintf(stderr, "posix_spawn failed: %d\n", err);
        return 1;
    }
    printf("spawned: yes\n");

    /* Brief pause to let child start */
    struct timespec ts = {0, 50000000}; /* 50ms */
    nanosleep(&ts, NULL);

    /* Kill the child */
    if (kill(child, SIGTERM) != 0) {
        perror("kill");
        return 1;
    }
    printf("kill: ok\n");

    /* Wait for child to terminate */
    int status;
    pid_t w = waitpid(child, &status, 0);
    if (w < 0) {
        perror("waitpid");
        return 1;
    }
    printf("terminated: yes\n");

    return 0;
}
