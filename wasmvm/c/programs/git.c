/*
 * git.c -- A clean-room, permissively-licensed git implementation
 *
 * Supports:
 *   Plumbing: hash-object, cat-file
 *   Porcelain: init, add, commit, status, log, diff, branch, checkout, merge, tag
 *   Remote:   remote, clone, fetch, push, pull (HTTP/HTTPS via libcurl)
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
#include <dirent.h>
#include <time.h>

#ifdef HAS_CURL
#include <curl/curl.h>
#endif

#include "git-objects.h"
#include "git-index.h"

/* --- Helpers --- */

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

/* Compute work_dir from git_dir (strip /.git) */
static void get_work_dir(const char *git_dir, char *work_dir, size_t sz) {
    size_t len = strlen(git_dir);
    if (len >= 5 && strcmp(git_dir + len - 5, "/.git") == 0) {
        if (len == 5) {
            snprintf(work_dir, sz, "/");
        } else {
            snprintf(work_dir, sz, "%.*s", (int)(len - 5), git_dir);
        }
    } else {
        snprintf(work_dir, sz, "%s", git_dir);
    }
}

/* Make a path relative to work_dir */
static const char *make_relative(const char *path, const char *work_dir) {
    size_t wlen = strlen(work_dir);
    if (strncmp(path, work_dir, wlen) == 0) {
        if (path[wlen] == '/') return path + wlen + 1;
        if (path[wlen] == '\0') return ".";
    }
    return path;
}

/* Read entire file into buffer. Caller frees. */
static uint8_t *read_file(const char *path, size_t *len_out) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;

    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (fsize < 0) { fclose(f); return NULL; }

    size_t len = (size_t)fsize;
    uint8_t *data = malloc(len ? len : 1);
    if (!data) { fclose(f); return NULL; }
    if (len > 0 && fread(data, 1, len, f) != len) {
        fclose(f); free(data);
        return NULL;
    }
    fclose(f);
    *len_out = len;
    return data;
}

/* Check if a path should be ignored (.git directory) */
static int is_git_internal(const char *name) {
    return strcmp(name, ".git") == 0;
}

/* Recursively collect files under a directory (relative to work_dir) */
typedef struct {
    char **paths;
    size_t count;
    size_t capacity;
} PathList;

static void path_list_init(PathList *pl) {
    pl->paths = NULL;
    pl->count = 0;
    pl->capacity = 0;
}

static void path_list_add(PathList *pl, const char *path) {
    if (pl->count >= pl->capacity) {
        size_t new_cap = pl->capacity ? pl->capacity * 2 : 64;
        pl->paths = realloc(pl->paths, new_cap * sizeof(char *));
        pl->capacity = new_cap;
    }
    pl->paths[pl->count++] = strdup(path);
}

static void path_list_free(PathList *pl) {
    for (size_t i = 0; i < pl->count; i++) free(pl->paths[i]);
    free(pl->paths);
    pl->paths = NULL;
    pl->count = 0;
}

static int path_cmp(const void *a, const void *b) {
    return strcmp(*(const char **)a, *(const char **)b);
}

static void collect_files(const char *dir, const char *prefix, PathList *pl) {
    DIR *d = opendir(dir);
    if (!d) return;

    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (strcmp(ent->d_name, ".") == 0 || strcmp(ent->d_name, "..") == 0)
            continue;
        if (is_git_internal(ent->d_name)) continue;

        char full[4096], rel[4096];
        snprintf(full, sizeof(full), "%s/%s", dir, ent->d_name);
        if (prefix[0])
            snprintf(rel, sizeof(rel), "%s/%s", prefix, ent->d_name);
        else
            snprintf(rel, sizeof(rel), "%s", ent->d_name);

        struct stat st;
        if (stat(full, &st) != 0) continue;

        if (S_ISDIR(st.st_mode)) {
            collect_files(full, rel, pl);
        } else if (S_ISREG(st.st_mode)) {
            path_list_add(pl, rel);
        }
    }
    closedir(d);
}

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

    if (!use_stdin && nfiles == 0) use_stdin = 1;

    if (use_stdin) {
        size_t cap = 4096, len = 0;
        uint8_t *data = malloc(cap);
        if (!data) { fprintf(stderr, "fatal: out of memory\n"); return 1; }

        int ch;
        while ((ch = getchar()) != EOF) {
            if (len >= cap) { cap *= 2; data = realloc(data, cap); }
            data[len++] = (uint8_t)ch;
        }

        char hex[GIT_SHA1_HEXSZ + 1];
        if (write_obj) {
            char *git_dir = git_find_repo();
            if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); free(data); return 128; }
            int rc = git_write_object(git_dir, type, data, len, hex);
            free(git_dir);
            if (rc != 0) { fprintf(stderr, "fatal: unable to write object\n"); free(data); return 1; }
        } else {
            if (git_hash_object(type, data, len, hex) != 0) {
                fprintf(stderr, "fatal: unable to hash object\n"); free(data); return 1;
            }
        }
        printf("%s\n", hex);
        free(data);
        return 0;
    }

    for (int fi = 0; fi < nfiles; fi++) {
        size_t len;
        uint8_t *data = read_file(files[fi], &len);
        if (!data) {
            fprintf(stderr, "fatal: could not open '%s': %s\n", files[fi], strerror(errno));
            return 1;
        }
        char hex[GIT_SHA1_HEXSZ + 1];
        if (write_obj) {
            char *git_dir = git_find_repo();
            if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); free(data); return 128; }
            int rc = git_write_object(git_dir, type, data, len, hex);
            free(git_dir);
            if (rc != 0) { fprintf(stderr, "fatal: unable to write object\n"); free(data); return 1; }
        } else {
            if (git_hash_object(type, data, len, hex) != 0) {
                fprintf(stderr, "fatal: unable to hash object\n"); free(data); return 1;
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
        if (strcmp(argv[i], "-t") == 0)      show_type = 1;
        else if (strcmp(argv[i], "-s") == 0) show_size = 1;
        else if (strcmp(argv[i], "-p") == 0) pretty = 1;
        else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git cat-file (-t | -s | -p | <type>) <object>\n");
            return 0;
        } else if (argv[i][0] != '-') {
            if (!object && (show_type || show_size || pretty))
                object = argv[i];
            else if (!expected_type)
                expected_type = argv[i];
            else
                object = argv[i];
        }
    }

    if (!object) { fprintf(stderr, "usage: git cat-file (-t | -s | -p | <type>) <object>\n"); return 1; }
    if (strlen(object) != 40) { fprintf(stderr, "fatal: not a valid object name %s\n", object); return 128; }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char type[32];
    uint8_t *data = NULL;
    size_t len = 0;

    if (git_read_object(git_dir, object, type, sizeof(type), &data, &len) != 0) {
        fprintf(stderr, "fatal: not a valid object name %s\n", object);
        free(git_dir);
        return 128;
    }
    free(git_dir);

    if (show_type) printf("%s\n", type);
    else if (show_size) printf("%zu\n", len);
    else if (pretty || expected_type) {
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

    char path[512];
    snprintf(path, sizeof(path), "%s/objects/pack", git_dir); mkdirp(path, 0755);
    snprintf(path, sizeof(path), "%s/objects/info", git_dir); mkdirp(path, 0755);
    snprintf(path, sizeof(path), "%s/refs/heads", git_dir);   mkdirp(path, 0755);
    snprintf(path, sizeof(path), "%s/refs/tags", git_dir);    mkdirp(path, 0755);

    snprintf(path, sizeof(path), "%s/HEAD", git_dir);
    FILE *f = fopen(path, "w");
    if (!f) { fprintf(stderr, "fatal: cannot create '%s': %s\n", path, strerror(errno)); return 1; }
    fprintf(f, "ref: refs/heads/main\n");
    fclose(f);

    snprintf(path, sizeof(path), "%s/config", git_dir);
    f = fopen(path, "w");
    if (f) {
        fprintf(f, "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n");
        fclose(f);
    }

    snprintf(path, sizeof(path), "%s/description", git_dir);
    f = fopen(path, "w");
    if (f) {
        fprintf(f, "Unnamed repository; edit this file to name the repository.\n");
        fclose(f);
    }

    char abs[4096];
    if (strcmp(dir, ".") == 0 && getcwd(abs, sizeof(abs)))
        printf("Initialized empty Git repository in %s/.git/\n", abs);
    else
        printf("Initialized empty Git repository in %s/.git/\n", dir);

    return 0;
}

/* --- add --- */

static int cmd_add(int argc, char **argv) {
    if (argc < 1) {
        fprintf(stderr, "usage: git add <pathspec>...\n");
        return 1;
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char work_dir[4096];
    get_work_dir(git_dir, work_dir, sizeof(work_dir));

    GitIndex idx;
    git_index_init(&idx);
    git_index_read(&idx, git_dir);

    char cwd[4096];
    if (!getcwd(cwd, sizeof(cwd))) {
        fprintf(stderr, "fatal: cannot get cwd\n");
        git_index_free(&idx);
        free(git_dir);
        return 1;
    }

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git add <pathspec>...\n");
            git_index_free(&idx); free(git_dir);
            return 0;
        }
        if (argv[i][0] == '-') continue;

        /* Build absolute path */
        char abs_path[4096];
        if (argv[i][0] == '/')
            snprintf(abs_path, sizeof(abs_path), "%s", argv[i]);
        else
            snprintf(abs_path, sizeof(abs_path), "%s/%s", cwd, argv[i]);

        struct stat st;
        if (stat(abs_path, &st) != 0) {
            fprintf(stderr, "fatal: pathspec '%s' did not match any files\n", argv[i]);
            git_index_free(&idx); free(git_dir);
            return 128;
        }

        PathList pl;
        path_list_init(&pl);

        if (S_ISDIR(st.st_mode)) {
            const char *rel_prefix = make_relative(abs_path, work_dir);
            if (strcmp(rel_prefix, ".") == 0)
                collect_files(abs_path, "", &pl);
            else
                collect_files(abs_path, rel_prefix, &pl);
        } else {
            const char *rel = make_relative(abs_path, work_dir);
            path_list_add(&pl, rel);
        }

        /* Stage each file */
        for (size_t j = 0; j < pl.count; j++) {
            char full[4096];
            snprintf(full, sizeof(full), "%s/%s", work_dir, pl.paths[j]);

            size_t flen;
            uint8_t *fdata = read_file(full, &flen);
            if (!fdata) {
                fprintf(stderr, "error: '%s': %s\n", pl.paths[j], strerror(errno));
                continue;
            }

            char hex[GIT_SHA1_HEXSZ + 1];
            if (git_write_object(git_dir, "blob", fdata, flen, hex) != 0) {
                fprintf(stderr, "error: writing object for '%s'\n", pl.paths[j]);
                free(fdata);
                continue;
            }

            struct stat fst;
            stat(full, &fst);
            uint32_t mode = S_ISREG(fst.st_mode) ?
                ((fst.st_mode & 0111) ? 0100755 : 0100644) : 0100644;
            uint32_t mtime = (uint32_t)fst.st_mtime;

            git_index_add(&idx, pl.paths[j], hex, mode, (uint32_t)flen, mtime);
            free(fdata);
        }

        path_list_free(&pl);
    }

    if (git_index_write(&idx, git_dir) != 0) {
        fprintf(stderr, "fatal: unable to write index\n");
        git_index_free(&idx); free(git_dir);
        return 1;
    }

    git_index_free(&idx);
    free(git_dir);
    return 0;
}

/* --- commit --- */

