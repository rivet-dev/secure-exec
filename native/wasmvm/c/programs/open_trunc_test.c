/* open_trunc_test.c — O_TRUNC truncates file on open parity test */
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const char *path = "/tmp/trunc_test_file";

    /* Create file with initial data */
    int fd = open(path, O_CREAT | O_WRONLY, 0644);
    if (fd < 0) {
        fprintf(stderr, "create failed: %s\n", strerror(errno));
        return 1;
    }
    const char *data = "hello world, this is initial data";
    write(fd, data, strlen(data));
    close(fd);
    printf("wrote %zu bytes\n", strlen(data));

    /* Re-open with O_TRUNC — file should be truncated to 0 */
    fd = open(path, O_TRUNC | O_WRONLY, 0644);
    if (fd < 0) {
        fprintf(stderr, "O_TRUNC open failed: %s\n", strerror(errno));
        unlink(path);
        return 1;
    }
    close(fd);

    /* Read back — should be empty */
    fd = open(path, O_RDONLY);
    if (fd < 0) {
        fprintf(stderr, "read open failed: %s\n", strerror(errno));
        unlink(path);
        return 1;
    }

    char buf[256];
    ssize_t n = read(fd, buf, sizeof(buf));
    close(fd);

    if (n != 0) {
        fprintf(stderr, "expected 0 bytes after O_TRUNC, got %zd\n", n);
        unlink(path);
        return 1;
    }
    printf("after O_TRUNC: 0 bytes (correct)\n");

    /* Also test O_CREAT|O_TRUNC on non-existing file (should just create) */
    const char *path2 = "/tmp/trunc_test_file2";
    unlink(path2);
    fd = open(path2, O_CREAT | O_TRUNC | O_WRONLY, 0644);
    if (fd < 0) {
        fprintf(stderr, "O_CREAT|O_TRUNC on new file failed: %s\n", strerror(errno));
        unlink(path);
        return 1;
    }
    printf("O_CREAT|O_TRUNC on new file: OK\n");
    close(fd);

    /* Clean up */
    unlink(path);
    unlink(path2);
    printf("O_TRUNC test passed\n");
    return 0;
}
