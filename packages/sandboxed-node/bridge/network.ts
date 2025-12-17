// Network module polyfill for isolated-vm
// Provides fetch, http, https, and dns module emulation that bridges to host

import type * as nodeHttp from "http";
import type * as nodeDns from "dns";

// Declare host bridge References
declare const _networkFetchRaw: {
  apply(
    ctx: undefined,
    args: [string, string],
    options: { result: { promise: true } }
  ): Promise<string>;
};

declare const _networkDnsLookupRaw: {
  apply(
    ctx: undefined,
    args: [string],
    options: { result: { promise: true } }
  ): Promise<string>;
};

declare const _networkHttpRequestRaw: {
  apply(
    ctx: undefined,
    args: [string, string],
    options: { result: { promise: true } }
  ): Promise<string>;
};

// Types for fetch API
interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  mode?: string;
  credentials?: string;
  cache?: string;
  redirect?: string;
  referrer?: string;
  integrity?: string;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Map<string, string>;
  url: string;
  redirected: boolean;
  type: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<never>;
  clone(): FetchResponse;
}

// Fetch polyfill
export async function fetch(url: string | URL, options: FetchOptions = {}): Promise<FetchResponse> {
  if (typeof _networkFetchRaw === 'undefined') {
    console.error('fetch requires NetworkAdapter to be configured');
    throw new Error('fetch requires NetworkAdapter to be configured');
  }

  const optionsJson = JSON.stringify({
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || null,
  });

  const responseJson = await _networkFetchRaw.apply(undefined, [String(url), optionsJson], {
    result: { promise: true },
  });
  const response = JSON.parse(responseJson) as {
    ok: boolean;
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    url?: string;
    redirected?: boolean;
    body?: string;
  };

  // Create Response-like object
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: new Map(Object.entries(response.headers || {})),
    url: response.url || String(url),
    redirected: response.redirected || false,
    type: "basic",

    async text(): Promise<string> {
      return response.body || "";
    },
    async json(): Promise<unknown> {
      return JSON.parse(response.body || "{}");
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      // Not fully supported - return empty buffer
      return new ArrayBuffer(0);
    },
    async blob(): Promise<never> {
      throw new Error("Blob not supported in sandbox");
    },
    clone(): FetchResponse {
      return { ...this };
    },
  };
}

// Headers class
export class Headers {
  private _headers: Record<string, string> = {};

  constructor(init?: HeadersInit | Headers | Record<string, string> | [string, string][]) {
    if (init && init !== null) {
      if (init instanceof Headers) {
        this._headers = { ...init._headers };
      } else if (Array.isArray(init)) {
        init.forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value;
        });
      } else if (typeof init === "object") {
        Object.entries(init as Record<string, string>).forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value;
        });
      }
    }
  }

  get(name: string): string | null {
    return this._headers[name.toLowerCase()] || null;
  }

  set(name: string, value: string): void {
    this._headers[name.toLowerCase()] = value;
  }

  has(name: string): boolean {
    return name.toLowerCase() in this._headers;
  }

  delete(name: string): void {
    delete this._headers[name.toLowerCase()];
  }

  entries(): IterableIterator<[string, string]> {
    return Object.entries(this._headers)[Symbol.iterator]() as IterableIterator<[string, string]>;
  }

  keys(): IterableIterator<string> {
    return Object.keys(this._headers)[Symbol.iterator]();
  }

  values(): IterableIterator<string> {
    return Object.values(this._headers)[Symbol.iterator]();
  }

  forEach(callback: (value: string, key: string, parent: Headers) => void): void {
    Object.entries(this._headers).forEach(([k, v]) => callback(v, k, this));
  }
}

// Request class
export class Request {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
  mode: string;
  credentials: string;
  cache: string;
  redirect: string;
  referrer: string;
  integrity: string;

  constructor(input: string | Request, init: FetchOptions = {}) {
    this.url = typeof input === "string" ? input : input.url;
    this.method = init.method || (typeof input !== "string" ? input.method : undefined) || "GET";
    this.headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
    this.body = init.body || null;
    this.mode = init.mode || "cors";
    this.credentials = init.credentials || "same-origin";
    this.cache = init.cache || "default";
    this.redirect = init.redirect || "follow";
    this.referrer = init.referrer || "about:client";
    this.integrity = init.integrity || "";
  }