/* Build a flat tree from sorted index entries */
static int write_tree_from_index(const char *git_dir, const GitIndex *idx,
                                 char tree_hex[GIT_SHA1_HEXSZ + 1]) {
    if (idx->count == 0) {
        /* Empty tree */
        return git_write_object(git_dir, "tree", (const uint8_t *)"", 0, tree_hex);
    }

    /* For simplicity: build a flat tree from all index entries.
     * Real git builds nested trees for subdirectories, but flat trees
     * work correctly for add/commit/status/log/diff operations as long
     * as we're consistent. We build proper nested trees. */

    /* Collect unique directory components and build recursively */
    /* For each top-level name or directory prefix, group entries */
    typedef struct {
        char name[256];
        int is_tree;
        uint8_t sha1[20];
        uint32_t mode;
    } TreeItem;

    TreeItem *items = NULL;
    size_t nitems = 0;
    size_t items_cap = 0;

    for (size_t i = 0; i < idx->count; ) {
        const char *slash = strchr(idx->entries[i].name, '/');

        if (!slash) {
            /* Regular file at top level */
            if (nitems >= items_cap) {
                items_cap = items_cap ? items_cap * 2 : 32;
                items = realloc(items, items_cap * sizeof(TreeItem));
            }
            TreeItem *it = &items[nitems++];
            snprintf(it->name, sizeof(it->name), "%s", idx->entries[i].name);
            it->is_tree = 0;
            it->mode = idx->entries[i].mode;
            git_hex_to_bin(idx->entries[i].sha1_hex, it->sha1);
            i++;
        } else {
            /* Subdirectory: collect all entries under this prefix */
            size_t prefix_len = (size_t)(slash - idx->entries[i].name);
            char dir_name[256];
            memcpy(dir_name, idx->entries[i].name, prefix_len);
            dir_name[prefix_len] = '\0';

            /* Build sub-index with entries under this dir */
            GitIndex sub_idx;
            git_index_init(&sub_idx);

            size_t j = i;
            while (j < idx->count &&
                   strncmp(idx->entries[j].name, dir_name, prefix_len) == 0 &&
                   idx->entries[j].name[prefix_len] == '/') {
                const GitIndexEntry *e = &idx->entries[j];
                git_index_add(&sub_idx, e->name + prefix_len + 1,
                              e->sha1_hex, e->mode, e->size, e->mtime_sec);
                j++;
            }

            /* Recursively write subtree */
            char sub_hex[GIT_SHA1_HEXSZ + 1];
            if (write_tree_from_index(git_dir, &sub_idx, sub_hex) != 0) {
                git_index_free(&sub_idx);
                free(items);
                return -1;
            }
            git_index_free(&sub_idx);

            if (nitems >= items_cap) {
                items_cap = items_cap ? items_cap * 2 : 32;
                items = realloc(items, items_cap * sizeof(TreeItem));
            }
            TreeItem *it = &items[nitems++];
            snprintf(it->name, sizeof(it->name), "%s", dir_name);
            it->is_tree = 1;
            it->mode = 040000;
            git_hex_to_bin(sub_hex, it->sha1);

            i = j;
        }
    }

    /* Build tree entries array */
    GitTreeEntry *tree_entries = malloc(nitems * sizeof(GitTreeEntry));
    for (size_t i = 0; i < nitems; i++) {
        tree_entries[i].mode = items[i].mode;
        snprintf(tree_entries[i].name, sizeof(tree_entries[i].name), "%s", items[i].name);
        memcpy(tree_entries[i].sha1, items[i].sha1, 20);
    }

    int rc = git_write_tree(git_dir, tree_entries, nitems, tree_hex);
    free(tree_entries);
    free(items);
    return rc;
}

static int cmd_commit(int argc, char **argv) {
    const char *message = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-m") == 0 && i + 1 < argc) {
            message = argv[++i];
        } else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git commit -m <message>\n");
            return 0;
        }
    }

    if (!message) {
        fprintf(stderr, "error: switch 'm' requires a value\n");
        return 1;
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    /* Read index */
    GitIndex idx;
    git_index_init(&idx);
    if (git_index_read(&idx, git_dir) != 0) {
        fprintf(stderr, "fatal: unable to read index\n");
        free(git_dir);
        return 1;
    }

    if (idx.count == 0) {
        fprintf(stderr, "nothing to commit (create/copy files and use \"git add\" to track)\n");
        git_index_free(&idx);
        free(git_dir);
        return 1;
    }

    /* Build tree from index */
    char tree_hex[GIT_SHA1_HEXSZ + 1];
    if (write_tree_from_index(git_dir, &idx, tree_hex) != 0) {
        fprintf(stderr, "fatal: unable to write tree\n");
        git_index_free(&idx);
        free(git_dir);
        return 1;
    }

    /* Get parent commit (HEAD) */
    char parent_hex[GIT_SHA1_HEXSZ + 1];
    char head_ref[256];
    parent_hex[0] = '\0';
    head_ref[0] = '\0';
    int has_parent = (git_read_head(git_dir, parent_hex, head_ref, sizeof(head_ref)) == 0);

    /* Check if tree is same as parent's tree (nothing to commit) */
    if (has_parent) {
        char parent_tree[GIT_SHA1_HEXSZ + 1];
        char p_parent[GIT_SHA1_HEXSZ + 1];
        if (git_read_commit(git_dir, parent_hex, parent_tree, p_parent, NULL, NULL) == 0) {
            if (strcmp(tree_hex, parent_tree) == 0) {
                printf("On branch %s\nnothing to commit, working tree clean\n",
                       head_ref[0] ? strrchr(head_ref, '/') + 1 : "HEAD");
                git_index_free(&idx);
                free(git_dir);
                return 0;
            }
        }
    }

    /* Build author/committer lines */
    const char *author_name = getenv("GIT_AUTHOR_NAME");
    const char *author_email = getenv("GIT_AUTHOR_EMAIL");
    const char *committer_name = getenv("GIT_COMMITTER_NAME");
    const char *committer_email = getenv("GIT_COMMITTER_EMAIL");

    if (!author_name) author_name = "Unknown";
    if (!author_email) author_email = "unknown@unknown";
    if (!committer_name) committer_name = author_name;
    if (!committer_email) committer_email = author_email;

    time_t now = time(NULL);
    char author_line[512], committer_line[512];
    snprintf(author_line, sizeof(author_line), "%s <%s> %ld +0000",
             author_name, author_email, (long)now);
    snprintf(committer_line, sizeof(committer_line), "%s <%s> %ld +0000",
             committer_name, committer_email, (long)now);

    /* Write commit object */
    char commit_hex[GIT_SHA1_HEXSZ + 1];
    if (git_write_commit(git_dir, tree_hex,
                         has_parent ? parent_hex : NULL,
                         author_line, committer_line, message,
                         commit_hex) != 0) {
        fprintf(stderr, "fatal: unable to write commit\n");
        git_index_free(&idx);
        free(git_dir);
        return 1;
    }

    /* Update ref */
    if (head_ref[0]) {
        git_update_ref(git_dir, head_ref, commit_hex);
    } else {
        /* Detached HEAD or first commit */
        char head_path[512];
        snprintf(head_path, sizeof(head_path), "%s/HEAD", git_dir);

        /* Read HEAD to check for symbolic ref */
        FILE *f = fopen(head_path, "r");
        if (f) {
            char buf[256];
            if (fgets(buf, sizeof(buf), f)) {
                size_t len = strlen(buf);
                while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r'))
                    buf[--len] = '\0';
                if (strncmp(buf, "ref: ", 5) == 0) {
                    git_update_ref(git_dir, buf + 5, commit_hex);
                    fclose(f);
                    goto done;
                }
            }
            fclose(f);
        }
        /* Write directly to HEAD */
        f = fopen(head_path, "w");
        if (f) { fprintf(f, "%s\n", commit_hex); fclose(f); }
    }

done:;
    /* Determine branch name for display */
    const char *branch = "HEAD";
    if (head_ref[0]) {
        const char *last = strrchr(head_ref, '/');
        if (last) branch = last + 1;
    }

    printf("[%s%s %.7s] %s\n",
           branch,
           has_parent ? "" : " (root-commit)",
           commit_hex, message);

    /* Count files changed */
    size_t files_changed = idx.count;
    if (has_parent) {
        /* Could diff trees, but for simplicity report index count */
    }
    printf(" %zu file%s changed\n", files_changed, files_changed != 1 ? "s" : "");

    git_index_free(&idx);
    free(git_dir);
    return 0;
}

/* --- status --- */

/* Collect entries from a tree recursively with prefix */
static void collect_tree_entries(const char *git_dir, const char *tree_hex,
                                 const char *prefix, PathList *pl,
                                 char ***hashes, size_t *hash_cap) {
    GitTreeEntry *entries = NULL;
    size_t nentries = 0;
    if (git_read_tree(git_dir, tree_hex, &entries, &nentries) != 0) return;

    for (size_t i = 0; i < nentries; i++) {
        char path[4096];
        if (prefix[0])
            snprintf(path, sizeof(path), "%s/%s", prefix, entries[i].name);
        else
            snprintf(path, sizeof(path), "%s", entries[i].name);

        if (entries[i].mode == 040000) {
            /* Subtree */
            char sub_hex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, sub_hex);
            collect_tree_entries(git_dir, sub_hex, path, pl, hashes, hash_cap);
        } else {
            size_t idx = pl->count;
            path_list_add(pl, path);
            /* Store hash */
            if (idx >= *hash_cap) {
                *hash_cap = *hash_cap ? *hash_cap * 2 : 64;
                *hashes = realloc(*hashes, *hash_cap * sizeof(char *));
            }
            char hex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, hex);
            (*hashes)[idx] = strdup(hex);
        }
    }
    free(entries);
}

static int cmd_status(int argc, char **argv) {
    (void)argc; (void)argv;

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char work_dir[4096];
    get_work_dir(git_dir, work_dir, sizeof(work_dir));

    /* Determine branch */
    char head_path[512];
    snprintf(head_path, sizeof(head_path), "%s/HEAD", git_dir);
    char *head_content = NULL;
    {
        FILE *f = fopen(head_path, "r");
        if (f) {
            char buf[256];
            if (fgets(buf, sizeof(buf), f)) {
                size_t len = strlen(buf);
                while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r'))
                    buf[--len] = '\0';
                head_content = strdup(buf);
            }
            fclose(f);
        }
    }

    const char *branch = "HEAD";
    int is_symbolic = 0;
    if (head_content && strncmp(head_content, "ref: ", 5) == 0) {
        const char *ref = head_content + 5;
        const char *last = strrchr(ref, '/');
        branch = last ? last + 1 : ref;
        is_symbolic = 1;
    }
    printf("On branch %s\n", branch);

    /* Read HEAD tree */
    char head_hex[GIT_SHA1_HEXSZ + 1];
    char head_ref[256];
    int has_head = (git_read_head(git_dir, head_hex, head_ref, sizeof(head_ref)) == 0);

    PathList head_files;
    path_list_init(&head_files);
    char **head_hashes = NULL;
    size_t head_hash_cap = 0;

    if (has_head) {
        char tree_hex[GIT_SHA1_HEXSZ + 1];
        char parent[GIT_SHA1_HEXSZ + 1];
        if (git_read_commit(git_dir, head_hex, tree_hex, parent, NULL, NULL) == 0) {
            collect_tree_entries(git_dir, tree_hex, "", &head_files, &head_hashes, &head_hash_cap);
        }
    } else {
        printf("\nNo commits yet\n");
    }

    /* Read index */
    GitIndex idx;
    git_index_init(&idx);
    git_index_read(&idx, git_dir);

    /* Compare HEAD vs index -> "Changes to be committed" */
    int has_staged = 0;
    for (size_t i = 0; i < idx.count; i++) {
        int found = 0;
        for (size_t j = 0; j < head_files.count; j++) {
            if (strcmp(idx.entries[i].name, head_files.paths[j]) == 0) {
                found = 1;
                if (strcmp(idx.entries[i].sha1_hex, head_hashes[j]) != 0) {
                    if (!has_staged) {
                        printf("\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n");
                        has_staged = 1;
                    }
                    printf("\tmodified:   %s\n", idx.entries[i].name);
                }
                break;
            }
        }
        if (!found) {
            if (!has_staged) {
                printf("\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n");
                has_staged = 1;
            }
            printf("\tnew file:   %s\n", idx.entries[i].name);
        }
    }

    /* Check deleted in index (in HEAD but not in index) */
    for (size_t j = 0; j < head_files.count; j++) {
        if (!git_index_find(&idx, head_files.paths[j])) {
            if (!has_staged) {
                printf("\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n");
                has_staged = 1;
            }
            printf("\tdeleted:    %s\n", head_files.paths[j]);
        }
    }

    /* Compare index vs working tree -> "Changes not staged for commit" */
    int has_unstaged = 0;
    for (size_t i = 0; i < idx.count; i++) {
        char full[4096];
        snprintf(full, sizeof(full), "%s/%s", work_dir, idx.entries[i].name);

        struct stat st;
        if (stat(full, &st) != 0) {
            if (!has_unstaged) {
                printf("\nChanges not staged for commit:\n  (use \"git add <file>...\" to update what will be committed)\n");
                has_unstaged = 1;
            }
            printf("\tdeleted:    %s\n", idx.entries[i].name);
            continue;
        }

        /* Quick check: compare file content hash to index hash */
        size_t flen;
        uint8_t *fdata = read_file(full, &flen);
        if (fdata) {
            char hex[GIT_SHA1_HEXSZ + 1];
            git_hash_object("blob", fdata, flen, hex);
            if (strcmp(hex, idx.entries[i].sha1_hex) != 0) {
                if (!has_unstaged) {
                    printf("\nChanges not staged for commit:\n  (use \"git add <file>...\" to update what will be committed)\n");
                    has_unstaged = 1;
                }
                printf("\tmodified:   %s\n", idx.entries[i].name);
            }
            free(fdata);
        }
    }

    /* Untracked files */
    PathList work_files;
    path_list_init(&work_files);
    collect_files(work_dir, "", &work_files);
    qsort(work_files.paths, work_files.count, sizeof(char *), path_cmp);

    int has_untracked = 0;
    for (size_t i = 0; i < work_files.count; i++) {
        if (!git_index_find(&idx, work_files.paths[i])) {
            if (!has_untracked) {
                printf("\nUntracked files:\n  (use \"git add <file>...\" to include in what will be committed)\n");
                has_untracked = 1;
            }
            printf("\t%s\n", work_files.paths[i]);
        }
    }
    path_list_free(&work_files);

    if (!has_staged && !has_unstaged && !has_untracked) {
        if (has_head)
            printf("nothing to commit, working tree clean\n");
        else
            printf("nothing to commit (create/copy files and use \"git add\" to track)\n");
    }

    /* Cleanup */
    for (size_t j = 0; j < head_files.count; j++) free(head_hashes[j]);
    free(head_hashes);
    path_list_free(&head_files);
    git_index_free(&idx);
    free(head_content);
    free(git_dir);
    return 0;
}

