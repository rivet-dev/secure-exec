/*
 * git-objects.c -- Git loose object read/write
 *
 * Clean-room implementation. NOT based on Git source code.
 * Licensed under Apache-2.0.
 */

#include "git-objects.h"
#include "sha1.h"
#include <zlib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>

static const char hex_chars[] = "0123456789abcdef";

static void to_hex(const uint8_t *bin, size_t len, char *hex) {
    for (size_t i = 0; i < len; i++) {
        hex[i * 2]     = hex_chars[bin[i] >> 4];
        hex[i * 2 + 1] = hex_chars[bin[i] & 0x0f];
    }
    hex[len * 2] = '\0';
}

int git_hash_object(const char *type, const uint8_t *data, size_t len,
                    char hex_out[GIT_SHA1_HEXSZ + 1]) {
    /* Header: "<type> <size>\0" */
    char header[64];
    int hdr_len = snprintf(header, sizeof(header), "%s %zu", type, len);
    if (hdr_len < 0) return -1;
    hdr_len++; /* include NUL terminator as part of the object */

    SHA1_CTX ctx;
    sha1_init(&ctx);
    sha1_update(&ctx, (const uint8_t *)header, (size_t)hdr_len);
    sha1_update(&ctx, data, len);

    uint8_t digest[20];
    sha1_final(&ctx, digest);
    to_hex(digest, 20, hex_out);

    return 0;
}

int git_write_object(const char *git_dir, const char *type,
                     const uint8_t *data, size_t len,
                     char hex_out[GIT_SHA1_HEXSZ + 1]) {
    if (git_hash_object(type, data, len, hex_out) != 0)
        return -1;

    /* Build directory: .git/objects/xx */
    char dir_path[512];
    snprintf(dir_path, sizeof(dir_path), "%s/objects/%.2s", git_dir, hex_out);
    mkdir(dir_path, 0755); /* ignore EEXIST */

    /* Full object path */
    char path[512];
    snprintf(path, sizeof(path), "%s/objects/%.2s/%s",
             git_dir, hex_out, hex_out + 2);

    /* Skip if already exists */
    if (access(path, F_OK) == 0)
        return 0;

    /* Build raw object: header + content */
    char header[64];
    int hdr_len = snprintf(header, sizeof(header), "%s %zu", type, len);
    hdr_len++;

    size_t total = (size_t)hdr_len + len;
    uint8_t *raw = malloc(total);
    if (!raw) return -1;
    memcpy(raw, header, (size_t)hdr_len);
    memcpy(raw + hdr_len, data, len);

    /* Compress with zlib */
    uLongf comp_len = compressBound((uLong)total);
    uint8_t *comp = malloc(comp_len);
    if (!comp) { free(raw); return -1; }

    if (compress(comp, &comp_len, raw, (uLong)total) != Z_OK) {
        free(raw); free(comp);
        return -1;
    }
    free(raw);

    /* Write compressed data */
    FILE *f = fopen(path, "wb");
    if (!f) { free(comp); return -1; }
    size_t written = fwrite(comp, 1, comp_len, f);
    fclose(f);
    free(comp);

    if (written != comp_len) {
        unlink(path);
        return -1;
    }

    return 0;
}

int git_read_object(const char *git_dir, const char *hex,
                    char *type_out, size_t type_sz,
                    uint8_t **data_out, size_t *len_out) {
    if (strlen(hex) != 40) return -1;

    char path[512];
    snprintf(path, sizeof(path), "%s/objects/%.2s/%s",
             git_dir, hex, hex + 2);

    FILE *f = fopen(path, "rb");
    if (!f) return -1;

    fseek(f, 0, SEEK_END);
    long comp_len = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (comp_len <= 0) { fclose(f); return -1; }

    uint8_t *comp = malloc((size_t)comp_len);
    if (!comp) { fclose(f); return -1; }
    if (fread(comp, 1, (size_t)comp_len, f) != (size_t)comp_len) {
        free(comp); fclose(f);
        return -1;
    }
    fclose(f);

    /* Decompress — grow buffer if needed */
    uLongf raw_len = (uLongf)comp_len * 4;
    if (raw_len < 256) raw_len = 256;
    uint8_t *raw = NULL;
    int ret = Z_BUF_ERROR;

    for (int tries = 0; tries < 12; tries++) {
        raw = realloc(raw, raw_len);
        if (!raw) { free(comp); return -1; }
        uLongf out_len = raw_len;
        ret = uncompress(raw, &out_len, comp, (uLong)comp_len);
        if (ret == Z_OK) {
            raw_len = out_len;
            break;
        } else if (ret == Z_BUF_ERROR) {
            raw_len *= 2;
        } else {
            free(raw); free(comp);
            return -1;
        }
    }
    free(comp);
    if (ret != Z_OK) { free(raw); return -1; }

    /* Parse header: "<type> <size>\0" */
    char *space = memchr(raw, ' ', raw_len);
    if (!space) { free(raw); return -1; }

    char *null_byte = memchr(space, '\0', raw_len - (size_t)(space - (char *)raw));
    if (!null_byte) { free(raw); return -1; }

    size_t type_len = (size_t)(space - (char *)raw);
    if (type_len >= type_sz) type_len = type_sz - 1;
    memcpy(type_out, raw, type_len);
    type_out[type_len] = '\0';

    size_t content_size = strtoul(space + 1, NULL, 10);
    size_t header_len = (size_t)(null_byte - (char *)raw) + 1;

    *data_out = malloc(content_size);
    if (!*data_out) { free(raw); return -1; }
    memcpy(*data_out, raw + header_len, content_size);
    *len_out = content_size;

    free(raw);
    return 0;
}

