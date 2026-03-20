/*
 * git-index.c -- Git index (staging area) read/write
 *
 * Clean-room implementation. NOT based on Git source code.
 * Licensed under Apache-2.0.
 */

#include "git-index.h"
#include "sha1.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Big-endian read/write helpers */
static uint32_t read_be32(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8)  |  (uint32_t)p[3];
}

static uint16_t read_be16(const uint8_t *p) {
    return (uint16_t)((p[0] << 8) | p[1]);
}

static void write_be32(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)(v);
}

static void write_be16(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v >> 8);
    p[1] = (uint8_t)(v);
}

static const char hex_chars[] = "0123456789abcdef";

static void bin_to_hex(const uint8_t *bin, char *hex) {
    for (int i = 0; i < 20; i++) {
        hex[i * 2]     = hex_chars[bin[i] >> 4];
        hex[i * 2 + 1] = hex_chars[bin[i] & 0x0f];
    }
    hex[40] = '\0';
}

static void hex_to_bin(const char *hex, uint8_t *bin) {
    for (int i = 0; i < 20; i++) {
        uint8_t hi = (uint8_t)(hex[i * 2] >= 'a' ? hex[i * 2] - 'a' + 10 : hex[i * 2] - '0');
        uint8_t lo = (uint8_t)(hex[i * 2 + 1] >= 'a' ? hex[i * 2 + 1] - 'a' + 10 : hex[i * 2 + 1] - '0');
        bin[i] = (uint8_t)((hi << 4) | lo);
    }
}

void git_index_init(GitIndex *idx) {
    idx->entries = NULL;
    idx->count = 0;
    idx->capacity = 0;
}

void git_index_free(GitIndex *idx) {
    for (size_t i = 0; i < idx->count; i++) {
        free(idx->entries[i].name);
    }
    free(idx->entries);
    idx->entries = NULL;
    idx->count = 0;
    idx->capacity = 0;
}

static void ensure_capacity(GitIndex *idx) {
    if (idx->count >= idx->capacity) {
        size_t new_cap = idx->capacity ? idx->capacity * 2 : 16;
        idx->entries = realloc(idx->entries, new_cap * sizeof(GitIndexEntry));
        idx->capacity = new_cap;
    }
}

int git_index_read(GitIndex *idx, const char *git_dir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/index", git_dir);

    FILE *f = fopen(path, "rb");
    if (!f) return 0; /* No index file = empty index */

    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (fsize < 12) { fclose(f); return -1; }

    uint8_t *buf = malloc((size_t)fsize);
    if (!buf) { fclose(f); return -1; }
    if (fread(buf, 1, (size_t)fsize, f) != (size_t)fsize) {
        free(buf); fclose(f);
        return -1;
    }
    fclose(f);

    /* Verify signature and version */
    uint32_t sig = read_be32(buf);
    uint32_t ver = read_be32(buf + 4);
    uint32_t nentries = read_be32(buf + 8);

    if (sig != GIT_INDEX_SIGNATURE || ver != GIT_INDEX_VERSION) {
        free(buf);
        return -1;
    }

    size_t pos = 12;
    for (uint32_t i = 0; i < nentries; i++) {
        if (pos + 62 > (size_t)fsize) { free(buf); return -1; }

        uint32_t ctime_sec  = read_be32(buf + pos);
        (void)ctime_sec;
        uint32_t mtime_sec  = read_be32(buf + pos + 8);
        uint32_t mode       = read_be32(buf + pos + 24);
        uint32_t size        = read_be32(buf + pos + 36);
        uint8_t *sha1        = buf + pos + 40;
        uint16_t flags       = read_be16(buf + pos + 60);
        uint16_t name_len    = flags & 0x0FFF;

        if (pos + 62 + name_len > (size_t)fsize) { free(buf); return -1; }

        char *name = malloc(name_len + 1);
        memcpy(name, buf + pos + 62, name_len);
        name[name_len] = '\0';

        ensure_capacity(idx);
        GitIndexEntry *e = &idx->entries[idx->count++];
        bin_to_hex(sha1, e->sha1_hex);
        e->mode = mode;
        e->size = size;
        e->mtime_sec = mtime_sec;
        e->name = name;

        /* Entry is padded to 8-byte boundary (62 + namelen + padding) */
        size_t entry_size = 62 + name_len;
        size_t padded = (entry_size + 8) & ~(size_t)7;
        pos += padded;
    }

    free(buf);
    return 0;
}

