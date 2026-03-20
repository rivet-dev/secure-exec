/*
 * sha1.c -- SHA-1 hash computation
 *
 * Clean-room implementation based on FIPS 180-1 specification.
 * Licensed under Apache-2.0.
 */

#include "sha1.h"
#include <string.h>

#define ROL32(val, n) (((val) << (n)) | ((val) >> (32 - (n))))

static void sha1_transform(uint32_t state[5], const uint8_t buffer[64]) {
    uint32_t a, b, c, d, e, temp;
    uint32_t w[80];

    for (int i = 0; i < 16; i++) {
        w[i] = ((uint32_t)buffer[i * 4] << 24) |
               ((uint32_t)buffer[i * 4 + 1] << 16) |
               ((uint32_t)buffer[i * 4 + 2] << 8) |
               ((uint32_t)buffer[i * 4 + 3]);
    }
    for (int i = 16; i < 80; i++) {
        w[i] = ROL32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    a = state[0]; b = state[1]; c = state[2]; d = state[3]; e = state[4];

    for (int i = 0; i < 80; i++) {
        uint32_t f, k;
        if (i < 20)      { f = (b & c) | ((~b) & d);           k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d;                      k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d);    k = 0x8F1BBCDC; }
        else              { f = b ^ c ^ d;                      k = 0xCA62C1D6; }

        temp = ROL32(a, 5) + f + e + k + w[i];
        e = d; d = c; c = ROL32(b, 30); b = a; a = temp;
    }

    state[0] += a; state[1] += b; state[2] += c;
    state[3] += d; state[4] += e;
}

void sha1_init(SHA1_CTX *ctx) {
    ctx->state[0] = 0x67452301;
    ctx->state[1] = 0xEFCDAB89;
    ctx->state[2] = 0x98BADCFE;
    ctx->state[3] = 0x10325476;
    ctx->state[4] = 0xC3D2E1F0;
    ctx->count = 0;
    memset(ctx->buffer, 0, sizeof(ctx->buffer));
}

void sha1_update(SHA1_CTX *ctx, const uint8_t *data, size_t len) {
    size_t index = (size_t)(ctx->count & 63);
    ctx->count += len;

    /* Fill partial block first */
    if (index) {
        size_t part = 64 - index;
        if (len >= part) {
            memcpy(ctx->buffer + index, data, part);
            sha1_transform(ctx->state, ctx->buffer);
            data += part;
            len -= part;
        } else {
            memcpy(ctx->buffer + index, data, len);
            return;
        }
    }

    /* Process full blocks */
    while (len >= 64) {
        sha1_transform(ctx->state, data);
        data += 64;
        len -= 64;
    }

    /* Buffer remaining bytes */
    if (len > 0) {
        memcpy(ctx->buffer, data, len);
    }
}

void sha1_final(SHA1_CTX *ctx, uint8_t digest[20]) {
    uint64_t bits = ctx->count * 8;
    size_t index = (size_t)(ctx->count & 63);

    /* Pad with 0x80 then zeros */
    ctx->buffer[index++] = 0x80;

    if (index > 56) {
        /* Not enough room for length — fill, transform, start new block */
        memset(ctx->buffer + index, 0, 64 - index);
        sha1_transform(ctx->state, ctx->buffer);
        index = 0;
    }
    memset(ctx->buffer + index, 0, 56 - index);

    /* Append length in bits (big-endian) */
    for (int i = 0; i < 8; i++) {
        ctx->buffer[56 + i] = (uint8_t)(bits >> (56 - i * 8));
    }
    sha1_transform(ctx->state, ctx->buffer);

    /* Output digest (big-endian) */
    for (int i = 0; i < 5; i++) {
        digest[i * 4]     = (uint8_t)(ctx->state[i] >> 24);
        digest[i * 4 + 1] = (uint8_t)(ctx->state[i] >> 16);
        digest[i * 4 + 2] = (uint8_t)(ctx->state[i] >> 8);
        digest[i * 4 + 3] = (uint8_t)(ctx->state[i]);
    }
}
