/* node_fs_backend.c — internal upstream Node fs sidecar for first-light ops.
 *
 * This is a private WasmVM-targeted backend artifact for the experimental
 * upstream Node runtime path. It accepts a single JSON request on stdin and
 * returns a single JSON response on stdout using ABI version 1.
 */

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "cJSON.h"

#ifndef PATH_MAX
#define PATH_MAX 4096
#endif

#ifndef O_BINARY
#define O_BINARY 0
#endif

#ifdef __APPLE__
#define SECURE_EXEC_ST_ATIM st_atimespec
#define SECURE_EXEC_ST_MTIM st_mtimespec
#define SECURE_EXEC_ST_CTIM st_ctimespec
#else
#define SECURE_EXEC_ST_ATIM st_atim
#define SECURE_EXEC_ST_MTIM st_mtim
#define SECURE_EXEC_ST_CTIM st_ctim
#endif

static const int ABI_VERSION = 1;

static const char *errno_code(int err) {
    switch (err) {
        case EACCES: return "EACCES";
        case EBADF: return "EBADF";
        case EEXIST: return "EEXIST";
        case EINVAL: return "EINVAL";
        case EIO: return "EIO";
        case EISDIR: return "EISDIR";
        case ENOENT: return "ENOENT";
        case ENOMEM: return "ENOMEM";
        case ENOTDIR: return "ENOTDIR";
        case EPERM: return "EPERM";
        default: return "EIO";
    }
}

static void print_json_and_exit(cJSON *root, int exit_code) {
    char *text = cJSON_PrintUnformatted(root);
    if (text == NULL) {
        fputs("{\"abiVersion\":1,\"ok\":false,\"error\":{\"code\":\"EIO\",\"message\":\"failed to serialize backend response\"}}\n", stdout);
        cJSON_Delete(root);
        exit(1);
    }
    fputs(text, stdout);
    fputc('\n', stdout);
    fflush(stdout);
    free(text);
    cJSON_Delete(root);
    exit(exit_code);
}

static void respond_with_error(const char *code, int errnum, const char *syscall_name, const char *path, const char *message) {
    cJSON *root = cJSON_CreateObject();
    cJSON *error = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "abiVersion", ABI_VERSION);
    cJSON_AddBoolToObject(root, "ok", 0);
    cJSON_AddItemToObject(root, "error", error);
    cJSON_AddStringToObject(error, "code", code);
    cJSON_AddNumberToObject(error, "errno", errnum);
    if (syscall_name != NULL) {
        cJSON_AddStringToObject(error, "syscall", syscall_name);
    }
    if (path != NULL) {
        cJSON_AddStringToObject(error, "path", path);
    }
    cJSON_AddStringToObject(error, "message", message);
    print_json_and_exit(root, 1);
}

static void respond_from_errno(int errnum, const char *syscall_name, const char *path) {
    char message[512];
    snprintf(message, sizeof(message), "%s: %s", syscall_name, strerror(errnum));
    respond_with_error(errno_code(errnum), errnum, syscall_name, path, message);
}

static cJSON *create_success_result(void) {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "abiVersion", ABI_VERSION);
    cJSON_AddBoolToObject(root, "ok", 1);
    return root;
}

static char *read_stdin_all(void) {
    size_t capacity = 4096;
    size_t length = 0;
    char *buffer = (char *)malloc(capacity);
    if (buffer == NULL) {
        respond_with_error("ENOMEM", ENOMEM, "read", NULL, "failed to allocate stdin buffer");
    }

    for (;;) {
        size_t remaining = capacity - length;
        if (remaining < 1024) {
            capacity *= 2;
            char *grown = (char *)realloc(buffer, capacity);
            if (grown == NULL) {
                free(buffer);
                respond_with_error("ENOMEM", ENOMEM, "read", NULL, "failed to grow stdin buffer");
            }
            buffer = grown;
            remaining = capacity - length;
        }

        size_t read_count = fread(buffer + length, 1, remaining - 1, stdin);
        length += read_count;

        if (read_count == 0) {
            if (ferror(stdin)) {
                free(buffer);
                respond_from_errno(errno, "read", NULL);
            }
            break;
        }
    }

    buffer[length] = '\0';
    return buffer;
}

