/*
 * pthread_sync_test.c — verify pthread synchronization primitives
 *
 * Tests pthread_cond, pthread_once, pthread_rwlock, and pthread_barrier
 * in a single-threaded context. All operations should succeed without
 * trapping or returning ENOSYS.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <errno.h>
#include <time.h>

static int failures = 0;

#define CHECK(cond, fmt, ...) do { \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: " fmt "\n", ##__VA_ARGS__); \
        failures++; \
    } else { \
        printf("PASS: " fmt "\n", ##__VA_ARGS__); \
    } \
} while (0)

/* --- pthread_once --- */

static int once_counter = 0;
static pthread_once_t once_control = PTHREAD_ONCE_INIT;

static void once_init_fn(void) {
    once_counter++;
}

static void test_once(void) {
    int r;
    r = pthread_once(&once_control, once_init_fn);
    CHECK(r == 0, "pthread_once first call returns 0 (got %d)", r);
    CHECK(once_counter == 1, "once init called exactly once (count=%d)", once_counter);

    r = pthread_once(&once_control, once_init_fn);
    CHECK(r == 0, "pthread_once second call returns 0 (got %d)", r);
    CHECK(once_counter == 1, "once init not called again (count=%d)", once_counter);
}

/* --- pthread_cond --- */

static void test_cond(void) {
    pthread_cond_t cond;
    pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
    int r;

    r = pthread_cond_init(&cond, NULL);
    CHECK(r == 0, "cond_init returns 0 (got %d)", r);

    r = pthread_cond_signal(&cond);
    CHECK(r == 0, "cond_signal returns 0 (got %d)", r);

    r = pthread_cond_broadcast(&cond);
    CHECK(r == 0, "cond_broadcast returns 0 (got %d)", r);

    /* cond_timedwait with past time: should return ETIMEDOUT */
    struct timespec past = { 0, 0 };
    pthread_mutex_lock(&mutex);
    r = pthread_cond_timedwait(&cond, &mutex, &past);
    CHECK(r == ETIMEDOUT, "cond_timedwait with past time returns ETIMEDOUT (got %d)", r);
    pthread_mutex_unlock(&mutex);

    /* Note: cond_wait and cond_timedwait(future) block on native Linux,
       so we only test timedwait with past timestamps for parity. */

    r = pthread_cond_destroy(&cond);
    CHECK(r == 0, "cond_destroy returns 0 (got %d)", r);

    pthread_mutex_destroy(&mutex);
}

/* --- pthread_rwlock --- */

static void test_rwlock(void) {
    pthread_rwlock_t rw;
    int r;

    r = pthread_rwlock_init(&rw, NULL);
    CHECK(r == 0, "rwlock_init returns 0 (got %d)", r);

    /* Read lock */
    r = pthread_rwlock_rdlock(&rw);
    CHECK(r == 0, "rwlock_rdlock returns 0 (got %d)", r);

    /* Multiple read locks allowed */
    r = pthread_rwlock_rdlock(&rw);
    CHECK(r == 0, "rwlock_rdlock second returns 0 (got %d)", r);

    r = pthread_rwlock_unlock(&rw);
    CHECK(r == 0, "rwlock_unlock reader 1 returns 0 (got %d)", r);

    r = pthread_rwlock_unlock(&rw);
    CHECK(r == 0, "rwlock_unlock reader 2 returns 0 (got %d)", r);

    /* Write lock */
    r = pthread_rwlock_wrlock(&rw);
    CHECK(r == 0, "rwlock_wrlock returns 0 (got %d)", r);

    r = pthread_rwlock_unlock(&rw);
    CHECK(r == 0, "rwlock_unlock writer returns 0 (got %d)", r);

    /* Try locks */
    r = pthread_rwlock_tryrdlock(&rw);
    CHECK(r == 0, "rwlock_tryrdlock returns 0 (got %d)", r);
    pthread_rwlock_unlock(&rw);

    r = pthread_rwlock_trywrlock(&rw);
    CHECK(r == 0, "rwlock_trywrlock returns 0 (got %d)", r);
    pthread_rwlock_unlock(&rw);

    r = pthread_rwlock_destroy(&rw);
    CHECK(r == 0, "rwlock_destroy returns 0 (got %d)", r);
}

/* --- pthread_barrier --- */

static void test_barrier(void) {
    pthread_barrier_t bar;
    int r;

    r = pthread_barrier_init(&bar, NULL, 1);
    CHECK(r == 0, "barrier_init(count=1) returns 0 (got %d)", r);

    r = pthread_barrier_wait(&bar);
    CHECK(r == PTHREAD_BARRIER_SERIAL_THREAD,
          "barrier_wait returns SERIAL_THREAD (got %d)", r);

    r = pthread_barrier_destroy(&bar);
    CHECK(r == 0, "barrier_destroy returns 0 (got %d)", r);

    /* Invalid count */
    r = pthread_barrier_init(&bar, NULL, 0);
    CHECK(r == EINVAL, "barrier_init(count=0) returns EINVAL (got %d)", r);
}

int main(void) {
    test_once();
    test_cond();
    test_rwlock();
    test_barrier();

    if (failures > 0) {
        fprintf(stderr, "%d test(s) failed\n", failures);
        return 1;
    }
    printf("All pthread sync tests passed\n");
    return 0;
}