char *git_find_repo(void) {
    char cwd[4096];
    if (!getcwd(cwd, sizeof(cwd))) return NULL;

    while (1) {
        char git_path[4096 + 8];
        snprintf(git_path, sizeof(git_path), "%s/.git", cwd);

        struct stat st;
        if (stat(git_path, &st) == 0 && S_ISDIR(st.st_mode)) {
            return strdup(git_path);
        }

        /* Walk up to parent */
        char *slash = strrchr(cwd, '/');
        if (!slash || slash == cwd) break;
        *slash = '\0';
    }

    return NULL;
}

/* --- Hex conversion --- */

void git_hex_to_bin(const char *hex, uint8_t *bin) {
    for (int i = 0; i < 20; i++) {
        uint8_t hi = (uint8_t)(hex[i * 2] >= 'a' ? hex[i * 2] - 'a' + 10 :
                                hex[i * 2] >= 'A' ? hex[i * 2] - 'A' + 10 :
                                hex[i * 2] - '0');
        uint8_t lo = (uint8_t)(hex[i * 2 + 1] >= 'a' ? hex[i * 2 + 1] - 'a' + 10 :
                                hex[i * 2 + 1] >= 'A' ? hex[i * 2 + 1] - 'A' + 10 :
                                hex[i * 2 + 1] - '0');
        bin[i] = (uint8_t)((hi << 4) | lo);
    }
}

void git_bin_to_hex(const uint8_t *bin, char *hex) {
    to_hex(bin, 20, hex);
}

/* --- Tree objects --- */

int git_write_tree(const char *git_dir, const GitTreeEntry *entries,
                   size_t nentries, char hex_out[GIT_SHA1_HEXSZ + 1]) {
    /* Tree format: repeated "<mode> <name>\0<20-byte-sha1>" */
    size_t total = 0;
    for (size_t i = 0; i < nentries; i++) {
        char mode_str[16];
        snprintf(mode_str, sizeof(mode_str), "%o", entries[i].mode);
        total += strlen(mode_str) + 1 + strlen(entries[i].name) + 1 + 20;
    }

    uint8_t *buf = malloc(total);
    if (!buf) return -1;

    size_t pos = 0;
    for (size_t i = 0; i < nentries; i++) {
        char mode_str[16];
        snprintf(mode_str, sizeof(mode_str), "%o", entries[i].mode);
        size_t mlen = strlen(mode_str);
        size_t nlen = strlen(entries[i].name);

        memcpy(buf + pos, mode_str, mlen);
        pos += mlen;
        buf[pos++] = ' ';
        memcpy(buf + pos, entries[i].name, nlen);
        pos += nlen;
        buf[pos++] = '\0';
        memcpy(buf + pos, entries[i].sha1, 20);
        pos += 20;
    }

    int rc = git_write_object(git_dir, "tree", buf, pos, hex_out);
    free(buf);
    return rc;
}

