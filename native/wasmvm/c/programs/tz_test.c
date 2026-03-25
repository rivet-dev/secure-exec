/* tz_test.c — verify POSIX TZ string support in localtime */
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

/* WASI time.h may not declare tzset */
extern void tzset(void);

int main(void) {
    int pass = 0, fail = 0;
    struct tm tm;
    time_t t;

    /* Test 1: TZ="" (empty) should be UTC */
    setenv("TZ", "", 1);
    tzset();
    t = 0; /* 1970-01-01 00:00:00 UTC */
    localtime_r(&t, &tm);
    if (tm.tm_gmtoff == 0 && tm.tm_hour == 0) {
        printf("PASS: TZ=\"\" is UTC (gmtoff=%ld, hour=%d)\n", (long)tm.tm_gmtoff, tm.tm_hour);
        pass++;
    } else {
        printf("FAIL: TZ=\"\" not UTC (gmtoff=%ld, hour=%d)\n", (long)tm.tm_gmtoff, tm.tm_hour);
        fail++;
    }

    /* Test 2: TZ=EST5EDT — standard time (January) should be UTC-5 */
    setenv("TZ", "EST5EDT", 1);
    tzset();
    /* 2024-01-15 12:00:00 UTC = Mon Jan 15 07:00:00 EST 2024 */
    t = 1705320000;
    localtime_r(&t, &tm);
    if (tm.tm_gmtoff == -18000) {
        printf("PASS: EST5EDT winter gmtoff=%ld (expected -18000)\n", (long)tm.tm_gmtoff);
        pass++;
    } else {
        printf("FAIL: EST5EDT winter gmtoff=%ld (expected -18000)\n", (long)tm.tm_gmtoff);
        fail++;
    }

    /* Test 3: EST5EDT — DST time (July) should be UTC-4 */
    /* 2024-07-15 12:00:00 UTC = Mon Jul 15 08:00:00 EDT 2024 */
    t = 1721044800;
    localtime_r(&t, &tm);
    if (tm.tm_gmtoff == -14400) {
        printf("PASS: EST5EDT summer gmtoff=%ld (expected -14400)\n", (long)tm.tm_gmtoff);
        pass++;
    } else {
        printf("FAIL: EST5EDT summer gmtoff=%ld (expected -14400)\n", (long)tm.tm_gmtoff);
        fail++;
    }

    /* Test 4: TZ=UTC should give offset 0 */
    setenv("TZ", "UTC", 1);
    tzset();
    t = 1705320000;
    localtime_r(&t, &tm);
    if (tm.tm_gmtoff == 0) {
        printf("PASS: TZ=UTC gmtoff=%ld\n", (long)tm.tm_gmtoff);
        pass++;
    } else {
        printf("FAIL: TZ=UTC gmtoff=%ld (expected 0)\n", (long)tm.tm_gmtoff);
        fail++;
    }

    /* Test 5: TZ=PST8PDT with explicit rules */
    setenv("TZ", "PST8PDT,M3.2.0/2,M11.1.0/2", 1);
    tzset();
    /* 2024-01-15 12:00:00 UTC — winter, should be PST (UTC-8) */
    t = 1705320000;
    localtime_r(&t, &tm);
    if (tm.tm_gmtoff == -28800) {
        printf("PASS: PST8PDT winter gmtoff=%ld (expected -28800)\n", (long)tm.tm_gmtoff);
        pass++;
    } else {
        printf("FAIL: PST8PDT winter gmtoff=%ld (expected -28800)\n", (long)tm.tm_gmtoff);
        fail++;
    }

    /* Test 6: PST8PDT summer should be PDT (UTC-7) */
    t = 1721044800; /* 2024-07-15 12:00:00 UTC */
    localtime_r(&t, &tm);
    if (tm.tm_gmtoff == -25200) {
        printf("PASS: PST8PDT summer gmtoff=%ld (expected -25200)\n", (long)tm.tm_gmtoff);
        pass++;
    } else {
        printf("FAIL: PST8PDT summer gmtoff=%ld (expected -25200)\n", (long)tm.tm_gmtoff);
        fail++;
    }

    printf("tz_test: %d passed, %d failed\n", pass, fail);
    return fail > 0 ? 1 : 0;
}
