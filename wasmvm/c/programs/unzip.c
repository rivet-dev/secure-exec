/* unzip.c — Extract ZIP archives using zlib/minizip
 *
 * Usage: unzip archive.zip                 (extract all to cwd)
 *        unzip -d outdir archive.zip       (extract to directory)
 *        unzip -l archive.zip              (list contents)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>
#include "unzip.h"

#define MAX_PATH_LEN 4096
#define WRITE_BUF_SIZE 8192

/* Ensure all parent directories of path exist */
static int mkdirs(const char *path) {
    char tmp[MAX_PATH_LEN];
    size_t len = strlen(path);
    if (len >= sizeof(tmp)) return -1;
    memcpy(tmp, path, len + 1);

    for (size_t i = 1; i < len; i++) {
        if (tmp[i] == '/') {
            tmp[i] = '\0';
            if (mkdir(tmp, 0755) != 0 && errno != EEXIST)
                return -1;
            tmp[i] = '/';
        }
    }
    return 0;
}

/* List archive contents */
static int list_archive(const char *archive) {
    unzFile uf = unzOpen(archive);
    if (!uf) {
        fprintf(stderr, "unzip: cannot open '%s'\n", archive);
        return 1;
    }

    unz_global_info gi;
    if (unzGetGlobalInfo(uf, &gi) != UNZ_OK) {
        fprintf(stderr, "unzip: cannot read archive info\n");
        unzClose(uf);
        return 1;
    }

    printf("  Length      Name\n");
    printf("---------  ----\n");

    unsigned long total_size = 0;
    for (uLong i = 0; i < gi.number_entry; i++) {
        char filename[MAX_PATH_LEN];
        unz_file_info fi;
        if (unzGetCurrentFileInfo(uf, &fi, filename, sizeof(filename),
                                  NULL, 0, NULL, 0) != UNZ_OK) {
            fprintf(stderr, "unzip: error reading file info\n");
            unzClose(uf);
            return 1;
        }

        printf("%9lu  %s\n", fi.uncompressed_size, filename);
        total_size += fi.uncompressed_size;

        if (i + 1 < gi.number_entry) {
            if (unzGoToNextFile(uf) != UNZ_OK) {
                fprintf(stderr, "unzip: error iterating archive\n");
                unzClose(uf);
                return 1;
            }
        }
    }

    printf("---------  ----\n");
    printf("%9lu  %lu file(s)\n", total_size, gi.number_entry);

    unzClose(uf);
    return 0;
}

/* Extract a single file from the archive */
static int extract_current_file(unzFile uf, const char *outdir) {
    char filename[MAX_PATH_LEN];
    unz_file_info fi;
    if (unzGetCurrentFileInfo(uf, &fi, filename, sizeof(filename),
                              NULL, 0, NULL, 0) != UNZ_OK) {
        fprintf(stderr, "unzip: error reading file info\n");
        return -1;
    }

    /* Build output path */
    char outpath[MAX_PATH_LEN];
    if (outdir) {
        snprintf(outpath, sizeof(outpath), "%s/%s", outdir, filename);
    } else {
        snprintf(outpath, sizeof(outpath), "%s", filename);
    }

    /* Directory entry (trailing slash) */
    size_t namelen = strlen(outpath);
    if (namelen > 0 && outpath[namelen - 1] == '/') {
        if (mkdir(outpath, 0755) != 0 && errno != EEXIST) {
            fprintf(stderr, "unzip: cannot create directory '%s': %s\n",
                    outpath, strerror(errno));
            return -1;
        }
        return 0;
    }

    /* Ensure parent directory exists */
    if (mkdirs(outpath) != 0) {
        fprintf(stderr, "unzip: cannot create parent directories for '%s'\n", outpath);
        return -1;
    }

    if (unzOpenCurrentFile(uf) != UNZ_OK) {
        fprintf(stderr, "unzip: cannot open '%s' in archive\n", filename);
        return -1;
    }

    FILE *fout = fopen(outpath, "wb");
    if (!fout) {
        fprintf(stderr, "unzip: cannot create '%s': %s\n", outpath, strerror(errno));
        unzCloseCurrentFile(uf);
        return -1;
    }

    unsigned char buf[WRITE_BUF_SIZE];
    int err = UNZ_OK;
    int bytes;
    while ((bytes = unzReadCurrentFile(uf, buf, sizeof(buf))) > 0) {
        if (fwrite(buf, 1, (size_t)bytes, fout) != (size_t)bytes) {
            fprintf(stderr, "unzip: error writing '%s'\n", outpath);
            err = -1;
            break;
        }
    }
    if (bytes < 0) {
        fprintf(stderr, "unzip: error reading '%s' from archive\n", filename);
        err = -1;
    }

    fclose(fout);
    unzCloseCurrentFile(uf);
    return err;
}

/* Extract all files from the archive */
static int extract_archive(const char *archive, const char *outdir) {
    unzFile uf = unzOpen(archive);
    if (!uf) {
        fprintf(stderr, "unzip: cannot open '%s'\n", archive);
        return 1;
    }

    /* Create output directory if specified */
    if (outdir) {
        if (mkdir(outdir, 0755) != 0 && errno != EEXIST) {
            fprintf(stderr, "unzip: cannot create directory '%s': %s\n",
                    outdir, strerror(errno));
            unzClose(uf);
            return 1;
        }
    }

    unz_global_info gi;
    if (unzGetGlobalInfo(uf, &gi) != UNZ_OK) {
        fprintf(stderr, "unzip: cannot read archive info\n");
        unzClose(uf);
        return 1;
    }

    int errors = 0;
    for (uLong i = 0; i < gi.number_entry; i++) {
        if (extract_current_file(uf, outdir) != 0)
            errors++;

        if (i + 1 < gi.number_entry) {
            if (unzGoToNextFile(uf) != UNZ_OK) {
                fprintf(stderr, "unzip: error iterating archive\n");
                unzClose(uf);
                return 1;
            }
        }
    }

    unzClose(uf);

    if (errors > 0) {
        fprintf(stderr, "unzip: completed with %d error(s)\n", errors);
        return 1;
    }
    return 0;
}

static void print_usage(void) {
    fprintf(stderr, "Usage: unzip [-l] [-d dir] archive.zip\n");
    fprintf(stderr, "  -l       List archive contents\n");
    fprintf(stderr, "  -d dir   Extract to directory\n");
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        print_usage();
        return 1;
    }

    int list_mode = 0;
    const char *outdir = NULL;
    const char *archive = NULL;
    int i = 1;

    /* Parse flags */
    while (i < argc && argv[i][0] == '-') {
        if (strcmp(argv[i], "-l") == 0) {
            list_mode = 1;
            i++;
        } else if (strcmp(argv[i], "-d") == 0) {
            if (i + 1 >= argc) {
                fprintf(stderr, "unzip: -d requires a directory argument\n");
                return 1;
            }
            outdir = argv[i + 1];
            i += 2;
        } else if (strcmp(argv[i], "--") == 0) {
            i++;
            break;
        } else {
            fprintf(stderr, "unzip: unknown option '%s'\n", argv[i]);
            print_usage();
            return 1;
        }
    }

    if (i >= argc) {
        fprintf(stderr, "unzip: no archive specified\n");
        print_usage();
        return 1;
    }

    archive = argv[i];

    if (list_mode) {
        return list_archive(archive);
    } else {
        return extract_archive(archive, outdir);
    }
}
