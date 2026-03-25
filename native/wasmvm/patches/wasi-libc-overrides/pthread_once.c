/**
 * pthread_once override for single-threaded WASM.
 *
 * The stub implementation works but lives in the same .o as other stubs
 * (__acquire_ptc, __release_ptc, __pthread_tsd_run_dtors). This standalone
 * override replaces that entire compilation unit, so it must also provide
 * __acquire_ptc and __release_ptc (no-ops in single-threaded WASM).
 *
 * pthread_once_t is just an int: 0 = not called, non-zero = called.
 */

#include <pthread.h>

int pthread_once(pthread_once_t *control, void (*init)(void))
{
	if (!*control) {
		init();
		*control = 1;
	}
	return 0;
}

/* Thread count change lock — no-op in single-threaded WASM */
void __acquire_ptc(void) {}
void __release_ptc(void) {}