static const char *require_string(cJSON *object, const char *name) {
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    if (!cJSON_IsString(value) || value->valuestring == NULL) {
        char message[256];
        snprintf(message, sizeof(message), "request field `%s` must be a string", name);
        respond_with_error("EINVAL", EINVAL, "parse", NULL, message);
    }
    return value->valuestring;
}

static int require_int(cJSON *object, const char *name, int default_value, int allow_missing) {
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    if (value == NULL) {
        if (allow_missing) {
            return default_value;
        }
        char message[256];
        snprintf(message, sizeof(message), "request field `%s` must be a number", name);
        respond_with_error("EINVAL", EINVAL, "parse", NULL, message);
    }
    if (!cJSON_IsNumber(value)) {
        char message[256];
        snprintf(message, sizeof(message), "request field `%s` must be a number", name);
        respond_with_error("EINVAL", EINVAL, "parse", NULL, message);
    }
    return value->valueint;
}

static int require_bool(cJSON *object, const char *name, int default_value) {
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    if (value == NULL) {
        return default_value;
    }
    if (!cJSON_IsBool(value)) {
        char message[256];
        snprintf(message, sizeof(message), "request field `%s` must be a boolean", name);
        respond_with_error("EINVAL", EINVAL, "parse", NULL, message);
    }
    return cJSON_IsTrue(value) ? 1 : 0;
}

static uint8_t *require_byte_buffer(cJSON *object, const char *name, size_t *length_out) {
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    if (!cJSON_IsArray(value)) {
        char message[256];
        snprintf(message, sizeof(message), "request field `%s` must be a byte array", name);
        respond_with_error("EINVAL", EINVAL, "parse", NULL, message);
    }

    int length = cJSON_GetArraySize(value);
    uint8_t *buffer = NULL;
    if (length > 0) {
        buffer = (uint8_t *)malloc((size_t)length);
        if (buffer == NULL) {
            respond_with_error("ENOMEM", ENOMEM, "malloc", NULL, "failed to allocate byte buffer");
        }
    }

    for (int index = 0; index < length; index++) {
        cJSON *item = cJSON_GetArrayItem(value, index);
        if (!cJSON_IsNumber(item) || item->valueint < 0 || item->valueint > 255) {
            free(buffer);
            respond_with_error("EINVAL", EINVAL, "parse", NULL, "byte buffer values must be integers in the range 0..255");
        }
        buffer[index] = (uint8_t)item->valueint;
    }

    *length_out = (size_t)length;
    return buffer;
}

static void add_stats_payload(cJSON *result, const struct stat *stat_info) {
    cJSON *stats = cJSON_CreateArray();
    cJSON_AddItemToObject(result, "stats", stats);

    const long long birth_sec = (long long)stat_info->SECURE_EXEC_ST_CTIM.tv_sec;
    const long long birth_nsec = (long long)stat_info->SECURE_EXEC_ST_CTIM.tv_nsec;

    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_dev));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_mode));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_nlink));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_uid));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_gid));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_rdev));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_blksize));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_ino));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_size));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->st_blocks));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->SECURE_EXEC_ST_ATIM.tv_sec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->SECURE_EXEC_ST_ATIM.tv_nsec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->SECURE_EXEC_ST_MTIM.tv_sec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->SECURE_EXEC_ST_MTIM.tv_nsec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->SECURE_EXEC_ST_CTIM.tv_sec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)stat_info->SECURE_EXEC_ST_CTIM.tv_nsec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)birth_sec));
    cJSON_AddItemToArray(stats, cJSON_CreateNumber((double)birth_nsec));
}

