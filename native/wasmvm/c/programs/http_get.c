/* http_get.c — connect to an HTTP server, send GET request, print response body */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "usage: http_get <port>\n");
        return 1;
    }

    int port = atoi(argv[1]);

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        perror("socket");
        return 1;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("connect");
        close(fd);
        return 1;
    }

    const char *request = "GET / HTTP/1.0\r\nHost: localhost\r\n\r\n";
    ssize_t sent = send(fd, request, strlen(request), 0);
    if (sent < 0) {
        perror("send");
        close(fd);
        return 1;
    }

    /* Read full response */
    char response[4096];
    size_t total = 0;
    ssize_t n;
    while ((n = recv(fd, response + total, sizeof(response) - total - 1, 0)) > 0) {
        total += (size_t)n;
    }
    response[total] = '\0';

    close(fd);

    /* Find body after \r\n\r\n */
    const char *body = strstr(response, "\r\n\r\n");
    if (body) {
        body += 4;
        printf("body: %s\n", body);
    } else {
        printf("body: (no separator found)\n");
        return 1;
    }

    return 0;
}
