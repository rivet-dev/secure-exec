// @hono/node-server bridge module for isolated-vm.
// This does not expose raw Node HTTP objects in the isolate. Instead it
// forwards Fetch-style requests to a host-side server runtime.

type FetchCallback = (request: Request, connInfo?: unknown) => Response | Promise<Response>;

interface HonoServeOptions {
  fetch: FetchCallback;
  port?: number;
  hostname?: string;
}

interface HonoServerAddress {
  address: string;
  family: string;
  port: number;
}

interface HostServeResult {
  serverId: number;
  address: HonoServerAddress | null;
}

interface SerializedRequest {
  url: string;
  method: string;
  headers?: Array<[string, string]>;
  body?: string;
}

interface SerializedResponse {
  status: number;
  headers?: Array<[string, string]>;
  body?: string;
}

declare const _networkHonoServeRaw:
  | {
      apply(
        ctx: undefined,
        args: [string],
        options: { result: { promise: true } }
      ): Promise<string>;
    }
  | undefined;

declare const _networkHonoCloseRaw:
  | {
      apply(
        ctx: undefined,
        args: [number],
        options: { result: { promise: true } }
      ): Promise<void>;
    }
  | undefined;

declare const _registerHandle:
  | ((id: string, description: string) => void)
  | undefined;

declare const _unregisterHandle:
  | ((id: string) => void)
  | undefined;

let nextHandlerId = 1;
const handlers = new Map<number, FetchCallback>();

class RequestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RequestError";
  }
}

class SandboxHonoServer {
  private _listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  private _handlerId: number;
  private _serverId: number | null = null;
  private _address: HonoServerAddress | null = null;
  private _listenPromise: Promise<void> | null = null;
  private _handleId: string | null = null;
  private _fetch: FetchCallback;
  listening = false;

  constructor(fetch: FetchCallback) {
    this._fetch = fetch;
    this._handlerId = nextHandlerId++;
    handlers.set(this._handlerId, fetch);
  }

  private _emit(event: string, ...args: unknown[]): void {
    const listeners = this._listeners[event];
    if (!listeners || listeners.length === 0) return;
    listeners.slice().forEach((listener) => listener(...args));
  }

  private async _start(port?: number, hostname?: string): Promise<void> {
    if (this._serverId !== null) return;
    if (typeof _networkHonoServeRaw === "undefined") {
      throw new Error("@hono/node-server requires NetworkAdapter.honoServe support");
    }

    const resultJson = await _networkHonoServeRaw.apply(
      undefined,
      [JSON.stringify({ handlerId: this._handlerId, port, hostname })],
      { result: { promise: true } }
    );
    const result = JSON.parse(resultJson) as HostServeResult;
    this._serverId = result.serverId;
    this._address = result.address;
    this.listening = true;

    this._handleId = `hono-server:${this._serverId}`;
    if (typeof _registerHandle === "function") {
      _registerHandle(this._handleId, "hono server");
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
        .catch((err) => {
          this._emit("error", err);
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
        if (this._serverId === null) {
          cb?.();
          return;
        }

        if (typeof _networkHonoCloseRaw === "undefined") {
          throw new Error("@hono/node-server close requires NetworkAdapter.honoClose support");
        }

        await _networkHonoCloseRaw.apply(undefined, [this._serverId], {
          result: { promise: true },
        });

        if (this._handleId && typeof _unregisterHandle === "function") {
          _unregisterHandle(this._handleId);
        }
        this._handleId = null;
        this._serverId = null;
        this._address = null;
        this.listening = false;
        handlers.delete(this._handlerId);
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

  address(): HonoServerAddress | null {
    return this._address;
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this._listeners[event];
    if (!listeners) return this;
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
    return this;
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
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

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }
}

export function createAdaptorServer(options: HonoServeOptions): SandboxHonoServer {
  if (!options || typeof options.fetch !== "function") {
    throw new TypeError("createAdaptorServer requires options.fetch");
  }
  return new SandboxHonoServer(options.fetch);
}

export function getRequestListener(): never {
  throw new Error("getRequestListener is not supported in sandbox bridge");
}

export function serve(
  options: HonoServeOptions,
  listeningListener?: (address: HonoServerAddress | null) => void
): SandboxHonoServer {
  const server = createAdaptorServer(options);
  server.listen(options.port ?? 3000, options.hostname, () => {
    listeningListener?.(server.address());
  });
  return server;
}

(globalThis as Record<string, unknown>)._honoNodeServerDispatch = async (
  handlerId: number,
  requestJson: string
): Promise<string> => {
  const handler = handlers.get(handlerId);
  if (!handler) {
    throw new RequestError(`Unknown @hono/node-server handler: ${handlerId}`);
  }

  const reqData = JSON.parse(requestJson) as SerializedRequest;
  const method = reqData.method || "GET";
  const init: RequestInit = {
    method,
    headers: reqData.headers || [],
  };

  if (method !== "GET" && method !== "HEAD" && typeof reqData.body === "string") {
    init.body = reqData.body;
  }

  const request = new Request(reqData.url, init);
  const response = await handler(request);
  const normalized =
    response instanceof Response ? response : new Response(response as BodyInit);

  const serialized: SerializedResponse = {
    status: normalized.status,
    headers: Array.from(normalized.headers.entries()),
    body: await normalized.text(),
  };

  return JSON.stringify(serialized);
};

const honoNodeServerModule = {
  RequestError,
  createAdaptorServer,
  getRequestListener,
  serve,
};

(globalThis as Record<string, unknown>)._honoNodeServerModule = honoNodeServerModule;

export default honoNodeServerModule;