/* --- log --- */

/* Print a single commit in log format */
static void log_print_commit(const char *hex, const char *deco,
                              const char *author, const char *message,
                              int oneline, int graph) {
    const char *gp = graph ? "* " : "";
    const char *gc = graph ? "| " : "";

    if (oneline) {
        if (deco && deco[0])
            printf("%s%.7s (%s) %s\n", gp, hex, deco, message ? message : "");
        else
            printf("%s%.7s %s\n", gp, hex, message ? message : "");
    } else {
        printf("%scommit %s", gp, hex);
        if (deco && deco[0]) printf(" (%s)", deco);
        printf("\n");
        if (author) printf("%sAuthor: %s\n", gc, author);
        printf("%s\n", gc);
        if (message) printf("%s    %s\n", gc, message);
        printf("%s\n", gc);
    }
}

/* --all log: separate function to isolate large stack usage from normal log path */
static int cmd_log_all(const char *git_dir, const char *head_hex,
                       const char *head_ref, int has_head,
                       int oneline, int graph, int max_count) {
    #define LOG_MAX 64
    #define LOG_QMAX 128

    typedef struct { char hex[GIT_SHA1_HEXSZ + 1]; char name[128]; } RefEntry;
    RefEntry ref_map[16];
    int nref_map = 0;

    char queue[LOG_QMAX][GIT_SHA1_HEXSZ + 1];
    int qf = 0, qb = 0;

    char heads_path[512];
    snprintf(heads_path, sizeof(heads_path), "%s/refs/heads", git_dir);
    DIR *d = opendir(heads_path);
    if (d) {
        struct dirent *ent;
        while ((ent = readdir(d)) != NULL) {
            if (ent->d_name[0] == '.') continue;
            char rpath[256], rhex[GIT_SHA1_HEXSZ + 1];
            snprintf(rpath, sizeof(rpath), "refs/heads/%s", ent->d_name);
            if (git_resolve_ref(git_dir, rpath, rhex) == 0 && qb < LOG_QMAX) {
                memcpy(queue[qb++], rhex, GIT_SHA1_HEXSZ + 1);
                if (nref_map < 16) {
                    memcpy(ref_map[nref_map].hex, rhex, GIT_SHA1_HEXSZ + 1);
                    snprintf(ref_map[nref_map].name, sizeof(ref_map[nref_map].name),
                             "%s", ent->d_name);
                    nref_map++;
                }
            }
        }
        closedir(d);
    }
    char tags_path[512];
    snprintf(tags_path, sizeof(tags_path), "%s/refs/tags", git_dir);
    d = opendir(tags_path);
    if (d) {
        struct dirent *ent;
        while ((ent = readdir(d)) != NULL) {
            if (ent->d_name[0] == '.') continue;
            char rpath[256], rhex[GIT_SHA1_HEXSZ + 1];
            snprintf(rpath, sizeof(rpath), "refs/tags/%s", ent->d_name);
            if (git_resolve_ref(git_dir, rpath, rhex) == 0 && qb < LOG_QMAX) {
                memcpy(queue[qb++], rhex, GIT_SHA1_HEXSZ + 1);
                if (nref_map < 16) {
                    memcpy(ref_map[nref_map].hex, rhex, GIT_SHA1_HEXSZ + 1);
                    snprintf(ref_map[nref_map].name, sizeof(ref_map[nref_map].name),
                             "tag: %s", ent->d_name);
                    nref_map++;
                }
            }
        }
        closedir(d);
    }

    /* BFS walk */
    char seen[LOG_MAX][GIT_SHA1_HEXSZ + 1];
    long timestamps[LOG_MAX];
    char *authors[LOG_MAX];
    char *messages_arr[LOG_MAX];
    int nseen = 0;

    while (qf < qb && nseen < LOG_MAX) {
        char cur[GIT_SHA1_HEXSZ + 1];
        memcpy(cur, queue[qf++], GIT_SHA1_HEXSZ + 1);
        int dup = 0;
        for (int i = 0; i < nseen; i++)
            if (strcmp(seen[i], cur) == 0) { dup = 1; break; }
        if (dup) continue;

        char tree_hex[GIT_SHA1_HEXSZ + 1], parent_hex[GIT_SHA1_HEXSZ + 1];
        char *auth = NULL, *msg = NULL;
        if (git_read_commit(git_dir, cur, tree_hex, parent_hex, &auth, &msg) != 0)
            continue;

        long ts = 0;
        if (auth) {
            const char *gt = strrchr(auth, '>');
            if (gt && gt[1] == ' ') ts = atol(gt + 2);
        }

        memcpy(seen[nseen], cur, GIT_SHA1_HEXSZ + 1);
        timestamps[nseen] = ts;
        authors[nseen] = auth;
        messages_arr[nseen] = msg;
        nseen++;

        char pars[4][GIT_SHA1_HEXSZ + 1];
        int np = git_read_commit_parents(git_dir, cur, pars, 4);
        for (int p = 0; p < np && qb < LOG_QMAX; p++)
            memcpy(queue[qb++], pars[p], GIT_SHA1_HEXSZ + 1);
    }

    /* Sort by timestamp descending */
    for (int i = 0; i < nseen; i++) {
        for (int j = i + 1; j < nseen; j++) {
            if (timestamps[j] > timestamps[i]) {
                char th[GIT_SHA1_HEXSZ + 1];
                memcpy(th, seen[i], GIT_SHA1_HEXSZ + 1);
                memcpy(seen[i], seen[j], GIT_SHA1_HEXSZ + 1);
                memcpy(seen[j], th, GIT_SHA1_HEXSZ + 1);
                long tt = timestamps[i]; timestamps[i] = timestamps[j]; timestamps[j] = tt;
                char *ta = authors[i]; authors[i] = authors[j]; authors[j] = ta;
                char *tm = messages_arr[i]; messages_arr[i] = messages_arr[j]; messages_arr[j] = tm;
            }
        }
    }

    int count = 0;
    for (int ci = 0; ci < nseen && (max_count < 0 || count < max_count); ci++) {
        char deco[256] = "";
        int dpos = 0;
        if (has_head && strcmp(seen[ci], head_hex) == 0 && head_ref[0]) {
            const char *last = strrchr(head_ref, '/');
            dpos += snprintf(deco + dpos, sizeof(deco) - (size_t)dpos,
                             "HEAD -> %s", last ? last + 1 : head_ref);
        }
        for (int ri = 0; ri < nref_map; ri++) {
            if (strcmp(ref_map[ri].hex, seen[ci]) == 0) {
                if (has_head && head_ref[0]) {
                    const char *last = strrchr(head_ref, '/');
                    if (strcmp(ref_map[ri].name, last ? last + 1 : head_ref) == 0) continue;
                }
                if (dpos > 0) dpos += snprintf(deco + dpos, sizeof(deco) - (size_t)dpos, ", ");
                dpos += snprintf(deco + dpos, sizeof(deco) - (size_t)dpos, "%s", ref_map[ri].name);
            }
        }
        log_print_commit(seen[ci], deco, authors[ci], messages_arr[ci], oneline, graph);
        count++;
    }

    for (int ci = 0; ci < nseen; ci++) {
        free(authors[ci]);
        free(messages_arr[ci]);
    }
    return 0;
}

static int cmd_log(int argc, char **argv) {
    int oneline = 0;
    int max_count = -1;
    int all = 0;
    int graph = 0;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--oneline") == 0) oneline = 1;
        else if (strcmp(argv[i], "--all") == 0) all = 1;
        else if (strcmp(argv[i], "--graph") == 0) graph = 1;
        else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git log [--oneline] [--all] [--graph] [-n <count>]\n");
            return 0;
        }
        else if ((strcmp(argv[i], "-n") == 0 || strcmp(argv[i], "--max-count") == 0)
                 && i + 1 < argc) {
            max_count = atoi(argv[++i]);
        }
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char head_hex[GIT_SHA1_HEXSZ + 1];
    char head_ref[256];
    int has_head = (git_read_head(git_dir, head_hex, head_ref, sizeof(head_ref)) == 0);

    if (all) {
        int rc = cmd_log_all(git_dir, head_hex, head_ref, has_head,
                             oneline, graph, max_count);
        free(git_dir);
        return rc;
    }

    /* Simple linear walk from HEAD */
    if (!has_head) {
        fprintf(stderr, "fatal: your current branch '%s' does not have any commits yet\n",
                head_ref[0] ? strrchr(head_ref, '/') + 1 : "HEAD");
        free(git_dir);
        return 128;
    }

    char hex[GIT_SHA1_HEXSZ + 1];
    memcpy(hex, head_hex, GIT_SHA1_HEXSZ + 1);
    int count = 0;

    while (hex[0] && (max_count < 0 || count < max_count)) {
        char tree_hex[GIT_SHA1_HEXSZ + 1];
        char parent_hex[GIT_SHA1_HEXSZ + 1];
        char *author = NULL;
        char *message = NULL;

        if (git_read_commit(git_dir, hex, tree_hex, parent_hex, &author, &message) != 0)
            break;

        char deco[256] = "";
        if (count == 0 && head_ref[0]) {
            const char *last = strrchr(head_ref, '/');
            snprintf(deco, sizeof(deco), "HEAD -> %s", last ? last + 1 : head_ref);
        }

        log_print_commit(hex, deco, author, message, oneline, graph);
        free(author);
        free(message);

        if (parent_hex[0])
            memcpy(hex, parent_hex, GIT_SHA1_HEXSZ + 1);
        else
            break;
        count++;
    }

    free(git_dir);
    return 0;
}

/* --- diff --- */

