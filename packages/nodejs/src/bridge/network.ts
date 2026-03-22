// Network module polyfill for the sandbox
// Provides fetch, http, https, and dns module emulation that bridges to host

// Cap in-sandbox request/response buffering to prevent host memory exhaustion
const MAX_HTTP_BODY_BYTES = 50 * 1024 * 1024; // 50 MB

import type * as nodeHttp from "http";
import type * as nodeDns from "dns";
import { exposeCustomGlobal } from "@secure-exec/core/internal/shared/global-exposure";
import type {
	NetworkDnsLookupRawBridgeRef,
	NetworkFetchRawBridgeRef,
	NetworkHttpRequestRawBridgeRef,
	NetworkHttpServerCloseRawBridgeRef,
	NetworkHttpServerListenRawBridgeRef,
	RegisterHandleBridgeFn,
	UnregisterHandleBridgeFn,
	UpgradeSocketWriteRawBridgeRef,
	UpgradeSocketEndRawBridgeRef,
	UpgradeSocketDestroyRawBridgeRef,
	NetSocketConnectRawBridgeRef,
	NetSocketWriteRawBridgeRef,
	NetSocketEndRawBridgeRef,
	NetSocketDestroyRawBridgeRef,
	NetSocketUpgradeTlsRawBridgeRef,
} from "../bridge-contract.js";

// Declare host bridge References
declare const _networkFetchRaw: NetworkFetchRawBridgeRef;

declare const _networkDnsLookupRaw: NetworkDnsLookupRawBridgeRef;

declare const _networkHttpRequestRaw: NetworkHttpRequestRawBridgeRef;

declare const _networkHttpServerListenRaw:
  | NetworkHttpServerListenRawBridgeRef
  | undefined;

declare const _networkHttpServerCloseRaw:
  | NetworkHttpServerCloseRawBridgeRef
  | undefined;

declare const _netSocketConnectRaw:
  | NetSocketConnectRawBridgeRef
  | undefined;

declare const _netSocketWriteRaw:
  | NetSocketWriteRawBridgeRef
  | undefined;

declare const _netSocketEndRaw:
  | NetSocketEndRawBridgeRef
  | undefined;

declare const _netSocketDestroyRaw:
  | NetSocketDestroyRawBridgeRef
  | undefined;

declare const _netSocketUpgradeTlsRaw:
  | NetSocketUpgradeTlsRawBridgeRef
  | undefined;

declare const _upgradeSocketWriteRaw:
  | UpgradeSocketWriteRawBridgeRef
  | undefined;

declare const _upgradeSocketEndRaw:
  | UpgradeSocketEndRawBridgeRef
  | undefined;

declare const _upgradeSocketDestroyRaw:
  | UpgradeSocketDestroyRawBridgeRef
  | undefined;

declare const _registerHandle:
  | RegisterHandleBridgeFn
  | undefined;

declare const _unregisterHandle:
  | UnregisterHandleBridgeFn
  | undefined;

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

interface FetchResponseBody {
  getReader(): { read(): Promise<{ value: Uint8Array | undefined; done: boolean }>; releaseLock(): void; cancel?(): Promise<void> };
  locked: boolean;
  cancel(): Promise<void>;
  pipeTo(): Promise<void>;
  pipeThrough<T>(transform: { readable: T }): T;
  tee(): [FetchResponseBody, FetchResponseBody];
  [Symbol.asyncIterator]?(): AsyncIterableIterator<Uint8Array>;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Map<string, string>;
  url: string;
  redirected: boolean;
  type: string;
  body: FetchResponseBody;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<never>;
  clone(): FetchResponse;
}

