/* readdir_dots_test.c — verify . and .. appear in readdir results */
#include <stdio.h>
#include <dirent.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>

static int check_dir(const char *path) {
    DIR *d = opendir(path);
    if (!d) {
        fprintf(stderr, "opendir(%s) failed: %s\n", path, strerror(errno));
        return 1;
    }

    int found_dot = 0, found_dotdot = 0;
    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (strcmp(ent->d_name, ".") == 0) found_dot = 1;
        if (strcmp(ent->d_name, "..") == 0) found_dotdot = 1;
    }
    closedir(d);

    if (!found_dot) {
        fprintf(stderr, "%s: missing '.'\n", path);
        return 1;
    }
    if (!found_dotdot) {
        fprintf(stderr, "%s: missing '..'\n", path);
        return 1;
    }
    printf("%s: . and .. present\n", path);
    return 0;
}

int main(void) {
    /* Check /tmp (a regular directory) */
    mkdir("/tmp", 0755);
    if (check_dir("/tmp") != 0) return 1;

    /* Check / (root — .. should point to itself) */
    if (check_dir("/") != 0) return 1;

    printf("readdir dots test passed\n");
    return 0;
}