static void print_diff_lines(const char *path, const char *old_data, size_t old_len,
                              const char *new_data, size_t new_len) {
    /* Simple line-by-line diff (unified format) */
    /* Count lines */
    size_t old_lines = 0, new_lines = 0;
    for (size_t i = 0; i < old_len; i++) if (old_data[i] == '\n') old_lines++;
    if (old_len > 0 && old_data[old_len - 1] != '\n') old_lines++;
    for (size_t i = 0; i < new_len; i++) if (new_data[i] == '\n') new_lines++;
    if (new_len > 0 && new_data[new_len - 1] != '\n') new_lines++;

    printf("diff --git a/%s b/%s\n", path, path);
    printf("--- a/%s\n", path);
    printf("+++ b/%s\n", path);

    /* Build line arrays */
    const char **old_arr = malloc((old_lines + 1) * sizeof(char *));
    size_t *old_arr_len = malloc((old_lines + 1) * sizeof(size_t));
    const char **new_arr = malloc((new_lines + 1) * sizeof(char *));
    size_t *new_arr_len = malloc((new_lines + 1) * sizeof(size_t));

    size_t oi = 0;
    const char *p = old_data;
    for (size_t i = 0; i < old_lines; i++) {
        old_arr[i] = p;
        const char *eol = memchr(p, '\n', old_len - (size_t)(p - old_data));
        if (eol) {
            old_arr_len[i] = (size_t)(eol - p);
            p = eol + 1;
        } else {
            old_arr_len[i] = old_len - (size_t)(p - old_data);
            p = old_data + old_len;
        }
    }
    (void)oi;

    p = new_data;
    for (size_t i = 0; i < new_lines; i++) {
        new_arr[i] = p;
        const char *eol = memchr(p, '\n', new_len - (size_t)(p - new_data));
        if (eol) {
            new_arr_len[i] = (size_t)(eol - p);
            p = eol + 1;
        } else {
            new_arr_len[i] = new_len - (size_t)(p - new_data);
            p = new_data + new_len;
        }
    }

    /* Simple diff: find matching runs, output hunks */
    /* Use naive O(nm) LCS to keep it simple */
    printf("@@ -%zu,%zu +%zu,%zu @@\n",
           old_lines ? (size_t)1 : (size_t)0, old_lines,
           new_lines ? (size_t)1 : (size_t)0, new_lines);

    /* Walk both arrays with simple forward comparison */
    size_t a = 0, b = 0;
    while (a < old_lines || b < new_lines) {
        /* Check if current lines match */
        if (a < old_lines && b < new_lines &&
            old_arr_len[a] == new_arr_len[b] &&
            memcmp(old_arr[a], new_arr[b], old_arr_len[a]) == 0) {
            printf(" %.*s\n", (int)old_arr_len[a], old_arr[a]);
            a++; b++;
        } else {
            /* Look ahead in new to find a match for old[a] */
            int found_in_new = -1;
            if (a < old_lines) {
                for (size_t k = b; k < new_lines && k < b + 10; k++) {
                    if (old_arr_len[a] == new_arr_len[k] &&
                        memcmp(old_arr[a], new_arr[k], old_arr_len[a]) == 0) {
                        found_in_new = (int)k;
                        break;
                    }
                }
            }

            /* Look ahead in old to find a match for new[b] */
            int found_in_old = -1;
            if (b < new_lines) {
                for (size_t k = a; k < old_lines && k < a + 10; k++) {
                    if (new_arr_len[b] == old_arr_len[k] &&
                        memcmp(new_arr[b], old_arr[k], new_arr_len[b]) == 0) {
                        found_in_old = (int)k;
                        break;
                    }
                }
            }

            if (found_in_new >= 0 && (found_in_old < 0 || (size_t)(found_in_new - (int)b) <= (size_t)(found_in_old - (int)a))) {
                /* Output new lines as additions until we match */
                while (b < (size_t)found_in_new) {
                    printf("+%.*s\n", (int)new_arr_len[b], new_arr[b]);
                    b++;
                }
            } else if (found_in_old >= 0) {
                /* Output old lines as deletions until we match */
                while (a < (size_t)found_in_old) {
                    printf("-%.*s\n", (int)old_arr_len[a], old_arr[a]);
                    a++;
                }
            } else {
                /* No match found nearby, output as change */
                if (a < old_lines) {
                    printf("-%.*s\n", (int)old_arr_len[a], old_arr[a]);
                    a++;
                }
                if (b < new_lines) {
                    printf("+%.*s\n", (int)new_arr_len[b], new_arr[b]);
                    b++;
                }
            }
        }
    }

    free(old_arr); free(old_arr_len);
    free(new_arr); free(new_arr_len);
}

static int cmd_diff(int argc, char **argv) {
    (void)argc; (void)argv;

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char work_dir[4096];
    get_work_dir(git_dir, work_dir, sizeof(work_dir));

    /* Read index */
    GitIndex idx;
    git_index_init(&idx);
    git_index_read(&idx, git_dir);

    int has_diff = 0;

    /* Compare index vs working tree */
    for (size_t i = 0; i < idx.count; i++) {
        char full[4096];
        snprintf(full, sizeof(full), "%s/%s", work_dir, idx.entries[i].name);

        size_t work_len;
        uint8_t *work_data = read_file(full, &work_len);
        if (!work_data) {
            /* Deleted file */
            printf("diff --git a/%s b/%s\n", idx.entries[i].name, idx.entries[i].name);
            printf("deleted file mode %06o\n", idx.entries[i].mode);
            has_diff = 1;
            continue;
        }

        /* Check if content differs */
        char work_hex[GIT_SHA1_HEXSZ + 1];
        git_hash_object("blob", work_data, work_len, work_hex);

        if (strcmp(work_hex, idx.entries[i].sha1_hex) != 0) {
            /* Read indexed blob */
            char type[32];
            uint8_t *idx_data = NULL;
            size_t idx_len = 0;
            if (git_read_object(git_dir, idx.entries[i].sha1_hex, type, sizeof(type),
                                &idx_data, &idx_len) == 0) {
                print_diff_lines(idx.entries[i].name,
                                 (const char *)idx_data, idx_len,
                                 (const char *)work_data, work_len);
                free(idx_data);
                has_diff = 1;
            }
        }
        free(work_data);
    }

    git_index_free(&idx);
    free(git_dir);
    return has_diff ? 0 : 0;
}

/* --- branch --- */

static int cmd_branch(int argc, char **argv) {
    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    int do_delete = 0;
    const char *name = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-d") == 0 || strcmp(argv[i], "-D") == 0) {
            do_delete = 1;
        } else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git branch [<name>] [-d <name>]\n");
            free(git_dir);
            return 0;
        } else if (argv[i][0] != '-') {
            name = argv[i];
        }
    }

    if (do_delete && name) {
        char del_path[512];
        snprintf(del_path, sizeof(del_path), "%s/refs/heads/%s", git_dir, name);
        if (unlink(del_path) != 0) {
            fprintf(stderr, "error: branch '%s' not found.\n", name);
            free(git_dir);
            return 1;
        }
        printf("Deleted branch %s\n", name);
        free(git_dir);
        return 0;
    }

    if (name) {
        /* Create branch at HEAD */
        char bhead_hex[GIT_SHA1_HEXSZ + 1];
        char bhead_ref[256];
        if (git_read_head(git_dir, bhead_hex, bhead_ref, sizeof(bhead_ref)) != 0) {
            fprintf(stderr, "fatal: not a valid object name: 'HEAD'\n");
            free(git_dir);
            return 128;
        }
        char ref_path[512];
        snprintf(ref_path, sizeof(ref_path), "%s/refs/heads/%s", git_dir, name);
        struct stat bst;
        if (stat(ref_path, &bst) == 0) {
            fprintf(stderr, "fatal: a branch named '%s' already exists.\n", name);
            free(git_dir);
            return 128;
        }
        char ref[256];
        snprintf(ref, sizeof(ref), "refs/heads/%s", name);
        git_update_ref(git_dir, ref, bhead_hex);
        free(git_dir);
        return 0;
    }

    /* List branches */
    char hpath[512];
    snprintf(hpath, sizeof(hpath), "%s/HEAD", git_dir);
    FILE *hf = fopen(hpath, "r");
    char current_branch[256] = "";
    if (hf) {
        char buf[256];
        if (fgets(buf, sizeof(buf), hf)) {
            size_t blen = strlen(buf);
            while (blen > 0 && (buf[blen - 1] == '\n' || buf[blen - 1] == '\r'))
                buf[--blen] = '\0';
            if (strncmp(buf, "ref: refs/heads/", 16) == 0)
                snprintf(current_branch, sizeof(current_branch), "%s", buf + 16);
        }
        fclose(hf);
    }

    char heads_dir[512];
    snprintf(heads_dir, sizeof(heads_dir), "%s/refs/heads", git_dir);
    DIR *bd = opendir(heads_dir);
    if (bd) {
        PathList pl;
        path_list_init(&pl);
        struct dirent *ent;
        while ((ent = readdir(bd)) != NULL) {
            if (ent->d_name[0] == '.') continue;
            path_list_add(&pl, ent->d_name);
        }
        closedir(bd);
        qsort(pl.paths, pl.count, sizeof(char *), path_cmp);
        for (size_t i = 0; i < pl.count; i++) {
            if (strcmp(pl.paths[i], current_branch) == 0)
                printf("* %s\n", pl.paths[i]);
            else
                printf("  %s\n", pl.paths[i]);
        }
        path_list_free(&pl);
    }

    free(git_dir);
    return 0;
}

/* --- checkout --- */

/* Restore a tree object to the working directory and populate an index */
static int restore_tree(const char *git_dir, const char *work_dir,
                        const char *tree_hex, const char *prefix,
                        GitIndex *idx) {
    GitTreeEntry *entries = NULL;
    size_t nentries = 0;
    if (git_read_tree(git_dir, tree_hex, &entries, &nentries) != 0) return -1;

    for (size_t i = 0; i < nentries; i++) {
        char relpath[4096], fullpath[4096];
        if (prefix[0])
            snprintf(relpath, sizeof(relpath), "%s/%s", prefix, entries[i].name);
        else
            snprintf(relpath, sizeof(relpath), "%s", entries[i].name);
        snprintf(fullpath, sizeof(fullpath), "%s/%s", work_dir, relpath);

        if (entries[i].mode == 040000) {
            mkdir(fullpath, 0755);
            char sub_hex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, sub_hex);
            if (restore_tree(git_dir, work_dir, sub_hex, relpath, idx) != 0) {
                free(entries);
                return -1;
            }
        } else {
            char blob_hex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, blob_hex);
            char rtype[32];
            uint8_t *rdata = NULL;
            size_t rlen = 0;
            if (git_read_object(git_dir, blob_hex, rtype, sizeof(rtype), &rdata, &rlen) != 0) {
                free(entries);
                return -1;
            }
            /* Ensure parent directory */
            char dirpath[4096];
            snprintf(dirpath, sizeof(dirpath), "%s", fullpath);
            char *sl = strrchr(dirpath, '/');
            if (sl) { *sl = '\0'; mkdirp(dirpath, 0755); }

            FILE *rf = fopen(fullpath, "wb");
            if (rf) { fwrite(rdata, 1, rlen, rf); fclose(rf); }
            git_index_add(idx, relpath, blob_hex, entries[i].mode, (uint32_t)rlen, 0);
            free(rdata);
        }
    }
    free(entries);
    return 0;
}

/* Remove tracked files from working directory */
static void clean_tracked_files(const char *work_dir, const GitIndex *idx) {
    for (size_t i = 0; i < idx->count; i++) {
        char fullpath[4096];
        snprintf(fullpath, sizeof(fullpath), "%s/%s", work_dir, idx->entries[i].name);
        unlink(fullpath);
    }
}

static int cmd_checkout(int argc, char **argv) {
    int create_branch = 0;
    const char *target = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-b") == 0) {
            create_branch = 1;
        } else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git checkout [-b] <branch>\n");
            return 0;
        } else if (argv[i][0] != '-') {
            target = argv[i];
        }
    }

    if (!target) {
        fprintf(stderr, "error: you must specify a branch or commit\n");
        return 1;
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char work_dir[4096];
    get_work_dir(git_dir, work_dir, sizeof(work_dir));

    if (create_branch) {
        char ch_hex[GIT_SHA1_HEXSZ + 1];
        char ch_ref[256];
        if (git_read_head(git_dir, ch_hex, ch_ref, sizeof(ch_ref)) != 0) {
            fprintf(stderr, "fatal: not a valid object name: 'HEAD'\n");
            free(git_dir);
            return 128;
        }
        char ref[256];
        snprintf(ref, sizeof(ref), "refs/heads/%s", target);
        git_update_ref(git_dir, ref, ch_hex);

        char head_path[512];
        snprintf(head_path, sizeof(head_path), "%s/HEAD", git_dir);
        FILE *hf = fopen(head_path, "w");
        if (hf) { fprintf(hf, "ref: %s\n", ref); fclose(hf); }

        printf("Switched to a new branch '%s'\n", target);
        free(git_dir);
        return 0;
    }

    /* Switch to existing branch */
    char target_hex[GIT_SHA1_HEXSZ + 1];
    char ref[256];
    snprintf(ref, sizeof(ref), "refs/heads/%s", target);
    if (git_resolve_ref(git_dir, ref, target_hex) != 0) {
        snprintf(ref, sizeof(ref), "refs/tags/%s", target);
        if (git_resolve_ref(git_dir, ref, target_hex) != 0) {
            fprintf(stderr, "error: pathspec '%s' did not match any file(s) known to git\n", target);
            free(git_dir);
            return 1;
        }
    }

    char co_tree[GIT_SHA1_HEXSZ + 1], co_parent[GIT_SHA1_HEXSZ + 1];
    if (git_read_commit(git_dir, target_hex, co_tree, co_parent, NULL, NULL) != 0) {
        fprintf(stderr, "fatal: unable to read commit\n");
        free(git_dir);
        return 128;
    }

    /* Clean current tracked files */
    GitIndex old_idx;
    git_index_init(&old_idx);
    git_index_read(&old_idx, git_dir);
    clean_tracked_files(work_dir, &old_idx);
    git_index_free(&old_idx);

    /* Restore target tree */
    GitIndex new_idx;
    git_index_init(&new_idx);
    if (restore_tree(git_dir, work_dir, co_tree, "", &new_idx) != 0) {
        fprintf(stderr, "fatal: unable to checkout tree\n");
        git_index_free(&new_idx);
        free(git_dir);
        return 128;
    }
    git_index_write(&new_idx, git_dir);
    git_index_free(&new_idx);

    /* Update HEAD */
    char head_path[512];
    snprintf(head_path, sizeof(head_path), "%s/HEAD", git_dir);
    FILE *hf = fopen(head_path, "w");
    if (hf) {
        fprintf(hf, "ref: refs/heads/%s\n", target);
        fclose(hf);
    }

    printf("Switched to branch '%s'\n", target);
    free(git_dir);
    return 0;
}

