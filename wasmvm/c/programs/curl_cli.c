/*
 * curl_cli.c - curl CLI built on libcurl
 *
 * Supports common curl options for HTTP/HTTPS operations:
 *   -o FILE            Write output to file instead of stdout
 *   -X METHOD          Set request method (GET, POST, PUT, DELETE, HEAD, PATCH)
 *   -d DATA            Send data in request body (implies POST)
 *   -H HEADER          Add custom header (repeatable)
 *   -I                 Fetch headers only (HEAD request)
 *   -L                 Follow redirects
 *   -s                 Silent mode (suppress progress/errors)
 *   -v                 Verbose output
 *   -w FORMAT          Write-out format after transfer (subset: %{http_code})
 *   -k / --insecure    Skip TLS certificate verification
 *   -u USER:PASS       HTTP Basic authentication
 *   -F NAME=VALUE      Multipart form upload (-F file=@path for file upload)
 *   --connect-timeout S  Connection timeout in seconds
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

#define MAX_HEADERS 64
#define MAX_FORMS 16

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
    const char *userpwd = NULL;
    const char *headers[MAX_HEADERS];
    const char *forms[MAX_FORMS];
    int header_count = 0;
    int form_count = 0;
    int head_only = 0;
    int follow_redirects = 0;
    int silent = 0;
    int verbose = 0;
    int insecure = 0;
    long connect_timeout = 0;

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
        } else if (strcmp(argv[i], "-F") == 0 && i + 1 < argc) {
            if (form_count < MAX_FORMS) {
                forms[form_count++] = argv[++i];
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
        } else if (strcmp(argv[i], "-k") == 0 ||
                   strcmp(argv[i], "--insecure") == 0) {
            insecure = 1;
        } else if (strcmp(argv[i], "-u") == 0 && i + 1 < argc) {
            userpwd = argv[++i];
        } else if (strcmp(argv[i], "-w") == 0 && i + 1 < argc) {
            writeout = argv[++i];
        } else if (strcmp(argv[i], "--connect-timeout") == 0 && i + 1 < argc) {
            connect_timeout = atol(argv[++i]);
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

    /* Multipart form (-F) */
    curl_mime *mime = NULL;
    if (form_count > 0) {
        mime = curl_mime_init(curl);
        for (int i = 0; i < form_count; i++) {
            /* Parse "name=value" or "name=@filename" */
            const char *eq = strchr(forms[i], '=');
            if (!eq) continue;

            size_t name_len = (size_t)(eq - forms[i]);
            char name[256];
            if (name_len >= sizeof(name)) name_len = sizeof(name) - 1;
            memcpy(name, forms[i], name_len);
            name[name_len] = '\0';

            const char *value = eq + 1;
            curl_mimepart *part = curl_mime_addpart(mime);
            curl_mime_name(part, name);

            if (value[0] == '@') {
                /* File upload */
                curl_mime_filedata(part, value + 1);
            } else {
                curl_mime_data(part, value, CURL_ZERO_TERMINATED);
            }
        }
        curl_easy_setopt(curl, CURLOPT_MIMEPOST, mime);
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

    /* TLS: skip certificate verification (-k / --insecure) */
    if (insecure) {
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
    }

    /* HTTP Basic authentication (-u user:pass) */
    if (userpwd) {
        curl_easy_setopt(curl, CURLOPT_USERPWD, userpwd);
        curl_easy_setopt(curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    }

    /* Connection timeout */
    if (connect_timeout > 0) {
        curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, connect_timeout);
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
    if (mime) {
        curl_mime_free(mime);
    }
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
