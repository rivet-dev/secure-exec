/* fs_probe.c — focused filesystem probe for upstream Node WasmVM pre-research.
 *
 * Exercises the narrow file/path operations needed for fs-first planning:
 * open, read, write, stat, readdir, and realpath.
 */

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef PATH_MAX
#define PATH_MAX 1024
#endif

int main(int argc, char *argv[]) {
    const char *base = "/tmp/fs-probe";
    const char *payload = "wasmvm-fs-probe";
    char file[PATH_MAX];
    char subdir[PATH_MAX];
    char realpath_input[PATH_MAX];
    char resolved[PATH_MAX];

    if (argc >= 2) {
        base = argv[1];
    }

    snprintf(file, sizeof(file), "%s/probe.txt", base);
    snprintf(subdir, sizeof(subdir), "%s/subdir", base);
    snprintf(realpath_input, sizeof(realpath_input), "%s/subdir/../probe.txt", base);

    if (mkdir(base, 0755) != 0 && errno != EEXIST) {
        perror("mkdir base");
        return 1;
    }
    if (mkdir(subdir, 0755) != 0 && errno != EEXIST) {
        perror("mkdir subdir");
        return 1;
    }

    int fd = open(file, O_CREAT | O_RDWR | O_TRUNC, 0644);
    if (fd < 0) {
        perror("open");
        return 1;
    }
    printf("open: ok\n");

    ssize_t written = write(fd, payload, strlen(payload));
    if (written != (ssize_t)strlen(payload)) {
        perror("write");
        close(fd);
        return 1;
    }
    printf("write: ok\n");

    if (lseek(fd, 0, SEEK_SET) < 0) {
        perror("lseek");
        close(fd);
        return 1;
    }

    char buf[64] = {0};
    ssize_t read_len = read(fd, buf, sizeof(buf) - 1);
    if (read_len != written || memcmp(buf, payload, (size_t)written) != 0) {
        fprintf(stderr, "read mismatch\n");
        close(fd);
        return 1;
    }
    printf("read: %s\n", buf);

    struct stat st;
    if (stat(file, &st) != 0 || st.st_size != written) {
        perror("stat");
        close(fd);
        return 1;
    }
    printf("stat: size=%lld\n", (long long)st.st_size);

    if (close(fd) != 0) {
        perror("close");
        return 1;
    }
    printf("close: ok\n");

    DIR *dir = opendir(base);
    if (dir == NULL) {
        perror("opendir");
        return 1;
    }

    int saw_file = 0;
    int saw_subdir = 0;
    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, "probe.txt") == 0) {
            saw_file = 1;
        }
        if (strcmp(entry->d_name, "subdir") == 0) {
            saw_subdir = 1;
        }
    }

    if (closedir(dir) != 0) {
        perror("closedir");
        return 1;
    }

    if (!saw_file || !saw_subdir) {
        fprintf(stderr, "readdir missing expected entries\n");
        return 1;
    }
    printf("readdir: ok\n");

    if (realpath(realpath_input, resolved) == NULL) {
        perror("realpath");
        return 1;
    }
    if (strcmp(resolved, file) != 0) {
        fprintf(stderr, "realpath mismatch: expected %s got %s\n", file, resolved);
        return 1;
    }
    printf("realpath: %s\n", resolved);

    unlink(file);
    rmdir(subdir);
    rmdir(base);

    return 0;
}