/* --- merge --- */

/* Flat tree for three-way merge comparison */
typedef struct {
    char path[4096];
    char sha1_hex[GIT_SHA1_HEXSZ + 1];
    uint32_t mode;
} FlatTreeEntry;

typedef struct {
    FlatTreeEntry *entries;
    size_t count;
    size_t capacity;
} FlatTree;

static void flat_tree_init(FlatTree *ft) {
    ft->entries = NULL; ft->count = 0; ft->capacity = 0;
}

static void flat_tree_add(FlatTree *ft, const char *fpath, const char *sha1_hex, uint32_t mode) {
    if (ft->count >= ft->capacity) {
        ft->capacity = ft->capacity ? ft->capacity * 2 : 32;
        ft->entries = realloc(ft->entries, ft->capacity * sizeof(FlatTreeEntry));
    }
    FlatTreeEntry *e = &ft->entries[ft->count++];
    snprintf(e->path, sizeof(e->path), "%s", fpath);
    memcpy(e->sha1_hex, sha1_hex, GIT_SHA1_HEXSZ + 1);
    e->mode = mode;
}

static void flat_tree_free(FlatTree *ft) {
    free(ft->entries); ft->entries = NULL; ft->count = 0;
}

static const char *flat_tree_find(const FlatTree *ft, const char *fpath) {
    for (size_t i = 0; i < ft->count; i++) {
        if (strcmp(ft->entries[i].path, fpath) == 0)
            return ft->entries[i].sha1_hex;
    }
    return NULL;
}

static void collect_tree_flat(const char *git_dir, const char *tree_hex,
                               const char *prefix, FlatTree *ft) {
    GitTreeEntry *entries = NULL;
    size_t nentries = 0;
    if (git_read_tree(git_dir, tree_hex, &entries, &nentries) != 0) return;
    for (size_t i = 0; i < nentries; i++) {
        char fpath[4096];
        if (prefix[0])
            snprintf(fpath, sizeof(fpath), "%s/%s", prefix, entries[i].name);
        else
            snprintf(fpath, sizeof(fpath), "%s", entries[i].name);
        if (entries[i].mode == 040000) {
            char sub_hex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, sub_hex);
            collect_tree_flat(git_dir, sub_hex, fpath, ft);
        } else {
            char ehex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, ehex);
            flat_tree_add(ft, fpath, ehex, entries[i].mode);
        }
    }
    free(entries);
}

/* Find merge base via BFS */
static int find_merge_base(const char *git_dir, const char *hex1, const char *hex2,
                           char base_hex[GIT_SHA1_HEXSZ + 1]) {
    char (*ancestors)[GIT_SHA1_HEXSZ + 1] = malloc(2048 * (GIT_SHA1_HEXSZ + 1));
    int n_anc = 0;
    char (*bq)[GIT_SHA1_HEXSZ + 1] = malloc(2048 * (GIT_SHA1_HEXSZ + 1));
    int bf = 0, bb = 0;

    memcpy(bq[bb++], hex1, GIT_SHA1_HEXSZ + 1);
    while (bf < bb && n_anc < 2048) {
        char cur[GIT_SHA1_HEXSZ + 1];
        memcpy(cur, bq[bf++], GIT_SHA1_HEXSZ + 1);
        int seen = 0;
        for (int i = 0; i < n_anc; i++)
            if (strcmp(ancestors[i], cur) == 0) { seen = 1; break; }
        if (seen) continue;
        memcpy(ancestors[n_anc++], cur, GIT_SHA1_HEXSZ + 1);
        char parents[4][GIT_SHA1_HEXSZ + 1];
        int np = git_read_commit_parents(git_dir, cur, parents, 4);
        for (int i = 0; i < np && bb < 2048; i++)
            memcpy(bq[bb++], parents[i], GIT_SHA1_HEXSZ + 1);
    }

    bf = 0; bb = 0;
    memcpy(bq[bb++], hex2, GIT_SHA1_HEXSZ + 1);
    char (*seen2)[GIT_SHA1_HEXSZ + 1] = malloc(2048 * (GIT_SHA1_HEXSZ + 1));
    int ns2 = 0;
    while (bf < bb) {
        char cur[GIT_SHA1_HEXSZ + 1];
        memcpy(cur, bq[bf++], GIT_SHA1_HEXSZ + 1);
        int s = 0;
        for (int i = 0; i < ns2; i++)
            if (strcmp(seen2[i], cur) == 0) { s = 1; break; }
        if (s) continue;
        if (ns2 < 2048) memcpy(seen2[ns2++], cur, GIT_SHA1_HEXSZ + 1);
        for (int i = 0; i < n_anc; i++) {
            if (strcmp(cur, ancestors[i]) == 0) {
                memcpy(base_hex, cur, GIT_SHA1_HEXSZ + 1);
                free(ancestors); free(bq); free(seen2);
                return 0;
            }
        }
        char parents[4][GIT_SHA1_HEXSZ + 1];
        int np = git_read_commit_parents(git_dir, cur, parents, 4);
        for (int i = 0; i < np && bb < 2048; i++)
            memcpy(bq[bb++], parents[i], GIT_SHA1_HEXSZ + 1);
    }

    free(ancestors); free(bq); free(seen2);
    base_hex[0] = '\0';
    return -1;
}

static int cmd_merge(int argc, char **argv) {
    const char *branch_name = NULL;
    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git merge <branch>\n");
            return 0;
        }
        if (argv[i][0] != '-') branch_name = argv[i];
    }
    if (!branch_name) {
        fprintf(stderr, "usage: git merge <branch>\n");
        return 1;
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char work_dir[4096];
    get_work_dir(git_dir, work_dir, sizeof(work_dir));

    char mhead_hex[GIT_SHA1_HEXSZ + 1], mhead_ref[256];
    if (git_read_head(git_dir, mhead_hex, mhead_ref, sizeof(mhead_ref)) != 0) {
        fprintf(stderr, "fatal: not a valid object name: 'HEAD'\n");
        free(git_dir); return 128;
    }

    char their_hex[GIT_SHA1_HEXSZ + 1];
    char merge_ref[256];
    snprintf(merge_ref, sizeof(merge_ref), "refs/heads/%s", branch_name);
    if (git_resolve_ref(git_dir, merge_ref, their_hex) != 0) {
        fprintf(stderr, "merge: %s - not something we can merge\n", branch_name);
        free(git_dir); return 1;
    }

    if (strcmp(mhead_hex, their_hex) == 0) {
        printf("Already up to date.\n");
        free(git_dir); return 0;
    }

    char base_hex[GIT_SHA1_HEXSZ + 1];
    if (find_merge_base(git_dir, mhead_hex, their_hex, base_hex) != 0) {
        fprintf(stderr, "fatal: refusing to merge unrelated histories\n");
        free(git_dir); return 128;
    }

    /* Fast-forward */
    if (strcmp(base_hex, mhead_hex) == 0) {
        if (mhead_ref[0])
            git_update_ref(git_dir, mhead_ref, their_hex);

        char ff_tree[GIT_SHA1_HEXSZ + 1], ff_p[GIT_SHA1_HEXSZ + 1];
        git_read_commit(git_dir, their_hex, ff_tree, ff_p, NULL, NULL);

        GitIndex old_idx;
        git_index_init(&old_idx);
        git_index_read(&old_idx, git_dir);
        clean_tracked_files(work_dir, &old_idx);
        git_index_free(&old_idx);

        GitIndex ff_idx;
        git_index_init(&ff_idx);
        restore_tree(git_dir, work_dir, ff_tree, "", &ff_idx);
        git_index_write(&ff_idx, git_dir);
        git_index_free(&ff_idx);

        printf("Updating %.7s..%.7s\nFast-forward\n", base_hex, their_hex);
        free(git_dir);
        return 0;
    }

    /* Already up to date */
    if (strcmp(base_hex, their_hex) == 0) {
        printf("Already up to date.\n");
        free(git_dir); return 0;
    }

    /* Three-way merge */
    char our_tree[GIT_SHA1_HEXSZ + 1], our_p[GIT_SHA1_HEXSZ + 1];
    char their_tree[GIT_SHA1_HEXSZ + 1], their_p[GIT_SHA1_HEXSZ + 1];
    char base_tree[GIT_SHA1_HEXSZ + 1], base_p[GIT_SHA1_HEXSZ + 1];

    git_read_commit(git_dir, mhead_hex, our_tree, our_p, NULL, NULL);
    git_read_commit(git_dir, their_hex, their_tree, their_p, NULL, NULL);
    git_read_commit(git_dir, base_hex, base_tree, base_p, NULL, NULL);

    FlatTree base_ft, our_ft, their_ft;
    flat_tree_init(&base_ft);
    flat_tree_init(&our_ft);
    flat_tree_init(&their_ft);
    collect_tree_flat(git_dir, base_tree, "", &base_ft);
    collect_tree_flat(git_dir, our_tree, "", &our_ft);
    collect_tree_flat(git_dir, their_tree, "", &their_ft);

    /* Collect all unique paths */
    PathList merge_paths;
    path_list_init(&merge_paths);
    for (size_t i = 0; i < base_ft.count; i++) path_list_add(&merge_paths, base_ft.entries[i].path);
    for (size_t i = 0; i < our_ft.count; i++) path_list_add(&merge_paths, our_ft.entries[i].path);
    for (size_t i = 0; i < their_ft.count; i++) path_list_add(&merge_paths, their_ft.entries[i].path);
    qsort(merge_paths.paths, merge_paths.count, sizeof(char *), path_cmp);
    /* Deduplicate */
    size_t unique = 0;
    for (size_t i = 0; i < merge_paths.count; i++) {
        if (i > 0 && strcmp(merge_paths.paths[i], merge_paths.paths[i - 1]) == 0) {
            free(merge_paths.paths[i]);
            continue;
        }
        merge_paths.paths[unique++] = merge_paths.paths[i];
    }
    merge_paths.count = unique;

    /* Clean old tracked files before writing merge result */
    GitIndex pre_idx;
    git_index_init(&pre_idx);
    git_index_read(&pre_idx, git_dir);
    clean_tracked_files(work_dir, &pre_idx);
    git_index_free(&pre_idx);

    int has_conflicts = 0;
    GitIndex merge_idx;
    git_index_init(&merge_idx);

    for (size_t i = 0; i < merge_paths.count; i++) {
        const char *mp = merge_paths.paths[i];
        const char *bh = flat_tree_find(&base_ft, mp);
        const char *oh = flat_tree_find(&our_ft, mp);
        const char *th = flat_tree_find(&their_ft, mp);
        const char *result_hash = NULL;

        if (oh && th) {
            if (strcmp(oh, th) == 0) {
                result_hash = oh;
            } else if (bh && strcmp(bh, oh) == 0) {
                result_hash = th;
            } else if (bh && strcmp(bh, th) == 0) {
                result_hash = oh;
            } else {
                /* Conflict */
                has_conflicts = 1;
                char ctype[32];
                uint8_t *od = NULL, *td = NULL;
                size_t ol = 0, tl = 0;
                git_read_object(git_dir, oh, ctype, sizeof(ctype), &od, &ol);
                git_read_object(git_dir, th, ctype, sizeof(ctype), &td, &tl);

                char cfull[4096];
                snprintf(cfull, sizeof(cfull), "%s/%s", work_dir, mp);
                char cdir[4096];
                snprintf(cdir, sizeof(cdir), "%s", cfull);
                char *csl = strrchr(cdir, '/');
                if (csl) { *csl = '\0'; mkdirp(cdir, 0755); }

                FILE *cf = fopen(cfull, "w");
                if (cf) {
                    fprintf(cf, "<<<<<<< HEAD\n");
                    if (od) fwrite(od, 1, ol, cf);
                    if (ol > 0 && od[ol - 1] != '\n') fprintf(cf, "\n");
                    fprintf(cf, "=======\n");
                    if (td) fwrite(td, 1, tl, cf);
                    if (tl > 0 && td[tl - 1] != '\n') fprintf(cf, "\n");
                    fprintf(cf, ">>>>>>> %s\n", branch_name);
                    fclose(cf);
                }
                size_t cflen;
                uint8_t *cfdata = read_file(cfull, &cflen);
                if (cfdata) {
                    char cfhex[GIT_SHA1_HEXSZ + 1];
                    git_write_object(git_dir, "blob", cfdata, cflen, cfhex);
                    git_index_add(&merge_idx, mp, cfhex, 0100644, (uint32_t)cflen, 0);
                    free(cfdata);
                }
                free(od); free(td);
                fprintf(stderr, "CONFLICT (content): Merge conflict in %s\n", mp);
                continue;
            }
        } else if (oh && !th) {
            if (bh && strcmp(bh, oh) == 0) continue;
            result_hash = oh;
        } else if (!oh && th) {
            if (bh && strcmp(bh, th) == 0) continue;
            result_hash = th;
        } else {
            continue;
        }

        if (result_hash) {
            char wtype[32];
            uint8_t *wdata = NULL;
            size_t wlen = 0;
            if (git_read_object(git_dir, result_hash, wtype, sizeof(wtype), &wdata, &wlen) == 0) {
                char wfull[4096];
                snprintf(wfull, sizeof(wfull), "%s/%s", work_dir, mp);
                char wdir[4096];
                snprintf(wdir, sizeof(wdir), "%s", wfull);
                char *wsl = strrchr(wdir, '/');
                if (wsl) { *wsl = '\0'; mkdirp(wdir, 0755); }
                FILE *wf = fopen(wfull, "wb");
                if (wf) { fwrite(wdata, 1, wlen, wf); fclose(wf); }
                git_index_add(&merge_idx, mp, result_hash, 0100644, (uint32_t)wlen, 0);
                free(wdata);
            }
        }
    }

    git_index_write(&merge_idx, git_dir);
    git_index_free(&merge_idx);
    path_list_free(&merge_paths);
    flat_tree_free(&base_ft);
    flat_tree_free(&our_ft);
    flat_tree_free(&their_ft);

    if (has_conflicts) {
        fprintf(stderr, "Automatic merge failed; fix conflicts and then commit the result.\n");
        free(git_dir);
        return 1;
    }

    /* Create merge commit */
    GitIndex mi;
    git_index_init(&mi);
    git_index_read(&mi, git_dir);
    char merge_tree[GIT_SHA1_HEXSZ + 1];
    write_tree_from_index(git_dir, &mi, merge_tree);
    git_index_free(&mi);

    const char *ma_name = getenv("GIT_AUTHOR_NAME");
    const char *ma_email = getenv("GIT_AUTHOR_EMAIL");
    const char *mc_name = getenv("GIT_COMMITTER_NAME");
    const char *mc_email = getenv("GIT_COMMITTER_EMAIL");
    if (!ma_name) ma_name = "Unknown";
    if (!ma_email) ma_email = "unknown@unknown";
    if (!mc_name) mc_name = ma_name;
    if (!mc_email) mc_email = ma_email;

    time_t merge_now = time(NULL);
    char ma_line[512], mc_line[512];
    snprintf(ma_line, sizeof(ma_line), "%s <%s> %ld +0000", ma_name, ma_email, (long)merge_now);
    snprintf(mc_line, sizeof(mc_line), "%s <%s> %ld +0000", mc_name, mc_email, (long)merge_now);

    char merge_msg[256];
    snprintf(merge_msg, sizeof(merge_msg), "Merge branch '%s'", branch_name);

    size_t mcap = 1024;
    char *mbuf = malloc(mcap);
    int mpos = snprintf(mbuf, mcap, "tree %s\n", merge_tree);
    mpos += snprintf(mbuf + mpos, mcap - (size_t)mpos, "parent %s\n", mhead_hex);
    mpos += snprintf(mbuf + mpos, mcap - (size_t)mpos, "parent %s\n", their_hex);
    mpos += snprintf(mbuf + mpos, mcap - (size_t)mpos, "author %s\n", ma_line);
    mpos += snprintf(mbuf + mpos, mcap - (size_t)mpos, "committer %s\n", mc_line);
    mpos += snprintf(mbuf + mpos, mcap - (size_t)mpos, "\n%s\n", merge_msg);

    char merge_commit_hex[GIT_SHA1_HEXSZ + 1];
    git_write_object(git_dir, "commit", (const uint8_t *)mbuf, (size_t)mpos, merge_commit_hex);
    free(mbuf);

    if (mhead_ref[0])
        git_update_ref(git_dir, mhead_ref, merge_commit_hex);

    printf("Merge made by the 'ort' strategy.\n");
    free(git_dir);
    return 0;
}

