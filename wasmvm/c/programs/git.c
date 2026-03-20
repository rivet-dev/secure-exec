/*
 * git.c -- A clean-room, permissively-licensed git plumbing implementation
 *
 * Supports:
 *   - hash-object [-t type] [-w] [--stdin] [file...]
 *   - cat-file (-t | -s | -p | <type>) <object>
 *   - init [directory]
 *
 * This implementation is NOT based on Git source code.
 * Licensed under Apache-2.0.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <unistd.h>

#include "git-objects.h"

/* --- hash-object --- */

static int cmd_hash_object(int argc, char **argv) {
    const char *type = "blob";
    int write_obj = 0;
    int use_stdin = 0;
    int nfiles = 0;
    const char *files[256];

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-t") == 0 && i + 1 < argc) {
            type = argv[++i];
        } else if (strcmp(argv[i], "-w") == 0) {
            write_obj = 1;
        } else if (strcmp(argv[i], "--stdin") == 0) {
            use_stdin = 1;
        } else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git hash-object [-t <type>] [-w] [--stdin] [<file>...]\n");
            return 0;
        } else if (argv[i][0] != '-') {
            if (nfiles < 256) files[nfiles++] = argv[i];
        }
    }

    if (!use_stdin && nfiles == 0) {
        use_stdin = 1;
    }

    /* Hash stdin */
    if (use_stdin) {
        size_t cap = 4096, len = 0;
        uint8_t *data = malloc(cap);
        if (!data) { fprintf(stderr, "fatal: out of memory\n"); return 1; }

        int ch;
        while ((ch = getchar()) != EOF) {
            if (len >= cap) {
                cap *= 2;
                data = realloc(data, cap);
                if (!data) { fprintf(stderr, "fatal: out of memory\n"); return 1; }
            }
            data[len++] = (uint8_t)ch;
        }

        char hex[GIT_SHA1_HEXSZ + 1];

        if (write_obj) {
            char *git_dir = git_find_repo();
            if (!git_dir) {
                fprintf(stderr, "fatal: not a git repository\n");
                free(data);
                return 128;
            }
            int rc = git_write_object(git_dir, type, data, len, hex);
            free(git_dir);
            if (rc != 0) {
                fprintf(stderr, "fatal: unable to write object\n");
                free(data);
                return 1;
            }
        } else {
            if (git_hash_object(type, data, len, hex) != 0) {
                fprintf(stderr, "fatal: unable to hash object\n");
                free(data);
                return 1;
            }
        }

        printf("%s\n", hex);
        free(data);
        return 0;
    }

    /* Hash files */
    for (int fi = 0; fi < nfiles; fi++) {
        FILE *f = fopen(files[fi], "rb");
        if (!f) {
            fprintf(stderr, "fatal: could not open '%s': %s\n",
                    files[fi], strerror(errno));
            return 1;
        }

        fseek(f, 0, SEEK_END);
        long fsize = ftell(f);
        fseek(f, 0, SEEK_SET);
        if (fsize < 0) { fclose(f); return 1; }

        size_t len = (size_t)fsize;
        uint8_t *data = malloc(len ? len : 1);
        if (!data) { fclose(f); return 1; }
        if (len > 0) {
            if (fread(data, 1, len, f) != len) {
                fprintf(stderr, "fatal: read error on '%s'\n", files[fi]);
                fclose(f); free(data);
                return 1;
            }
        }
        fclose(f);

        char hex[GIT_SHA1_HEXSZ + 1];

        if (write_obj) {
            char *git_dir = git_find_repo();
            if (!git_dir) {
                fprintf(stderr, "fatal: not a git repository\n");
                free(data);
                return 128;
            }
            int rc = git_write_object(git_dir, type, data, len, hex);
            free(git_dir);
            if (rc != 0) {
                fprintf(stderr, "fatal: unable to write object\n");
                free(data);
                return 1;
            }
        } else {
            if (git_hash_object(type, data, len, hex) != 0) {
                fprintf(stderr, "fatal: unable to hash object\n");
                free(data);
                return 1;
            }
        }

        printf("%s\n", hex);
        free(data);
    }

    return 0;
}

/* --- cat-file --- */

