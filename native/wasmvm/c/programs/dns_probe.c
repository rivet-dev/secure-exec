/* dns_probe.c — focused DNS probe for upstream Node WasmVM pre-research.
 *
 * Verifies the success path (localhost lookup) plus an expected failure path
 * for a reserved .invalid hostname.
 */

#include <arpa/inet.h>
#include <netdb.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>

static int lookup_ipv4(const char *host, char *ip, size_t ip_len) {
    struct addrinfo hints;
    struct addrinfo *res = NULL;

    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    int err = getaddrinfo(host, NULL, &hints, &res);
    if (err != 0) {
        return err;
    }

    struct sockaddr_in *sin = (struct sockaddr_in *)res->ai_addr;
    inet_ntop(AF_INET, &sin->sin_addr, ip, ip_len);
    freeaddrinfo(res);
    return 0;
}

int main(void) {
    char ip[INET_ADDRSTRLEN];

    int err = lookup_ipv4("localhost", ip, sizeof(ip));
    if (err != 0) {
        fprintf(stderr, "localhost_lookup_failed: %s\n", gai_strerror(err));
        return 1;
    }
    printf("localhost: %s\n", ip);

    err = lookup_ipv4("secure-exec-probe.invalid", ip, sizeof(ip));
    if (err == 0) {
        fprintf(stderr, "invalid_host_unexpected_success: %s\n", ip);
        return 1;
    }

    printf("invalid_host: expected_failure\n");
    fprintf(stderr, "invalid_host_error: %s\n", gai_strerror(err));

    return 0;
}
