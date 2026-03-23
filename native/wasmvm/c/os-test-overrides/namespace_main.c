/* Stub main() for os-test namespace/ tests.
 * These are compile-only header conformance checks — they just #include a
 * header and verify it exists.  They have no main(), so WASI _start traps
 * with "unreachable".  Providing this stub lets them exit 0. */
int main(void) { return 0; }
