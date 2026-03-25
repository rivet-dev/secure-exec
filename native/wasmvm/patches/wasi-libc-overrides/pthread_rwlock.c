/**
 * pthread_rwlock overrides for single-threaded WASM.
 *
 * The wasi-libc stub rwlock uses futex-based atomics that return ENOSYS
 * in WASI. This override uses simple counter-based locking suitable
 * for single-threaded execution.
 *
 * Internal fields used:
 *   _rw_lock = __u.__vi[0]  (0=unlocked, >0=readers, -1=writer)
 */

#include <pthread.h>
#include <errno.h>
#include <time.h>

/* Field accessor matching musl's pthread_impl.h */
#define RW_LOCK(rw) ((rw)->__u.__vi[0])

int pthread_rwlock_init(pthread_rwlock_t *restrict rw,
                        const pthread_rwlockattr_t *restrict a)
{
	*rw = (pthread_rwlock_t){0};
	return 0;
}

int pthread_rwlock_destroy(pthread_rwlock_t *rw)
{
	return 0;
}

int __pthread_rwlock_tryrdlock(pthread_rwlock_t *rw)
{
	if (RW_LOCK(rw) < 0) return EBUSY; /* Writer holds lock */
	RW_LOCK(rw)++;
	return 0;
}

int __pthread_rwlock_rdlock(pthread_rwlock_t *rw)
{
	return __pthread_rwlock_tryrdlock(rw);
}

int __pthread_rwlock_timedrdlock(pthread_rwlock_t *restrict rw,
                                 const struct timespec *restrict at)
{
	int r = __pthread_rwlock_tryrdlock(rw);
	if (r == EBUSY) return at ? ETIMEDOUT : EDEADLK;
	return r;
}

int __pthread_rwlock_trywrlock(pthread_rwlock_t *rw)
{
	if (RW_LOCK(rw) != 0) return EBUSY; /* Readers or writer hold lock */
	RW_LOCK(rw) = -1;
	return 0;
}

int __pthread_rwlock_wrlock(pthread_rwlock_t *rw)
{
	return __pthread_rwlock_trywrlock(rw);
}

int __pthread_rwlock_timedwrlock(pthread_rwlock_t *restrict rw,
                                 const struct timespec *restrict at)
{
	int r = __pthread_rwlock_trywrlock(rw);
	if (r == EBUSY) return at ? ETIMEDOUT : EDEADLK;
	return r;
}

int __pthread_rwlock_unlock(pthread_rwlock_t *rw)
{
	if (RW_LOCK(rw) < 0)
		RW_LOCK(rw) = 0;   /* Release writer */
	else if (RW_LOCK(rw) > 0)
		RW_LOCK(rw)--;      /* Release one reader */
	else
		return EPERM;
	return 0;
}

/* Weak aliases */
__attribute__((__weak__, __alias__("__pthread_rwlock_rdlock")))
int pthread_rwlock_rdlock(pthread_rwlock_t *);

__attribute__((__weak__, __alias__("__pthread_rwlock_timedrdlock")))
int pthread_rwlock_timedrdlock(pthread_rwlock_t *restrict,
                               const struct timespec *restrict);

__attribute__((__weak__, __alias__("__pthread_rwlock_tryrdlock")))
int pthread_rwlock_tryrdlock(pthread_rwlock_t *);

__attribute__((__weak__, __alias__("__pthread_rwlock_wrlock")))
int pthread_rwlock_wrlock(pthread_rwlock_t *);

__attribute__((__weak__, __alias__("__pthread_rwlock_timedwrlock")))
int pthread_rwlock_timedwrlock(pthread_rwlock_t *restrict,
                               const struct timespec *restrict);

__attribute__((__weak__, __alias__("__pthread_rwlock_trywrlock")))
int pthread_rwlock_trywrlock(pthread_rwlock_t *);

__attribute__((__weak__, __alias__("__pthread_rwlock_unlock")))
int pthread_rwlock_unlock(pthread_rwlock_t *);