static FILE *open_stdio_file(const char *path, int flags) {
    int access_mode = flags & 3;
    int create = (flags & O_CREAT) != 0;
    int trunc = (flags & O_TRUNC) != 0;
    int append = (flags & O_APPEND) != 0;
    FILE *file = NULL;

    if (append) {
        return fopen(path, access_mode == O_RDWR ? "a+b" : "ab");
    }

    if (trunc) {
        if (access_mode == O_RDONLY) {
            return fopen(path, "rb");
        }
        return fopen(path, access_mode == O_RDWR ? "w+b" : "wb");
    }

    if (access_mode == O_RDONLY) {
        return fopen(path, "rb");
    }

    file = fopen(path, "r+b");
    if (file == NULL && create) {
        file = fopen(path, access_mode == O_RDWR ? "w+b" : "wb");
    }
    return file;
}

static void handle_open(cJSON *request) {
    const char *path = require_string(request, "path");
    int flags = require_int(request, "flags", O_RDONLY, 0);
    (void)require_int(request, "mode", 0666, 1);

    FILE *file = open_stdio_file(path, flags | O_BINARY);
    if (file == NULL) {
        respond_from_errno(errno, "fopen", path);
    }
    fclose(file);

    cJSON *root = create_success_result();
    cJSON_AddItemToObject(root, "result", cJSON_CreateObject());
    print_json_and_exit(root, 0);
}

static void handle_read(cJSON *request) {
    const char *path = require_string(request, "path");
    int position = require_int(request, "position", 0, 1);
    int length = require_int(request, "length", 0, 0);
    if (length < 0) {
        respond_with_error("EINVAL", EINVAL, "read", path, "read length must be >= 0");
    }

    FILE *file = open_stdio_file(path, O_RDONLY | O_BINARY);
    if (file == NULL) {
        respond_from_errno(errno, "fopen", path);
    }
    if (fseek(file, position, SEEK_SET) != 0) {
        fclose(file);
        respond_from_errno(errno, "fseek", path);
    }

    uint8_t *buffer = NULL;
    if (length > 0) {
        buffer = (uint8_t *)malloc((size_t)length);
        if (buffer == NULL) {
            fclose(file);
            respond_with_error("ENOMEM", ENOMEM, "malloc", path, "failed to allocate read buffer");
        }
    }

    size_t bytes_read = length > 0 ? fread(buffer, 1, (size_t)length, file) : 0;
    if (ferror(file)) {
        free(buffer);
        fclose(file);
        respond_from_errno(errno, "fread", path);
    }
    fclose(file);

    cJSON *root = create_success_result();
    cJSON *result = cJSON_CreateObject();
    cJSON *byte_array = cJSON_CreateArray();
    cJSON_AddNumberToObject(result, "bytesRead", (double)bytes_read);
    cJSON_AddItemToObject(result, "buffer", byte_array);
    for (size_t index = 0; index < bytes_read; index++) {
        cJSON_AddItemToArray(byte_array, cJSON_CreateNumber((double)buffer[index]));
    }
    cJSON_AddItemToObject(root, "result", result);
    free(buffer);
    print_json_and_exit(root, 0);
}

static void handle_write(cJSON *request) {
    const char *path = require_string(request, "path");
    int flags = require_int(request, "flags", O_WRONLY, 1);
    int position = require_int(request, "position", 0, 1);
    int append = require_bool(request, "append", 0);
    size_t length = 0;
    uint8_t *buffer = require_byte_buffer(request, "buffer", &length);

    FILE *file = open_stdio_file(path, flags | O_BINARY);
    if (file == NULL) {
        free(buffer);
        respond_from_errno(errno, "fopen", path);
    }
    if (!append && fseek(file, position, SEEK_SET) != 0) {
        free(buffer);
        fclose(file);
        respond_from_errno(errno, "fseek", path);
    }

    size_t total_written = 0;
    while (total_written < length) {
        size_t wrote = fwrite(buffer + total_written, 1, length - total_written, file);
        if (wrote == 0 && ferror(file)) {
            free(buffer);
            fclose(file);
            respond_from_errno(errno, "fwrite", path);
        }
        total_written += wrote;
    }
    fflush(file);

    free(buffer);
    fclose(file);

    cJSON *root = create_success_result();
    cJSON *result = cJSON_CreateObject();
    cJSON_AddNumberToObject(result, "bytesWritten", (double)total_written);
    cJSON_AddItemToObject(root, "result", result);
    print_json_and_exit(root, 0);
}

