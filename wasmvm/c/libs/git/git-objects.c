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
