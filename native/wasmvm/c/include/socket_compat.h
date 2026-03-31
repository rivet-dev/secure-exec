/* socket_compat.h -- forward declarations for socket APIs still hidden by the
 * current patched wasi-libc headers.
 *
 * The wasmVM socket patches provide the implementations, but the generated
 * sysroot headers still leave a few declarations behind the wasip2-only
 * guard. Include this from C probes that exercise bind/listen/sendto-style
 * paths until the sysroot header patch is fully wired through.
 */
#ifndef SOCKET_COMPAT_H
#define SOCKET_COMPAT_H

#include <sys/socket.h>

#ifdef __wasi__
int bind(int, const struct sockaddr *, socklen_t);
int listen(int, int);
ssize_t sendto(int, const void *, size_t, int, const struct sockaddr *, socklen_t);
ssize_t recvfrom(int, void *__restrict, size_t, int, struct sockaddr *__restrict, socklen_t *__restrict);
int getsockname(int, struct sockaddr *__restrict, socklen_t *__restrict);
int getpeername(int, struct sockaddr *__restrict, socklen_t *__restrict);
#endif

#endif
