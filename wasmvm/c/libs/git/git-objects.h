/*
 * git-objects.h -- Git object format read/write
 *
 * Clean-room implementation of the git loose object format.
 * Objects are stored as zlib-compressed "<type> <size>\0<content>",
 * identified by their SHA-1 hash, under .git/objects/<xx>/<38-hex>.
 *
 * Licensed under Apache-2.0.
 */

#ifndef GIT_OBJECTS_H
#define GIT_OBJECTS_H

#include <stddef.h>
#include <stdint.h>

#define GIT_SHA1_HEXSZ 40

/* Compute SHA-1 hash of a git object (type + size + content).
 * Returns 0 on success, fills hex_out with 40-char lowercase hex + NUL. */
int git_hash_object(const char *type, const uint8_t *data, size_t len,
                    char hex_out[GIT_SHA1_HEXSZ + 1]);

/* Write a git loose object to .git/objects/.
 * Creates object directory if needed. Skips write if object exists.
 * Returns 0 on success. */
int git_write_object(const char *git_dir, const char *type,
                     const uint8_t *data, size_t len,
                     char hex_out[GIT_SHA1_HEXSZ + 1]);

/* Read a git loose object from .git/objects/.
 * Caller must free *data_out. Returns 0 on success. */
int git_read_object(const char *git_dir, const char *hex,
                    char *type_out, size_t type_sz,
                    uint8_t **data_out, size_t *len_out);

/* Walk up from CWD to find .git directory.
 * Returns heap-allocated path (e.g. "/repo/.git") or NULL. */
char *git_find_repo(void);

#endif
