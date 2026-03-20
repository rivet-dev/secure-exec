/*
 * git.c -- A clean-room, permissively-licensed git implementation
 *
 * Supports:
 *   Plumbing: hash-object, cat-file
 *   Porcelain: init, add, commit, status, log, diff
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

static int cmd_log(int argc, char **argv) {
    int oneline = 0;
    int max_count = -1;

    for (int i = 0; i < argc; i++) {
        if (strcmp(argv[i], "--oneline") == 0) oneline = 1;
        else if (strcmp(argv[i], "--help") == 0) {
            fprintf(stderr, "usage: git log [--oneline] [-n <count>]\n");
            return 0;
        }
        else if ((strcmp(argv[i], "-n") == 0 || strcmp(argv[i], "--max-count") == 0)
                 && i + 1 < argc) {
            max_count = atoi(argv[++i]);
        }
    }

    char *git_dir = git_find_repo();
    if (!git_dir) { fprintf(stderr, "fatal: not a git repository\n"); return 128; }

    char hex[GIT_SHA1_HEXSZ + 1];
    char head_ref[256];
    if (git_read_head(git_dir, hex, head_ref, sizeof(head_ref)) != 0) {
        fprintf(stderr, "fatal: your current branch '%s' does not have any commits yet\n",
                head_ref[0] ? strrchr(head_ref, '/') + 1 : "HEAD");
        free(git_dir);
        return 128;
    }

    int count = 0;
    while (hex[0] && (max_count < 0 || count < max_count)) {
        char tree_hex[GIT_SHA1_HEXSZ + 1];
        char parent_hex[GIT_SHA1_HEXSZ + 1];
        char *author = NULL;
        char *message = NULL;

        if (git_read_commit(git_dir, hex, tree_hex, parent_hex, &author, &message) != 0)
            break;

        if (oneline) {
            printf("%.7s %s\n", hex, message ? message : "");
        } else {
            printf("commit %s", hex);
            /* Show branch decoration on first commit */
            if (count == 0 && head_ref[0]) {
                const char *last = strrchr(head_ref, '/');
                printf(" (HEAD -> %s)", last ? last + 1 : head_ref);
            }
            printf("\n");
            if (author) printf("Author: %s\n", author);
            printf("\n");
            if (message) printf("    %s\n", message);
            printf("\n");
        }

        free(author);
        free(message);

        /* Walk to parent */
        if (parent_hex[0]) {
            memcpy(hex, parent_hex, GIT_SHA1_HEXSZ + 1);
        } else {
            break;
        }
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

/* --- main dispatcher --- */

static void usage(void) {
    fprintf(stderr, "usage: git <command> [<args>]\n\n");
    fprintf(stderr, "Commands:\n");
    fprintf(stderr, "   init          Create an empty Git repository\n");
    fprintf(stderr, "   add           Add file contents to the index\n");
    fprintf(stderr, "   commit        Record changes to the repository\n");
    fprintf(stderr, "   status        Show the working tree status\n");
    fprintf(stderr, "   log           Show commit logs\n");
    fprintf(stderr, "   diff          Show changes between commits and working tree\n");
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
