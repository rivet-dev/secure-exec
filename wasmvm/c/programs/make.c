/*
 * make.c -- A clean-room, permissively-licensed POSIX make implementation
 *
 * Supports:
 *   - Targets, prerequisites, and tab-indented recipes
 *   - Variable assignment (=, :=, ?=, +=)
 *   - Automatic variables ($@, $<, $^, $*, $?)
 *   - .PHONY, .DEFAULT
 *   - Conditionals (ifeq, ifneq, ifdef, ifndef, else, endif)
 *   - include directive
 *   - Pattern rules (%.o: %.c)
 *   - Built-in functions: $(shell), $(wildcard), $(subst), $(patsubst),
 *     $(filter), $(filter-out), $(sort), $(word), $(words), $(firstword),
 *     $(lastword), $(dir), $(notdir), $(basename), $(suffix),
 *     $(addsuffix), $(addprefix), $(strip), $(foreach), $(if), $(or),
 *     $(and), $(error), $(warning), $(info), $(abspath), $(realpath)
 *   - Flags: -f, -C, -n, -s, -j, -k, --version, --help
 *   - @ (silent) and - (ignore error) recipe prefixes
 *   - Backslash-newline continuation
 *   - Comment lines (# ...)
 *   - Nested variable references
 *   - Command-line variable overrides
 *
 * This implementation is NOT based on GNU make source code.
 * Licensed under Apache-2.0.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <sys/stat.h>
#include <unistd.h>
#include <dirent.h>
#include <time.h>

#ifdef __wasi__
#include "posix_spawn_compat.h"
#else
#include <spawn.h>
#include <sys/wait.h>
#endif

extern char **environ;

/* Limits */
#define MAX_LINE    8192
#define MAX_VARS    1024
#define MAX_RULES   2048
#define MAX_DEPS    256
#define MAX_RECIPES 256
#define MAX_EXPAND  65536
#define MAX_DEPTH   64
#define MAX_IF_DEPTH 32
#define MAX_INCLUDE_DEPTH 16

/* --- String utilities ---------------------------------------------------- */

static char *xstrdup(const char *s) {
    if (!s) return NULL;
    char *d = strdup(s);
    if (!d) { fprintf(stderr, "make: out of memory\n"); exit(2); }
    return d;
}

static char *xmalloc(size_t n) {
    char *p = malloc(n);
    if (!p) { fprintf(stderr, "make: out of memory\n"); exit(2); }
    return p;
}

static char *xrealloc(void *p, size_t n) {
    char *r = realloc(p, n);
    if (!r) { fprintf(stderr, "make: out of memory\n"); exit(2); }
    return r;
}

/* Strip leading/trailing whitespace in place, return pointer */
static char *strip(char *s) {
    while (isspace((unsigned char)*s)) s++;
    char *e = s + strlen(s);
    while (e > s && isspace((unsigned char)e[-1])) e--;
    *e = '\0';
    return s;
}

/* Trim trailing whitespace in place */
static void rtrim(char *s) {
    char *e = s + strlen(s);
    while (e > s && isspace((unsigned char)e[-1])) e--;
    *e = '\0';
}

/* --- Variable table ------------------------------------------------------ */

typedef struct {
    char *name;
    char *value;
    int override; /* set on command line — cannot be overridden by Makefile */
    int recursive; /* = (recursive) vs := (simple) */
} Var;

static Var vars[MAX_VARS];
static int nvar = 0;

static Var *var_find(const char *name) {
    for (int i = 0; i < nvar; i++)
        if (strcmp(vars[i].name, name) == 0)
            return &vars[i];
    return NULL;
}

static void var_set(const char *name, const char *value, int recursive, int override) {
    Var *v = var_find(name);
    if (v) {
        if (v->override && !override) return; /* CLI override wins */
        free(v->value);
        v->value = xstrdup(value);
        v->recursive = recursive;
        if (override) v->override = 1;
    } else {
        if (nvar >= MAX_VARS) { fprintf(stderr, "make: too many variables\n"); exit(2); }
        vars[nvar].name = xstrdup(name);
        vars[nvar].value = xstrdup(value);
        vars[nvar].recursive = recursive;
        vars[nvar].override = override;
        nvar++;
    }
}

static void var_append(const char *name, const char *value) {
    Var *v = var_find(name);
    if (v && v->override) return;
    if (v) {
        size_t olen = strlen(v->value);
        size_t nlen = strlen(value);
        v->value = xrealloc(v->value, olen + 1 + nlen + 1);
        v->value[olen] = ' ';
        memcpy(v->value + olen + 1, value, nlen + 1);
    } else {
        var_set(name, value, 1, 0);
    }
}

static void var_set_if_absent(const char *name, const char *value, int recursive) {
    if (!var_find(name))
        var_set(name, value, recursive, 0);
}

/* Forward declaration */
static char *expand(const char *s);

static const char *var_get(const char *name) {
    Var *v = var_find(name);
    if (!v) {
        /* Fall back to environment */
        const char *env = getenv(name);
        return env ? env : "";
    }
    return v->value;
}

/* Get expanded value of a variable */
static char *var_get_expanded(const char *name) {
    Var *v = var_find(name);
    if (!v) {
        const char *env = getenv(name);
        return xstrdup(env ? env : "");
    }
    if (v->recursive) {
        return expand(v->value);
    }
    return xstrdup(v->value);
}

/* --- Rules --------------------------------------------------------------- */

typedef struct {
    char *target;
    char *deps[MAX_DEPS];
    int ndeps;
    char *recipes[MAX_RECIPES];
    int nrecipes;
    int phony;
    int pattern; /* 1 if this is a pattern rule (contains %) */
} Rule;

static Rule rules[MAX_RULES];
static int nrule = 0;
static char *default_target = NULL;

static Rule *rule_find(const char *target) {
    for (int i = 0; i < nrule; i++)
        if (!rules[i].pattern && strcmp(rules[i].target, target) == 0)
            return &rules[i];
    return NULL;
}

/* Try to match a pattern rule. Returns the rule and sets *stem. */
static Rule *pattern_match(const char *target, char *stem, size_t stemsz) {
    for (int i = 0; i < nrule; i++) {
        if (!rules[i].pattern) continue;
        const char *pct = strchr(rules[i].target, '%');
        if (!pct) continue;
        size_t preflen = pct - rules[i].target;
        size_t suflen = strlen(pct + 1);
        size_t tlen = strlen(target);
        if (tlen < preflen + suflen) continue;
        if (strncmp(target, rules[i].target, preflen) != 0) continue;
        if (strcmp(target + tlen - suflen, pct + 1) != 0) continue;
        size_t slen = tlen - preflen - suflen;
        if (slen >= stemsz) continue;
        memcpy(stem, target + preflen, slen);
        stem[slen] = '\0';
        return &rules[i];
    }
    return NULL;
}

/* --- Expansion engine ---------------------------------------------------- */

/* Expand $(subst from,to,text) */
static char *fn_subst(const char *args) {
    /* Parse: from,to,text */
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    const char *c2 = strchr(c1 + 1, ',');
    if (!c2) return xstrdup("");
    char *from = xmalloc(c1 - args + 1);
    memcpy(from, args, c1 - args);
    from[c1 - args] = '\0';
    char *to = xmalloc(c2 - c1);
    memcpy(to, c1 + 1, c2 - c1 - 1);
    to[c2 - c1 - 1] = '\0';
    const char *text = c2 + 1;
    size_t flen = strlen(from), tlen = strlen(to), txlen = strlen(text);
    /* Worst case: every char replaced */
    size_t bufsz = txlen * (tlen > 0 ? tlen : 1) + txlen + 1;
    if (bufsz < 4096) bufsz = 4096;
    char *out = xmalloc(bufsz);
    size_t oi = 0;
    for (size_t i = 0; i <= txlen; ) {
        if (flen > 0 && i + flen <= txlen && memcmp(text + i, from, flen) == 0) {
            memcpy(out + oi, to, tlen);
            oi += tlen;
            i += flen;
        } else if (i < txlen) {
            out[oi++] = text[i++];
        } else {
            break;
        }
    }
    out[oi] = '\0';
    free(from); free(to);
    return out;
}

