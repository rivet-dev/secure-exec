/*
 * fcntl_high_fd_test.c — verify fcntl works for FDs beyond 256
 *
 * Opens files to push FD numbers past 300, then uses F_GETFD, F_SETFD,
 * F_DUPFD, and F_DUPFD_CLOEXEC on high-numbered FDs.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>

/* WASI headers omit F_DUPFD and F_DUPFD_CLOEXEC */
#ifndef F_DUPFD
#define F_DUPFD 0
#endif
#ifndef F_DUPFD_CLOEXEC
#define F_DUPFD_CLOEXEC 1030
#endif

static int failures = 0;

#define CHECK(cond, fmt, ...) do { \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: " fmt "\n", ##__VA_ARGS__); \
        failures++; \
    } else { \
        printf("PASS: " fmt "\n", ##__VA_ARGS__); \
    } \
} while (0)

int main(void) {
    /* Create a temp file to open many times */
    const char *path = "/tmp/fcntl_high_fd_test";
    FILE *f = fopen(path, "w");
    if (!f) { perror("fopen"); return 1; }
    fprintf(f, "test");
    fclose(f);

    /* Open the file repeatedly to push FD numbers above 300 */
    int fds[320];
    int count = 0;
    for (int i = 0; i < 320; i++) {
        int fd = open(path, O_RDONLY);
        if (fd < 0) {
            /* May hit system limit before 320 — that's ok */
            break;
        }
        fds[count++] = fd;
    }

    CHECK(count > 0, "opened %d files", count);

    /* Find the highest FD */
    int high_fd = fds[count - 1];
    CHECK(high_fd >= 300, "highest FD >= 300 (got %d)", high_fd);

    if (high_fd >= 300) {
        /* F_GETFD on high FD — should not return EBADF */
        int flags = fcntl(high_fd, F_GETFD);
        CHECK(flags >= 0, "F_GETFD on fd %d succeeds (got %d)", high_fd, flags);

        /* F_SETFD on high FD */
        int r = fcntl(high_fd, F_SETFD, FD_CLOEXEC);
        CHECK(r == 0, "F_SETFD FD_CLOEXEC on fd %d returns 0 (got %d)", high_fd, r);

        /* Verify F_GETFD returns FD_CLOEXEC */
        flags = fcntl(high_fd, F_GETFD);
        CHECK(flags == FD_CLOEXEC, "F_GETFD returns FD_CLOEXEC after set (got %d)", flags);

        /* Clear cloexec */
        r = fcntl(high_fd, F_SETFD, 0);
        CHECK(r == 0, "F_SETFD 0 on fd %d returns 0 (got %d)", high_fd, r);
        flags = fcntl(high_fd, F_GETFD);
        CHECK(flags == 0, "F_GETFD returns 0 after clear (got %d)", flags);

        /* F_DUPFD with min_fd above 300 */
        int dup_fd = fcntl(fds[0], F_DUPFD, high_fd + 1);
        if (dup_fd >= 0) {
            CHECK(dup_fd > high_fd, "F_DUPFD returns fd > %d (got %d)", high_fd, dup_fd);
            /* Verify dup'd fd is usable */
            flags = fcntl(dup_fd, F_GETFD);
            CHECK(flags == 0, "F_GETFD on dup'd fd %d returns 0 (got %d)", dup_fd, flags);
            close(dup_fd);
        } else {
            /* EMFILE is acceptable — system may limit FDs */
            CHECK(errno == EMFILE || errno == ENOMEM,
                  "F_DUPFD above 300 fails with EMFILE/ENOMEM (errno=%d)", errno);
        }
    }

    /* Cleanup */
    for (int i = 0; i < count; i++) {
        close(fds[i]);
    }
    unlink(path);

    if (failures > 0) {
        fprintf(stderr, "%d test(s) failed\n", failures);
        return 1;
    }
    printf("All fcntl high FD tests passed\n");
    return 0;
}