int git_read_tree(const char *git_dir, const char *tree_hex,
                  GitTreeEntry **entries_out, size_t *nentries_out) {
    char type[32];
    uint8_t *data = NULL;
    size_t len = 0;

    if (git_read_object(git_dir, tree_hex, type, sizeof(type), &data, &len) != 0)
        return -1;

    if (strcmp(type, "tree") != 0) {
        free(data);
        return -1;
    }

    /* Count entries first */
    size_t count = 0;
    size_t pos = 0;
    while (pos < len) {
        const char *nul = memchr(data + pos, '\0', len - pos);
        if (!nul) break;
        pos = (size_t)(nul - (char *)data) + 1 + 20;
        count++;
    }

    GitTreeEntry *entries = malloc(count * sizeof(GitTreeEntry));
    if (!entries) { free(data); return -1; }

    pos = 0;
    size_t idx = 0;
    while (pos < len && idx < count) {
        /* Parse "<mode> <name>\0<20 bytes sha1>" */
        const char *space = memchr(data + pos, ' ', len - pos);
        if (!space) break;

        char mode_str[16];
        size_t mlen = (size_t)(space - (char *)(data + pos));
        if (mlen >= sizeof(mode_str)) mlen = sizeof(mode_str) - 1;
        memcpy(mode_str, data + pos, mlen);
        mode_str[mlen] = '\0';
        entries[idx].mode = (uint32_t)strtoul(mode_str, NULL, 8);

        const char *name_start = space + 1;
        const char *nul = memchr(name_start, '\0', len - (size_t)(name_start - (char *)data));
        if (!nul) break;

        size_t nlen = (size_t)(nul - name_start);
        if (nlen >= sizeof(entries[idx].name)) nlen = sizeof(entries[idx].name) - 1;
        memcpy(entries[idx].name, name_start, nlen);
        entries[idx].name[nlen] = '\0';

        memcpy(entries[idx].sha1, nul + 1, 20);

        pos = (size_t)(nul - (char *)data) + 1 + 20;
        idx++;
    }

    free(data);
    *entries_out = entries;
    *nentries_out = idx;
    return 0;
}

/* --- Commit objects --- */

int git_write_commit(const char *git_dir, const char *tree_hex,
                     const char *parent_hex, const char *author,
                     const char *committer, const char *message,
                     char hex_out[GIT_SHA1_HEXSZ + 1]) {
    /* Build commit content */
    size_t cap = 1024 + strlen(author) + strlen(committer) + strlen(message);
    char *buf = malloc(cap);
    if (!buf) return -1;

    int pos = snprintf(buf, cap, "tree %s\n", tree_hex);
    if (parent_hex && parent_hex[0]) {
        pos += snprintf(buf + pos, cap - (size_t)pos, "parent %s\n", parent_hex);
    }
    pos += snprintf(buf + pos, cap - (size_t)pos, "author %s\n", author);
    pos += snprintf(buf + pos, cap - (size_t)pos, "committer %s\n", committer);
    pos += snprintf(buf + pos, cap - (size_t)pos, "\n%s\n", message);

    int rc = git_write_object(git_dir, "commit", (const uint8_t *)buf,
                              (size_t)pos, hex_out);
    free(buf);
    return rc;
}

int git_read_commit(const char *git_dir, const char *commit_hex,
                    char tree_hex[GIT_SHA1_HEXSZ + 1],
                    char parent_hex[GIT_SHA1_HEXSZ + 1],
                    char **author_out, char **message_out) {
    char type[32];
    uint8_t *data = NULL;
    size_t len = 0;

    tree_hex[0] = '\0';
    parent_hex[0] = '\0';
    if (author_out) *author_out = NULL;
    if (message_out) *message_out = NULL;

    if (git_read_object(git_dir, commit_hex, type, sizeof(type), &data, &len) != 0)
        return -1;

    if (strcmp(type, "commit") != 0) {
        free(data);
        return -1;
    }

    /* Parse commit headers and body */
    const char *text = (const char *)data;
    const char *end = text + len;
    int in_body = 0;

    while (text < end) {
        const char *eol = memchr(text, '\n', (size_t)(end - text));
        if (!eol) eol = end;

        size_t line_len = (size_t)(eol - text);

        if (!in_body) {
            if (line_len == 0) {
                in_body = 1;
                text = eol + 1;
                /* Rest is the message */
                size_t msg_len = (size_t)(end - text);
                /* Trim trailing newline */
                while (msg_len > 0 && text[msg_len - 1] == '\n') msg_len--;
                if (message_out) {
                    *message_out = malloc(msg_len + 1);
                    memcpy(*message_out, text, msg_len);
                    (*message_out)[msg_len] = '\0';
                }
                break;
            } else if (strncmp(text, "tree ", 5) == 0 && line_len >= 45) {
                memcpy(tree_hex, text + 5, 40);
                tree_hex[40] = '\0';
            } else if (strncmp(text, "parent ", 7) == 0 && line_len >= 47) {
                if (parent_hex[0] == '\0') {
                    memcpy(parent_hex, text + 7, 40);
                    parent_hex[40] = '\0';
                }
            } else if (strncmp(text, "author ", 7) == 0 && author_out) {
                *author_out = malloc(line_len - 6);
                memcpy(*author_out, text + 7, line_len - 7);
                (*author_out)[line_len - 7] = '\0';
            }
        }

        text = eol + 1;
    }

    free(data);
    return 0;
}