/* --- tag --- */

static int cmd_tag(int argc, char **argv) {
    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    int annotated = 0;
    const char *message = NULL;
    const char *tag_name = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-a") == 0) annotated = 1;
        else if (strcmp(argv[i], "-m") == 0 && i + 1 < argc) {
            message = argv[++i];
            annotated = 1;
        } else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git tag [<name>] [-a -m <message>]\n");
            free(git_dir);
            return 0;
        } else if (argv[i][0] != '-') {
            tag_name = argv[i];
        }
    }

    if (!tag_name) {
        /* List tags */
        char tags_dir[512];
        snprintf(tags_dir, sizeof(tags_dir), "%s/refs/tags", git_dir);
        DIR *td = opendir(tags_dir);
        if (td) {
            PathList pl;
            path_list_init(&pl);
            struct dirent *ent;
            while ((ent = readdir(td)) != NULL) {
                if (ent->d_name[0] == '.') continue;
                path_list_add(&pl, ent->d_name);
            }
            closedir(td);
            qsort(pl.paths, pl.count, sizeof(char *), path_cmp);
            for (size_t i = 0; i < pl.count; i++)
                printf("%s\n", pl.paths[i]);
            path_list_free(&pl);
        }
        free(git_dir);
        return 0;
    }

    char tag_head[GIT_SHA1_HEXSZ + 1], tag_href[256];
    if (git_read_head(git_dir, tag_head, tag_href, sizeof(tag_href)) != 0) {
        fprintf(stderr, "fatal: not a valid object name: 'HEAD'\n");
        free(git_dir);
        return 128;
    }

    char tref[256];
    snprintf(tref, sizeof(tref), "refs/tags/%s", tag_name);

    if (annotated && message) {
        const char *tagger_name = getenv("GIT_COMMITTER_NAME");
        const char *tagger_email = getenv("GIT_COMMITTER_EMAIL");
        if (!tagger_name) tagger_name = "Unknown";
        if (!tagger_email) tagger_email = "unknown@unknown";

        time_t tnow = time(NULL);
        char tbuf[4096];
        int tpos = snprintf(tbuf, sizeof(tbuf),
            "object %s\ntype commit\ntag %s\ntagger %s <%s> %ld +0000\n\n%s\n",
            tag_head, tag_name, tagger_name, tagger_email, (long)tnow, message);

        char tobj_hex[GIT_SHA1_HEXSZ + 1];
        if (git_write_object(git_dir, "tag", (const uint8_t *)tbuf,
                             (size_t)tpos, tobj_hex) != 0) {
            fprintf(stderr, "fatal: unable to write tag object\n");
            free(git_dir);
            return 1;
        }
        git_update_ref(git_dir, tref, tobj_hex);
    } else {
        git_update_ref(git_dir, tref, tag_head);
    }

    free(git_dir);
    return 0;
}

/* --- Config file helpers (for remote URLs) --- */

/* Read a remote's URL from .git/config */
static int git_config_get_remote_url(const char *git_dir, const char *name,
                                     char *url_out, size_t url_sz) {
    char config_path[4096];
    snprintf(config_path, sizeof(config_path), "%s/config", git_dir);

    size_t len;
    uint8_t *data = read_file(config_path, &len);
    if (!data) return -1;

    char section[256];
    snprintf(section, sizeof(section), "[remote \"%s\"]", name);

    char *pos = strstr((char *)data, section);
    if (!pos) { free(data); return -1; }
    pos += strlen(section);

    /* Find "url = " within this section (before next section header) */
    char *next_sec = strstr(pos, "\n[");
    char *url_key = strstr(pos, "url = ");
    if (!url_key || (next_sec && url_key > next_sec)) { free(data); return -1; }

    url_key += 6;
    while (*url_key == ' ' || *url_key == '\t') url_key++;

    char *eol = strchr(url_key, '\n');
    if (!eol) eol = (char *)data + len;

    size_t ulen = (size_t)(eol - url_key);
    while (ulen > 0 && (url_key[ulen - 1] == '\r' || url_key[ulen - 1] == ' '))
        ulen--;
    if (ulen >= url_sz) ulen = url_sz - 1;
    memcpy(url_out, url_key, ulen);
    url_out[ulen] = '\0';

    free(data);
    return 0;
}

/* Append a [remote] section to .git/config */
static int git_config_add_remote(const char *git_dir, const char *name, const char *url) {
    char config_path[4096];
    snprintf(config_path, sizeof(config_path), "%s/config", git_dir);

    FILE *f = fopen(config_path, "a");
    if (!f) return -1;

    fprintf(f, "[remote \"%s\"]\n", name);
    fprintf(f, "\turl = %s\n", url);
    fprintf(f, "\tfetch = +refs/heads/*:refs/remotes/%s/*\n", name);
    fclose(f);
    return 0;
}

/* Check if an object exists locally */
static int has_object(const char *git_dir, const char *hex) {
    char path[4096];
    snprintf(path, sizeof(path), "%s/objects/%.2s/%s", git_dir, hex, hex + 2);
    struct stat st;
    return stat(path, &st) == 0;
}

/* --- HTTP transport (requires libcurl) --- */

#ifdef HAS_CURL

typedef struct {
    uint8_t *data;
    size_t size;
    size_t capacity;
} HttpBuf;

static void httpbuf_init(HttpBuf *b) {
    b->data = NULL; b->size = 0; b->capacity = 0;
}

static void httpbuf_free(HttpBuf *b) {
    free(b->data); b->data = NULL; b->size = 0; b->capacity = 0;
}

static size_t httpbuf_write_cb(char *ptr, size_t sz, size_t nm, void *ud) {
    HttpBuf *b = (HttpBuf *)ud;
    size_t total = sz * nm;
    if (b->size + total > b->capacity) {
        size_t nc = (b->capacity + total) * 2;
        if (nc < 4096) nc = 4096;
        b->data = realloc(b->data, nc);
        b->capacity = nc;
    }
    memcpy(b->data + b->size, ptr, total);
    b->size += total;
    return total;
}

/* HTTP GET into buffer. Returns 0 on success. */
static int http_get(const char *url, HttpBuf *buf) {
    CURL *curl = curl_easy_init();
    if (!curl) return -1;

    httpbuf_init(buf);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, httpbuf_write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, buf);
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

    CURLcode res = curl_easy_perform(curl);
    long code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK || code != 200) {
        httpbuf_free(buf);
        return -1;
    }
    return 0;
}

/* HTTP PUT data to URL. Returns 0 on success. */
static int http_put(const char *url, const uint8_t *data, size_t len) {
    CURL *curl = curl_easy_init();
    if (!curl) return -1;

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "PUT");
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, data);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)len);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/octet-stream");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return (res == CURLE_OK) ? 0 : -1;
}

/* Download a loose object from remote if missing locally */
static int download_object(const char *base_url, const char *git_dir, const char *hex) {
    if (has_object(git_dir, hex)) return 0;

    char url[4096];
    snprintf(url, sizeof(url), "%s/objects/%.2s/%s", base_url, hex, hex + 2);

    HttpBuf buf;
    if (http_get(url, &buf) != 0) return -1;

    char obj_dir[4096];
    snprintf(obj_dir, sizeof(obj_dir), "%s/objects/%.2s", git_dir, hex);
    mkdir(obj_dir, 0755);

    char obj_path[4096];
    snprintf(obj_path, sizeof(obj_path), "%s/objects/%.2s/%s", git_dir, hex, hex + 2);

    FILE *f = fopen(obj_path, "wb");
    if (!f) { httpbuf_free(&buf); return -1; }
    fwrite(buf.data, 1, buf.size, f);
    fclose(f);
    httpbuf_free(&buf);
    return 0;
}