static int cmd_cat_file(int argc, char **argv) {
    if (argc < 1) {
        fprintf(stderr, "usage: git cat-file (-t | -s | -p | <type>) <object>\n");
        return 1;
    }

    int show_type = 0, show_size = 0, pretty = 0;
    const char *expected_type = NULL;
    const char *object = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-t") == 0)      { show_type = 1; }
        else if (strcmp(argv[i], "-s") == 0) { show_size = 1; }
        else if (strcmp(argv[i], "-p") == 0) { pretty = 1; }
        else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git cat-file (-t | -s | -p | <type>) <object>\n");
            return 0;
        } else if (argv[i][0] != '-') {
            if (!object && (show_type || show_size || pretty)) {
                object = argv[i];
            } else if (!expected_type) {
                expected_type = argv[i];
            } else {
                object = argv[i];
            }
        }
    }

    if (!object) {
        fprintf(stderr, "usage: git cat-file (-t | -s | -p | <type>) <object>\n");
        return 1;
    }

    if (strlen(object) != 40) {
        fprintf(stderr, "fatal: not a valid object name %s\n", object);
        return 128;
    }

    char *git_dir = git_find_repo();
    if (!git_dir) {
        fprintf(stderr, "fatal: not a git repository\n");
        return 128;
    }

    char type[32];
    uint8_t *data = NULL;
    size_t len = 0;

    if (git_read_object(git_dir, object, type, sizeof(type), &data, &len) != 0) {
        fprintf(stderr, "fatal: not a valid object name %s\n", object);
        free(git_dir);
        return 128;
    }
    free(git_dir);

    if (show_type) {
        printf("%s\n", type);
    } else if (show_size) {
        printf("%zu\n", len);
    } else if (pretty || expected_type) {
        if (expected_type && strcmp(type, expected_type) != 0) {
            fprintf(stderr, "fatal: git cat-file %s: bad file\n", expected_type);
            free(data);
            return 1;
        }
        fwrite(data, 1, len, stdout);
    }

    free(data);
    return 0;
}

/* --- init --- */

static int mkdirp(const char *path, int mode) {
    char tmp[512];
    snprintf(tmp, sizeof(tmp), "%s", path);
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            mkdir(tmp, mode);
            *p = '/';
        }
    }
    return mkdir(tmp, mode);
}

static int cmd_init(int argc, char **argv) {
    const char *dir = ".";
    for (int i = 0; i < argc; i++) {
        if (argv[i][0] != '-') { dir = argv[i]; break; }
    }

    char git_dir[512];
    snprintf(git_dir, sizeof(git_dir), "%s/.git", dir);

    struct stat st;
    if (stat(git_dir, &st) == 0) {
        char abs[4096];
        if (getcwd(abs, sizeof(abs))) {
            printf("Reinitialized existing Git repository in %s/%s/\n", abs, git_dir);
        }
        return 0;
    }

    /* Create .git structure */
    char path[512];

    snprintf(path, sizeof(path), "%s/objects/pack", git_dir);
    mkdirp(path, 0755);

    snprintf(path, sizeof(path), "%s/objects/info", git_dir);
    mkdirp(path, 0755);

    snprintf(path, sizeof(path), "%s/refs/heads", git_dir);
    mkdirp(path, 0755);

    snprintf(path, sizeof(path), "%s/refs/tags", git_dir);
    mkdirp(path, 0755);

    /* HEAD */
    snprintf(path, sizeof(path), "%s/HEAD", git_dir);
    FILE *f = fopen(path, "w");
    if (!f) {
        fprintf(stderr, "fatal: cannot create '%s': %s\n", path, strerror(errno));
        return 1;
    }
    fprintf(f, "ref: refs/heads/main\n");
    fclose(f);

    /* config */
    snprintf(path, sizeof(path), "%s/config", git_dir);
    f = fopen(path, "w");
    if (f) {
        fprintf(f, "[core]\n"
                   "\trepositoryformatversion = 0\n"
                   "\tfilemode = true\n"
                   "\tbare = false\n");
        fclose(f);
    }

    /* description */
    snprintf(path, sizeof(path), "%s/description", git_dir);
    f = fopen(path, "w");
    if (f) {
        fprintf(f, "Unnamed repository; edit this file to name the repository.\n");
        fclose(f);
    }

    char abs[4096];
    if (strcmp(dir, ".") == 0 && getcwd(abs, sizeof(abs))) {
        printf("Initialized empty Git repository in %s/.git/\n", abs);
    } else {
        printf("Initialized empty Git repository in %s/.git/\n", dir);
    }

    return 0;
}

/* --- main dispatcher --- */

static void usage(void) {
    fprintf(stderr, "usage: git <command> [<args>]\n\n");
    fprintf(stderr, "Commands:\n");
    fprintf(stderr, "   init          Create an empty Git repository\n");
    fprintf(stderr, "   hash-object   Compute object ID\n");
    fprintf(stderr, "   cat-file      Display object content\n");
}

int main(int argc, char **argv) {
    if (argc < 2) {
        usage();
        return 1;
    }

    const char *cmd = argv[1];

    if (strcmp(cmd, "hash-object") == 0)
        return cmd_hash_object(argc - 2, argv + 2);
    if (strcmp(cmd, "cat-file") == 0)
        return cmd_cat_file(argc - 2, argv + 2);
    if (strcmp(cmd, "init") == 0)
        return cmd_init(argc - 2, argv + 2);
    if (strcmp(cmd, "--version") == 0) {
        printf("git version 2.47.1 (secure-exec)\n");
        return 0;
    }
    if (strcmp(cmd, "--help") == 0 || strcmp(cmd, "help") == 0) {
        usage();
        return 0;
    }

    fprintf(stderr, "git: '%s' is not a git command. See 'git --help'.\n", cmd);
    return 1;
}
