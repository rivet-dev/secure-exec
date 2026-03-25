/* open_excl_test.c — O_CREAT|O_EXCL atomic creation parity test */
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const char *path = "/tmp/excl_test_file";

    /* Clean up from any previous run */
    unlink(path);

    /* First open with O_CREAT|O_EXCL should succeed */
    int fd = open(path, O_CREAT | O_EXCL | O_WRONLY, 0644);
    if (fd < 0) {
        fprintf(stderr, "first O_EXCL open failed: %s\n", strerror(errno));
        return 1;
    }
    printf("first open: OK\n");

    /* Write some data */
    const char *data = "hello";
    write(fd, data, strlen(data));
    close(fd);

    /* Second open with O_CREAT|O_EXCL should fail with EEXIST */
    int fd2 = open(path, O_CREAT | O_EXCL | O_WRONLY, 0644);
    if (fd2 >= 0) {
        fprintf(stderr, "second O_EXCL open succeeded unexpectedly (fd=%d)\n", fd2);
        close(fd2);
        unlink(path);
        return 1;
    }

    if (errno != EEXIST) {
        fprintf(stderr, "expected EEXIST, got: %s (%d)\n", strerror(errno), errno);
        unlink(path);
        return 1;
    }
    printf("second open: EEXIST (correct)\n");

    /* Clean up */
    unlink(path);
    printf("O_EXCL test passed\n");
    return 0;
}
