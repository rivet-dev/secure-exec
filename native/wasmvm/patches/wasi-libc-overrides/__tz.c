/**
 * __tz.c — Timezone support for single-threaded WASM
 *
 * Replaces the disabled musl __tz.c stub with a working POSIX TZ string parser.
 * Supports TZ formats like "EST5EDT", "UTC", "PST8PDT,M3.2.0/2,M11.1.0/2".
 * Does NOT support tzdata file loading (no /usr/share/zoneinfo).
 * Default (no TZ set) remains UTC for backwards compatibility.
 */

#include <time.h>
#include <stdint.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

/* musl internal helpers (defined in other compilation units) */
extern int __month_to_secs(int, int);
extern long long __year_to_secs(long long, int *);

/* Shared UTC string (defined in original __tz.c, but we replace the whole file) */
const char __utc[] = "UTC";

/* Timezone state */
static long tz_offset = 0;      /* seconds west of UTC (positive = west) */
static long dst_offset = 0;     /* DST offset (seconds west of UTC) */
static int tz_daylight = 0;     /* 1 if DST zone exists */
static char std_name[32] = "UTC";
static char dst_name[32] = "";
static int r0[5], r1[5];        /* DST transition rules */
static char old_tz[256] = "";
static int tz_initialized = 0;

/* Global POSIX symbols */
long __timezone = 0;
int __daylight = 0;
char *__tzname[2] = { 0, 0 };

/* --- POSIX TZ string parsing (from musl's do_tzset) --- */

static int getint(const char **p)
{
	unsigned x;
	for (x = 0; **p - '0' < 10U; (*p)++)
		x = **p - '0' + 10 * x;
	return x;
}

static int getoff(const char **p)
{
	int neg = 0;
	if (**p == '-') {
		++*p;
		neg = 1;
	} else if (**p == '+') {
		++*p;
	}
	int off = 3600 * getint(p);
	if (**p == ':') {
		++*p;
		off += 60 * getint(p);
		if (**p == ':') {
			++*p;
			off += getint(p);
		}
	}
	return neg ? -off : off;
}

static void getrule(const char **p, int rule[5])
{
	int r = rule[0] = **p;

	if (r != 'M') {
		if (r == 'J') ++*p;
		else rule[0] = 0;
		rule[1] = getint(p);
	} else {
		++*p; rule[1] = getint(p);
		++*p; rule[2] = getint(p);
		++*p; rule[3] = getint(p);
	}

	if (**p == '/') {
		++*p;
		rule[4] = getoff(p);
	} else {
		rule[4] = 7200;
	}
}

static void getname(char *d, int dsize, const char **p)
{
	int i;
	if (**p == '<') {
		++*p;
		for (i = 0; (*p)[i] && (*p)[i] != '>'; i++)
			if (i < dsize - 1) d[i] = (*p)[i];
		if ((*p)[i]) ++*p;
	} else {
		for (i = 0; ((*p)[i] | 32) - 'a' < 26U; i++)
			if (i < dsize - 1) d[i] = (*p)[i];
	}
	*p += i;
	d[i < dsize - 1 ? i : dsize - 1] = 0;
}