static void handle_stat_like(cJSON *request, int use_lstat) {
    const char *path = require_string(request, "path");
    struct stat stat_info;
    int rc = use_lstat ? lstat(path, &stat_info) : stat(path, &stat_info);
    if (rc != 0) {
        respond_from_errno(errno, use_lstat ? "lstat" : "stat", path);
    }

    cJSON *root = create_success_result();
    cJSON *result = cJSON_CreateObject();
    add_stats_payload(result, &stat_info);
    cJSON_AddItemToObject(root, "result", result);
    print_json_and_exit(root, 0);
}

static void handle_readdir(cJSON *request) {
    const char *path = require_string(request, "path");
    DIR *dir = opendir(path);
    if (dir == NULL) {
        respond_from_errno(errno, "readdir", path);
    }

    cJSON *root = create_success_result();
    cJSON *result = cJSON_CreateObject();
    cJSON *entries = cJSON_CreateArray();
    cJSON_AddItemToObject(result, "entries", entries);
    cJSON_AddItemToObject(root, "result", result);

    for (;;) {
        errno = 0;
        struct dirent *entry = readdir(dir);
        if (entry == NULL) {
            if (errno != 0) {
                closedir(dir);
                cJSON_Delete(root);
                respond_from_errno(errno, "readdir", path);
            }
            break;
        }
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }
        cJSON_AddItemToArray(entries, cJSON_CreateString(entry->d_name));
    }

    closedir(dir);
    print_json_and_exit(root, 0);
}

static void handle_realpath(cJSON *request) {
    const char *path = require_string(request, "path");
    char resolved[PATH_MAX];
    if (realpath(path, resolved) == NULL) {
        respond_from_errno(errno, "realpath", path);
    }

    cJSON *root = create_success_result();
    cJSON *result = cJSON_CreateObject();
    cJSON_AddStringToObject(result, "path", resolved);
    cJSON_AddItemToObject(root, "result", result);
    print_json_and_exit(root, 0);
}

int main(void) {
    char *input = read_stdin_all();
    cJSON *request = cJSON_Parse(input);
    free(input);

    if (request == NULL) {
        respond_with_error("EINVAL", EINVAL, "parse", NULL, "failed to parse upstream fs backend request JSON");
    }

    int abi_version = require_int(request, "abiVersion", 0, 0);
    if (abi_version != ABI_VERSION) {
        respond_with_error("EINVAL", EINVAL, "parse", NULL, "unsupported upstream fs backend ABI version");
    }

    const char *op = require_string(request, "op");
    if (strcmp(op, "open") == 0) {
        handle_open(request);
    } else if (strcmp(op, "read") == 0) {
        handle_read(request);
    } else if (strcmp(op, "write") == 0) {
        handle_write(request);
    } else if (strcmp(op, "stat") == 0) {
        handle_stat_like(request, 0);
    } else if (strcmp(op, "lstat") == 0) {
        handle_stat_like(request, 1);
    } else if (strcmp(op, "readdir") == 0) {
        handle_readdir(request);
    } else if (strcmp(op, "realpath") == 0) {
        handle_realpath(request);
    } else {
        respond_with_error("EINVAL", EINVAL, op, NULL, "unsupported upstream fs backend operation");
    }

    return 0;
}
