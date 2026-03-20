/*
 * git-index.h -- Git index (staging area) read/write
 *
 * Clean-room implementation. NOT based on Git source code.
 * Licensed under Apache-2.0.
 */

#ifndef GIT_INDEX_H
#define GIT_INDEX_H

#include <stddef.h>
#include <stdint.h>
#include "git-objects.h"

#define GIT_INDEX_SIGNATURE 0x44495243 /* "DIRC" */
#define GIT_INDEX_VERSION 2

typedef struct {
    uint32_t ctime_sec;
    uint32_t ctime_nsec;
    uint32_t mtime_sec;
    uint32_t mtime_nsec;
    uint32_t dev;
    uint32_t ino;
    uint32_t mode;
    uint32_t uid;
    uint32_t gid;
    uint32_t size;
    uint8_t  sha1[20];
    uint16_t flags;   /* name length (lower 12 bits) */
    char     name[1]; /* variable length, NUL-padded to 8-byte boundary */
} GitIndexEntryRaw;

typedef struct {
    char     sha1_hex[GIT_SHA1_HEXSZ + 1];
    uint32_t mode;
    uint32_t size;
    uint32_t mtime_sec;
    char    *name;   /* heap-allocated */
} GitIndexEntry;

typedef struct {
    GitIndexEntry *entries;
    size_t         count;
    size_t         capacity;
} GitIndex;

/* Initialize an empty index */
void git_index_init(GitIndex *idx);

/* Free index entries */
void git_index_free(GitIndex *idx);

/* Read index from .git/index file. Returns 0 on success, -1 on error.
 * If file doesn't exist, index is left empty (success). */
int git_index_read(GitIndex *idx, const char *git_dir);

/* Write index to .git/index file. Returns 0 on success. */
int git_index_write(const GitIndex *idx, const char *git_dir);

/* Add or update an entry in the index. Keeps entries sorted by name. */
void git_index_add(GitIndex *idx, const char *name, const char *sha1_hex,
                   uint32_t mode, uint32_t size, uint32_t mtime_sec);

/* Remove an entry by name. Returns 0 if removed, -1 if not found. */
int git_index_remove(GitIndex *idx, const char *name);

/* Find an entry by name. Returns pointer or NULL. */
const GitIndexEntry *git_index_find(const GitIndex *idx, const char *name);

#endif