  clone(): Request {
    return new Request(this.url, this);
  }
}

// Response class
export class Response {
  private _body: string | null;
  status: number;
  statusText: string;
  headers: Headers;
  ok: boolean;
  type: string;
  url: string;
  redirected: boolean;

  constructor(body?: string | null, init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}) {
    this._body = body || null;
    this.status = init.status || 200;
    this.statusText = init.statusText || "OK";
    this.headers = new Headers(init.headers);
    this.ok = this.status >= 200 && this.status < 300;
    this.type = "default";
    this.url = "";
    this.redirected = false;
  }

  async text(): Promise<string> {
    return String(this._body || "");
  }

  async json(): Promise<unknown> {
    return JSON.parse(this._body || "{}");
  }

  clone(): Response {
    return new Response(this._body, this);
  }

  static error(): Response {
    return new Response(null, { status: 0, statusText: "" });
  }

  static redirect(url: string, status = 302): Response {
    return new Response(null, { status, headers: { Location: url } });
  }
}

// DNS module types
type DnsCallback = (err: Error | null, address?: string, family?: number) => void;
type DnsResolveCallback = (err: Error | null, addresses?: string[]) => void;

interface DnsError extends Error {
  code?: string;
}

// DNS module polyfill
export const dns = {
  lookup(hostname: string, options: unknown, callback?: DnsCallback): void {
    let cb = callback;
    if (typeof options === "function") {
      cb = options as DnsCallback;
    }

    _networkDnsLookupRaw
      .apply(undefined, [hostname], { result: { promise: true } })
      .then((resultJson) => {
        const result = JSON.parse(resultJson) as { error?: string; code?: string; address?: string; family?: number };
        if (result.error) {
          const err: DnsError = new Error(result.error);
          err.code = result.code || "ENOTFOUND";
          cb?.(err);
        } else {
          cb?.(null, result.address, result.family);
        }
      })
      .catch((err) => {
        cb?.(err as Error);
      });
  },

  resolve(hostname: string, rrtype: string | DnsResolveCallback, callback?: DnsResolveCallback): void {
    let cb = callback;
    if (typeof rrtype === "function") {
      cb = rrtype;
    }

    // Simplified - just do lookup for A records
    dns.lookup(hostname, (err, address) => {
      if (err) {
        cb?.(err);
      } else {
        cb?.(null, address ? [address] : []);
      }
    });
  },

  resolve4(hostname: string, callback: DnsResolveCallback): void {
    dns.resolve(hostname, "A", callback);
  },

  resolve6(hostname: string, callback: DnsResolveCallback): void {
    dns.resolve(hostname, "AAAA", callback);
  },

  promises: {
    lookup(hostname: string, _options?: unknown): Promise<{ address: string; family: number }> {
      return new Promise((resolve, reject) => {
        dns.lookup(hostname, _options, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address: address || "", family: family || 4 });
        });
      });
    },
    resolve(hostname: string, rrtype?: string): Promise<string[]> {
      return new Promise((resolve, reject) => {
        dns.resolve(hostname, rrtype || "A", (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses || []);
        });
      });
    },
  },
} satisfies Partial<typeof nodeDns>;

// Event listener type
type EventListener = (...args: unknown[]) => void;

// IncomingMessage class
export class IncomingMessage {
  headers: Record<string, string>;
  rawHeaders: string[];
  trailers: Record<string, string>;
  rawTrailers: string[];
  httpVersion: string;
  httpVersionMajor: number;
  httpVersionMinor: number;
  method: string | null;
  url: string;
  statusCode: number | undefined;
  statusMessage: string | undefined;
  private _body: string;
  private _isBinary: boolean;
  private _listeners: Record<string, EventListener[]>;
  complete: boolean;
  aborted: boolean;
  socket: null;
  private _bodyConsumed: boolean;
  private _ended: boolean;
  private _flowing: boolean;
  readable: boolean;
  readableEnded: boolean;
  readableFlowing: boolean | null;
  destroyed: boolean;
  private _encoding?: string;

