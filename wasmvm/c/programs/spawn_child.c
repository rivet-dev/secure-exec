/* spawn_child.c -- posix_spawn 'echo hello', waitpid, print child stdout */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifdef __wasi__
/* spawn.h and sys/wait.h not in wasi sysroot -- declare types inline.
 * posix_spawn_file_actions_t layout MUST match host_spawn_wait.c exactly. */
typedef struct { int __pad0[2]; void *__actions; int __pad[16]; } posix_spawn_file_actions_t;
typedef struct { int __dummy; } posix_spawnattr_t;
int posix_spawnp(pid_t *restrict, const char *restrict,
    const posix_spawn_file_actions_t *,
    const posix_spawnattr_t *restrict,
    char *const[restrict], char *const[restrict]);
int posix_spawn_file_actions_init(posix_spawn_file_actions_t *);
int posix_spawn_file_actions_destroy(posix_spawn_file_actions_t *);
int posix_spawn_file_actions_adddup2(posix_spawn_file_actions_t *, int, int);
int posix_spawn_file_actions_addclose(posix_spawn_file_actions_t *, int);
pid_t waitpid(pid_t, int *, int);
#define WEXITSTATUS(s) (((s) & 0xff00) >> 8)
#define WIFEXITED(s)   (!((s) & 0x7f))
#else
#include <spawn.h>
#include <sys/wait.h>
#endif

extern char **environ;

int main(void) {
    int pipefd[2];
    if (pipe(pipefd) != 0) {
        perror("pipe");
        return 1;
    }

    /* Redirect child stdout to pipe write end */
    posix_spawn_file_actions_t fa;
    posix_spawn_file_actions_init(&fa);
    posix_spawn_file_actions_adddup2(&fa, pipefd[1], STDOUT_FILENO);
    posix_spawn_file_actions_addclose(&fa, pipefd[0]);
    posix_spawn_file_actions_addclose(&fa, pipefd[1]);

    char *argv[] = {"echo", "hello", NULL};
    pid_t child;
    int err = posix_spawnp(&child, "echo", &fa, NULL, argv, environ);
    posix_spawn_file_actions_destroy(&fa);

    if (err != 0) {
        fprintf(stderr, "posix_spawn failed: %d\n", err);
        return 1;
    }

    close(pipefd[1]);

    char buf[256];
    ssize_t n = read(pipefd[0], buf, sizeof(buf) - 1);
    close(pipefd[0]);

    int status;
    waitpid(child, &status, 0);

    if (n > 0) {
        buf[n] = '\0';
        printf("child_stdout: %s", buf);
    } else {
        printf("child_stdout: (empty)\n");
    }
    printf("child_exit: %d\n", WIFEXITED(status) ? WEXITSTATUS(status) : -1);

    return 0;
}
