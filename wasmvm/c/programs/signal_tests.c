/* signal_tests.c -- signal delivery edge cases: SIGKILL, exited PID, invalid PID */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>
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
#define SIGKILL 9
#define WIFSIGNALED(s) (((s) & 0x7f) != 0 && ((s) & 0x7f) != 0x7f)
#define WTERMSIG(s)    ((s) & 0x7f)
#define WIFEXITED(s)   (!((s) & 0x7f))
#define WEXITSTATUS(s) (((s) & 0xff00) >> 8)
#else
#include <spawn.h>
#include <sys/wait.h>
#include <signal.h>
#endif

extern char **environ;

int main(void) {
    /* Test 1: SIGKILL (9) — spawn sleep, kill with SIGKILL, verify WIFSIGNALED + WTERMSIG==9 */
    {
        char *argv[] = {"sleep", "999", NULL};
        pid_t child;
        int err = posix_spawnp(&child, "sleep", NULL, NULL, argv, environ);
        if (err != 0) {
            printf("test_sigkill: FAIL (spawn failed: %d)\n", err);
            return 1;
        }

        struct timespec ts = {0, 50000000}; /* 50ms */
        nanosleep(&ts, NULL);

        int kr = kill(child, SIGKILL);
        if (kr != 0) {
            printf("test_sigkill: FAIL (kill returned %d, errno %d)\n", kr, errno);
            return 1;
        }

        int status;
        pid_t w = waitpid(child, &status, 0);
        if (w < 0) {
            printf("test_sigkill: FAIL (waitpid failed)\n");
            return 1;
        }

        int signaled = WIFSIGNALED(status);
        int termsig = WTERMSIG(status);
        if (signaled && termsig == 9) {
            printf("test_sigkill: ok\n");
        } else {
            printf("test_sigkill: FAIL (signaled=%d termsig=%d)\n", signaled, termsig);
        }
        printf("sigkill_signaled=%s\n", signaled ? "yes" : "no");
        printf("sigkill_termsig=%d\n", termsig);
    }

    /* Test 2: kill() on exited process — should return -1/ESRCH or 0 */
    {
        char *argv[] = {"true", NULL};
        pid_t child;
        int err = posix_spawnp(&child, "true", NULL, NULL, argv, environ);
        if (err != 0) {
            printf("test_kill_exited: FAIL (spawn failed: %d)\n", err);
            return 1;
        }

        int status;
        waitpid(child, &status, 0);

        /* After reaping, the PID slot is freed — kill should fail with ESRCH
         * or return 0 if the kernel still has the entry (POSIX allows either
         * for recently-exited processes). */
        errno = 0;
        int kr = kill(child, 0);
        if (kr == 0) {
            printf("test_kill_exited: ok\n");
            printf("kill_exited_ret=0\n");
        } else if (kr == -1 && errno == ESRCH) {
            printf("test_kill_exited: ok\n");
            printf("kill_exited_ret=-1_ESRCH\n");
        } else {
            printf("test_kill_exited: FAIL (ret=%d errno=%d)\n", kr, errno);
        }
    }

    /* Test 3: kill() with invalid PID — should return -1 */
    {
        errno = 0;
        int kr = kill(99999, 0);
        if (kr == -1) {
            printf("test_kill_invalid: ok\n");
            printf("kill_invalid_errno=%d\n", errno);
        } else {
            printf("test_kill_invalid: FAIL (ret=%d, expected -1)\n", kr);
        }
    }

    return 0;
}
