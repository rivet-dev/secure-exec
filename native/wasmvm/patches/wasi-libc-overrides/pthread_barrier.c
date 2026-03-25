/**
 * pthread_barrier overrides for single-threaded WASM.
 *
 * The wasi-libc stub barrier calls __builtin_trap() when more than
 * one thread reaches the barrier. In single-threaded WASM, only one
 * thread ever calls barrier_wait, so it always gets
 * PTHREAD_BARRIER_SERIAL_THREAD.
 *
 * Internal fields used:
 *   _b_limit = __u.__i[2]  (barrier count - 1)
 */

#include <pthread.h>
#include <errno.h>

/* Field accessor matching musl's pthread_impl.h */
#define B_LIMIT(b) ((b)->__u.__i[2])

int pthread_barrier_init(pthread_barrier_t *restrict b,
                         const pthread_barrierattr_t *restrict a,
                         unsigned count)
{
	if (count == 0) return EINVAL;
	*b = (pthread_barrier_t){0};
	B_LIMIT(b) = count - 1;
	return 0;
}

int pthread_barrier_destroy(pthread_barrier_t *b)
{
	return 0;
}

int pthread_barrier_wait(pthread_barrier_t *b)
{
	/* Single thread is always the serializing thread */
	return PTHREAD_BARRIER_SERIAL_THREAD;
}