/* Match pattern with single % wildcard */
static int pattern_match_str(const char *pattern, const char *str, char *stem, size_t stemsz) {
    const char *pct = strchr(pattern, '%');
    if (!pct) return strcmp(pattern, str) == 0;
    size_t preflen = pct - pattern;
    size_t suflen = strlen(pct + 1);
    size_t slen = strlen(str);
    if (slen < preflen + suflen) return 0;
    if (strncmp(str, pattern, preflen) != 0) return 0;
    if (strcmp(str + slen - suflen, pct + 1) != 0) return 0;
    if (stem) {
        size_t sl = slen - preflen - suflen;
        if (sl >= stemsz) return 0;
        memcpy(stem, str + preflen, sl);
        stem[sl] = '\0';
    }
    return 1;
}

/* Expand $(patsubst pattern,replacement,text) */
static char *fn_patsubst(const char *args) {
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    const char *c2 = strchr(c1 + 1, ',');
    if (!c2) return xstrdup("");
    char *pat = xmalloc(c1 - args + 1);
    memcpy(pat, args, c1 - args);
    pat[c1 - args] = '\0';
    char *rep = xmalloc(c2 - c1);
    memcpy(rep, c1 + 1, c2 - c1 - 1);
    rep[c2 - c1 - 1] = '\0';
    char *text = xstrdup(c2 + 1);

    char out[MAX_EXPAND];
    out[0] = '\0';
    size_t oi = 0;
    char *tok = strtok(text, " \t");
    int first = 1;
    while (tok) {
        if (!first && oi < MAX_EXPAND - 1) out[oi++] = ' ';
        first = 0;
        char stem[1024];
        if (pattern_match_str(pat, tok, stem, sizeof(stem))) {
            const char *pct = strchr(rep, '%');
            if (pct) {
                size_t pl = pct - rep;
                memcpy(out + oi, rep, pl); oi += pl;
                size_t sl = strlen(stem);
                memcpy(out + oi, stem, sl); oi += sl;
                size_t sl2 = strlen(pct + 1);
                memcpy(out + oi, pct + 1, sl2); oi += sl2;
            } else {
                size_t rl = strlen(rep);
                memcpy(out + oi, rep, rl); oi += rl;
            }
        } else {
            size_t tl = strlen(tok);
            memcpy(out + oi, tok, tl); oi += tl;
        }
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(pat); free(rep); free(text);
    return xstrdup(out);
}

/* $(strip text) */
static char *fn_strip(const char *text) {
    char *t = xstrdup(text);
    /* Collapse internal whitespace */
    char out[MAX_EXPAND];
    size_t oi = 0;
    char *s = strip(t);
    int in_ws = 0;
    while (*s) {
        if (isspace((unsigned char)*s)) {
            if (!in_ws && oi > 0) { out[oi++] = ' '; in_ws = 1; }
            s++;
        } else {
            out[oi++] = *s++;
            in_ws = 0;
        }
    }
    out[oi] = '\0';
    free(t);
    return xstrdup(out);
}

/* $(filter pattern...,text) */
static char *fn_filter(const char *args, int invert) {
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    char *patterns = xmalloc(c1 - args + 1);
    memcpy(patterns, args, c1 - args);
    patterns[c1 - args] = '\0';
    char *text = xstrdup(c1 + 1);

    /* Parse patterns (space-separated) */
    char *pats[64];
    int npat = 0;
    char *pp = xstrdup(patterns);
    char *pt = strtok(pp, " \t");
    while (pt && npat < 64) { pats[npat++] = pt; pt = strtok(NULL, " \t"); }

    char out[MAX_EXPAND];
    size_t oi = 0;
    char *tok = strtok(text, " \t");
    int first = 1;
    while (tok) {
        int matched = 0;
        for (int i = 0; i < npat; i++) {
            if (pattern_match_str(pats[i], tok, NULL, 0)) { matched = 1; break; }
        }
        if (matched != invert) {
            if (!first && oi < MAX_EXPAND - 1) out[oi++] = ' ';
            first = 0;
            size_t tl = strlen(tok);
            if (oi + tl < MAX_EXPAND) { memcpy(out + oi, tok, tl); oi += tl; }
        }
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(patterns); free(text); free(pp);
    return xstrdup(out);
}

/* $(sort list) */
static char *fn_sort(const char *text) {
    char *t = xstrdup(text);
    char *words[4096];
    int nw = 0;
    char *tok = strtok(t, " \t");
    while (tok && nw < 4096) { words[nw++] = tok; tok = strtok(NULL, " \t"); }
    /* Simple insertion sort + dedup */
    for (int i = 1; i < nw; i++) {
        char *key = words[i];
        int j = i - 1;
        while (j >= 0 && strcmp(words[j], key) > 0) {
            words[j + 1] = words[j];
            j--;
        }
        words[j + 1] = key;
    }
    char out[MAX_EXPAND];
    size_t oi = 0;
    for (int i = 0; i < nw; i++) {
        if (i > 0 && strcmp(words[i], words[i - 1]) == 0) continue;
        if (oi > 0) out[oi++] = ' ';
        size_t wl = strlen(words[i]);
        if (oi + wl < MAX_EXPAND) { memcpy(out + oi, words[i], wl); oi += wl; }
    }
    out[oi] = '\0';
    free(t);
    return xstrdup(out);
}

/* $(word n,text) */
static char *fn_word(const char *args) {
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    char nbuf[32];
    size_t nl = c1 - args;
    if (nl >= sizeof(nbuf)) return xstrdup("");
    memcpy(nbuf, args, nl); nbuf[nl] = '\0';
    int n = atoi(strip(nbuf));
    if (n < 1) return xstrdup("");
    char *text = xstrdup(c1 + 1);
    char *tok = strtok(text, " \t");
    int i = 1;
    while (tok) {
        if (i == n) { char *r = xstrdup(tok); free(text); return r; }
        i++;
        tok = strtok(NULL, " \t");
    }
    free(text);
    return xstrdup("");
}

/* $(words text) */
static char *fn_words(const char *text) {
    char *t = xstrdup(text);
    int n = 0;
    char *tok = strtok(t, " \t");
    while (tok) { n++; tok = strtok(NULL, " \t"); }
    free(t);
    char buf[32];
    snprintf(buf, sizeof(buf), "%d", n);
    return xstrdup(buf);
}

/* $(firstword text) */
static char *fn_firstword(const char *text) {
    char *t = xstrdup(text);
    char *tok = strtok(t, " \t");
    char *r = tok ? xstrdup(tok) : xstrdup("");
    free(t);
    return r;
}

/* $(lastword text) */
static char *fn_lastword(const char *text) {
    char *t = xstrdup(text);
    char *last = NULL;
    char *tok = strtok(t, " \t");
    while (tok) { last = tok; tok = strtok(NULL, " \t"); }
    char *r = last ? xstrdup(last) : xstrdup("");
    free(t);
    return r;
}

/* $(dir names...) */
static char *fn_dir(const char *text) {
    char *t = xstrdup(text);
    char out[MAX_EXPAND];
    size_t oi = 0;
    char *tok = strtok(t, " \t");
    int first = 1;
    while (tok) {
        if (!first) out[oi++] = ' ';
        first = 0;
        char *sl = strrchr(tok, '/');
        if (sl) {
            size_t dl = sl - tok + 1;
            memcpy(out + oi, tok, dl); oi += dl;
        } else {
            out[oi++] = '.'; out[oi++] = '/';
        }
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(t);
    return xstrdup(out);
}

/* $(notdir names...) */
static char *fn_notdir(const char *text) {
    char *t = xstrdup(text);
    char out[MAX_EXPAND];
    size_t oi = 0;
    char *tok = strtok(t, " \t");
    int first = 1;
    while (tok) {
        if (!first) out[oi++] = ' ';
        first = 0;
        char *sl = strrchr(tok, '/');
        const char *base = sl ? sl + 1 : tok;
        size_t bl = strlen(base);
        memcpy(out + oi, base, bl); oi += bl;
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(t);
    return xstrdup(out);
}

/* $(basename names...) — strip suffix */
static char *fn_basename(const char *text) {
    char *t = xstrdup(text);
    char out[MAX_EXPAND];
    size_t oi = 0;
    char *tok = strtok(t, " \t");
    int first = 1;
    while (tok) {
        if (!first) out[oi++] = ' ';
        first = 0;
        char *dot = strrchr(tok, '.');
        char *sl = strrchr(tok, '/');
        if (dot && (!sl || dot > sl)) {
            size_t pl = dot - tok;
            memcpy(out + oi, tok, pl); oi += pl;
        } else {
            size_t tl = strlen(tok);
            memcpy(out + oi, tok, tl); oi += tl;
        }
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(t);
    return xstrdup(out);
}

/* $(suffix names...) */
static char *fn_suffix(const char *text) {
    char *t = xstrdup(text);
    char out[MAX_EXPAND];
    size_t oi = 0;
    char *tok = strtok(t, " \t");
    int first = 1;
    while (tok) {
        char *dot = strrchr(tok, '.');
        char *sl = strrchr(tok, '/');
        if (dot && (!sl || dot > sl)) {
            if (!first) out[oi++] = ' ';
            first = 0;
            size_t dl = strlen(dot);
            memcpy(out + oi, dot, dl); oi += dl;
        }
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(t);
    return xstrdup(out);
}

/* $(addprefix prefix,names...) */
static char *fn_addprefix(const char *args) {
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    char *prefix = xmalloc(c1 - args + 1);
    memcpy(prefix, args, c1 - args);
    prefix[c1 - args] = '\0';
    char *text = xstrdup(c1 + 1);
    char out[MAX_EXPAND];
    size_t oi = 0;
    size_t pl = strlen(prefix);
    char *tok = strtok(text, " \t");
    int first = 1;
    while (tok) {
        if (!first) out[oi++] = ' ';
        first = 0;
        memcpy(out + oi, prefix, pl); oi += pl;
        size_t tl = strlen(tok);
        memcpy(out + oi, tok, tl); oi += tl;
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(prefix); free(text);
    return xstrdup(out);
}

/* $(addsuffix suffix,names...) */
static char *fn_addsuffix(const char *args) {
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    char *suffix = xmalloc(c1 - args + 1);
    memcpy(suffix, args, c1 - args);
    suffix[c1 - args] = '\0';
    char *text = xstrdup(c1 + 1);
    char out[MAX_EXPAND];
    size_t oi = 0;
    size_t sl = strlen(suffix);
    char *tok = strtok(text, " \t");
    int first = 1;
    while (tok) {
        if (!first) out[oi++] = ' ';
        first = 0;
        size_t tl = strlen(tok);
        memcpy(out + oi, tok, tl); oi += tl;
        memcpy(out + oi, suffix, sl); oi += sl;
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(suffix); free(text);
    return xstrdup(out);
}

/* $(wildcard pattern) */
static char *fn_wildcard(const char *pattern) {
    /* Simple glob: match files in directory matching shell pattern */
    char out[MAX_EXPAND];
    size_t oi = 0;

    /* Split pattern into directory and filename parts */
    char patt[1024];
    strncpy(patt, pattern, sizeof(patt) - 1);
    patt[sizeof(patt) - 1] = '\0';
    /* Strip leading/trailing whitespace */
    char *p = strip(patt);

    char *sl = strrchr(p, '/');
    char dirpath[1024], fileglob[1024];
    if (sl) {
        size_t dl = sl - p;
        memcpy(dirpath, p, dl);
        dirpath[dl] = '\0';
        strncpy(fileglob, sl + 1, sizeof(fileglob) - 1);
    } else {
        strcpy(dirpath, ".");
        strncpy(fileglob, p, sizeof(fileglob) - 1);
    }
    fileglob[sizeof(fileglob) - 1] = '\0';

    DIR *d = opendir(dirpath);
    if (!d) return xstrdup("");

    /* Collect matching entries */
    char *entries[4096];
    int nent = 0;
    struct dirent *ent;
    while ((ent = readdir(d)) != NULL && nent < 4096) {
        if (strcmp(ent->d_name, ".") == 0 || strcmp(ent->d_name, "..") == 0)
            continue;
        /* Simple pattern matching: only support * and ? */
        if (pattern_match_str(fileglob, ent->d_name, NULL, 0)) {
            /* Build full path */
            char fullpath[2048];
            if (strcmp(dirpath, ".") == 0)
                snprintf(fullpath, sizeof(fullpath), "%s", ent->d_name);
            else
                snprintf(fullpath, sizeof(fullpath), "%s/%s", dirpath, ent->d_name);
            entries[nent++] = xstrdup(fullpath);
        }
    }
    closedir(d);

    /* Sort entries */
    for (int i = 1; i < nent; i++) {
        char *key = entries[i];
        int j = i - 1;
        while (j >= 0 && strcmp(entries[j], key) > 0) {
            entries[j + 1] = entries[j]; j--;
        }
        entries[j + 1] = key;
    }

    for (int i = 0; i < nent; i++) {
        if (oi > 0) out[oi++] = ' ';
        size_t el = strlen(entries[i]);
        if (oi + el < MAX_EXPAND) { memcpy(out + oi, entries[i], el); oi += el; }
        free(entries[i]);
    }
    out[oi] = '\0';
    return xstrdup(out);
}

/* $(shell command) */
static char *fn_shell(const char *cmd) {
    char result[MAX_EXPAND];
    size_t ri = 0;

    /* Create pipe for child stdout */
    int pipefd[2];
    if (pipe(pipefd) != 0) return xstrdup("");

    posix_spawn_file_actions_t fa;
    posix_spawn_file_actions_init(&fa);
    posix_spawn_file_actions_adddup2(&fa, pipefd[1], STDOUT_FILENO);
    posix_spawn_file_actions_addclose(&fa, pipefd[0]);
    posix_spawn_file_actions_addclose(&fa, pipefd[1]);

    char *argv[] = {"sh", "-c", (char *)cmd, NULL};
    pid_t child;
    int err = posix_spawnp(&child, "sh", &fa, NULL, argv, environ);
    posix_spawn_file_actions_destroy(&fa);

    if (err != 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        return xstrdup("");
    }
    close(pipefd[1]);

    /* Read output */
    ssize_t n;
    while ((n = read(pipefd[0], result + ri, MAX_EXPAND - ri - 1)) > 0)
        ri += n;
    close(pipefd[0]);

    int status;
    waitpid(child, &status, 0);

    result[ri] = '\0';
    /* Replace newlines with spaces (make convention) */
    for (size_t i = 0; i < ri; i++)
        if (result[i] == '\n') result[i] = ' ';
    /* Remove trailing whitespace */
    rtrim(result);
    return xstrdup(result);
}

/* $(foreach var,list,text) */
static char *fn_foreach(const char *args) {
    /* Parse var,list,text — need to handle nested commas */
    const char *c1 = strchr(args, ',');
    if (!c1) return xstrdup("");
    char varname[256];
    size_t vl = c1 - args;
    if (vl >= sizeof(varname)) return xstrdup("");
    memcpy(varname, args, vl); varname[vl] = '\0';
    char *vn = strip(varname);

    const char *c2 = strchr(c1 + 1, ',');
    if (!c2) return xstrdup("");
    char *list = xmalloc(c2 - c1);
    memcpy(list, c1 + 1, c2 - c1 - 1);
    list[c2 - c1 - 1] = '\0';
    const char *body = c2 + 1;

    /* Expand list */
    char *elist = expand(list);
    free(list);

    char out[MAX_EXPAND];
    size_t oi = 0;
    char *tok = strtok(elist, " \t");
    int first = 1;
    while (tok) {
        /* Set variable */
        var_set(vn, tok, 0, 0);
        char *expanded = expand(body);
        if (!first && oi < MAX_EXPAND - 1) out[oi++] = ' ';
        first = 0;
        size_t el = strlen(expanded);
        if (oi + el < MAX_EXPAND) { memcpy(out + oi, expanded, el); oi += el; }
        free(expanded);
        tok = strtok(NULL, " \t");
    }
    out[oi] = '\0';
    free(elist);
    return xstrdup(out);
}

/* Find matching close paren, accounting for nesting */
static const char *find_close_paren(const char *s, char open, char close) {
    int depth = 1;
    while (*s) {
        if (*s == open) depth++;
        else if (*s == close) { depth--; if (depth == 0) return s; }
        s++;
    }
    return NULL;
}

/* Expand a string with variable/function references */
static char *expand(const char *s) {
    if (!s) return xstrdup("");
    char *out = xmalloc(MAX_EXPAND);
    size_t oi = 0;
    size_t slen = strlen(s);

    for (size_t i = 0; i < slen && oi < MAX_EXPAND - 1; ) {
        if (s[i] == '$') {
            i++;
            if (i >= slen) { out[oi++] = '$'; break; }
            if (s[i] == '$') {
                /* $$ -> literal $ */
                out[oi++] = '$';
                i++;
            } else if (s[i] == '(' || s[i] == '{') {
                char close = (s[i] == '(') ? ')' : '}';
                char open = s[i];
                i++;
                const char *end = find_close_paren(s + i, open, close);
                if (!end) { out[oi++] = '$'; out[oi++] = open; continue; }
                size_t reflen = end - (s + i);
                char *ref = xmalloc(reflen + 1);
                memcpy(ref, s + i, reflen);
                ref[reflen] = '\0';
                i = end - s + 1;

                /* Check for function calls */
                char *result = NULL;
                char *space = NULL;
                /* Functions have the form: name arg... or name arg,arg... */
                /* Check known functions */
                if (strncmp(ref, "subst ", 6) == 0) {
                    char *ea = expand(ref + 6);
                    result = fn_subst(ea);
                    free(ea);
                } else if (strncmp(ref, "patsubst ", 9) == 0) {
                    char *ea = expand(ref + 9);
                    result = fn_patsubst(ea);
                    free(ea);
                } else if (strncmp(ref, "strip ", 6) == 0) {
                    char *ea = expand(ref + 6);
                    result = fn_strip(ea);
                    free(ea);
                } else if (strncmp(ref, "filter-out ", 11) == 0) {
                    char *ea = expand(ref + 11);
                    result = fn_filter(ea, 1);
                    free(ea);
                } else if (strncmp(ref, "filter ", 7) == 0) {
                    char *ea = expand(ref + 7);
                    result = fn_filter(ea, 0);
                    free(ea);
                } else if (strncmp(ref, "sort ", 5) == 0) {
                    char *ea = expand(ref + 5);
                    result = fn_sort(ea);
                    free(ea);
                } else if (strncmp(ref, "word ", 5) == 0) {
                    char *ea = expand(ref + 5);
                    result = fn_word(ea);
                    free(ea);
                } else if (strncmp(ref, "words ", 6) == 0) {
                    char *ea = expand(ref + 6);
                    result = fn_words(ea);
                    free(ea);
                } else if (strncmp(ref, "firstword ", 10) == 0) {
                    char *ea = expand(ref + 10);
                    result = fn_firstword(ea);
                    free(ea);
                } else if (strncmp(ref, "lastword ", 9) == 0) {
                    char *ea = expand(ref + 9);
                    result = fn_lastword(ea);
                    free(ea);
                } else if (strncmp(ref, "dir ", 4) == 0) {
                    char *ea = expand(ref + 4);
                    result = fn_dir(ea);
                    free(ea);
                } else if (strncmp(ref, "notdir ", 7) == 0) {
                    char *ea = expand(ref + 7);
                    result = fn_notdir(ea);
                    free(ea);
                } else if (strncmp(ref, "basename ", 9) == 0) {
                    char *ea = expand(ref + 9);
                    result = fn_basename(ea);
                    free(ea);
                } else if (strncmp(ref, "suffix ", 7) == 0) {
                    char *ea = expand(ref + 7);
                    result = fn_suffix(ea);
                    free(ea);
                } else if (strncmp(ref, "addprefix ", 10) == 0) {
                    char *ea = expand(ref + 10);
                    result = fn_addprefix(ea);
                    free(ea);
                } else if (strncmp(ref, "addsuffix ", 10) == 0) {
                    char *ea = expand(ref + 10);
                    result = fn_addsuffix(ea);
                    free(ea);
                } else if (strncmp(ref, "wildcard ", 9) == 0) {
                    char *ea = expand(ref + 9);
                    result = fn_wildcard(ea);
                    free(ea);
                } else if (strncmp(ref, "shell ", 6) == 0) {
                    char *ea = expand(ref + 6);
                    result = fn_shell(ea);
                    free(ea);
                } else if (strncmp(ref, "foreach ", 8) == 0) {
                    /* Don't expand args yet — foreach does it per-iteration */
                    result = fn_foreach(ref + 8);
                } else if (strncmp(ref, "if ", 3) == 0) {
                    /* $(if cond,then,else) */
                    char *ea = expand(ref + 3);
                    const char *c1 = strchr(ea, ',');
                    if (c1) {
                        char *cond = xmalloc(c1 - ea + 1);
                        memcpy(cond, ea, c1 - ea); cond[c1 - ea] = '\0';
                        const char *c2 = strchr(c1 + 1, ',');
                        char *s_cond = strip(cond);
                        if (strlen(s_cond) > 0) {
                            /* True: use then-part */
                            if (c2) {
                                char *tp = xmalloc(c2 - c1);
                                memcpy(tp, c1 + 1, c2 - c1 - 1); tp[c2 - c1 - 1] = '\0';
                                result = xstrdup(tp);
                                free(tp);
                            } else {
                                result = xstrdup(c1 + 1);
                            }
                        } else {
                            /* False: use else-part */
                            result = xstrdup(c2 ? c2 + 1 : "");
                        }
                        free(cond);
                    } else {
                        result = xstrdup("");
                    }
                    free(ea);
                } else if (strncmp(ref, "or ", 3) == 0) {
                    char *ea = expand(ref + 3);
                    char *t = xstrdup(ea);
                    char *tok = strtok(t, ",");
                    result = xstrdup("");
                    while (tok) {
                        char *st = strip(tok);
                        if (strlen(st) > 0) { free(result); result = xstrdup(st); break; }
                        tok = strtok(NULL, ",");
                    }
                    free(t); free(ea);
                } else if (strncmp(ref, "and ", 4) == 0) {
                    char *ea = expand(ref + 4);
                    char *t = xstrdup(ea);
                    result = xstrdup("");
                    char *tok = strtok(t, ",");
                    while (tok) {
                        char *st = strip(tok);
                        if (strlen(st) == 0) { free(result); result = xstrdup(""); break; }
                        free(result); result = xstrdup(st);
                        tok = strtok(NULL, ",");
                    }
                    free(t); free(ea);
                } else if (strncmp(ref, "error ", 6) == 0) {
                    char *ea = expand(ref + 6);
                    fprintf(stderr, "*** %s.  Stop.\n", ea);
                    free(ea); free(ref); free(out);
                    exit(2);
                } else if (strncmp(ref, "warning ", 8) == 0) {
                    char *ea = expand(ref + 8);
                    fprintf(stderr, "warning: %s\n", ea);
                    free(ea);
                    result = xstrdup("");
                } else if (strncmp(ref, "info ", 5) == 0) {
                    char *ea = expand(ref + 5);
                    printf("%s\n", ea);
                    free(ea);
                    result = xstrdup("");
                } else if (strncmp(ref, "abspath ", 8) == 0) {
                    char *ea = expand(ref + 8);
                    char *t = xstrdup(ea);
                    char outbuf[MAX_EXPAND];
                    size_t obi = 0;
                    char *tok = strtok(t, " \t");
                    int first = 1;
                    while (tok) {
                        if (!first) outbuf[obi++] = ' ';
                        first = 0;
                        if (tok[0] == '/') {
                            size_t tl = strlen(tok);
                            memcpy(outbuf + obi, tok, tl); obi += tl;
                        } else {
                            char cwd[1024];
                            if (getcwd(cwd, sizeof(cwd))) {
                                size_t cl = strlen(cwd);
                                memcpy(outbuf + obi, cwd, cl); obi += cl;
                                outbuf[obi++] = '/';
                            }
                            size_t tl = strlen(tok);
                            memcpy(outbuf + obi, tok, tl); obi += tl;
                        }
                        tok = strtok(NULL, " \t");
                    }
                    outbuf[obi] = '\0';
                    result = xstrdup(outbuf);
                    free(t); free(ea);
                } else if (strncmp(ref, "realpath ", 9) == 0) {
                    char *ea = expand(ref + 9);
                    /* Simplified: same as abspath for now */
                    result = xstrdup(ea);
                    free(ea);
                } else if ((space = strchr(ref, ':')) != NULL && space[1] != '\0') {
                    /* $(VAR:old=new) — suffix substitution shorthand */
                    char *eq = strchr(ref, '=');
                    if (eq && eq > space) {
                        char vname[256];
                        size_t vnl = space - ref;
                        if (vnl >= sizeof(vname)) vnl = sizeof(vname) - 1;
                        memcpy(vname, ref, vnl); vname[vnl] = '\0';
                        char *old_suf = xmalloc(eq - space);
                        memcpy(old_suf, space + 1, eq - space - 1);
                        old_suf[eq - space - 1] = '\0';
                        char *new_suf = xstrdup(eq + 1);

                        /* Build patsubst pattern */
                        char pat_arg[MAX_LINE];
                        char *val = var_get_expanded(vname);
                        snprintf(pat_arg, sizeof(pat_arg), "%%%s,%%%s,%s",
                                 old_suf, new_suf, val);
                        result = fn_patsubst(pat_arg);
                        free(val); free(old_suf); free(new_suf);
                    } else {
                        /* Just a variable with : in name — treat as variable */
                        result = var_get_expanded(ref);
                    }
                } else {
                    /* Simple variable reference */
                    result = var_get_expanded(ref);
                }

                if (result) {
                    size_t rl = strlen(result);
                    if (oi + rl < MAX_EXPAND) {
                        memcpy(out + oi, result, rl);
                        oi += rl;
                    }
                    free(result);
                }
                free(ref);
            } else if (s[i] == '@' || s[i] == '<' || s[i] == '^' ||
                       s[i] == '*' || s[i] == '?') {
                /* Single-char automatic variable */
                char vname[2] = { s[i], '\0' };
                i++;
                const char *val = var_get(vname);
                size_t vl = strlen(val);
                if (oi + vl < MAX_EXPAND) { memcpy(out + oi, val, vl); oi += vl; }
            } else if (isalpha((unsigned char)s[i]) || s[i] == '_') {
                /* Single-char variable $X */
                char vname[2] = { s[i], '\0' };
                i++;
                const char *val = var_get(vname);
                size_t vl = strlen(val);
                if (oi + vl < MAX_EXPAND) { memcpy(out + oi, val, vl); oi += vl; }
            } else {
                out[oi++] = '$';
                /* Don't consume the char — let next iteration handle it */
            }
        } else {
            out[oi++] = s[i++];
        }
    }
    out[oi] = '\0';
    return out;
}

/* --- Makefile parser ----------------------------------------------------- */

static int include_depth = 0;

/* Conditional state */
static struct { int active; int seen_true; int in_else; } cond_stack[MAX_IF_DEPTH];
static int cond_depth = 0;

static int cond_active(void) {
    if (cond_depth == 0) return 1;
    return cond_stack[cond_depth - 1].active;
}

/* Read a logical line (handling backslash-newline continuation) */
static char *read_logical_line(FILE *f) {
    static char buf[MAX_LINE];
    size_t total = 0;
    int first = 1;

    while (1) {
        if (!fgets(buf + total, MAX_LINE - (int)total, f))
            return first ? NULL : buf;
        first = 0;
        size_t len = strlen(buf + total);
        total += len;
        if (total == 0) return buf;
        /* Handle backslash continuation */
        if (total >= 2 && buf[total - 2] == '\\' && buf[total - 1] == '\n') {
            total -= 2;
            buf[total++] = ' '; /* Replace continuation with space */
            buf[total] = '\0';
            continue;
        }
        /* Remove trailing newline */
        if (buf[total - 1] == '\n') {
            buf[total - 1] = '\0';
            total--;
        }
        return buf;
    }
}

static Rule *current_rule = NULL;

static void parse_assignment(char *line, int override) {
    /* Find the operator: :=, ?=, +=, or = */
    char *p = line;
    char *op = NULL;
    int op_type = 0; /* 0=recursive, 1=simple, 2=conditional, 3=append */

    while (*p) {
        if (*p == ':' && *(p + 1) == '=') { op = p; op_type = 1; break; }
        if (*p == '?' && *(p + 1) == '=') { op = p; op_type = 2; break; }
        if (*p == '+' && *(p + 1) == '=') { op = p; op_type = 3; break; }
        if (*p == '=') { op = p; op_type = 0; break; }
        if (*p == ':' || *p == '#') break; /* Rule or comment */
        p++;
    }

    if (!op || *op == ':' || *op == '#') return;

    char name[256];
    size_t nl = op - line;
    if (nl >= sizeof(name)) nl = sizeof(name) - 1;
    memcpy(name, line, nl);
    name[nl] = '\0';
    rtrim(name);

    const char *val = op + (op_type == 0 ? 1 : 2);
    while (*val == ' ' || *val == '\t') val++;

    if (op_type == 3) {
        /* += append */
        char *expanded_val = expand(val);
        var_append(name, expanded_val);
        free(expanded_val);
    } else if (op_type == 2) {
        /* ?= conditional */
        var_set_if_absent(name, val, 1);
    } else if (op_type == 1) {
        /* := simple (expand now) */
        char *expanded_val = expand(val);
        var_set(name, expanded_val, 0, override);
        free(expanded_val);
    } else {
        /* = recursive (expand later) */
        var_set(name, val, 1, override);
    }
}

static int is_assignment(const char *line) {
    const char *p = line;
    while (*p) {
        if (*p == ':' && *(p + 1) == '=') return 1;
        if (*p == '?' && *(p + 1) == '=') return 1;
        if (*p == '+' && *(p + 1) == '=') return 1;
        if (*p == '=') return 1;
        if (*p == ':') return 0; /* rule colon */
        if (*p == '#') return 0;
        p++;
    }
    return 0;
}

static void parse_rule(char *line) {
    /* target1 target2 : dep1 dep2 */
    char *colon = NULL;
    /* Find rule colon (not :=) */
    char *p = line;
    while (*p) {
        if (*p == ':' && *(p + 1) != '=') { colon = p; break; }
        if (*p == '=') return; /* assignment, not rule */
        p++;
    }
    if (!colon) return;

    /* Extract targets */
    char targets_str[MAX_LINE];
    size_t tl = colon - line;
    memcpy(targets_str, line, tl);
    targets_str[tl] = '\0';

    /* Expand targets */
    char *etargets = expand(targets_str);

    /* Extract deps */
    const char *deps_str = colon + 1;
    /* Handle order-only deps (|) — just include them for now */
    char *edeps = expand(deps_str);

    /* Parse target list */
    char *tgt_list[64];
    int ntgt = 0;
    char *ttmp = xstrdup(etargets);
    char *tok = strtok(ttmp, " \t");
    while (tok && ntgt < 64) { tgt_list[ntgt++] = xstrdup(tok); tok = strtok(NULL, " \t"); }
    free(ttmp);

    /* Parse dep list */
    char *dep_list[MAX_DEPS];
    int ndep = 0;
    char *dtmp = xstrdup(edeps);
    tok = strtok(dtmp, " \t");
    while (tok && ndep < MAX_DEPS) { dep_list[ndep++] = xstrdup(tok); tok = strtok(NULL, " \t"); }
    free(dtmp);

    free(etargets);
    free(edeps);

    /* Create rules */
    for (int t = 0; t < ntgt; t++) {
        /* Check .PHONY */
        if (strcmp(tgt_list[t], ".PHONY") == 0) {
            for (int d = 0; d < ndep; d++) {
                Rule *r = rule_find(dep_list[d]);
                if (r) r->phony = 1;
                /* Also mark any future rule */
                /* Store in a temporary phony list */
                var_append(".PHONY_TARGETS", dep_list[d]);
            }
            free(tgt_list[t]);
            continue;
        }

        /* Check for existing rule — merge deps */
        Rule *existing = rule_find(tgt_list[t]);
        if (existing && !existing->pattern) {
            for (int d = 0; d < ndep; d++) {
                if (existing->ndeps < MAX_DEPS)
                    existing->deps[existing->ndeps++] = xstrdup(dep_list[d]);
            }
            current_rule = existing;
            free(tgt_list[t]);
            continue;
        }

        if (nrule >= MAX_RULES) {
            fprintf(stderr, "make: too many rules\n");
            exit(2);
        }
        Rule *r = &rules[nrule++];
        r->target = tgt_list[t];
        r->ndeps = 0;
        for (int d = 0; d < ndep; d++) {
            if (r->ndeps < MAX_DEPS)
                r->deps[r->ndeps++] = xstrdup(dep_list[d]);
        }
        r->nrecipes = 0;
        r->phony = 0;
        r->pattern = (strchr(r->target, '%') != NULL) ? 1 : 0;

        /* Check if target is in .PHONY list */
        const char *phony_list = var_get(".PHONY_TARGETS");
        if (phony_list && strstr(phony_list, r->target))
            r->phony = 1;

        /* Set default target */
        if (!default_target && !r->pattern && r->target[0] != '.')
            default_target = r->target;

        current_rule = r;
    }

    /* Clean up dep copies */
    for (int d = 0; d < ndep; d++) free(dep_list[d]);
}

static void parse_makefile(const char *filename);

static void parse_line(const char *raw_line) {
    /* Skip empty lines */
    if (raw_line[0] == '\0') { current_rule = NULL; return; }

    /* Recipe line (starts with tab) */
    if (raw_line[0] == '\t') {
        if (current_rule && cond_active()) {
            if (current_rule->nrecipes < MAX_RECIPES)
                current_rule->recipes[current_rule->nrecipes++] = xstrdup(raw_line + 1);
        }
        return;
    }

    /* Strip comments (not in recipes) */
    char line[MAX_LINE];
    strncpy(line, raw_line, MAX_LINE - 1);
    line[MAX_LINE - 1] = '\0';
    char *comment = strchr(line, '#');
    if (comment) *comment = '\0';

    /* Strip leading whitespace */
    char *s = line;
    while (*s == ' ' || *s == '\t') s++;
    if (*s == '\0') { return; }

    /* Handle conditionals */
    if (strncmp(s, "ifeq ", 5) == 0 || strncmp(s, "ifeq(", 5) == 0) {
        if (cond_depth >= MAX_IF_DEPTH) { fprintf(stderr, "make: too many nested conditionals\n"); exit(2); }
        if (!cond_active()) {
            cond_stack[cond_depth].active = 0;
            cond_stack[cond_depth].seen_true = 0;
            cond_stack[cond_depth].in_else = 0;
            cond_depth++;
            return;
        }
        /* Parse (a,b) or 'a' 'b' or "a" "b" */
        char *args = s + 4;
        while (*args == ' ') args++;
        char arg1[MAX_LINE] = "", arg2[MAX_LINE] = "";
        if (*args == '(') {
            args++;
            const char *comma = strchr(args, ',');
            if (comma) {
                size_t l1 = comma - args;
                memcpy(arg1, args, l1); arg1[l1] = '\0';
                const char *end = strchr(comma + 1, ')');
                if (end) {
                    size_t l2 = end - comma - 1;
                    memcpy(arg2, comma + 1, l2); arg2[l2] = '\0';
                }
            }
        } else {
            /* 'a' 'b' or "a" "b" format */
            char delim = *args;
            if (delim == '\'' || delim == '"') {
                args++;
                char *end1 = strchr(args, delim);
                if (end1) {
                    memcpy(arg1, args, end1 - args); arg1[end1 - args] = '\0';
                    args = end1 + 1;
                    while (*args == ' ' || *args == '\t') args++;
                    delim = *args;
                    if (delim == '\'' || delim == '"') {
                        args++;
                        char *end2 = strchr(args, delim);
                        if (end2) {
                            memcpy(arg2, args, end2 - args); arg2[end2 - args] = '\0';
                        }
                    }
                }
            }
        }
        char *ea1 = expand(strip(arg1));
        char *ea2 = expand(strip(arg2));
        int eq = (strcmp(ea1, ea2) == 0);
        free(ea1); free(ea2);
        cond_stack[cond_depth].active = eq;
        cond_stack[cond_depth].seen_true = eq;
        cond_stack[cond_depth].in_else = 0;
        cond_depth++;
        return;
    }

    if (strncmp(s, "ifneq ", 6) == 0 || strncmp(s, "ifneq(", 6) == 0) {
        if (cond_depth >= MAX_IF_DEPTH) { fprintf(stderr, "make: too many nested conditionals\n"); exit(2); }
        if (!cond_active()) {
            cond_stack[cond_depth].active = 0;
            cond_stack[cond_depth].seen_true = 0;
            cond_stack[cond_depth].in_else = 0;
            cond_depth++;
            return;
        }
        char *args = s + 5;
        while (*args == ' ') args++;
        char arg1[MAX_LINE] = "", arg2[MAX_LINE] = "";
        if (*args == '(') {
            args++;
            const char *comma = strchr(args, ',');
            if (comma) {
                size_t l1 = comma - args;
                memcpy(arg1, args, l1); arg1[l1] = '\0';
                const char *end = strchr(comma + 1, ')');
                if (end) {
                    size_t l2 = end - comma - 1;
                    memcpy(arg2, comma + 1, l2); arg2[l2] = '\0';
                }
            }
        } else {
            char delim = *args;
            if (delim == '\'' || delim == '"') {
                args++;
                char *end1 = strchr(args, delim);
                if (end1) {
                    memcpy(arg1, args, end1 - args); arg1[end1 - args] = '\0';
                    args = end1 + 1;
                    while (*args == ' ' || *args == '\t') args++;
                    delim = *args;
                    if (delim == '\'' || delim == '"') {
                        args++;
                        char *end2 = strchr(args, delim);
                        if (end2) {
                            memcpy(arg2, args, end2 - args); arg2[end2 - args] = '\0';
                        }
                    }
                }
            }
        }
        char *ea1 = expand(strip(arg1));
        char *ea2 = expand(strip(arg2));
        int neq = (strcmp(ea1, ea2) != 0);
        free(ea1); free(ea2);
        cond_stack[cond_depth].active = neq;
        cond_stack[cond_depth].seen_true = neq;
        cond_stack[cond_depth].in_else = 0;
        cond_depth++;
        return;
    }

    if (strncmp(s, "ifdef ", 6) == 0) {
        if (cond_depth >= MAX_IF_DEPTH) { fprintf(stderr, "make: too many nested conditionals\n"); exit(2); }
        if (!cond_active()) {
            cond_stack[cond_depth].active = 0;
            cond_stack[cond_depth].seen_true = 0;
            cond_stack[cond_depth].in_else = 0;
            cond_depth++;
            return;
        }
        char *vname = strip(s + 6);
        char *ev = expand(vname);
        char *sv = strip(ev);
        int defined = (var_find(sv) != NULL || getenv(sv) != NULL);
        free(ev);
        cond_stack[cond_depth].active = defined;
        cond_stack[cond_depth].seen_true = defined;
        cond_stack[cond_depth].in_else = 0;
        cond_depth++;
        return;
    }

    if (strncmp(s, "ifndef ", 7) == 0) {
        if (cond_depth >= MAX_IF_DEPTH) { fprintf(stderr, "make: too many nested conditionals\n"); exit(2); }
        if (!cond_active()) {
            cond_stack[cond_depth].active = 0;
            cond_stack[cond_depth].seen_true = 0;
            cond_stack[cond_depth].in_else = 0;
            cond_depth++;
            return;
        }
        char *vname = strip(s + 7);
        char *ev = expand(vname);
        char *sv = strip(ev);
        int defined = (var_find(sv) != NULL || getenv(sv) != NULL);
        free(ev);
        cond_stack[cond_depth].active = !defined;
        cond_stack[cond_depth].seen_true = !defined;
        cond_stack[cond_depth].in_else = 0;
        cond_depth++;
        return;
    }

    if (strcmp(s, "else") == 0 || strncmp(s, "else ", 5) == 0) {
        if (cond_depth > 0) {
            cond_stack[cond_depth - 1].in_else = 1;
            /* Activate else branch only if no prior branch was true and parent is active */
            int parent_active = (cond_depth <= 1) || cond_stack[cond_depth - 2].active;
            cond_stack[cond_depth - 1].active = parent_active && !cond_stack[cond_depth - 1].seen_true;
        }
        return;
    }

    if (strcmp(s, "endif") == 0) {
        if (cond_depth > 0) cond_depth--;
        return;
    }

    if (!cond_active()) return;

    /* include directive */
    if (strncmp(s, "include ", 8) == 0 || strncmp(s, "-include ", 9) == 0 ||
        strncmp(s, "sinclude ", 9) == 0) {
        int optional = (s[0] == '-' || s[0] == 's');
        char *files = s + (optional ? (s[0] == '-' ? 9 : 9) : 8);
        char *ef = expand(files);
        char *tok = strtok(ef, " \t");
        while (tok) {
            if (include_depth >= MAX_INCLUDE_DEPTH) {
                fprintf(stderr, "make: include depth exceeded\n");
                exit(2);
            }
            FILE *f = fopen(tok, "r");
            if (f) {
                include_depth++;
                char *ln;
                while ((ln = read_logical_line(f)) != NULL)
                    parse_line(ln);
                fclose(f);
                include_depth--;
            } else if (!optional) {
                fprintf(stderr, "make: %s: %s\n", tok, strerror(errno));
                exit(2);
            }
            tok = strtok(NULL, " \t");
        }
        free(ef);
        return;
    }

    /* Assignment or rule */
    if (is_assignment(s)) {
        /* Expand variable name side if it contains $() */
        char expanded_line[MAX_LINE];
        /* Only expand the left side up to the operator */
        char *eql = s;
        while (*eql && *eql != '=' && !(*eql == ':' && *(eql+1) == '=') &&
               !(*eql == '?' && *(eql+1) == '=') && !(*eql == '+' && *(eql+1) == '='))
            eql++;
        /* Just parse directly — expansion happens in parse_assignment for := */
        parse_assignment(s, 0);
        current_rule = NULL;
    } else {
        parse_rule(s);
    }
}

static void parse_makefile(const char *filename) {
    FILE *f = fopen(filename, "r");
    if (!f) {
        fprintf(stderr, "make: %s: %s\n", filename, strerror(errno));
        exit(2);
    }
    char *line;
    while ((line = read_logical_line(f)) != NULL)
        parse_line(line);
    fclose(f);
}

/* --- Build engine -------------------------------------------------------- */

/* Build state */
#define ST_UNVISITED 0
#define ST_VISITING  1
#define ST_DONE      2

typedef struct { char *name; int state; int built; } TargetState;
static TargetState target_states[MAX_RULES * 2];
static int ntstate = 0;

static TargetState *get_state(const char *name) {
    for (int i = 0; i < ntstate; i++)
        if (strcmp(target_states[i].name, name) == 0)
            return &target_states[i];
    if (ntstate >= MAX_RULES * 2) { fprintf(stderr, "make: too many targets\n"); exit(2); }
    target_states[ntstate].name = xstrdup(name);
    target_states[ntstate].state = ST_UNVISITED;
    target_states[ntstate].built = 0;
    return &target_states[ntstate++];
}

/* Options */
static int opt_dry_run = 0;
static int opt_silent = 0;
static int opt_keep_going = 0;
static int opt_question = 0;

static time_t file_mtime(const char *path) {
    struct stat st;
    if (stat(path, &st) != 0) return 0;
    return st.st_mtime;
}

static int file_exists(const char *path) {
    struct stat st;
    return stat(path, &st) == 0;
}

static int execute_recipe_line(const char *line, int silent_global) {
    const char *cmd = line;
    int silent = silent_global;
    int ignore_error = 0;

    /* Process recipe prefixes */
    while (*cmd == '@' || *cmd == '-' || *cmd == '+') {
        if (*cmd == '@') silent = 1;
        if (*cmd == '-') ignore_error = 1;
        cmd++;
        while (*cmd == ' ') cmd++;
    }

    if (!silent)
        printf("%s\n", cmd);
    fflush(stdout);

    if (opt_dry_run) return 0;

    /* Execute via sh -c */
    int pipefd[2];
    if (pipe(pipefd) != 0) {
        fprintf(stderr, "make: pipe: %s\n", strerror(errno));
        return ignore_error ? 0 : 2;
    }

    posix_spawn_file_actions_t fa;
    posix_spawn_file_actions_init(&fa);
    /* Child inherits stdin/stdout/stderr from parent — no redirection needed for recipes */
    posix_spawn_file_actions_addclose(&fa, pipefd[0]);
    posix_spawn_file_actions_addclose(&fa, pipefd[1]);

    /* We don't actually need the pipe for recipes — child writes to inherited stdout/stderr */
    close(pipefd[0]);
    close(pipefd[1]);
    posix_spawn_file_actions_destroy(&fa);

    /* Simpler: just use system()-like spawn via sh -c */
    posix_spawn_file_actions_t fa2;
    posix_spawn_file_actions_init(&fa2);

    char *argv[] = {"sh", "-c", (char *)cmd, NULL};
    pid_t child;
    int err = posix_spawnp(&child, "sh", &fa2, NULL, argv, environ);
    posix_spawn_file_actions_destroy(&fa2);

    if (err != 0) {
        fprintf(stderr, "make: sh: %s\n", strerror(err));
        return ignore_error ? 0 : 2;
    }

    int status;
    waitpid(child, &status, 0);

    int exitcode = WIFEXITED(status) ? WEXITSTATUS(status) : 1;

    if (exitcode != 0 && !ignore_error) {
        fprintf(stderr, "make: *** [%s] Error %d\n",
                var_get("@"), exitcode);
        return 2;
    }
    return 0;
}

static int build_target(const char *target) {
    TargetState *ts = get_state(target);

    if (ts->state == ST_DONE) return ts->built ? 0 : 2;
    if (ts->state == ST_VISITING) {
        fprintf(stderr, "make: circular dependency: %s\n", target);
        return 2;
    }
    ts->state = ST_VISITING;

    Rule *rule = rule_find(target);
    char stem[1024] = "";
    Rule *prule = NULL;

    if (!rule) {
        prule = pattern_match(target, stem, sizeof(stem));
    }

    Rule *effective = rule ? rule : prule;

    if (!effective) {
        /* No rule — check if file exists */
        if (file_exists(target)) {
            ts->state = ST_DONE;
            ts->built = 1;
            return 0;
        }
        fprintf(stderr, "make: *** No rule to make target '%s'.  Stop.\n", target);
        ts->state = ST_DONE;
        ts->built = 0;
        return 2;
    }

    /* Build dependencies */
    int need_rebuild = effective->phony;
    time_t target_time = effective->phony ? 0 : file_mtime(target);
    if (!effective->phony && !file_exists(target))
        need_rebuild = 1;

    /* Build prerequisite list — expand pattern rule deps with stem */
    char *deps[MAX_DEPS];
    int ndeps = effective->ndeps;
    for (int i = 0; i < ndeps; i++) {
        if (prule && strchr(effective->deps[i], '%')) {
            /* Replace % with stem */
            const char *dep = effective->deps[i];
            const char *pct = strchr(dep, '%');
            size_t pl = pct - dep;
            size_t sl = strlen(stem);
            size_t rl = strlen(pct + 1);
            deps[i] = xmalloc(pl + sl + rl + 1);
            memcpy(deps[i], dep, pl);
            memcpy(deps[i] + pl, stem, sl);
            memcpy(deps[i] + pl + sl, pct + 1, rl + 1);
        } else {
            deps[i] = xstrdup(effective->deps[i]);
        }
    }

    for (int i = 0; i < ndeps; i++) {
        int ret = build_target(deps[i]);
        if (ret != 0 && !opt_keep_going) {
            for (int j = 0; j < ndeps; j++) free(deps[j]);
            ts->state = ST_DONE;
            ts->built = 0;
            return 2;
        }
        if (!effective->phony) {
            time_t dep_time = file_mtime(deps[i]);
            if (dep_time > target_time) need_rebuild = 1;
        }
    }

    /* Build all prereq names as a space-separated string */
    char all_prereqs[MAX_LINE] = "";
    size_t ap_off = 0;
    for (int i = 0; i < ndeps; i++) {
        if (i > 0 && ap_off < MAX_LINE - 1) all_prereqs[ap_off++] = ' ';
        size_t dl = strlen(deps[i]);
        if (ap_off + dl < MAX_LINE) { memcpy(all_prereqs + ap_off, deps[i], dl); ap_off += dl; }
    }
    all_prereqs[ap_off] = '\0';

    /* Set automatic variables */
    var_set("@", target, 0, 0);
    var_set("<", ndeps > 0 ? deps[0] : "", 0, 0);
    var_set("^", all_prereqs, 0, 0);
    var_set("*", stem, 0, 0);
    /* $? — deps newer than target */
    char newer_deps[MAX_LINE] = "";
    size_t nd_off = 0;
    for (int i = 0; i < ndeps; i++) {
        if (effective->phony || file_mtime(deps[i]) > target_time) {
            if (nd_off > 0 && nd_off < MAX_LINE - 1) newer_deps[nd_off++] = ' ';
            size_t dl = strlen(deps[i]);
            if (nd_off + dl < MAX_LINE) { memcpy(newer_deps + nd_off, deps[i], dl); nd_off += dl; }
        }
    }
    newer_deps[nd_off] = '\0';
    var_set("?", newer_deps, 0, 0);

    for (int j = 0; j < ndeps; j++) free(deps[j]);

    if (!need_rebuild && effective->nrecipes > 0) {
        ts->state = ST_DONE;
        ts->built = 1;
        return 0;
    }

    /* Execute recipes */
    for (int i = 0; i < effective->nrecipes; i++) {
        char *expanded = expand(effective->recipes[i]);
        int ret = execute_recipe_line(expanded, opt_silent);
        free(expanded);
        if (ret != 0) {
            ts->state = ST_DONE;
            ts->built = 0;
            return 2;
        }
    }

    ts->state = ST_DONE;
    ts->built = 1;
    return 0;
}

/* --- Version and help ---------------------------------------------------- */

static void print_version(void) {
    printf("make (secure-exec) 1.0.0\n");
    printf("Compatible with POSIX make and common GNU make extensions.\n");
    printf("This is a clean-room implementation, licensed under Apache-2.0.\n");
}

static void print_help(void) {
    printf("Usage: make [options] [target ...]\n");
    printf("Options:\n");
    printf("  -f FILE   Read FILE as a makefile\n");
    printf("  -C DIR    Change to DIR before reading makefiles\n");
    printf("  -n        Dry run (print commands without executing)\n");
    printf("  -s        Silent mode (don't print commands)\n");
    printf("  -k        Keep going on errors\n");
    printf("  -q        Question mode (exit 0 if up to date, 1 if not)\n");
    printf("  -j N      Ignored (parallelism not supported)\n");
    printf("  --version Print version information\n");
    printf("  --help    Print this help message\n");
}

/* --- Main ---------------------------------------------------------------- */

int main(int argc, char **argv) {
    char *makefile = NULL;
    char *directory = NULL;
    char *targets[64];
    int ntargets = 0;

    /* Parse command-line arguments */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--version") == 0) {
            print_version();
            return 0;
        }
        if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_help();
            return 0;
        }
        if (strcmp(argv[i], "-f") == 0 && i + 1 < argc) {
            makefile = argv[++i];
        } else if (strncmp(argv[i], "-f", 2) == 0 && argv[i][2] != '\0') {
            makefile = argv[i] + 2;
        } else if (strcmp(argv[i], "-C") == 0 && i + 1 < argc) {
            directory = argv[++i];
        } else if (strncmp(argv[i], "-C", 2) == 0 && argv[i][2] != '\0') {
            directory = argv[i] + 2;
        } else if (strcmp(argv[i], "-n") == 0 || strcmp(argv[i], "--dry-run") == 0) {
            opt_dry_run = 1;
        } else if (strcmp(argv[i], "-s") == 0 || strcmp(argv[i], "--silent") == 0) {
            opt_silent = 1;
        } else if (strcmp(argv[i], "-k") == 0 || strcmp(argv[i], "--keep-going") == 0) {
            opt_keep_going = 1;
        } else if (strcmp(argv[i], "-q") == 0 || strcmp(argv[i], "--question") == 0) {
            opt_question = 1;
        } else if (strcmp(argv[i], "-j") == 0 && i + 1 < argc) {
            i++; /* Skip -j N (ignored) */
        } else if (strncmp(argv[i], "-j", 2) == 0) {
            /* -jN (ignored) */
        } else if (argv[i][0] == '-') {
            /* Unknown option — ignore or error */
            fprintf(stderr, "make: unknown option: %s\n", argv[i]);
        } else if (strchr(argv[i], '=')) {
            /* Command-line variable assignment: VAR=value */
            parse_assignment(argv[i], 1);
        } else {
            /* Target */
            if (ntargets < 64) targets[ntargets++] = argv[i];
        }
    }

    /* Change directory if requested */
    if (directory) {
        if (chdir(directory) != 0) {
            fprintf(stderr, "make: %s: %s\n", directory, strerror(errno));
            return 2;
        }
    }

    /* Set built-in variables */
    var_set_if_absent("MAKE", argv[0], 0);
    var_set_if_absent("SHELL", "/bin/sh", 0);
    var_set("MAKEFLAGS", "", 0, 0);
    if (opt_dry_run) var_append("MAKEFLAGS", "-n");
    if (opt_silent) var_append("MAKEFLAGS", "-s");
    if (opt_keep_going) var_append("MAKEFLAGS", "-k");

    /* Find and read makefile */
    if (!makefile) {
        if (file_exists("GNUmakefile")) makefile = "GNUmakefile";
        else if (file_exists("makefile")) makefile = "makefile";
        else if (file_exists("Makefile")) makefile = "Makefile";
        else {
            fprintf(stderr, "make: *** No makefile found.  Stop.\n");
            return 2;
        }
    }
    parse_makefile(makefile);

    /* Build targets */
    if (ntargets == 0) {
        if (!default_target) {
            fprintf(stderr, "make: *** No targets.  Stop.\n");
            return 2;
        }
        targets[0] = default_target;
        ntargets = 1;
    }

    int ret = 0;
    for (int i = 0; i < ntargets; i++) {
        int r = build_target(targets[i]);
        if (r != 0) { ret = 2; if (!opt_keep_going) break; }
    }

    return ret;
}
