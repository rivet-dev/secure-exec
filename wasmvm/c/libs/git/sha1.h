/*
 * sha1.h -- SHA-1 hash computation
 *
 * Clean-room implementation based on FIPS 180-1 specification.
 * Licensed under Apache-2.0.
 */

#ifndef GIT_SHA1_H
#define GIT_SHA1_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint32_t state[5];
    uint64_t count;
    uint8_t buffer[64];
} SHA1_CTX;

void sha1_init(SHA1_CTX *ctx);
void sha1_update(SHA1_CTX *ctx, const uint8_t *data, size_t len);
void sha1_final(SHA1_CTX *ctx, uint8_t digest[20]);

#endif
