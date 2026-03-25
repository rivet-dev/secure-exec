/**
 * pthread_cond overrides for single-threaded WASM.
 *
 * The wasi-libc stub condvar calls __builtin_trap() in pthread_cond_wait
 * (single-threaded deadlock). This override makes cond_wait return
 * immediately (pretend signaled) since there are no other threads.
 *
 * Internal fields used:
 *   _c_clock = __u.__i[4]  (clock type from condattr)
 */

#include <pthread.h>
#include <errno.h>
#include <time.h>

/* Field accessor matching musl's pthread_impl.h */
#define C_CLOCK(c) ((c)->__u.__i[4])

int pthread_cond_init(pthread_cond_t *restrict c,
                      const pthread_condattr_t *restrict a)
{
	*c = (pthread_cond_t){0};
	if (a) C_CLOCK(c) = *(const int *)a & 0x7fffffff;
	return 0;
}

int pthread_cond_destroy(pthread_cond_t *c)
{
	return 0;
}

int pthread_cond_signal(pthread_cond_t *c)
{
	return 0; /* No other threads to wake */
}

int pthread_cond_broadcast(pthread_cond_t *c)
{
	return 0; /* No other threads to wake */
}

int pthread_cond_wait(pthread_cond_t *restrict c,
                      pthread_mutex_t *restrict m)
{
	/* Single-threaded: pretend we were signaled immediately */
	return 0;
}

int __pthread_cond_timedwait(pthread_cond_t *restrict c,
                             pthread_mutex_t *restrict m,
                             const struct timespec *restrict ts)
{
	if (ts) {
		struct timespec now;
		/* WASI clockid_t is a pointer type; use CLOCK_REALTIME directly */
		if (clock_gettime(CLOCK_REALTIME, &now))
			return EINVAL;
		if (now.tv_sec > ts->tv_sec ||
		    (now.tv_sec == ts->tv_sec && now.tv_nsec >= ts->tv_nsec))
			return ETIMEDOUT;
	}
	return 0; /* Single-threaded: pretend signaled */
}

/* Weak alias so both names resolve */
__attribute__((__weak__, __alias__("__pthread_cond_timedwait")))
int pthread_cond_timedwait(pthread_cond_t *restrict,
                           pthread_mutex_t *restrict,
                           const struct timespec *restrict);