  constructor(response?: { headers?: Record<string, string>; url?: string; status?: number; statusText?: string; body?: string }) {
    this.headers = response?.headers || {};
    this.rawHeaders = [];
    if (this.headers && typeof this.headers === "object") {
      Object.entries(this.headers).forEach(([k, v]) => {
        this.rawHeaders.push(k, v);
      });
    }
    this.trailers = {};
    this.rawTrailers = [];
    this.httpVersion = "1.1";
    this.httpVersionMajor = 1;
    this.httpVersionMinor = 1;
    this.method = null;
    this.url = response?.url || "";
    this.statusCode = response?.status;
    this.statusMessage = response?.statusText;
    // Decode base64 body if x-body-encoding header is set
    const bodyEncoding = this.headers['x-body-encoding'];
    if (bodyEncoding === 'base64' && response?.body && typeof Buffer !== 'undefined') {
      this._body = Buffer.from(response.body, 'base64').toString('binary');
      this._isBinary = true;
    } else {
      this._body = response?.body || "";
      this._isBinary = false;
    }
    this._listeners = {};
    this.complete = false;
    this.aborted = false;
    this.socket = null;
    this._bodyConsumed = false;
    this._ended = false;
    this._flowing = false;
    this.readable = true;
    this.readableEnded = false;
    this.readableFlowing = null;
    this.destroyed = false;
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);

    // When 'data' listener is added, start flowing mode
    // Note: We check for non-empty body (this._body.length > 0) because we need to
    // emit 'end' even for empty responses, but only emit 'data' if there's actual data
    if (event === "data" && !this._bodyConsumed) {
      this._flowing = true;
      this.readableFlowing = true;
      // Emit data in next microtask
      Promise.resolve().then(() => {
        if (!this._bodyConsumed) {
          this._bodyConsumed = true;
          // Only emit data if there's actual content
          if (this._body && this._body.length > 0) {
            let buf: Buffer | string;
            if (typeof Buffer !== "undefined") {
              // For binary data, use 'binary' encoding to preserve bytes
              buf = this._isBinary ? Buffer.from(this._body, 'binary') : Buffer.from(this._body);
            } else {
              buf = this._body;
            }
            this.emit("data", buf);
          }
          // Always emit end after data (even if no data was emitted)
          Promise.resolve().then(() => {
            if (!this._ended) {
              this._ended = true;
              this.complete = true;
              this.readable = false;
              this.readableEnded = true;
              this.emit("end");
            }
          });
        }
      });
    }

