/*
 * inode_nlink_test.c — verify inode allocation and hard link nlink tracking
 *
 * Tests:
 *   1. New file gets non-zero inode
 *   2. Two different files get different inodes
 *   3. Hard link shares inode with original, both report nlink=2
 *   4. Unlinking one hard link drops nlink back to 1
 *   5. Directories get unique inodes
 *   6. Directory nlink = 2 + number of immediate subdirectories
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>

static int failures = 0;

#define CHECK(cond, fmt, ...) do { \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: " fmt "\n", ##__VA_ARGS__); \
        failures++; \
    } else { \
        printf("PASS: " fmt "\n", ##__VA_ARGS__); \
    } \
} while (0)

int main(void) {
    struct stat st1, st2, st3;

    /* Clean up from any prior run */
    unlink("/tmp/ino_a");
    unlink("/tmp/ino_b");
    unlink("/tmp/ino_link");
    rmdir("/tmp/ino_sub1");
    rmdir("/tmp/ino_sub2");
    rmdir("/tmp/ino_dir");

    /* Setup */
    mkdir("/tmp", 0755);

    /* --- Test 1: new file gets non-zero inode --- */
    FILE *f = fopen("/tmp/ino_a", "w");
    if (!f) { perror("fopen /tmp/ino_a"); return 1; }
    fprintf(f, "hello");
    fclose(f);

    if (stat("/tmp/ino_a", &st1) != 0) { perror("stat ino_a"); return 1; }
    CHECK(st1.st_ino != 0, "file ino != 0 (got %lu)", (unsigned long)st1.st_ino);
    CHECK(st1.st_nlink == 1, "file nlink == 1 (got %lu)", (unsigned long)st1.st_nlink);

    /* --- Test 2: different files get different inodes --- */
    f = fopen("/tmp/ino_b", "w");
    if (!f) { perror("fopen /tmp/ino_b"); return 1; }
    fprintf(f, "world");
    fclose(f);

    if (stat("/tmp/ino_b", &st2) != 0) { perror("stat ino_b"); return 1; }
    CHECK(st2.st_ino != 0, "second file ino != 0 (got %lu)", (unsigned long)st2.st_ino);
    CHECK(st1.st_ino != st2.st_ino, "different files have different inodes (%lu vs %lu)",
          (unsigned long)st1.st_ino, (unsigned long)st2.st_ino);

    /* --- Test 3: hard link shares inode, nlink=2 --- */
    if (link("/tmp/ino_a", "/tmp/ino_link") != 0) { perror("link"); return 1; }

    if (stat("/tmp/ino_a", &st1) != 0) { perror("stat ino_a after link"); return 1; }
    if (stat("/tmp/ino_link", &st3) != 0) { perror("stat ino_link"); return 1; }
    CHECK(st1.st_ino == st3.st_ino, "hard link shares inode (%lu == %lu)",
          (unsigned long)st1.st_ino, (unsigned long)st3.st_ino);
    CHECK(st1.st_nlink == 2, "original nlink == 2 after link (got %lu)", (unsigned long)st1.st_nlink);
    CHECK(st3.st_nlink == 2, "link nlink == 2 (got %lu)", (unsigned long)st3.st_nlink);

    /* --- Test 4: unlink one hard link, nlink drops to 1 --- */
    if (unlink("/tmp/ino_link") != 0) { perror("unlink ino_link"); return 1; }

    if (stat("/tmp/ino_a", &st1) != 0) { perror("stat ino_a after unlink"); return 1; }
    CHECK(st1.st_nlink == 1, "nlink == 1 after unlink (got %lu)", (unsigned long)st1.st_nlink);

    /* --- Test 5: directories get unique inodes --- */
    if (mkdir("/tmp/ino_dir", 0755) != 0) { perror("mkdir ino_dir"); return 1; }

    if (stat("/tmp/ino_dir", &st2) != 0) { perror("stat ino_dir"); return 1; }
    CHECK(st2.st_ino != 0, "dir ino != 0 (got %lu)", (unsigned long)st2.st_ino);
    CHECK(st2.st_nlink == 2, "empty dir nlink == 2 (got %lu)", (unsigned long)st2.st_nlink);

    /* --- Test 6: dir nlink = 2 + subdirs --- */
    if (mkdir("/tmp/ino_dir/sub1", 0755) != 0) { perror("mkdir sub1"); return 1; }

    if (stat("/tmp/ino_dir", &st2) != 0) { perror("stat ino_dir after sub1"); return 1; }
    CHECK(st2.st_nlink == 3, "dir nlink == 3 with 1 subdir (got %lu)", (unsigned long)st2.st_nlink);

    if (mkdir("/tmp/ino_dir/sub2", 0755) != 0) { perror("mkdir sub2"); return 1; }

    if (stat("/tmp/ino_dir", &st2) != 0) { perror("stat ino_dir after sub2"); return 1; }
    CHECK(st2.st_nlink == 4, "dir nlink == 4 with 2 subdirs (got %lu)", (unsigned long)st2.st_nlink);

    /* Cleanup */
    unlink("/tmp/ino_a");
    unlink("/tmp/ino_b");
    rmdir("/tmp/ino_dir/sub1");
    rmdir("/tmp/ino_dir/sub2");
    rmdir("/tmp/ino_dir");

    if (failures > 0) {
        fprintf(stderr, "%d test(s) failed\n", failures);
        return 1;
    }
    printf("All inode/nlink tests passed\n");
    return 0;
}
