/* dup_test.c — duplicate stdout FD, write through duplicate */
#include <stdio.h>
#include <unistd.h>
#include <string.h>

int main(void) {
    /* Test dup: duplicate stdout */
    int new_fd = dup(STDOUT_FILENO);
    if (new_fd < 0) {
        perror("dup");
        return 1;
    }

    const char *msg1 = "hello from dup\n";
    write(new_fd, msg1, strlen(msg1));
    close(new_fd);

    /* Test dup2: duplicate stdout to fd 10 */
    int fd2 = dup2(STDOUT_FILENO, 10);
    if (fd2 != 10) {
        fprintf(stderr, "dup2 returned %d, expected 10\n", fd2);
        return 1;
    }

    const char *msg2 = "hello from dup2\n";
    write(fd2, msg2, strlen(msg2));
    close(fd2);

    /* Final output via original stdout */
    fflush(stdout);
    printf("done\n");
    return 0;
}