    // If 'end' listener is added after data was already consumed, emit end
    if (event === "end" && this._bodyConsumed && !this._ended) {
      Promise.resolve().then(() => {
        if (!this._ended) {
          this._ended = true;
          this.complete = true;
          this.readable = false;
          this.readableEnded = true;
          listener();
        }
      });
    }

    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapper = (...args: unknown[]): void => {
      this.off(event, wrapper);
      listener(...args);
    };
    (wrapper as EventListener & { _originalListener?: EventListener })._originalListener = listener;
    return this.on(event, wrapper);
  }

  off(event: string, listener: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].findIndex(
        (fn) => fn === listener || (fn as EventListener & { _originalListener?: EventListener })._originalListener === listener
      );
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string): this {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const handlers = this._listeners[event];
    if (handlers) {
      handlers.slice().forEach((fn) => fn(...args));
    }
    return handlers !== undefined && handlers.length > 0;
  }

  setEncoding(encoding: string): this {
    this._encoding = encoding;
    return this;
  }

  read(_size?: number): string | Buffer | null {
    if (this._bodyConsumed) return null;
    this._bodyConsumed = true;
    let buf: Buffer | string;
    if (typeof Buffer !== "undefined") {
      buf = this._isBinary ? Buffer.from(this._body, 'binary') : Buffer.from(this._body);
    } else {
      buf = this._body;
    }
    // Schedule end event
    Promise.resolve().then(() => {
      if (!this._ended) {
        this._ended = true;
        this.complete = true;
        this.readable = false;
        this.readableEnded = true;
        this.emit("end");
      }
    });
    return buf;
  }

  pipe<T extends NodeJS.WritableStream>(dest: T): T {
    let buf: Buffer | string;
    if (typeof Buffer !== "undefined") {
      buf = this._isBinary ? Buffer.from(this._body || "", 'binary') : Buffer.from(this._body || "");
    } else {
      buf = this._body || "";
    }
    if (typeof dest.write === "function" && (typeof buf === "string" ? buf.length : buf.length) > 0) {
      dest.write(buf as unknown as string);
    }
    if (typeof dest.end === "function") {
      Promise.resolve().then(() => dest.end());
    }
    this._bodyConsumed = true;
    this._ended = true;
    this.complete = true;
    this.readable = false;
    this.readableEnded = true;
    return dest;
  }

  pause(): this {
    this._flowing = false;
    this.readableFlowing = false;
    return this;
  }

  resume(): this {
    this._flowing = true;
    this.readableFlowing = true;
    if (!this._bodyConsumed && this._body) {
      Promise.resolve().then(() => {
        if (!this._bodyConsumed) {
          this._bodyConsumed = true;
          let buf: Buffer | string;
          if (typeof Buffer !== "undefined") {
            buf = this._isBinary ? Buffer.from(this._body, 'binary') : Buffer.from(this._body);
          } else {
            buf = this._body;
          }
          this.emit("data", buf);
          Promise.resolve().then(() => {
            if (!this._ended) {
              this._ended = true;
              this.complete = true;
              this.readable = false;
              this.readableEnded = true;
              this.emit("end");
            }
          });
        }
      });
    }
    return this;
  }

  unpipe(_dest?: NodeJS.WritableStream): this {
    return this;
  }

  destroy(err?: Error): this {
    this.destroyed = true;
    this.readable = false;
    if (err) this.emit("error", err);
    this.emit("close");
    return this;
  }

  [Symbol.asyncIterator](): AsyncIterator<string | Buffer> {
    const self = this;
    let dataEmitted = false;
    let ended = false;

    return {
      async next(): Promise<IteratorResult<string | Buffer>> {
        if (ended || self._ended) {
          return { done: true, value: undefined as unknown as string };
        }

        if (!dataEmitted && !self._bodyConsumed) {
          dataEmitted = true;
          self._bodyConsumed = true;
          let buf: Buffer | string;
          if (typeof Buffer !== "undefined") {
            buf = self._isBinary ? Buffer.from(self._body || "", 'binary') : Buffer.from(self._body || "");
          } else {
            buf = self._body || "";
          }
          return { done: false, value: buf };
        }

        ended = true;
        self._ended = true;
        self.complete = true;
        self.readable = false;
        self.readableEnded = true;
        return { done: true, value: undefined as unknown as string };
      },
      return(): Promise<IteratorResult<string | Buffer>> {
        ended = true;
        return Promise.resolve({ done: true, value: undefined as unknown as string });
      },
      throw(err: Error): Promise<IteratorResult<string | Buffer>> {
        ended = true;
        self.emit("error", err);
        return Promise.resolve({ done: true, value: undefined as unknown as string });
      },
    };
  }
}

// ClientRequest class
export class ClientRequest {
  private _options: nodeHttp.RequestOptions;
  private _callback?: (res: IncomingMessage) => void;
  private _listeners: Record<string, EventListener[]> = {};
  private _body = "";
  private _ended = false;
  socket: null = null;
  finished = false;
  aborted = false;

  constructor(options: nodeHttp.RequestOptions, callback?: (res: IncomingMessage) => void) {
    this._options = options;
    this._callback = callback;

    // Execute request asynchronously using Promise microtask
    Promise.resolve().then(() => this._execute());
  }

  private async _execute(): Promise<void> {
    try {
      if (typeof _networkHttpRequestRaw === 'undefined') {
        console.error('http/https request requires NetworkAdapter to be configured');
        throw new Error('http/https request requires NetworkAdapter to be configured');
      }

      const url = this._buildUrl();
      const optionsJson = JSON.stringify({
        method: this._options.method || "GET",
        headers: this._options.headers || {},
        body: this._body || null,
      });

      const responseJson = await _networkHttpRequestRaw.apply(undefined, [url, optionsJson], {
        result: { promise: true },
      });
      const response = JSON.parse(responseJson) as {
        headers?: Record<string, string>;
        url?: string;
        status?: number;
        statusText?: string;
        body?: string;
      };

      const res = new IncomingMessage(response);
      this.finished = true;

      if (this._callback) {
        this._callback(res);
      }
      this._emit("response", res);
    } catch (err) {
      this._emit("error", err);
    }
  }