/* Download a tree and all blobs/subtrees it references */
static int download_tree(const char *base_url, const char *git_dir, const char *tree_hex) {
    if (download_object(base_url, git_dir, tree_hex) != 0) return -1;

    GitTreeEntry *entries = NULL;
    size_t nentries = 0;
    if (git_read_tree(git_dir, tree_hex, &entries, &nentries) != 0) return -1;

    for (size_t i = 0; i < nentries; i++) {
        char ehex[GIT_SHA1_HEXSZ + 1];
        git_bin_to_hex(entries[i].sha1, ehex);

        int rc = (entries[i].mode == 040000)
            ? download_tree(base_url, git_dir, ehex)
            : download_object(base_url, git_dir, ehex);
        if (rc != 0) { free(entries); return -1; }
    }
    free(entries);
    return 0;
}

/* Recursively download a commit and all its dependencies */
static int download_commit_graph(const char *base_url, const char *git_dir,
                                 const char *commit_hex) {
    if (has_object(git_dir, commit_hex)) return 0;
    if (download_object(base_url, git_dir, commit_hex) != 0) return -1;

    char tree_hex[GIT_SHA1_HEXSZ + 1], parent_hex[GIT_SHA1_HEXSZ + 1];
    if (git_read_commit(git_dir, commit_hex, tree_hex, parent_hex, NULL, NULL) != 0)
        return -1;

    if (download_tree(base_url, git_dir, tree_hex) != 0) return -1;

    char parents[16][GIT_SHA1_HEXSZ + 1];
    int np = git_read_commit_parents(git_dir, commit_hex, parents, 16);
    for (int i = 0; i < np; i++) {
        if (parents[i][0] && !has_object(git_dir, parents[i])) {
            if (download_commit_graph(base_url, git_dir, parents[i]) != 0)
                return -1;
        }
    }
    return 0;
}

/* Upload a loose object to remote via HTTP PUT */
static int upload_object(const char *base_url, const char *git_dir, const char *hex) {
    char obj_path[4096];
    snprintf(obj_path, sizeof(obj_path), "%s/objects/%.2s/%s", git_dir, hex, hex + 2);

    size_t len;
    uint8_t *data = read_file(obj_path, &len);
    if (!data) return -1;

    char url[4096];
    snprintf(url, sizeof(url), "%s/objects/%.2s/%s", base_url, hex, hex + 2);

    int rc = http_put(url, data, len);
    free(data);
    return rc;
}

/* Recursively upload a commit and all its new objects */
static int upload_commit_graph(const char *base_url, const char *git_dir,
                               const char *commit_hex, const char *stop_hex) {
    if (stop_hex && strcmp(commit_hex, stop_hex) == 0) return 0;

    if (upload_object(base_url, git_dir, commit_hex) != 0) return -1;

    char tree_hex[GIT_SHA1_HEXSZ + 1], parent_hex[GIT_SHA1_HEXSZ + 1];
    if (git_read_commit(git_dir, commit_hex, tree_hex, parent_hex, NULL, NULL) != 0)
        return -1;

    /* Upload tree and blobs */
    GitTreeEntry *entries = NULL;
    size_t nentries = 0;
    upload_object(base_url, git_dir, tree_hex);
    if (git_read_tree(git_dir, tree_hex, &entries, &nentries) == 0) {
        for (size_t i = 0; i < nentries; i++) {
            char ehex[GIT_SHA1_HEXSZ + 1];
            git_bin_to_hex(entries[i].sha1, ehex);
            upload_object(base_url, git_dir, ehex);
        }
        free(entries);
    }

    /* Upload parent commits (stop at known boundary) */
    char parents[16][GIT_SHA1_HEXSZ + 1];
    int np = git_read_commit_parents(git_dir, commit_hex, parents, 16);
    for (int i = 0; i < np; i++) {
        if (parents[i][0] && (!stop_hex || strcmp(parents[i], stop_hex) != 0))
            upload_commit_graph(base_url, git_dir, parents[i], stop_hex);
    }
    return 0;
}

/* Update a remote ref via HTTP PUT */
static int http_update_ref(const char *base_url, const char *ref, const char *hex) {
    char url[4096];
    snprintf(url, sizeof(url), "%s/%s", base_url, ref);

    char body[64];
    snprintf(body, sizeof(body), "%s\n", hex);
    return http_put(url, (const uint8_t *)body, strlen(body));
}

#endif /* HAS_CURL */

/* --- remote --- */

static int cmd_remote(int argc, char **argv) {
    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    int verbose = 0;
    const char *subcmd = NULL;
    int sub_start = -1;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "-v") == 0 || strcmp(argv[i], "--verbose") == 0)
            verbose = 1;
        else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git remote [-v] [add <name> <url>]\n");
            free(git_dir); return 0;
        } else if (argv[i][0] != '-' && !subcmd) {
            subcmd = argv[i];
            sub_start = i + 1;
        }
    }

    if (!subcmd) {
        /* List remotes */
        char config_path[4096];
        snprintf(config_path, sizeof(config_path), "%s/config", git_dir);
        size_t len;
        uint8_t *data = read_file(config_path, &len);
        if (data) {
            char *p = (char *)data;
            while ((p = strstr(p, "[remote \"")) != NULL) {
                p += 9;
                char *end = strchr(p, '"');
                if (!end) break;
                char rname[256];
                size_t rlen = (size_t)(end - p);
                if (rlen >= sizeof(rname)) rlen = sizeof(rname) - 1;
                memcpy(rname, p, rlen);
                rname[rlen] = '\0';

                if (verbose) {
                    char rurl[4096];
                    if (git_config_get_remote_url(git_dir, rname, rurl, sizeof(rurl)) == 0) {
                        printf("%s\t%s (fetch)\n", rname, rurl);
                        printf("%s\t%s (push)\n", rname, rurl);
                    } else {
                        printf("%s\n", rname);
                    }
                } else {
                    printf("%s\n", rname);
                }
                p = end + 1;
            }
            free(data);
        }
        free(git_dir);
        return 0;
    }

    if (strcmp(subcmd, "add") == 0) {
        const char *name = NULL, *url = NULL;
        for (int i = sub_start; i < argc; i++) {
            if (argv[i][0] == '-') continue;
            if (!name) name = argv[i];
            else if (!url) url = argv[i];
        }
        if (!name || !url) {
            fprintf(stderr, "usage: git remote add <name> <url>\n");
            free(git_dir); return 1;
        }

        /* Check if remote already exists */
        char existing[4096];
        if (git_config_get_remote_url(git_dir, name, existing, sizeof(existing)) == 0) {
            fprintf(stderr, "fatal: remote %s already exists.\n", name);
            free(git_dir); return 3;
        }

        if (git_config_add_remote(git_dir, name, url) != 0) {
            fprintf(stderr, "fatal: could not add remote '%s'\n", name);
            free(git_dir); return 1;
        }

        /* Create refs/remotes/<name>/ directory */
        char ref_dir[4096];
        snprintf(ref_dir, sizeof(ref_dir), "%s/refs/remotes/%s", git_dir, name);
        mkdirp(ref_dir, 0755);

        free(git_dir);
        return 0;
    }

    fprintf(stderr, "error: unknown subcommand: %s\n", subcmd);
    free(git_dir);
    return 1;
}

/* --- clone --- */

static int cmd_clone(int argc, char **argv) {
    const char *url = NULL;
    const char *dir = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git clone <url> [<directory>]\n");
            return 0;
        } else if (argv[i][0] != '-') {
            if (!url) url = argv[i];
            else if (!dir) dir = argv[i];
        }
    }

    if (!url) {
        fprintf(stderr, "usage: git clone <url> [<directory>]\n");
        return 1;
    }

#ifndef HAS_CURL
    fprintf(stderr, "fatal: git clone requires HTTP support (built without libcurl)\n");
    return 1;
#else
    /* Derive directory name from URL if not given */
    char auto_dir[256] = "";
    if (!dir) {
        const char *last_slash = strrchr(url, '/');
        const char *base = last_slash ? last_slash + 1 : url;
        snprintf(auto_dir, sizeof(auto_dir), "%s", base);
        size_t alen = strlen(auto_dir);
        if (alen > 4 && strcmp(auto_dir + alen - 4, ".git") == 0)
            auto_dir[alen - 4] = '\0';
        if (auto_dir[0] == '\0') snprintf(auto_dir, sizeof(auto_dir), "repo");
        dir = auto_dir;
    }

    printf("Cloning into '%s'...\n", dir);

    if (mkdir(dir, 0755) != 0 && errno != EEXIST) {
        fprintf(stderr, "fatal: could not create directory '%s'\n", dir);
        return 128;
    }

    char prev_cwd[4096];
    getcwd(prev_cwd, sizeof(prev_cwd));
    if (chdir(dir) != 0) {
        fprintf(stderr, "fatal: could not chdir to '%s'\n", dir);
        return 128;
    }

    /* git init */
    char *init_args[1] = { NULL };
    cmd_init(0, init_args);

    char *git_dir = git_find_repo();
    if (!git_dir) {
        chdir(prev_cwd);
        fprintf(stderr, "fatal: init failed\n");
        return 128;
    }

    /* Add remote origin */
    git_config_add_remote(git_dir, "origin", url);
    char rdir[4096];
    snprintf(rdir, sizeof(rdir), "%s/refs/remotes/origin", git_dir);
    mkdirp(rdir, 0755);

    /* Fetch info/refs */
    char refs_url[4096];
    snprintf(refs_url, sizeof(refs_url), "%s/info/refs", url);

    HttpBuf refs_buf;
    if (http_get(refs_url, &refs_buf) != 0) {
        fprintf(stderr, "fatal: repository '%s' not found\n", url);
        free(git_dir); chdir(prev_cwd); return 128;
    }

    /* Parse refs and download objects */
    char default_branch[256] = "";
    char default_hex[GIT_SHA1_HEXSZ + 1] = "";
    char *line = (char *)refs_buf.data;
    char *data_end = (char *)refs_buf.data + refs_buf.size;

    while (line < data_end) {
        char *nl = memchr(line, '\n', (size_t)(data_end - line));
        if (!nl) nl = data_end;

        /* Each line: <40hex>\t<refname> */
        if (nl - line >= 42 && line[40] == '\t') {
            char ref_hex[GIT_SHA1_HEXSZ + 1];
            memcpy(ref_hex, line, 40);
            ref_hex[40] = '\0';

            size_t rlen = (size_t)(nl - line - 41);
            char ref_name[256];
            if (rlen >= sizeof(ref_name)) rlen = sizeof(ref_name) - 1;
            memcpy(ref_name, line + 41, rlen);
            /* Trim trailing whitespace */
            while (rlen > 0 && (ref_name[rlen - 1] == '\r' || ref_name[rlen - 1] == ' '))
                rlen--;
            ref_name[rlen] = '\0';

            /* Download commit graph */
            if (download_commit_graph(url, git_dir, ref_hex) != 0) {
                fprintf(stderr, "warning: failed to download objects for %s\n", ref_name);
                line = nl + 1;
                continue;
            }

            /* Store remote tracking ref */
            if (strncmp(ref_name, "refs/heads/", 11) == 0) {
                char remote_ref[256];
                snprintf(remote_ref, sizeof(remote_ref),
                         "refs/remotes/origin/%s", ref_name + 11);
                git_update_ref(git_dir, remote_ref, ref_hex);

                /* Also create local branch */
                git_update_ref(git_dir, ref_name, ref_hex);

                /* Pick default branch: prefer main, then master, then first */
                const char *bname = ref_name + 11;
                if (default_hex[0] == '\0' ||
                    strcmp(bname, "main") == 0 ||
                    (strcmp(bname, "master") == 0 && strcmp(default_branch, "main") != 0)) {
                    memcpy(default_hex, ref_hex, GIT_SHA1_HEXSZ + 1);
                    snprintf(default_branch, sizeof(default_branch), "%s", ref_name);
                }
            } else if (strncmp(ref_name, "refs/tags/", 10) == 0) {
                git_update_ref(git_dir, ref_name, ref_hex);
            }
        }
        line = nl + 1;
    }
    httpbuf_free(&refs_buf);

    if (default_hex[0] == '\0') {
        fprintf(stderr, "warning: remote HEAD refers to nonexistent ref\n");
        free(git_dir); chdir(prev_cwd); return 0;
    }

    /* Set HEAD to default branch */
    char head_path[4096];
    snprintf(head_path, sizeof(head_path), "%s/HEAD", git_dir);
    FILE *hf = fopen(head_path, "w");
    if (hf) { fprintf(hf, "ref: %s\n", default_branch); fclose(hf); }

    /* Checkout the default branch */
    char tree_hex[GIT_SHA1_HEXSZ + 1], p_hex[GIT_SHA1_HEXSZ + 1];
    if (git_read_commit(git_dir, default_hex, tree_hex, p_hex, NULL, NULL) == 0) {
        char work_dir[4096];
        get_work_dir(git_dir, work_dir, sizeof(work_dir));

        GitIndex idx;
        git_index_init(&idx);
        restore_tree(git_dir, work_dir, tree_hex, "", &idx);
        git_index_write(&idx, git_dir);
        git_index_free(&idx);
    }

    free(git_dir);
    chdir(prev_cwd);
    return 0;
