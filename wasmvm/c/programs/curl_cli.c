/*
 * curl_cli.c - curl CLI built on libcurl
 *
 * Supports common curl options for HTTP operations:
 *   -o FILE      Write output to file instead of stdout
 *   -X METHOD    Set request method (GET, POST, PUT, DELETE, HEAD, PATCH)
 *   -d DATA      Send data in request body (implies POST)
 *   -H HEADER    Add custom header (repeatable)
 *   -I           Fetch headers only (HEAD request)
 *   -L           Follow redirects
 *   -s           Silent mode (suppress progress/errors)
 *   -v           Verbose output
 *   -w FORMAT    Write-out format after transfer (subset: %{http_code})
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

#define MAX_HEADERS 64

/* Write callback: write to FILE* (stdout or output file) */
static size_t write_callback(char *ptr, size_t size, size_t nmemb,
                             void *userdata) {
    FILE *out = (FILE *)userdata;
    return fwrite(ptr, size, nmemb, out);
}

/* Header callback for -I mode: write headers to stdout */
static size_t header_callback(char *buffer, size_t size, size_t nitems,
                              void *userdata) {
    size_t total = size * nitems;
    FILE *out = (FILE *)userdata;
    fwrite(buffer, 1, total, out);
    return total;
}

int main(int argc, char *argv[]) {
    const char *url = NULL;
    const char *output_file = NULL;
    const char *method = NULL;
    const char *data = NULL;
    const char *writeout = NULL;
    const char *headers[MAX_HEADERS];
    int header_count = 0;
    int head_only = 0;
    int follow_redirects = 0;
    int silent = 0;
    int verbose = 0;

    /* Parse arguments */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-o") == 0 && i + 1 < argc) {
            output_file = argv[++i];
        } else if (strcmp(argv[i], "-X") == 0 && i + 1 < argc) {
            method = argv[++i];
        } else if (strcmp(argv[i], "-d") == 0 && i + 1 < argc) {
            data = argv[++i];
        } else if (strcmp(argv[i], "-H") == 0 && i + 1 < argc) {
            if (header_count < MAX_HEADERS) {
                headers[header_count++] = argv[++i];
            } else {
                i++; /* skip */
            }
        } else if (strcmp(argv[i], "-I") == 0) {
            head_only = 1;
        } else if (strcmp(argv[i], "-L") == 0) {
            follow_redirects = 1;
        } else if (strcmp(argv[i], "-s") == 0) {
            silent = 1;
        } else if (strcmp(argv[i], "-v") == 0) {
            verbose = 1;
        } else if (strcmp(argv[i], "-w") == 0 && i + 1 < argc) {
            writeout = argv[++i];
        } else if (argv[i][0] != '-') {
            url = argv[i];
        } else {
            /* Unknown option — skip silently for forward compat */
        }
    }

    if (!url) {
        fprintf(stderr, "curl: try 'curl --help' for more information\n");
        return 2;
    }

    CURLcode res;
    curl_global_init(CURL_GLOBAL_DEFAULT);

    CURL *curl = curl_easy_init();
    if (!curl) {
        fprintf(stderr, "curl: failed to initialize\n");
        curl_global_cleanup();
        return 2;
    }

    /* Set URL */
    curl_easy_setopt(curl, CURLOPT_URL, url);

    /* Output destination */
    FILE *out = stdout;
    if (output_file) {
        out = fopen(output_file, "wb");
        if (!out) {
            fprintf(stderr, "curl: (23) Failed creating file '%s'\n",
                    output_file);
            curl_easy_cleanup(curl);
            curl_global_cleanup();
            return 23;
        }
    }

    /* Write callback */
    if (head_only) {
        /* -I: suppress body, show headers */
        curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
        curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, header_callback);
        curl_easy_setopt(curl, CURLOPT_HEADERDATA, out);
    } else {
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, out);
    }

    /* Request method */
    if (method) {
        curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method);
    }

    /* POST data */
    if (data) {
        if (!method) {
            curl_easy_setopt(curl, CURLOPT_POST, 1L);
        }
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, data);
    }

    /* Custom headers */
    struct curl_slist *header_list = NULL;
    for (int i = 0; i < header_count; i++) {
        header_list = curl_slist_append(header_list, headers[i]);
    }
    if (header_list) {
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list);
    }

    /* Follow redirects */
    if (follow_redirects) {
        curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    }

    /* Verbose / silent */
    if (verbose) {
        curl_easy_setopt(curl, CURLOPT_VERBOSE, 1L);
    }
    /* Suppress progress meter (default in non-TTY, but be explicit) */
    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 1L);

    /* Perform request */
    res = curl_easy_perform(curl);

    int exit_code = 0;

    if (res != CURLE_OK) {
        if (!silent) {
            fprintf(stderr, "curl: (%d) %s\n", (int)res,
                    curl_easy_strerror(res));
        }
        /* Map common curl error codes */
        exit_code = (int)res;
    }

    /* Write-out format */
    if (writeout && res == CURLE_OK) {
        /* Support %{http_code} */
        if (strstr(writeout, "%{http_code}")) {
            long http_code = 0;
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
            /* Simple replacement — just print the code */
            const char *p = writeout;
            while (*p) {
                if (strncmp(p, "%{http_code}", 12) == 0) {
                    fprintf(stdout, "%ld", http_code);
                    p += 12;
                } else if (*p == '\\' && *(p + 1) == 'n') {
                    fputc('\n', stdout);
                    p += 2;
                } else {
                    fputc(*p, stdout);
                    p++;
                }
            }
        }
    }

    /* Cleanup */
    if (header_list) {
        curl_slist_free_all(header_list);
    }
    curl_easy_cleanup(curl);
    if (output_file && out) {
        fclose(out);
    }
    curl_global_cleanup();

    return exit_code;
}