  private _buildUrl(): string {
    const opts = this._options;
    const protocol = opts.protocol || (opts.port === 443 ? "https:" : "http:");
    const host = opts.hostname || opts.host || "localhost";
    const port = opts.port ? ":" + opts.port : "";
    const path = opts.path || "/";
    return protocol + "//" + host + port + path;
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapper = (...args: unknown[]): void => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(listener);
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  private _emit(event: string, ...args: unknown[]): void {
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => fn(...args));
    }
  }

  write(data: string): boolean {
    this._body += data;
    return true;
  }

  end(data?: string): this {
    if (data) this._body += data;
    this._ended = true;
    return this;
  }

  abort(): void {
    this.aborted = true;
  }

  setTimeout(_timeout: number): this {
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setSocketKeepAlive(): this {
    return this;
  }

  flushHeaders(): void {
    // no-op
  }
}

// Agent class - no-op stub (connection pooling not applicable with fetch-based implementation)
class Agent {
  maxSockets: number;
  maxFreeSockets: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  timeout: number;

  constructor(options?: {
    keepAlive?: boolean;
    keepAliveMsecs?: number;
    maxSockets?: number;
    maxFreeSockets?: number;
    timeout?: number;
  }) {
    // Accept options but ignore them - our fetch-based implementation doesn't use connection pooling
    this.keepAlive = options?.keepAlive ?? false;
    this.keepAliveMsecs = options?.keepAliveMsecs ?? 1000;
    this.maxSockets = options?.maxSockets ?? Infinity;
    this.maxFreeSockets = options?.maxFreeSockets ?? 256;
    this.timeout = options?.timeout ?? -1;
  }

  destroy(): void {
    // no-op
  }
}

// Create HTTP module
function createHttpModule(_protocol: string): Partial<typeof nodeHttp> {
  return {
    request(options: string | URL | nodeHttp.RequestOptions, callback?: (res: IncomingMessage) => void): ClientRequest {
      let opts: nodeHttp.RequestOptions;
      if (typeof options === "string") {
        const url = new URL(options);
        opts = {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
        };
      } else if (options instanceof URL) {
        opts = {
          protocol: options.protocol,
          hostname: options.hostname,
          port: options.port,
          path: options.pathname + options.search,
        };
      } else {
        opts = options;
      }
      return new ClientRequest(opts, callback as (res: IncomingMessage) => void);
    },

    get(options: string | URL | nodeHttp.RequestOptions, callback?: (res: IncomingMessage) => void): ClientRequest {
      let opts: nodeHttp.RequestOptions;
      if (typeof options === "string") {
        const url = new URL(options);
        opts = {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: "GET",
        };
      } else if (options instanceof URL) {
        opts = {
          protocol: options.protocol,
          hostname: options.hostname,
          port: options.port,
          path: options.pathname + options.search,
          method: "GET",
        };
      } else {
        opts = { ...options, method: "GET" };
      }
      const req = new ClientRequest(opts, callback as (res: IncomingMessage) => void);
      req.end();
      return req;
    },

    createServer(): never {
      throw new Error("http.createServer is not supported in sandbox");
    },

    Agent,
    globalAgent: new Agent({ keepAlive: false }),
    IncomingMessage: IncomingMessage as unknown as typeof nodeHttp.IncomingMessage,
    ClientRequest: ClientRequest as unknown as typeof nodeHttp.ClientRequest,

    METHODS: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    STATUS_CODES: {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved Permanently",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
    },
  };
}

export const http = createHttpModule("http");
export const https = createHttpModule("https");

// Export modules and make them available as globals for require()
(globalThis as Record<string, unknown>)._httpModule = http;
(globalThis as Record<string, unknown>)._httpsModule = https;
(globalThis as Record<string, unknown>)._dnsModule = dns;

// Make fetch API available globally
(globalThis as Record<string, unknown>).fetch = fetch;
(globalThis as Record<string, unknown>).Headers = Headers;
(globalThis as Record<string, unknown>).Request = Request;
(globalThis as Record<string, unknown>).Response = Response;

export default {
  fetch,
  Headers,
  Request,
  Response,
  dns,
  http,
  https,
  IncomingMessage,
  ClientRequest,
};
