/* unlink_open_test.c — deferred unlink: open file, write, unlink, write more, read back */
#include <stdio.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

int main(void) {
    const char *path = "/tmp/unlink_test_file";

    /* Create and write initial data */
    int fd = open(path, O_CREAT | O_RDWR, 0644);
    if (fd < 0) {
        fprintf(stderr, "create failed: %s\n", strerror(errno));
        return 1;
    }

    const char *data1 = "hello ";
    write(fd, data1, strlen(data1));
    printf("wrote: %s\n", data1);

    /* Unlink while fd is still open */
    if (unlink(path) != 0) {
        fprintf(stderr, "unlink failed: %s\n", strerror(errno));
        close(fd);
        return 1;
    }
    printf("unlinked\n");

    /* Write more data through the open fd */
    const char *data2 = "world";
    write(fd, data2, strlen(data2));
    printf("wrote more: %s\n", data2);

    /* Seek back to start and read everything */
    lseek(fd, 0, SEEK_SET);
    char buf[256];
    ssize_t n = read(fd, buf, sizeof(buf) - 1);
    if (n < 0) {
        fprintf(stderr, "read failed: %s\n", strerror(errno));
        close(fd);
        return 1;
    }
    buf[n] = '\0';
    printf("read back: %s\n", buf);

    /* Verify content */
    if (strcmp(buf, "hello world") != 0) {
        fprintf(stderr, "content mismatch: got '%s'\n", buf);
        close(fd);
        return 1;
    }

    close(fd);
    printf("unlink_open test passed\n");
    return 0;
}