int git_index_write(const GitIndex *idx, const char *git_dir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/index", git_dir);

    /* Build index data in memory, then SHA-1 checksum + write */
    size_t buf_cap = 12; /* header */
    for (size_t i = 0; i < idx->count; i++) {
        size_t name_len = strlen(idx->entries[i].name);
        size_t entry_size = 62 + name_len;
        size_t padded = (entry_size + 8) & ~(size_t)7;
        buf_cap += padded;
    }

    uint8_t *buf = calloc(1, buf_cap);
    if (!buf) return -1;

    /* Header */
    write_be32(buf, GIT_INDEX_SIGNATURE);
    write_be32(buf + 4, GIT_INDEX_VERSION);
    write_be32(buf + 8, (uint32_t)idx->count);

    size_t pos = 12;
    for (size_t i = 0; i < idx->count; i++) {
        const GitIndexEntry *e = &idx->entries[i];
        size_t name_len = strlen(e->name);

        write_be32(buf + pos, 0);        /* ctime_sec */
        write_be32(buf + pos + 4, 0);    /* ctime_nsec */
        write_be32(buf + pos + 8, e->mtime_sec);
        write_be32(buf + pos + 12, 0);   /* mtime_nsec */
        write_be32(buf + pos + 16, 0);   /* dev */
        write_be32(buf + pos + 20, 0);   /* ino */
        write_be32(buf + pos + 24, e->mode);
        write_be32(buf + pos + 28, 1000); /* uid */
        write_be32(buf + pos + 32, 1000); /* gid */
        write_be32(buf + pos + 36, e->size);
        hex_to_bin(e->sha1_hex, buf + pos + 40);
        uint16_t flags = (uint16_t)(name_len > 0x0FFF ? 0x0FFF : name_len);
        write_be16(buf + pos + 60, flags);
        memcpy(buf + pos + 62, e->name, name_len);

        size_t entry_size = 62 + name_len;
        size_t padded = (entry_size + 8) & ~(size_t)7;
        pos += padded;
    }

    /* SHA-1 checksum over everything */
    SHA1_CTX sha_ctx;
    sha1_init(&sha_ctx);
    sha1_update(&sha_ctx, buf, pos);
    uint8_t checksum[20];
    sha1_final(&sha_ctx, checksum);

    FILE *f = fopen(path, "wb");
    if (!f) { free(buf); return -1; }
    fwrite(buf, 1, pos, f);
    fwrite(checksum, 1, 20, f);
    fclose(f);
    free(buf);

    return 0;
}

void git_index_add(GitIndex *idx, const char *name, const char *sha1_hex,
                   uint32_t mode, uint32_t size, uint32_t mtime_sec) {
    /* Update existing entry if found */
    for (size_t i = 0; i < idx->count; i++) {
        if (strcmp(idx->entries[i].name, name) == 0) {
            memcpy(idx->entries[i].sha1_hex, sha1_hex, GIT_SHA1_HEXSZ + 1);
            idx->entries[i].mode = mode;
            idx->entries[i].size = size;
            idx->entries[i].mtime_sec = mtime_sec;
            return;
        }
    }

    /* Insert in sorted position */
    ensure_capacity(idx);
    size_t insert_pos = idx->count;
    for (size_t i = 0; i < idx->count; i++) {
        if (strcmp(name, idx->entries[i].name) < 0) {
            insert_pos = i;
            break;
        }
    }

    if (insert_pos < idx->count) {
        memmove(&idx->entries[insert_pos + 1], &idx->entries[insert_pos],
                (idx->count - insert_pos) * sizeof(GitIndexEntry));
    }

    GitIndexEntry *e = &idx->entries[insert_pos];
    memcpy(e->sha1_hex, sha1_hex, GIT_SHA1_HEXSZ + 1);
    e->mode = mode;
    e->size = size;
    e->mtime_sec = mtime_sec;
    e->name = strdup(name);
    idx->count++;
}

int git_index_remove(GitIndex *idx, const char *name) {
    for (size_t i = 0; i < idx->count; i++) {
        if (strcmp(idx->entries[i].name, name) == 0) {
            free(idx->entries[i].name);
            if (i + 1 < idx->count) {
                memmove(&idx->entries[i], &idx->entries[i + 1],
                        (idx->count - i - 1) * sizeof(GitIndexEntry));
            }
            idx->count--;
            return 0;
        }
    }
    return -1;
}

const GitIndexEntry *git_index_find(const GitIndex *idx, const char *name) {
    for (size_t i = 0; i < idx->count; i++) {
        if (strcmp(idx->entries[i].name, name) == 0)
            return &idx->entries[i];
    }
    return NULL;
}
