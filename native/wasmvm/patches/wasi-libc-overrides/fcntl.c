/**
 * Fix for wasi-libc's broken fcntl F_GETFD/F_SETFD implementation.
 *
 * wasi-libc always returns FD_CLOEXEC(1) for F_GETFD and ignores F_SETFD
 * because WASI has no exec(). This fix properly tracks per-fd cloexec
 * flags and delegates F_GETFL/F_SETFL to the original WASI fd_fdstat
 * interface.
 *
 * Installed into the patched sysroot so ALL WASM programs get correct
 * fcntl behavior, not just test binaries.
 */

#include <stdarg.h>
#include <errno.h>
#include <fcntl.h>
#include <wasi/api.h>

/* Per-fd cloexec tracking (up to 256 FDs) */
#define MAX_FDS 256
static unsigned char _fd_cloexec[MAX_FDS];

int fcntl(int fd, int cmd, ...) {
    va_list ap;
    va_start(ap, cmd);

    int result;

    switch (cmd) {
    case F_GETFD:
        if (fd < 0 || fd >= MAX_FDS) {
            errno = EBADF;
            result = -1;
        } else {
            result = _fd_cloexec[fd] ? FD_CLOEXEC : 0;
        }
        break;

    case F_SETFD: {
        int arg = va_arg(ap, int);
        if (fd < 0 || fd >= MAX_FDS) {
            errno = EBADF;
            result = -1;
        } else {
            _fd_cloexec[fd] = (arg & FD_CLOEXEC) ? 1 : 0;
            result = 0;
        }
        break;
    }

    case F_GETFL: {
        __wasi_fdstat_t stat;
        __wasi_errno_t err = __wasi_fd_fdstat_get((__wasi_fd_t)fd, &stat);
        if (err != 0) {
            errno = err;
            result = -1;
        } else {
            int flags = stat.fs_flags;
            /* Derive read/write mode from rights */
            __wasi_rights_t r = stat.fs_rights_base;
            int can_read  = (r & __WASI_RIGHTS_FD_READ) != 0;
            int can_write = (r & __WASI_RIGHTS_FD_WRITE) != 0;
            if (can_read && can_write)
                flags |= O_RDWR;
            else if (can_read)
                flags |= O_RDONLY;
            else if (can_write)
                flags |= O_WRONLY;
            result = flags;
        }
        break;
    }

    case F_SETFL: {
        int arg = va_arg(ap, int);
        __wasi_errno_t err = __wasi_fd_fdstat_set_flags(
            (__wasi_fd_t)fd,
            (__wasi_fdflags_t)(arg & 0xfff));
        if (err != 0) {
            errno = err;
            result = -1;
        } else {
            result = 0;
        }
        break;
    }

    default:
        errno = EINVAL;
        result = -1;
        break;
    }

    va_end(ap);
    return result;
}