// Fetch polyfill
export async function fetch(input: string | URL | Request, options: FetchOptions = {}): Promise<FetchResponse> {
  if (typeof _networkFetchRaw === 'undefined') {
    console.error('fetch requires NetworkAdapter to be configured');
    throw new Error('fetch requires NetworkAdapter to be configured');
  }

  // Extract URL and options from Request object (used by axios fetch adapter)
  let resolvedUrl: string;
  if (input instanceof Request) {
    resolvedUrl = input.url;
    options = {
      method: input.method,
      headers: Object.fromEntries(input.headers.entries()),
      body: input.body,
      ...options,
    };
  } else {
    resolvedUrl = String(input);
  }

  // Normalize headers: Headers instances and Map-like objects are not JSON-serializable.
  // Convert to a plain Record<string, string> for the bridge.
  let rawHeaders: Record<string, string> = {};
  const h = options.headers;
  if (h) {
    if (typeof h.entries === 'function') {
      // Headers instance, Map, or any iterable with entries()
      for (const [k, v] of (h as any).entries()) {
        rawHeaders[k] = v;
      }
    } else if (typeof h === 'object') {
      rawHeaders = h as Record<string, string>;
    }
  }

  const optionsJson = JSON.stringify({
    method: options.method || "GET",
    headers: rawHeaders,
    body: options.body || null,
  });

  const responseJson = await _networkFetchRaw.apply(undefined, [resolvedUrl, optionsJson], {
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

  // Build a ReadableStream-like body from the complete response text
  const bodyText = response.body || "";
  const bodyBytes = new TextEncoder().encode(bodyText);
  let bodyRead = false;

  // Minimal ReadableStream-like body that delivers the complete response as a single chunk.
  //
  // Key design constraints for V8 sidecar compatibility:
  // 1. read() returns Promise.resolve() (not async function) to minimize microtask ticks
  // 2. Implements Symbol.asyncIterator for direct consumption by the Anthropic SDK's
  //    ReadableStreamToAsyncIterable (avoids an extra async wrapper layer)
  // 3. The async generator uses a simple yield (not nested for-await) to avoid deep
  //    microtask chains that can stall in V8's event loop between modules
  const body: FetchResponseBody = {
    getReader() {
      let readerDone = bodyRead;
      return {
        read(): Promise<{ value: Uint8Array | undefined; done: boolean }> {
          if (readerDone) return Promise.resolve({ value: undefined, done: true });
          readerDone = true;
          bodyRead = true;
          return Promise.resolve({ value: bodyBytes, done: false });
        },
        releaseLock() {},
        cancel() { return Promise.resolve(); },
      };
    },
    // Direct async iteration — SDK's ReadableStreamToAsyncIterable returns this
    // immediately when it detects Symbol.asyncIterator, avoiding the reader wrapper.
    // Uses explicit next()/return() protocol instead of async generator to minimize
    // microtask chains (async generators create extra Promise wrapping that can stall
    // in V8 sidecar's event loop between loaded ESM modules).
    [Symbol.asyncIterator]() {
      let iterDone = bodyRead;
      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (iterDone) return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true });
          iterDone = true;
          bodyRead = true;
          return Promise.resolve({ value: bodyBytes, done: false });
        },
        return(): Promise<IteratorResult<Uint8Array>> {
          iterDone = true;
          return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true });
        },
        [Symbol.asyncIterator]() { return this; },
      };
    },
    locked: false,
    cancel() { return Promise.resolve(); },
    pipeTo() { return Promise.resolve(); },
    pipeThrough<T>(transform: { readable: T }): T { return transform.readable; },
    tee(): [FetchResponseBody, FetchResponseBody] { return [body, body]; },
  };

  // Create Response-like object
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: new Map(Object.entries(response.headers || {})),
    url: response.url || resolvedUrl,
    redirected: response.redirected || false,
    type: "basic",
    body,

    async text(): Promise<string> {
      return bodyText;
    },
    async json(): Promise<unknown> {
      return JSON.parse(bodyText || "{}");
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength);
    },
    async blob(): Promise<never> {
      throw new Error("Blob not supported in sandbox");
    },
    clone(): FetchResponse {
      return { ...this } as FetchResponse;
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

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  keys(): IterableIterator<string> {
    return Object.keys(this._headers)[Symbol.iterator]();
  }

  values(): IterableIterator<string> {
    return Object.values(this._headers)[Symbol.iterator]();
  }

  append(name: string, value: string): void {
    const key = name.toLowerCase();
    if (key in this._headers) {
      this._headers[key] = this._headers[key] + ", " + value;
    } else {
      this._headers[key] = value;
    }
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
    return new Request(this.url, this as unknown as FetchOptions);
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

  get body(): { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null {
    const bodyStr = this._body;
    if (bodyStr === null) return null;
    return {
      getReader() {
        let consumed = false;
        return {
          async read() {
            if (consumed) return { done: true };
            consumed = true;
            const encoder = new TextEncoder();
            return { done: false, value: encoder.encode(bodyStr) };
          },
        };
      },
    };
  }

  clone(): Response {
    return new Response(this._body, { status: this.status, statusText: this.statusText });
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
    dns.lookup(hostname, (err: Error | null, address?: string) => {
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
};

// Event listener type
type EventListener = (...args: unknown[]) => void;

// Module-level globalAgent used by ClientRequest when no agent option is provided.
// Initialized lazily after Agent class is defined; set by createHttpModule().
let _moduleGlobalAgent: { _acquireSlot(key: string): Promise<void>; _releaseSlot(key: string): void; _getHostKey(options: { hostname?: string; host?: string; port?: string | number }): string } | null = null;

/**
 * Polyfill of Node.js `http.IncomingMessage` (client-side response). Buffers
 * the response body eagerly and emits `data`/`end` events on listener
 * registration (flowing mode). Supports base64 binary decoding via
 * `x-body-encoding` header.
 */
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

  constructor(response?: { headers?: Record<string, string>; url?: string; status?: number; statusText?: string; body?: string; trailers?: Record<string, string> }) {
    this.headers = response?.headers || {};
    this.rawHeaders = [];
    if (this.headers && typeof this.headers === "object") {
      Object.entries(this.headers).forEach(([k, v]) => {
        this.rawHeaders.push(k, v);
      });
    }
    // Populate trailers if provided
    if (response?.trailers && typeof response.trailers === "object") {
      this.trailers = response.trailers;
      this.rawTrailers = [];
      Object.entries(response.trailers).forEach(([k, v]) => {
        this.rawTrailers.push(k, v);
      });
    } else {
      this.trailers = {};
      this.rawTrailers = [];
    }
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

/**
 * Polyfill of Node.js `http.ClientRequest`. Executes the request asynchronously
 * via the `_networkHttpRequestRaw` bridge and emits a `response` event with
 * an IncomingMessage. Supports Agent-based connection pooling, socket events,
 * HTTP upgrade (101), and trailer headers.
 */
export class ClientRequest {
  private _options: nodeHttp.RequestOptions;
  private _callback?: (res: IncomingMessage) => void;
  private _listeners: Record<string, EventListener[]> = {};
  private _body = "";
  private _bodyBytes = 0;
  private _ended = false;
  private _agent: { _acquireSlot(key: string): Promise<void>; _releaseSlot(key: string): void; _getHostKey(options: { hostname?: string; host?: string; port?: string | number }): string } | null;
  private _hostKey: string;
  socket: FakeSocket;
  finished = false;
  aborted = false;

  constructor(options: nodeHttp.RequestOptions, callback?: (res: IncomingMessage) => void) {
    this._options = options;
    this._callback = callback;

    // Resolve agent: false = no agent, undefined = globalAgent, or explicit Agent
    const agentOpt = options.agent;
    if (agentOpt === false) {
      this._agent = null;
    } else if (agentOpt instanceof Agent) {
      this._agent = agentOpt;
    } else {
      this._agent = _moduleGlobalAgent;
    }
    this._hostKey = this._agent ? this._agent._getHostKey(options as { hostname?: string; host?: string; port?: string | number }) : "";

    // Create socket-like object and emit 'socket' event
    this.socket = new FakeSocket({
      host: (options.hostname || options.host || "localhost") as string,
      port: Number(options.port) || 80,
    });
    Promise.resolve().then(() => this._emit("socket", this.socket));

    // Execute request asynchronously
    Promise.resolve().then(() => this._execute());
  }

  private async _execute(): Promise<void> {
    // Acquire agent slot before executing
    if (this._agent) {
      await this._agent._acquireSlot(this._hostKey);
    }

    try {
      if (typeof _networkHttpRequestRaw === 'undefined') {
        console.error('http/https request requires NetworkAdapter to be configured');
        throw new Error('http/https request requires NetworkAdapter to be configured');
      }

      const url = this._buildUrl();
      const tls: Record<string, unknown> = {};
      if ((this._options as Record<string, unknown>).rejectUnauthorized !== undefined) {
        tls.rejectUnauthorized = (this._options as Record<string, unknown>).rejectUnauthorized;
      }
      const optionsJson = JSON.stringify({
        method: this._options.method || "GET",
        headers: this._options.headers || {},
        body: this._body || null,
        ...tls,
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
        trailers?: Record<string, string>;
        upgradeSocketId?: number;
      };

      this.finished = true;

      // 101 Switching Protocols → fire 'upgrade' event
      if (response.status === 101) {
        const res = new IncomingMessage(response);
        // Use UpgradeSocket for bidirectional data relay when socketId is available
        let socket: FakeSocket | UpgradeSocket = this.socket;
        if (response.upgradeSocketId != null) {
          socket = new UpgradeSocket(response.upgradeSocketId, {
            host: this._options.hostname as string,
            port: Number(this._options.port) || 80,
          });
          upgradeSocketInstances.set(response.upgradeSocketId, socket);
        }
        const head = typeof Buffer !== "undefined"
          ? (response.body ? Buffer.from(response.body, "base64") : Buffer.alloc(0))
          : new Uint8Array(0);
        this._emit("upgrade", res, socket, head);
        return;
      }

      const res = new IncomingMessage(response);

      if (this._callback) {
        this._callback(res);
      }
      this._emit("response", res);
    } catch (err) {
      this._emit("error", err);
    } finally {
      // Release agent slot
      if (this._agent) {
        this._agent._releaseSlot(this._hostKey);
      }
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
    const addedBytes = typeof Buffer !== "undefined" ? Buffer.byteLength(data) : data.length;
    if (this._bodyBytes + addedBytes > MAX_HTTP_BODY_BYTES) {
      throw new Error("ERR_HTTP_BODY_TOO_LARGE: request body exceeds " + MAX_HTTP_BODY_BYTES + " byte limit");
    }
    this._body += data;
    this._bodyBytes += addedBytes;
    return true;
  }

  end(data?: string): this {
    if (data) this.write(data);
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

// Minimal socket-like object emitted by ClientRequest 'socket' event
class FakeSocket {
  remoteAddress: string;
  remotePort: number;
  localAddress = "127.0.0.1";
  localPort = 0;
  connecting = false;
  destroyed = false;
  writable = true;
  readable = true;
  private _listeners: Record<string, EventListener[]> = {};

  constructor(options?: { host?: string; port?: number }) {
    this.remoteAddress = options?.host || "127.0.0.1";
    this.remotePort = options?.port || 80;
  }

  setTimeout(_ms: number, _cb?: () => void): this { return this; }
  setNoDelay(_noDelay?: boolean): this { return this; }
  setKeepAlive(_enable?: boolean, _delay?: number): this { return this; }

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

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const handlers = this._listeners[event];
    if (handlers) handlers.slice().forEach((fn) => fn(...args));
    return handlers !== undefined && handlers.length > 0;
  }

  write(_data: unknown): boolean { return true; }
  end(): this { return this; }

  destroy(): this {
    this.destroyed = true;
    this.writable = false;
    this.readable = false;
    return this;
  }
}

// HTTP Agent with connection pooling via maxSockets
class Agent {
  maxSockets: number;
  maxFreeSockets: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  timeout: number;
  requests: Record<string, unknown[]>;
  sockets: Record<string, unknown[]>;
  freeSockets: Record<string, unknown[]>;

  // Per-host active count and pending queue
  private _activeCounts = new Map<string, number>();
  private _queues = new Map<string, Array<() => void>>();

  constructor(options?: {
    keepAlive?: boolean;
    keepAliveMsecs?: number;
    maxSockets?: number;
    maxFreeSockets?: number;
    timeout?: number;
  }) {
    this.keepAlive = options?.keepAlive ?? false;
    this.keepAliveMsecs = options?.keepAliveMsecs ?? 1000;
    this.maxSockets = options?.maxSockets ?? Infinity;
    this.maxFreeSockets = options?.maxFreeSockets ?? 256;
    this.timeout = options?.timeout ?? -1;
    this.requests = {};
    this.sockets = {};
    this.freeSockets = {};
  }

  _getHostKey(options: { hostname?: string; host?: string; port?: string | number }): string {
    const host = options.hostname || options.host || "localhost";
    const port = options.port || 80;
    return `${host}:${port}`;
  }

  // Wait for an available slot; resolves immediately if under maxSockets
  _acquireSlot(hostKey: string): Promise<void> {
    const active = this._activeCounts.get(hostKey) || 0;
    if (active < this.maxSockets) {
      this._activeCounts.set(hostKey, active + 1);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let queue = this._queues.get(hostKey);
      if (!queue) {
        queue = [];
        this._queues.set(hostKey, queue);
      }
      queue.push(resolve);
    });
  }

  // Release a slot; dequeues next pending request if any
  _releaseSlot(hostKey: string): void {
    const queue = this._queues.get(hostKey);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this._queues.delete(hostKey);
      next();
    } else {
      const active = this._activeCounts.get(hostKey) || 1;
      const next = active - 1;
      if (next <= 0) this._activeCounts.delete(hostKey);
      else this._activeCounts.set(hostKey, next);
    }
  }

  destroy(): void {
    this._activeCounts.clear();
    for (const [, queue] of this._queues) {
      queue.length = 0;
    }
    this._queues.clear();
  }
}

interface ServerAddress {
  address: string;
  family: string;
  port: number;
}

interface SerializedServerListenResult {
  address: ServerAddress | null;
}

interface SerializedServerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  bodyBase64?: string;
}

interface SerializedServerResponse {
  status: number;
  headers?: Array<[string, string]>;
  body?: string;
  bodyEncoding?: "utf8" | "base64";
}

let nextServerId = 1;
const serverRequestListeners = new Map<
  number,
  (incoming: ServerIncomingMessage, outgoing: ServerResponseBridge) => unknown
>();
// Server instances indexed by serverId — used by upgrade dispatch to emit 'upgrade' events
const serverInstances = new Map<number, Server>();

class ServerIncomingMessage {
  headers: Record<string, string>;
  rawHeaders: string[];
  method: string;
  url: string;
  socket: Record<string, unknown>;
  connection: Record<string, unknown>;
  rawBody?: Buffer;
  destroyed = false;
  errored?: Error;
  readable = true;
  httpVersion = "1.1";
  httpVersionMajor = 1;
  httpVersionMinor = 1;
  complete = true;
  // Readable stream state stub for frameworks that inspect internal state
  _readableState = { flowing: null, length: 0, ended: false, objectMode: false };
  private _listeners: Record<string, EventListener[]> = {};

  constructor(request: SerializedServerRequest) {
    this.headers = request.headers || {};
    this.rawHeaders = request.rawHeaders || [];
    if (!Array.isArray(this.rawHeaders) || this.rawHeaders.length % 2 !== 0) {
      this.rawHeaders = [];
    }
    this.method = request.method || "GET";
    this.url = request.url || "/";
    const fakeSocket: Record<string, unknown> = {
      encrypted: false,
      remoteAddress: "127.0.0.1",
      remotePort: 0,
      writable: true,
      on() { return fakeSocket; },
      once() { return fakeSocket; },
      removeListener() { return fakeSocket; },
      destroy() {},
      end() {},
    };
    this.socket = fakeSocket;
    this.connection = fakeSocket;
    const rawHost = this.headers.host;
    if (typeof rawHost === "string" && rawHost.includes(",")) {
      this.headers.host = rawHost.split(",")[0].trim();
    }
    if (!this.headers.host) {
      this.headers.host = "127.0.0.1";
    }
    if (this.rawHeaders.length === 0) {
      Object.entries(this.headers).forEach(([key, value]) => {
        this.rawHeaders.push(key, value);
      });
    }
    if (request.bodyBase64 && typeof Buffer !== "undefined") {
      this.rawBody = Buffer.from(request.bodyBase64, "base64");
    }
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapped = (...args: unknown[]): void => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: EventListener): this {
    const listeners = this._listeners[event];
    if (!listeners) return this;
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
    return this;
  }

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this._listeners[event];
    if (!listeners || listeners.length === 0) return false;
    listeners.slice().forEach((fn) => fn(...args));
    return true;
  }

  // Readable stream stubs for framework compatibility
  unpipe(): this { return this; }
  pause(): this { return this; }
  resume(): this { return this; }
  read(): null { return null; }
  pipe(dest: unknown): unknown { return dest; }
  isPaused(): boolean { return false; }
  setEncoding(): this { return this; }

  destroy(err?: Error): this {
    this.destroyed = true;
    this.errored = err;
    if (err) {
      this.emit("error", err);
    }
    this.emit("close");
    return this;
  }
}

/**
 * Sandbox-side response writer for HTTP server requests. Collects headers and
 * body chunks, then serializes to JSON for transfer back to the host.
 */
class ServerResponseBridge {
  statusCode = 200;
  statusMessage = "OK";
  headersSent = false;
  writable = true;
  writableFinished = false;
  private _headers = new Map<string, string>();
  private _chunks: Uint8Array[] = [];
  private _chunksBytes = 0;
  private _listeners: Record<string, EventListener[]> = {};
  private _closedPromise: Promise<void>;
  private _resolveClosed: (() => void) | null = null;

  constructor() {
    this._closedPromise = new Promise<void>((resolve) => {
      this._resolveClosed = resolve;
    });
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapped = (...args: unknown[]): void => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: EventListener): this {
    const listeners = this._listeners[event];
    if (!listeners) return this;
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
    return this;
  }

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this._listeners[event];
    if (!listeners || listeners.length === 0) return false;
    listeners.slice().forEach((fn) => fn(...args));
    return true;
  }

  private _emit(event: string, ...args: unknown[]): void {
    this.emit(event, ...args);
  }

  writeHead(
    statusCode: number,
    headers?: Record<string, string> | Array<[string, string]>
  ): this {
    this.statusCode = statusCode;
    if (headers) {
      if (Array.isArray(headers)) {
        headers.forEach(([key, value]) => this.setHeader(key, value));
      } else {
        Object.entries(headers).forEach(([key, value]) =>
          this.setHeader(key, value)
        );
      }
    }
    this.headersSent = true;
    return this;
  }

  setHeader(name: string, value: string | number | string[]): this {
    const normalized = Array.isArray(value) ? value.join(", ") : String(value);
    this._headers.set(name.toLowerCase(), normalized);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this._headers.get(name.toLowerCase());
  }

  hasHeader(name: string): boolean {
    return this._headers.has(name.toLowerCase());
  }

  removeHeader(name: string): void {
    this._headers.delete(name.toLowerCase());
  }

  write(chunk: string | Uint8Array | null): boolean {
    if (chunk == null) return true;
    this.headersSent = true;
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (this._chunksBytes + buf.byteLength > MAX_HTTP_BODY_BYTES) {
      throw new Error("ERR_HTTP_BODY_TOO_LARGE: response body exceeds " + MAX_HTTP_BODY_BYTES + " byte limit");
    }
    this._chunks.push(buf);
    this._chunksBytes += buf.byteLength;
    return true;
  }

  end(chunk?: string | Uint8Array | null): this {
    if (chunk != null) {
      this.write(chunk);
    }
    this._finalize();
    return this;
  }

  getHeaderNames(): string[] {
    return Array.from(this._headers.keys());
  }

  getHeaders(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of this._headers) result[key] = value;
    return result;
  }

  // Writable stream state stub for frameworks that inspect internal state
  _writableState = { length: 0, ended: false, finished: false, objectMode: false, corked: 0 };

  // Fake socket for frameworks that access res.socket/res.connection
  socket = {
    writable: true,
    on: () => this.socket,
    once: () => this.socket,
    removeListener: () => this.socket,
    destroy: () => {},
    end: () => {},
    cork: () => {},
    uncork: () => {},
    write: () => true,
  } as Record<string, unknown>;
  connection = this.socket;

  // Node.js http.ServerResponse socket/stream compatibility stubs
  assignSocket(): void { /* no-op */ }
  detachSocket(): void { /* no-op */ }
  writeContinue(): void { /* no-op */ }
  writeProcessing(): void { /* no-op */ }
  addTrailers(): void { /* no-op */ }
  cork(): void { /* no-op */ }
  uncork(): void { /* no-op */ }
  setTimeout(_msecs?: number): this { return this; }

  flushHeaders(): void {
    this.headersSent = true;
  }

  destroy(err?: Error): void {
    if (err) {
      this._emit("error", err);
    }
    this._finalize();
  }

  async waitForClose(): Promise<void> {
    await this._closedPromise;
  }

  serialize(): SerializedServerResponse {
    const bodyBuffer =
      this._chunks.length > 0 ? Buffer.concat(this._chunks) : Buffer.alloc(0);
    return {
      status: this.statusCode,
      headers: Array.from(this._headers.entries()),
      body: bodyBuffer.toString("base64"),
      bodyEncoding: "base64",
    };
  }

  private _finalize(): void {
    if (this.writableFinished) {
      return;
    }
    this.writableFinished = true;
    this.writable = false;
    this._emit("finish");
    this._emit("close");
    this._resolveClosed?.();
    this._resolveClosed = null;
  }
}

/**
 * Polyfill of Node.js `http.Server`. Delegates actual listening to the host
 * via the `_networkHttpServerListenRaw` bridge. Incoming requests are
 * dispatched through `_httpServerDispatch` which invokes the request listener
 * inside the isolate. Registers an active handle to keep the sandbox alive.
 */
class Server {
  listening = false;
  private _listeners: Record<string, EventListener[]> = {};
  private _serverId: number;
  private _listenPromise: Promise<void> | null = null;
  private _address: ServerAddress | null = null;
  private _handleId: string | null = null;

  constructor(requestListener?: (req: ServerIncomingMessage, res: ServerResponseBridge) => unknown) {
    this._serverId = nextServerId++;
    if (requestListener) {
      serverRequestListeners.set(this._serverId, requestListener);
    } else {
      serverRequestListeners.set(this._serverId, () => undefined);
    }
    serverInstances.set(this._serverId, this);
  }

  /** @internal Emit an event — used by upgrade dispatch to fire 'upgrade' events. */
  _emit(event: string, ...args: unknown[]): void {
    const listeners = this._listeners[event];
    if (!listeners || listeners.length === 0) return;
    listeners.slice().forEach((listener) => listener(...args));
  }

  private async _start(port?: number, hostname?: string): Promise<void> {
    if (typeof _networkHttpServerListenRaw === "undefined") {
      throw new Error(
        "http.createServer requires NetworkAdapter.httpServerListen support"
      );
    }

    const resultJson = await _networkHttpServerListenRaw.apply(
      undefined,
      [JSON.stringify({ serverId: this._serverId, port, hostname })],
      { result: { promise: true } }
    );
    const result = JSON.parse(resultJson) as SerializedServerListenResult;
    this._address = result.address;
    this.listening = true;
    this._handleId = `http-server:${this._serverId}`;
    if (typeof _registerHandle === "function") {
      _registerHandle(this._handleId, "http server");
    }
  }

  listen(
    portOrCb?: number | (() => void),
    hostOrCb?: string | (() => void),
    cb?: () => void
  ): this {
    const port = typeof portOrCb === "number" ? portOrCb : undefined;
    const hostname = typeof hostOrCb === "string" ? hostOrCb : undefined;
    const callback =
      typeof cb === "function"
        ? cb
        : typeof hostOrCb === "function"
          ? hostOrCb
          : typeof portOrCb === "function"
            ? portOrCb
            : undefined;

    if (!this._listenPromise) {
      this._listenPromise = this._start(port, hostname)
        .then(() => {
          this._emit("listening");
          callback?.();
        })
        .catch((error) => {
          this._emit("error", error);
        });
    }
    return this;
  }

  close(cb?: (err?: Error) => void): this {
    const run = async () => {
      try {
        if (this._listenPromise) {
          await this._listenPromise;
        }
        if (this.listening && typeof _networkHttpServerCloseRaw !== "undefined") {
          await _networkHttpServerCloseRaw.apply(undefined, [this._serverId], {
            result: { promise: true },
          });
        }
        this.listening = false;
        this._address = null;
        serverInstances.delete(this._serverId);
        if (this._handleId && typeof _unregisterHandle === "function") {
          _unregisterHandle(this._handleId);
        }
        this._handleId = null;
        cb?.();
        this._emit("close");
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        cb?.(error);
        this._emit("error", error);
      }
    };
    void run();
    return this;
  }

  address(): ServerAddress | null {
    return this._address;
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapped = (...args: unknown[]): void => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: EventListener): this {
    const listeners = this._listeners[event];
    if (!listeners) return this;
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
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

  // Node.js Server timeout properties (no-op in sandbox)
  keepAliveTimeout = 5000;
  requestTimeout = 300000;
  headersTimeout = 60000;
  timeout = 0;
  maxRequestsPerSocket = 0;

  setTimeout(_msecs?: number, _callback?: () => void): this {
    if (typeof _msecs === "number") this.timeout = _msecs;
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

/** Route an incoming HTTP request to the server's request listener and return the serialized response. */
async function dispatchServerRequest(
  serverId: number,
  requestJson: string
): Promise<string> {
  const listener = serverRequestListeners.get(serverId);
  if (!listener) {
    throw new Error(`Unknown HTTP server: ${serverId}`);
  }

  const request = JSON.parse(requestJson) as SerializedServerRequest;
  const incoming = new ServerIncomingMessage(request);
  const outgoing = new ServerResponseBridge();

  try {
    // Call listener synchronously — frameworks register event handlers here
    const listenerResult = listener(incoming, outgoing);

    // Emit readable stream events so body-parsing middleware (e.g. express.json()) can proceed
    if (incoming.rawBody && incoming.rawBody.length > 0) {
      incoming.emit("data", incoming.rawBody);
    }
    incoming.emit("end");

    await Promise.resolve(listenerResult);
  } catch (err) {
    outgoing.statusCode = 500;
    try {
      outgoing.end(err instanceof Error ? `Error: ${err.message}` : "Error");
    } catch {
      // Body cap may prevent writing error — finalize without data
      if (!outgoing.writableFinished) outgoing.end();
    }
  }

  if (!outgoing.writableFinished) {
    outgoing.end();
  }

  await outgoing.waitForClose();
  return JSON.stringify(outgoing.serialize());
}

// Upgrade socket for bidirectional data relay through the host bridge
const upgradeSocketInstances = new Map<number, UpgradeSocket>();

class UpgradeSocket {
  remoteAddress: string;
  remotePort: number;
  localAddress = "127.0.0.1";
  localPort = 0;
  connecting = false;
  destroyed = false;
  writable = true;
  readable = true;
  readyState = "open";
  bytesWritten = 0;
  private _listeners: Record<string, EventListener[]> = {};
  private _socketId: number;

  // Readable stream state stub for ws compatibility (socketOnClose checks _readableState.endEmitted)
  _readableState = { endEmitted: false };
  _writableState = { finished: false, errorEmitted: false };

  constructor(socketId: number, options?: { host?: string; port?: number }) {
    this._socketId = socketId;
    this.remoteAddress = options?.host || "127.0.0.1";
    this.remotePort = options?.port || 80;
  }

  setTimeout(_ms: number, _cb?: () => void): this { return this; }
  setNoDelay(_noDelay?: boolean): this { return this; }
  setKeepAlive(_enable?: boolean, _delay?: number): this { return this; }
  ref(): this { return this; }
  unref(): this { return this; }
  cork(): void {}
  uncork(): void {}
  pause(): this { return this; }
  resume(): this { return this; }
  address(): { address: string; family: string; port: number } {
    return { address: this.localAddress, family: "IPv4", port: this.localPort };
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  addListener(event: string, listener: EventListener): this {
    return this.on(event, listener);
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
    if (handlers) handlers.slice().forEach((fn) => fn.call(this, ...args));
    return handlers !== undefined && handlers.length > 0;
  }

  listenerCount(event: string): number {
    return this._listeners[event]?.length || 0;
  }

  // Allow arbitrary property assignment (used by ws for Symbol properties)
  [key: string | symbol]: unknown;

  write(data: unknown, encodingOrCb?: string | (() => void), cb?: (() => void)): boolean {
    if (this.destroyed) return false;
    const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb;
    if (typeof _upgradeSocketWriteRaw !== "undefined") {
      let base64: string;
      if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
        base64 = data.toString("base64");
      } else if (typeof data === "string") {
        base64 = typeof Buffer !== "undefined" ? Buffer.from(data).toString("base64") : btoa(data);
      } else if (data instanceof Uint8Array) {
        base64 = typeof Buffer !== "undefined" ? Buffer.from(data).toString("base64") : btoa(String.fromCharCode(...data));
      } else {
        base64 = typeof Buffer !== "undefined" ? Buffer.from(String(data)).toString("base64") : btoa(String(data));
      }
      this.bytesWritten += base64.length;
      _upgradeSocketWriteRaw.applySync(undefined, [this._socketId, base64]);
    }
    if (callback) callback();
    return true;
  }

  end(data?: unknown): this {
    if (data) this.write(data);
    if (typeof _upgradeSocketEndRaw !== "undefined" && !this.destroyed) {
      _upgradeSocketEndRaw.applySync(undefined, [this._socketId]);
    }
    this.writable = false;
    this.emit("finish");
    return this;
  }

  destroy(err?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.writable = false;
    this.readable = false;
    this._readableState.endEmitted = true;
    this._writableState.finished = true;
    if (typeof _upgradeSocketDestroyRaw !== "undefined") {
      _upgradeSocketDestroyRaw.applySync(undefined, [this._socketId]);
    }
    upgradeSocketInstances.delete(this._socketId);
    if (err) this.emit("error", err);
    this.emit("close", false);
    return this;
  }

  // Push data received from the host into this socket
  _pushData(data: Buffer | Uint8Array): void {
    this.emit("data", data);
  }

  // Signal end-of-stream from the host
  _pushEnd(): void {
    this.readable = false;
    this._readableState.endEmitted = true;
    this._writableState.finished = true;
    this.emit("end");
    this.emit("close", false);
    upgradeSocketInstances.delete(this._socketId);
  }
}

/** Route an incoming HTTP upgrade to the server's 'upgrade' event listeners. */
function dispatchUpgradeRequest(
  serverId: number,
  requestJson: string,
  headBase64: string,
  socketId: number
): void {
  const server = serverInstances.get(serverId);
  if (!server) {
    throw new Error(`Unknown HTTP server for upgrade: ${serverId}`);
  }

  const request = JSON.parse(requestJson) as SerializedServerRequest;
  const incoming = new ServerIncomingMessage(request);
  const head = typeof Buffer !== "undefined" ? Buffer.from(headBase64, "base64") : new Uint8Array(0);

  const socket = new UpgradeSocket(socketId, {
    host: incoming.headers["host"]?.split(":")[0] || "127.0.0.1",
  });
  upgradeSocketInstances.set(socketId, socket);

  // Emit 'upgrade' on the server — ws.WebSocketServer listens for this
  server._emit("upgrade", incoming, socket, head);
}

/** Push data from host to an upgrade socket. */
function onUpgradeSocketData(socketId: number, dataBase64: string): void {
  const socket = upgradeSocketInstances.get(socketId);
  if (socket) {
    const data = typeof Buffer !== "undefined" ? Buffer.from(dataBase64, "base64") : new Uint8Array(0);
    socket._pushData(data);
  }
}

/** Signal end-of-stream from host to an upgrade socket. */
function onUpgradeSocketEnd(socketId: number): void {
  const socket = upgradeSocketInstances.get(socketId);
  if (socket) {
    socket._pushEnd();
  }
}

// Function-based ServerResponse constructor — allows .call() inheritance
// used by light-my-request (Fastify's inject), which does
// http.ServerResponse.call(this, req) + util.inherits(Response, http.ServerResponse)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ServerResponseCallable(this: any): void {
  this.statusCode = 200;
  this.statusMessage = "OK";
  this.headersSent = false;
  this.writable = true;
  this.writableFinished = false;
  this._headers = new Map<string, string>();
  this._chunks = [] as Uint8Array[];
  this._chunksBytes = 0;
  this._listeners = {} as Record<string, EventListener[]>;
  this._closedPromise = new Promise<void>((resolve) => {
    this._resolveClosed = resolve;
  });
  // Writable stream state stub
  this._writableState = { length: 0, ended: false, finished: false, objectMode: false, corked: 0 };
  // Fake socket for frameworks/inject libraries that access res.socket
  const fakeSocket = {
    writable: true,
    on() { return fakeSocket; },
    once() { return fakeSocket; },
    removeListener() { return fakeSocket; },
    destroy() {},
    end() {},
    cork() {},
    uncork() {},
    write() { return true; },
  };
  this.socket = fakeSocket;
  this.connection = fakeSocket;
}
ServerResponseCallable.prototype = Object.create(ServerResponseBridge.prototype, {
  constructor: { value: ServerResponseCallable, writable: true, configurable: true },
});

// Create HTTP module
function createHttpModule(protocol: string): Record<string, unknown> {
  const defaultProtocol = protocol === "https" ? "https:" : "http:";
  const moduleAgent = new Agent({ keepAlive: false });
  // Set module-level globalAgent so ClientRequest defaults to it
  _moduleGlobalAgent = moduleAgent;

  // Ensure protocol is set on request options (defaults to module protocol)
  function ensureProtocol(opts: nodeHttp.RequestOptions): nodeHttp.RequestOptions {
    if (!opts.protocol) return { ...opts, protocol: defaultProtocol };
    return opts;
  }

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
      return new ClientRequest(ensureProtocol(opts), callback as (res: IncomingMessage) => void);
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
      const req = new ClientRequest(ensureProtocol(opts), callback as (res: IncomingMessage) => void);
      req.end();
      return req;
    },

    createServer(
      _optionsOrListener?: unknown,
      maybeListener?: (req: ServerIncomingMessage, res: ServerResponseBridge) => void
    ): Server {
      const listener =
        typeof _optionsOrListener === "function"
          ? (_optionsOrListener as (
              req: ServerIncomingMessage,
              res: ServerResponseBridge
            ) => void)
          : maybeListener;
      return new Server(listener);
    },

    Agent,
    globalAgent: moduleAgent,
    Server: Server as unknown as typeof nodeHttp.Server,
    ServerResponse: ServerResponseCallable as unknown as typeof nodeHttp.ServerResponse,
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
export const http2 = {
  Http2ServerRequest: class Http2ServerRequest {},
  Http2ServerResponse: class Http2ServerResponse {},
  constants: {
    HTTP2_HEADER_METHOD: ":method",
    HTTP2_HEADER_PATH: ":path",
    HTTP2_HEADER_SCHEME: ":scheme",
    HTTP2_HEADER_AUTHORITY: ":authority",
    HTTP2_HEADER_STATUS: ":status",
    HTTP2_HEADER_CONTENT_TYPE: "content-type",
    HTTP2_HEADER_CONTENT_LENGTH: "content-length",
    HTTP2_HEADER_ACCEPT: "accept",
    HTTP2_HEADER_ACCEPT_ENCODING: "accept-encoding",
    HTTP2_METHOD_GET: "GET",
    HTTP2_METHOD_POST: "POST",
    HTTP2_METHOD_PUT: "PUT",
    HTTP2_METHOD_DELETE: "DELETE",
    NGHTTP2_NO_ERROR: 0,
    NGHTTP2_PROTOCOL_ERROR: 1,
    NGHTTP2_INTERNAL_ERROR: 2,
    NGHTTP2_REFUSED_STREAM: 7,
    NGHTTP2_CANCEL: 8,
  } as Record<string, string | number>,
  createServer(): never {
    throw new Error("http2.createServer is not supported in sandbox");
  },
  createSecureServer(): never {
    throw new Error("http2.createSecureServer is not supported in sandbox");
  },
};

// Export modules and make them available as globals for require()
exposeCustomGlobal("_httpModule", http);
exposeCustomGlobal("_httpsModule", https);
exposeCustomGlobal("_http2Module", http2);
exposeCustomGlobal("_dnsModule", dns);
exposeCustomGlobal("_httpServerDispatch", dispatchServerRequest);
exposeCustomGlobal("_httpServerUpgradeDispatch", dispatchUpgradeRequest);
exposeCustomGlobal("_upgradeSocketData", onUpgradeSocketData);
exposeCustomGlobal("_upgradeSocketEnd", onUpgradeSocketEnd);

// Harden fetch API globals (non-writable, non-configurable)
exposeCustomGlobal("fetch", fetch);
exposeCustomGlobal("Headers", Headers);
exposeCustomGlobal("Request", Request);
exposeCustomGlobal("Response", Response);
if (typeof (globalThis as Record<string, unknown>).Blob === "undefined") {
  // Minimal Blob stub used by server frameworks for instanceof checks.
  exposeCustomGlobal("Blob", class BlobStub {});
}
if (typeof (globalThis as Record<string, unknown>).FormData === "undefined") {
  // Minimal FormData stub — server frameworks check `instanceof FormData`.
  class FormDataStub {
    private _entries: [string, string][] = [];
    append(name: string, value: string): void {
      this._entries.push([name, value]);
    }
    get(name: string): string | null {
      const entry = this._entries.find(([k]) => k === name);
      return entry ? entry[1] : null;
    }
    getAll(name: string): string[] {
      return this._entries.filter(([k]) => k === name).map(([, v]) => v);
    }
    has(name: string): boolean {
      return this._entries.some(([k]) => k === name);
    }
    delete(name: string): void {
      this._entries = this._entries.filter(([k]) => k !== name);
    }
    entries(): IterableIterator<[string, string]> {
      return this._entries[Symbol.iterator]();
    }
    [Symbol.iterator](): IterableIterator<[string, string]> {
      return this.entries();
    }
  }
  exposeCustomGlobal("FormData", FormDataStub);
}

// ===================================================================
// net module — TCP socket support bridged to the host
// ===================================================================

type NetEventListener = (...args: unknown[]) => void;

// Track active sockets for dispatch routing
const activeNetSockets = new Map<number, NetSocket>();

// Dispatch callback invoked by the host when socket events arrive
function netSocketDispatch(socketId: number, event: string, data?: string): void {
  const socket = activeNetSockets.get(socketId);
  if (!socket) return;

  switch (event) {
    case "connect":
      socket._connected = true;
      socket.connecting = false;
      socket._emitNet("connect");
      socket._emitNet("ready");
      break;
    case "secureConnect":
      socket._emitNet("secureConnect");
      break;
    case "data": {
      const buf = typeof Buffer !== "undefined"
        ? Buffer.from(data!, "base64")
        : new Uint8Array(0);
      socket._emitNet("data", buf);
      break;
    }
    case "end":
      socket._emitNet("end");
      break;
    case "error":
      socket._emitNet("error", new Error(data ?? "socket error"));
      break;
    case "close":
      activeNetSockets.delete(socketId);
      socket._connected = false;
      socket.connecting = false;
      socket._emitNet("close");
      break;
  }
}

exposeCustomGlobal("_netSocketDispatch", netSocketDispatch);

class NetSocket {
  private _listeners: Record<string, NetEventListener[]> = {};
  private _onceListeners: Record<string, NetEventListener[]> = {};
  private _socketId = 0;
  _connected = false;
  connecting = false;
  destroyed = false;
  writable = true;
  readable = true;
  readableLength = 0;
  writableLength = 0;
  remoteAddress?: string;
  remotePort?: number;
  remoteFamily?: string;
  localAddress = "0.0.0.0";
  localPort = 0;
  localFamily = "IPv4";
  bytesRead = 0;
  bytesWritten = 0;
  bufferSize = 0;
  pending = true;
  allowHalfOpen = false;
  // Readable stream state stub for library compatibility
  _readableState = { endEmitted: false };

  constructor(options?: { allowHalfOpen?: boolean }) {
    if (options?.allowHalfOpen) this.allowHalfOpen = true;
  }

  connect(portOrOptions: number | { host?: string; port: number }, hostOrCallback?: string | (() => void), callback?: () => void): this {
    if (typeof _netSocketConnectRaw === "undefined") {
      throw new Error("net.Socket is not supported in sandbox (bridge not available)");
    }

    let host: string;
    let port: number;
    let cb: (() => void) | undefined;

    if (typeof portOrOptions === "object") {
      host = portOrOptions.host ?? "127.0.0.1";
      port = portOrOptions.port;
      cb = typeof hostOrCallback === "function" ? hostOrCallback : callback;
    } else {
      port = portOrOptions;
      host = typeof hostOrCallback === "string" ? hostOrCallback : "127.0.0.1";
      cb = typeof hostOrCallback === "function" ? hostOrCallback : callback;
    }

    if (cb) this.once("connect", cb);

    this.connecting = true;
    this.remoteAddress = host;
    this.remotePort = port;
    this.pending = false;

    this._socketId = _netSocketConnectRaw.applySync(undefined, [host, port]) as number;
    activeNetSockets.set(this._socketId, this);

    // Note: do NOT use _registerHandle for net sockets — _waitForActiveHandles()
    // blocks dispatch callbacks. Libraries use their own async patterns (Promises,
    // callbacks) which keep the execution alive via the script result promise.

    return this;
  }

  write(data: unknown, encodingOrCallback?: string | (() => void), callback?: () => void): boolean {
    if (typeof _netSocketWriteRaw === "undefined") return false;
    if (this.destroyed || !this._socketId) return false;

    let buf: Buffer;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (typeof data === "string") {
      const enc = typeof encodingOrCallback === "string" ? encodingOrCallback : "utf-8";
      buf = Buffer.from(data, enc as BufferEncoding);
    } else {
      buf = Buffer.from(data as Uint8Array);
    }

    const base64 = buf.toString("base64");
    this.bytesWritten += buf.length;
    _netSocketWriteRaw.applySync(undefined, [this._socketId, base64]);

    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (cb) cb();
    return true;
  }

  end(dataOrCallback?: unknown, encodingOrCallback?: string | (() => void), callback?: () => void): this {
    if (typeof dataOrCallback === "function") {
      this.once("finish", dataOrCallback as () => void);
    } else if (dataOrCallback != null) {
      this.write(dataOrCallback, encodingOrCallback, callback);
    }
    if (typeof _netSocketEndRaw !== "undefined" && this._socketId && !this.destroyed) {
      _netSocketEndRaw.applySync(undefined, [this._socketId]);
    }
    return this;
  }

  destroy(error?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.writable = false;
    this.readable = false;
    if (typeof _netSocketDestroyRaw !== "undefined" && this._socketId) {
      _netSocketDestroyRaw.applySync(undefined, [this._socketId]);
      activeNetSockets.delete(this._socketId);
    }
    if (error) {
      this._emitNet("error", error);
    }
    this._emitNet("close");
    return this;
  }

  setKeepAlive(_enable?: boolean, _initialDelay?: number): this { return this; }
  setNoDelay(_noDelay?: boolean): this { return this; }
  setTimeout(timeout: number, callback?: () => void): this {
    if (callback) this.once("timeout", callback);
    if (timeout === 0) return this;
    // Timeout not enforced — bridge manages socket lifecycle
    return this;
  }
  ref(): this { return this; }
  unref(): this { return this; }
  pause(): this { return this; }
  resume(): this { return this; }
  address(): { port: number; family: string; address: string } {
    return { port: this.localPort, family: this.localFamily, address: this.localAddress };
  }
  setEncoding(_encoding: string): this { return this; }
  pipe<T>(destination: T): T { return destination; }

  on(event: string, listener: NetEventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  addListener(event: string, listener: NetEventListener): this {
    return this.on(event, listener);
  }

  once(event: string, listener: NetEventListener): this {
    if (!this._onceListeners[event]) this._onceListeners[event] = [];
    this._onceListeners[event].push(listener);
    return this;
  }

  removeListener(event: string, listener: NetEventListener): this {
    const listeners = this._listeners[event];
    if (listeners) {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    }
    const onceListeners = this._onceListeners[event];
    if (onceListeners) {
      const idx = onceListeners.indexOf(listener);
      if (idx >= 0) onceListeners.splice(idx, 1);
    }
    return this;
  }

  off(event: string, listener: NetEventListener): this {
    return this.removeListener(event, listener);
  }

  removeAllListeners(event?: string): this {
    if (event) {
      delete this._listeners[event];
      delete this._onceListeners[event];
    } else {
      this._listeners = {};
      this._onceListeners = {};
    }
    return this;
  }

  listeners(event: string): NetEventListener[] {
    return [...(this._listeners[event] ?? []), ...(this._onceListeners[event] ?? [])];
  }

  listenerCount(event: string): number {
    return (this._listeners[event]?.length ?? 0) + (this._onceListeners[event]?.length ?? 0);
  }

  setMaxListeners(_n: number): this { return this; }
  getMaxListeners(): number { return 10; }
  prependListener(event: string, listener: NetEventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].unshift(listener);
    return this;
  }
  prependOnceListener(event: string, listener: NetEventListener): this {
    if (!this._onceListeners[event]) this._onceListeners[event] = [];
    this._onceListeners[event].unshift(listener);
    return this;
  }
  eventNames(): string[] {
    return [...new Set([...Object.keys(this._listeners), ...Object.keys(this._onceListeners)])];
  }
  rawListeners(event: string): NetEventListener[] {
    return this.listeners(event);
  }
  emit(event: string, ...args: unknown[]): boolean {
    return this._emitNet(event, ...args);
  }

  _emitNet(event: string, ...args: unknown[]): boolean {
    let handled = false;
    const listeners = this._listeners[event];
    if (listeners) {
      for (const fn of [...listeners]) {
        try { fn(...args); } catch { /* ignore */ }
        handled = true;
      }
    }
    const onceListeners = this._onceListeners[event];
    if (onceListeners) {
      const fns = [...onceListeners];
      this._onceListeners[event] = [];
      for (const fn of fns) {
        try { fn(...args); } catch { /* ignore */ }
        handled = true;
      }
    }
    return handled;
  }

  // Upgrade this socket to TLS
  _upgradeTls(options?: { rejectUnauthorized?: boolean; servername?: string }): void {
    if (typeof _netSocketUpgradeTlsRaw === "undefined") {
      throw new Error("tls.connect is not supported in sandbox (bridge not available)");
    }
    _netSocketUpgradeTlsRaw.applySync(undefined, [this._socketId, JSON.stringify(options ?? {})]);
  }
}

function netConnect(portOrOptions: number | { host?: string; port: number }, hostOrCallback?: string | (() => void), callback?: () => void): NetSocket {
  const socket = new NetSocket();
  socket.connect(portOrOptions, hostOrCallback as string, callback);
  return socket;
}

const netModule = {
  Socket: NetSocket,
  connect: netConnect,
  createConnection: netConnect,
  createServer(): never {
    throw new Error("net.createServer is not supported in sandbox");
  },
  isIP(input: string): number {
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input)) return 4;
    if (input.includes(":")) return 6;
    return 0;
  },
  isIPv4(input: string): boolean { return netModule.isIP(input) === 4; },
  isIPv6(input: string): boolean { return netModule.isIP(input) === 6; },
};

// ===================================================================
// tls module — TLS socket support via upgrade bridge
// ===================================================================

function tlsConnect(
  portOrOptions: number | { host?: string; port: number; socket?: NetSocket; rejectUnauthorized?: boolean; servername?: string },
  hostOrCallback?: string | (() => void),
  callback?: () => void,
): NetSocket {
  let socket: NetSocket;
  let options: { rejectUnauthorized?: boolean; servername?: string; host?: string; port?: number } = {};
  let cb: (() => void) | undefined;

  if (typeof portOrOptions === "object") {
    options = { ...portOrOptions };
    cb = typeof hostOrCallback === "function" ? hostOrCallback : callback;

    if (portOrOptions.socket) {
      // Upgrade existing socket to TLS
      socket = portOrOptions.socket;
    } else {
      // Create new TCP socket then upgrade
      socket = new NetSocket();
      socket.connect({ host: portOrOptions.host ?? "127.0.0.1", port: portOrOptions.port });
    }
  } else {
    const host = typeof hostOrCallback === "string" ? hostOrCallback : "127.0.0.1";
    cb = typeof hostOrCallback === "function" ? hostOrCallback : callback;
    options = { host };
    socket = new NetSocket();
    socket.connect(portOrOptions, host);
  }

  if (cb) socket.once("secureConnect", cb);

  // If already connected, upgrade immediately; otherwise wait for connect
  if (socket._connected) {
    socket._upgradeTls({
      rejectUnauthorized: options.rejectUnauthorized,
      servername: options.servername ?? options.host,
    });
  } else {
    socket.once("connect", () => {
      socket._upgradeTls({
        rejectUnauthorized: options.rejectUnauthorized,
        servername: options.servername ?? options.host,
      });
    });
  }

  return socket;
}

const tlsModule = {
  connect: tlsConnect,
  TLSSocket: NetSocket, // Alias — TLSSocket is just a NetSocket after upgrade
  createServer(): never {
    throw new Error("tls.createServer is not supported in sandbox");
  },
  createSecureContext(): Record<string, unknown> {
    return {}; // Stub for libraries that call this
  },
  DEFAULT_MIN_VERSION: "TLSv1.2",
  DEFAULT_MAX_VERSION: "TLSv1.3",
};

exposeCustomGlobal("_netModule", netModule);
exposeCustomGlobal("_tlsModule", tlsModule);

export default {
  fetch,
  Headers,
  Request,
  Response,
  dns,
  http,
  https,
  http2,
  IncomingMessage,
  ClientRequest,
  net: netModule,
  tls: tlsModule,
};
