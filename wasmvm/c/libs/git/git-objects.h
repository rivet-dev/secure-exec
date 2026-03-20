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

/* --- Tree objects --- */

typedef struct {
    uint32_t mode;
    char     name[256];
    uint8_t  sha1[20];
} GitTreeEntry;

/* Build a tree object from sorted entries. Writes the object and fills hex_out.
 * Returns 0 on success. */
int git_write_tree(const char *git_dir, const GitTreeEntry *entries,
                   size_t nentries, char hex_out[GIT_SHA1_HEXSZ + 1]);

/* Parse a tree object. Caller must free *entries_out.
 * Returns 0 on success. */
int git_read_tree(const char *git_dir, const char *tree_hex,
                  GitTreeEntry **entries_out, size_t *nentries_out);

/* --- Commit objects --- */

/* Create a commit object. parent_hex may be NULL for root commit.
 * Returns 0 on success. */
int git_write_commit(const char *git_dir, const char *tree_hex,
                     const char *parent_hex, const char *author,
                     const char *committer, const char *message,
                     char hex_out[GIT_SHA1_HEXSZ + 1]);

/* Read a commit's tree, parent, author, and message.
 * Caller must free *message_out. parent_hex may be zeroed if no parent.
 * Returns 0 on success. */
int git_read_commit(const char *git_dir, const char *commit_hex,
                    char tree_hex[GIT_SHA1_HEXSZ + 1],
                    char parent_hex[GIT_SHA1_HEXSZ + 1],
                    char **author_out, char **message_out);

/* --- Ref helpers --- */

/* Read a ref (e.g. refs/heads/main). Follows symbolic refs (ref: ...).
 * Returns 0 on success, fills hex_out with commit hash. */
int git_resolve_ref(const char *git_dir, const char *ref,
                    char hex_out[GIT_SHA1_HEXSZ + 1]);

/* Update a ref to point to the given hex hash. */
int git_update_ref(const char *git_dir, const char *ref, const char *hex);

/* Read HEAD. If symbolic, resolve to commit hash.
 * Also fills ref_out with the symbolic ref name (e.g. "refs/heads/main").
 * Returns 0 on success, -1 if HEAD is unborn. */
int git_read_head(const char *git_dir, char hex_out[GIT_SHA1_HEXSZ + 1],
                  char *ref_out, size_t ref_sz);

/* Hex conversion helpers */
void git_hex_to_bin(const char *hex, uint8_t *bin);
void git_bin_to_hex(const uint8_t *bin, char *hex);

/* Read all parent commit hashes from a commit object.
 * Returns number of parents found (up to max_parents). */
int git_read_commit_parents(const char *git_dir, const char *commit_hex,
                            char (*parents)[GIT_SHA1_HEXSZ + 1], int max_parents);

#endif
