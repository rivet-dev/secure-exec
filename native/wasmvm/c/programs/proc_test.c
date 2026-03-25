/* proc_test.c — verify /proc/self entries are accessible */
#include <stdio.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <dirent.h>

int main(void) {
    char buf[4096];
    ssize_t n;
    struct stat st;
    int pass = 0, fail = 0;

    /* /proc/self/exe — readlink should return a path */
    n = readlink("/proc/self/exe", buf, sizeof(buf) - 1);
    if (n > 0) {
        buf[n] = '\0';
        printf("PASS: /proc/self/exe -> %s\n", buf);
        pass++;
    } else {
        printf("FAIL: readlink /proc/self/exe: %s\n", strerror(errno));
        fail++;
    }

    /* /proc/self/cwd — readlink should return cwd */
    n = readlink("/proc/self/cwd", buf, sizeof(buf) - 1);
    if (n > 0) {
        buf[n] = '\0';
        printf("PASS: /proc/self/cwd -> %s\n", buf);
        pass++;
    } else {
        printf("FAIL: readlink /proc/self/cwd: %s\n", strerror(errno));
        fail++;
    }

    /* /proc/self/environ — should exist and be stattable */
    if (stat("/proc/self/environ", &st) == 0) {
        printf("PASS: /proc/self/environ exists (size=%ld)\n", (long)st.st_size);
        pass++;
    } else {
        printf("FAIL: stat /proc/self/environ: %s\n", strerror(errno));
        fail++;
    }

    /* /proc/self/fd — should be a directory */
    if (stat("/proc/self/fd", &st) == 0 && S_ISDIR(st.st_mode)) {
        printf("PASS: /proc/self/fd is a directory\n");
        pass++;
    } else {
        printf("FAIL: /proc/self/fd not a directory: %s\n", strerror(errno));
        fail++;
    }

    /* /proc/self — should list exe, cwd, environ, fd */
    DIR *d = opendir("/proc/self");
    if (d) {
        int found_exe = 0, found_cwd = 0, found_environ = 0, found_fd = 0;
        struct dirent *ent;
        while ((ent = readdir(d)) != NULL) {
            if (strcmp(ent->d_name, "exe") == 0) found_exe = 1;
            if (strcmp(ent->d_name, "cwd") == 0) found_cwd = 1;
            if (strcmp(ent->d_name, "environ") == 0) found_environ = 1;
            if (strcmp(ent->d_name, "fd") == 0) found_fd = 1;
        }
        closedir(d);
        if (found_exe && found_cwd && found_environ && found_fd) {
            printf("PASS: /proc/self contains exe, cwd, environ, fd\n");
            pass++;
        } else {
            printf("FAIL: /proc/self missing entries (exe=%d cwd=%d environ=%d fd=%d)\n",
                   found_exe, found_cwd, found_environ, found_fd);
            fail++;
        }
    } else {
        printf("FAIL: opendir /proc/self: %s\n", strerror(errno));
        fail++;
    }

    printf("proc_test: %d passed, %d failed\n", pass, fail);
    return fail > 0 ? 1 : 0;
}