/* --- Ref helpers --- */

static char *read_file_trimmed(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return NULL;
    char buf[256];
    if (!fgets(buf, sizeof(buf), f)) { fclose(f); return NULL; }
    fclose(f);
    size_t len = strlen(buf);
    while (len > 0 && (buf[len - 1] == '\n' || buf[len - 1] == '\r'))
        buf[--len] = '\0';
    return strdup(buf);
}

int git_resolve_ref(const char *git_dir, const char *ref,
                    char hex_out[GIT_SHA1_HEXSZ + 1]) {
    char path[512];
    snprintf(path, sizeof(path), "%s/%s", git_dir, ref);

    char *content = read_file_trimmed(path);
    if (!content) return -1;

    /* Follow symbolic refs */
    if (strncmp(content, "ref: ", 5) == 0) {
        char *target = content + 5;
        int rc = git_resolve_ref(git_dir, target, hex_out);
        free(content);
        return rc;
    }

    if (strlen(content) >= 40) {
        memcpy(hex_out, content, 40);
        hex_out[40] = '\0';
        free(content);
        return 0;
    }

    free(content);
    return -1;
}

int git_update_ref(const char *git_dir, const char *ref, const char *hex) {
    char path[512];
    snprintf(path, sizeof(path), "%s/%s", git_dir, ref);

    /* Ensure parent directory exists */
    char dir[512];
    snprintf(dir, sizeof(dir), "%s", path);
    char *slash = strrchr(dir, '/');
    if (slash) {
        *slash = '\0';
        mkdir(dir, 0755);
    }

    FILE *f = fopen(path, "w");
    if (!f) return -1;
    fprintf(f, "%s\n", hex);
    fclose(f);
    return 0;
}

int git_read_head(const char *git_dir, char hex_out[GIT_SHA1_HEXSZ + 1],
                  char *ref_out, size_t ref_sz) {
    char head_path[512];
    snprintf(head_path, sizeof(head_path), "%s/HEAD", git_dir);

    char *content = read_file_trimmed(head_path);
    if (!content) return -1;

    if (strncmp(content, "ref: ", 5) == 0) {
        const char *ref = content + 5;
        if (ref_out) {
            size_t len = strlen(ref);
            if (len >= ref_sz) len = ref_sz - 1;
            memcpy(ref_out, ref, len);
            ref_out[len] = '\0';
        }
        int rc = git_resolve_ref(git_dir, ref, hex_out);
        free(content);
        return rc;
    }

    /* Detached HEAD */
    if (strlen(content) >= 40) {
        memcpy(hex_out, content, 40);
        hex_out[40] = '\0';
        if (ref_out) ref_out[0] = '\0';
        free(content);
        return 0;
    }

    free(content);
    return -1;
}

int git_read_commit_parents(const char *git_dir, const char *commit_hex,
                            char (*parents)[GIT_SHA1_HEXSZ + 1], int max_parents) {
    char type[32];
    uint8_t *data = NULL;
    size_t len = 0;

    if (git_read_object(git_dir, commit_hex, type, sizeof(type), &data, &len) != 0)
        return 0;
    if (strcmp(type, "commit") != 0) { free(data); return 0; }

    int nparents = 0;
    const char *text = (const char *)data;
    const char *end = text + len;

    while (text < end) {
        const char *eol = memchr(text, '\n', (size_t)(end - text));
        if (!eol) break;
        size_t line_len = (size_t)(eol - text);
        if (line_len == 0) break;

        if (strncmp(text, "parent ", 7) == 0 && line_len >= 47 && nparents < max_parents) {
            memcpy(parents[nparents], text + 7, 40);
            parents[nparents][40] = '\0';
            nparents++;
        }
        text = eol + 1;
    }

    free(data);
    return nparents;
}
