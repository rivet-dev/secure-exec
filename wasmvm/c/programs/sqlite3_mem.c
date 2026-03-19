/* sqlite3_mem — in-memory SQLite operations (Tier 5 test fixture)
 *
 * Creates an in-memory database, creates a table, inserts rows,
 * queries them, and prints the results. Validates the full libc surface
 * (malloc, string formatting, math) exercised by SQLite.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sqlite3.h"

#ifdef SQLITE_OS_OTHER
/* Minimal OS stubs for WASM — in-memory DB only, no file I/O */
int sqlite3_os_init(void) { return SQLITE_OK; }
int sqlite3_os_end(void)  { return SQLITE_OK; }
#endif

static int print_row(void *unused, int ncols, char **values, char **names) {
    (void)unused;
    for (int i = 0; i < ncols; i++) {
        if (i > 0) printf("|");
        printf("%s=%s", names[i], values[i] ? values[i] : "NULL");
    }
    printf("\n");
    return 0;
}

static void exec_sql(sqlite3 *db, const char *sql, const char *label) {
    char *err = NULL;
    int rc = sqlite3_exec(db, sql, print_row, NULL, &err);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "%s error: %s\n", label, err);
        sqlite3_free(err);
        sqlite3_close(db);
        exit(1);
    }
}

int main(void) {
    sqlite3 *db;
    int rc;

    rc = sqlite3_open(":memory:", &db);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "open error: %s\n", sqlite3_errmsg(db));
        return 1;
    }
    printf("db: open\n");

    exec_sql(db,
        "CREATE TABLE users ("
        "  id INTEGER PRIMARY KEY,"
        "  name TEXT NOT NULL,"
        "  score REAL"
        ");",
        "create");
    printf("table: created\n");

    exec_sql(db,
        "INSERT INTO users VALUES (1, 'Alice', 95.5);"
        "INSERT INTO users VALUES (2, 'Bob', 87.3);"
        "INSERT INTO users VALUES (3, 'Charlie', NULL);"
        "INSERT INTO users VALUES (4, 'Diana', 92.1);",
        "insert");
    printf("rows: 4\n");

    printf("--- query: all ---\n");
    exec_sql(db, "SELECT id, name, score FROM users ORDER BY id;", "select");

    printf("--- query: avg ---\n");
    exec_sql(db, "SELECT COUNT(*) as total, AVG(score) as avg_score FROM users WHERE score IS NOT NULL;", "avg");

    printf("--- query: top ---\n");
    exec_sql(db, "SELECT name, score FROM users WHERE score IS NOT NULL ORDER BY score DESC LIMIT 2;", "top");

    printf("version: %s\n", sqlite3_libversion());

    sqlite3_close(db);
    printf("db: closed\n");

    return 0;
}