static void do_tzset(void)
{
	const char *s = getenv("TZ");
	if (!s || !*s) s = "UTC";

	/* Skip if TZ hasn't changed */
	if (tz_initialized && strcmp(s, old_tz) == 0) return;

	/* Cache TZ value */
	size_t len = strlen(s);
	if (len >= sizeof(old_tz)) len = sizeof(old_tz) - 1;
	memcpy(old_tz, s, len);
	old_tz[len] = 0;
	tz_initialized = 1;

	/* Reset DST rules */
	for (int i = 0; i < 5; i++) r0[i] = r1[i] = 0;

	/* Skip optional colon prefix */
	if (*s == ':') s++;

	/* Parse standard zone name and offset */
	getname(std_name, sizeof(std_name), &s);
	__tzname[0] = std_name;

	if (*s == '+' || *s == '-' || (*s - '0' < 10U)) {
		tz_offset = getoff(&s);
	} else {
		tz_offset = 0;
	}
	__timezone = tz_offset;

	/* Parse optional DST zone */
	getname(dst_name, sizeof(dst_name), &s);
	__tzname[1] = dst_name;

	if (dst_name[0]) {
		tz_daylight = 1;
		__daylight = 1;
		if (*s == '+' || *s == '-' || *s - '0' < 10U)
			dst_offset = getoff(&s);
		else
			dst_offset = tz_offset - 3600;
	} else {
		tz_daylight = 0;
		__daylight = 0;
		dst_offset = tz_offset;
	}

	/* Parse optional DST transition rules */
	if (*s == ',') {
		s++; getrule(&s, r0);
		if (*s == ',') { s++; getrule(&s, r1); }
	} else if (tz_daylight) {
		/* No explicit rules — default to US rules (matches glibc behavior).
		 * POSIX says implementation-defined; glibc uses M3.2.0/2,M11.1.0/2 */
		r0[0] = 'M'; r0[1] = 3; r0[2] = 2; r0[3] = 0; r0[4] = 7200;
		r1[0] = 'M'; r1[1] = 11; r1[2] = 1; r1[3] = 0; r1[4] = 7200;
	}
}

/* --- DST transition computation --- */

static int days_in_month(int m, int is_leap)
{
	if (m == 2) return 28 + is_leap;
	return 30 + ((0xad5 >> (m - 1)) & 1);
}

static long long rule_to_secs(const int *rule, int year)
{
	int is_leap;
	long long t = __year_to_secs(year, &is_leap);
	int x, m, n, d;
	if (rule[0] != 'M') {
		x = rule[1];
		if (rule[0] == 'J' && (x < 60 || !is_leap)) x--;
		t += 86400 * x;
	} else {
		m = rule[1];
		n = rule[2];
		d = rule[3];
		t += __month_to_secs(m - 1, is_leap);
		int wday = (int)((t + 4 * 86400) % (7 * 86400)) / 86400;
		int days = d - wday;
		if (days < 0) days += 7;
		if (n == 5 && days + 28 >= days_in_month(m, is_leap)) n = 4;
		t += 86400 * (days + 7 * (n - 1));
	}
	t += rule[4];
	return t;
}

/* WASI signature: int *offset (not long *offset) — ABI-compatible on wasm32 */
void __secs_to_zone(long long t, int local, int *isdst, int *offset, long *oppoff, const char **zonename)
{
	do_tzset();

	if (!tz_daylight) {
		/* No DST — always standard time */
		if (isdst) *isdst = 0;
		if (offset) *offset = -tz_offset;
		if (oppoff) *oppoff = -dst_offset;
		if (zonename) *zonename = __tzname[0];
		return;
	}

	/* Determine if DST is in effect using POSIX rules */
	long long y = t / 31556952 + 70;
	while (__year_to_secs(y, 0) > t) y--;
	while (__year_to_secs(y + 1, 0) < t) y++;

	long long t0 = rule_to_secs(r0, y);
	long long t1 = rule_to_secs(r1, y);

	if (!local) {
		t0 += tz_offset;
		t1 += dst_offset;
	}

	int is_dst;
	if (t0 < t1) {
		is_dst = (t >= t0 && t < t1);
	} else {
		is_dst = !(t >= t1 && t < t0);
	}

	if (is_dst) {
		if (isdst) *isdst = 1;
		if (offset) *offset = -dst_offset;
		if (oppoff) *oppoff = -tz_offset;
		if (zonename) *zonename = __tzname[1];
	} else {
		if (isdst) *isdst = 0;
		if (offset) *offset = -tz_offset;
		if (oppoff) *oppoff = -dst_offset;
		if (zonename) *zonename = __tzname[0];
	}
}

void __tzset(void)
{
	do_tzset();
}

/* Weak alias so user code can call tzset() */
void tzset(void) __attribute__((weak, alias("__tzset")));

const char *__tm_to_tzname(const struct tm *tm)
{
	const void *p = tm->__tm_zone;
	if (!p) return "";
	return p;
}