#endif /* HAS_CURL */
}

/* --- fetch --- */

static int cmd_fetch(int argc, char **argv) {
    const char *remote_name = "origin";

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git fetch [<remote>]\n");
            return 0;
        } else if (argv[i][0] != '-') {
            remote_name = argv[i];
        }
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

#ifndef HAS_CURL
    fprintf(stderr, "fatal: git fetch requires HTTP support (built without libcurl)\n");
    free(git_dir); return 1;
#else
    char url[4096];
    if (git_config_get_remote_url(git_dir, remote_name, url, sizeof(url)) != 0) {
        fprintf(stderr, "fatal: '%s' does not appear to be a git repository\n", remote_name);
        free(git_dir); return 128;
    }

    /* Fetch info/refs */
    char refs_url[4096];
    snprintf(refs_url, sizeof(refs_url), "%s/info/refs", url);

    HttpBuf refs_buf;
    if (http_get(refs_url, &refs_buf) != 0) {
        fprintf(stderr, "fatal: could not read from remote repository '%s'\n", url);
        free(git_dir); return 128;
    }

    int updated = 0;
    char *line = (char *)refs_buf.data;
    char *data_end = (char *)refs_buf.data + refs_buf.size;

    while (line < data_end) {
        char *nl = memchr(line, '\n', (size_t)(data_end - line));
        if (!nl) nl = data_end;

        if (nl - line >= 42 && line[40] == '\t') {
            char ref_hex[GIT_SHA1_HEXSZ + 1];
            memcpy(ref_hex, line, 40);
            ref_hex[40] = '\0';

            size_t rlen = (size_t)(nl - line - 41);
            char ref_name[256];
            if (rlen >= sizeof(ref_name)) rlen = sizeof(ref_name) - 1;
            memcpy(ref_name, line + 41, rlen);
            while (rlen > 0 && (ref_name[rlen - 1] == '\r' || ref_name[rlen - 1] == ' '))
                rlen--;
            ref_name[rlen] = '\0';

            if (strncmp(ref_name, "refs/heads/", 11) == 0) {
                char remote_ref[256];
                snprintf(remote_ref, sizeof(remote_ref),
                         "refs/remotes/%s/%s", remote_name, ref_name + 11);

                /* Check if we already have this ref at this commit */
                char existing[GIT_SHA1_HEXSZ + 1];
                if (git_resolve_ref(git_dir, remote_ref, existing) == 0 &&
                    strcmp(existing, ref_hex) == 0) {
                    line = nl + 1;
                    continue;
                }

                /* Download new objects */
                if (download_commit_graph(url, git_dir, ref_hex) == 0) {
                    git_update_ref(git_dir, remote_ref, ref_hex);
                    printf(" * [updated] %s -> %s/%s\n",
                           ref_name + 11, remote_name, ref_name + 11);
                    updated++;
                }
            }
        }
        line = nl + 1;
    }
    httpbuf_free(&refs_buf);

    if (updated == 0)
        printf("Already up to date.\n");
    else
        printf("From %s\n", url);

    free(git_dir);
    return 0;
#endif
}

/* --- pull --- */

static int cmd_pull(int argc, char **argv) {
    const char *remote_name = "origin";

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git pull [<remote>]\n");
            return 0;
        } else if (argv[i][0] != '-') {
            remote_name = argv[i];
        }
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    /* Read current HEAD ref name (e.g. refs/heads/main) */
    char head_hex[GIT_SHA1_HEXSZ + 1], head_ref[256];
    if (git_read_head(git_dir, head_hex, head_ref, sizeof(head_ref)) != 0) {
        fprintf(stderr, "fatal: not on any branch\n");
        free(git_dir); return 1;
    }

    /* Extract branch name from refs/heads/<branch> */
    const char *branch = head_ref;
    if (strncmp(branch, "refs/heads/", 11) == 0)
        branch = head_ref + 11;

    free(git_dir);

    /* Fetch first */
    char *fetch_args[2] = { (char *)remote_name, NULL };
    int rc = cmd_fetch(1, fetch_args);
    if (rc != 0) return rc;

    /* Then merge the remote tracking ref */
    git_dir = git_find_repo();
    if (!git_dir) return 128;

    char remote_ref[256];
    snprintf(remote_ref, sizeof(remote_ref), "refs/remotes/%s/%s", remote_name, branch);

    char remote_hex[GIT_SHA1_HEXSZ + 1];
    if (git_resolve_ref(git_dir, remote_ref, remote_hex) != 0) {
        fprintf(stderr, "There is no tracking information for the current branch.\n");
        free(git_dir); return 1;
    }

    /* Re-read HEAD (might have been updated during fetch phase) */
    char cur_hex[GIT_SHA1_HEXSZ + 1], cur_ref[256];
    git_read_head(git_dir, cur_hex, cur_ref, sizeof(cur_ref));
    free(git_dir);

    if (strcmp(cur_hex, remote_hex) == 0) {
        printf("Already up to date.\n");
        return 0;
    }

    /* Merge remote branch into current */
    /* Reuse the branch name for merge - simulate "git merge remotes/origin/<branch>" */
    /* We set up the ref so merge can find it */
    git_dir = git_find_repo();
    if (!git_dir) return 128;

    /* Create a temporary local ref for the merge source */
    char merge_ref[256];
    snprintf(merge_ref, sizeof(merge_ref), "refs/heads/__pull_merge_tmp__");
    git_update_ref(git_dir, merge_ref, remote_hex);
    free(git_dir);

    char *merge_args[2] = { "__pull_merge_tmp__", NULL };
    rc = cmd_merge(1, merge_args);

    /* Clean up temporary ref */
    git_dir = git_find_repo();
    if (git_dir) {
        char tmp_path[4096];
        snprintf(tmp_path, sizeof(tmp_path), "%s/refs/heads/__pull_merge_tmp__", git_dir);
        unlink(tmp_path);
        free(git_dir);
    }

    return rc;
}

/* --- push --- */

static int cmd_push(int argc, char **argv) {
    const char *remote_name = "origin";
    const char *refspec = NULL;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git push [<remote>] [<branch>]\n");
            return 0;
        } else if (argv[i][0] != '-') {
            if (!refspec && strcmp(argv[i], remote_name) != 0)
                refspec = argv[i];
            else
                remote_name = argv[i];
        }
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

#ifndef HAS_CURL
    fprintf(stderr, "fatal: git push requires HTTP support (built without libcurl)\n");
    free(git_dir); return 1;
#else
    char url[4096];
    if (git_config_get_remote_url(git_dir, remote_name, url, sizeof(url)) != 0) {
        fprintf(stderr, "fatal: '%s' does not appear to be a git repository\n", remote_name);
        free(git_dir); return 128;
    }

    /* Determine what branch to push */
    char head_hex[GIT_SHA1_HEXSZ + 1], head_ref[256];
    if (git_read_head(git_dir, head_hex, head_ref, sizeof(head_ref)) != 0) {
        fprintf(stderr, "fatal: not on any branch\n");
        free(git_dir); return 1;
    }

    const char *branch = head_ref;
    if (strncmp(branch, "refs/heads/", 11) == 0)
        branch = head_ref + 11;
    if (refspec) branch = refspec;

    char local_ref[256];
    snprintf(local_ref, sizeof(local_ref), "refs/heads/%s", branch);
    char local_hex[GIT_SHA1_HEXSZ + 1];
    if (git_resolve_ref(git_dir, local_ref, local_hex) != 0) {
        fprintf(stderr, "error: src refspec %s does not match any\n", branch);
        free(git_dir); return 1;
    }

    /* Find remote tracking ref to determine boundary for upload */
    char remote_ref[256];
    snprintf(remote_ref, sizeof(remote_ref), "refs/remotes/%s/%s", remote_name, branch);
    char remote_hex[GIT_SHA1_HEXSZ + 1] = "";
    git_resolve_ref(git_dir, remote_ref, remote_hex); /* may fail — no remote yet */

    /* Upload objects */
    const char *stop = remote_hex[0] ? remote_hex : NULL;
    if (upload_commit_graph(url, git_dir, local_hex, stop) != 0) {
        fprintf(stderr, "fatal: failed to push objects to '%s'\n", url);
        free(git_dir); return 1;
    }

    /* Update remote ref */
    char target_ref[256];
    snprintf(target_ref, sizeof(target_ref), "refs/heads/%s", branch);
    if (http_update_ref(url, target_ref, local_hex) != 0) {
        fprintf(stderr, "fatal: failed to update remote ref '%s'\n", target_ref);
        free(git_dir); return 1;
    }

    /* Update local remote tracking ref */
    git_update_ref(git_dir, remote_ref, local_hex);

    printf("To %s\n", url);
    if (remote_hex[0])
        printf("   %.7s..%.7s  %s -> %s\n", remote_hex, local_hex, branch, branch);
    else
        printf(" * [new branch]  %s -> %s\n", branch, branch);

    free(git_dir);
    return 0;
#endif
}

/* --- main dispatcher --- */

static void usage(void) {
    fprintf(stderr, "usage: git <command> [<args>]\n\n");
    fprintf(stderr, "Commands:\n");
    fprintf(stderr, "   init          Create an empty Git repository\n");
    fprintf(stderr, "   clone         Clone a repository via HTTP(S)\n");
    fprintf(stderr, "   add           Add file contents to the index\n");
    fprintf(stderr, "   commit        Record changes to the repository\n");
    fprintf(stderr, "   status        Show the working tree status\n");
    fprintf(stderr, "   log           Show commit logs\n");
    fprintf(stderr, "   diff          Show changes between commits and working tree\n");
    fprintf(stderr, "   branch        List, create, or delete branches\n");
    fprintf(stderr, "   checkout      Switch branches or restore files\n");
    fprintf(stderr, "   merge         Join two development histories\n");
    fprintf(stderr, "   tag           Create, list, or delete tags\n");
    fprintf(stderr, "   remote        Manage remote repositories\n");
    fprintf(stderr, "   fetch         Download objects from remote\n");
    fprintf(stderr, "   pull          Fetch and merge remote changes\n");
    fprintf(stderr, "   push          Send local commits to remote\n");
    fprintf(stderr, "   hash-object   Compute object ID\n");
    fprintf(stderr, "   cat-file      Display object content\n");
}

int main(int argc, char **argv) {
    if (argc < 2) {
        usage();
        return 1;
    }

    const char *cmd = argv[1];

    if (strcmp(cmd, "hash-object") == 0) return cmd_hash_object(argc - 2, argv + 2);
    if (strcmp(cmd, "cat-file") == 0)    return cmd_cat_file(argc - 2, argv + 2);
    if (strcmp(cmd, "init") == 0)        return cmd_init(argc - 2, argv + 2);
    if (strcmp(cmd, "add") == 0)         return cmd_add(argc - 2, argv + 2);
    if (strcmp(cmd, "commit") == 0)      return cmd_commit(argc - 2, argv + 2);
    if (strcmp(cmd, "status") == 0)      return cmd_status(argc - 2, argv + 2);
    if (strcmp(cmd, "log") == 0)         return cmd_log(argc - 2, argv + 2);
    if (strcmp(cmd, "diff") == 0)        return cmd_diff(argc - 2, argv + 2);
    if (strcmp(cmd, "branch") == 0)      return cmd_branch(argc - 2, argv + 2);
    if (strcmp(cmd, "checkout") == 0)    return cmd_checkout(argc - 2, argv + 2);
    if (strcmp(cmd, "merge") == 0)       return cmd_merge(argc - 2, argv + 2);
    if (strcmp(cmd, "tag") == 0)         return cmd_tag(argc - 2, argv + 2);
    if (strcmp(cmd, "remote") == 0)      return cmd_remote(argc - 2, argv + 2);
    if (strcmp(cmd, "clone") == 0)       return cmd_clone(argc - 2, argv + 2);
    if (strcmp(cmd, "fetch") == 0)       return cmd_fetch(argc - 2, argv + 2);
    if (strcmp(cmd, "pull") == 0)        return cmd_pull(argc - 2, argv + 2);
    if (strcmp(cmd, "push") == 0)        return cmd_push(argc - 2, argv + 2);
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
