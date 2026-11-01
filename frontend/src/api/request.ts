import { apiErrorFromResponse, ApiError } from "./errors";
import { isApiErrorBody } from "./guards";

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/** Auth context registers a redirect when a protected route returns 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** When true, 401 does not invoke the global logged-out redirect (login, session probe). */
  skipAuthRedirect?: boolean;
};

async function readErrorBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function maybeRedirectUnauthorized(status: number, skipAuthRedirect: boolean | undefined): void {
  if (status === 401 && !skipAuthRedirect) {
    onUnauthorized?.();
  }
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(res.status, { ok: false, error: "invalid json response" });
  }
}

async function parseTextBody(res: Response): Promise<string> {
  return res.text();
}

/** Same-origin fetch with JSON bodies and typed error handling. */
export async function request<T>(
  path: string,
  options: RequestOptions & { parse: (json: unknown) => T },
): Promise<T>;
export async function request(
  path: string,
  options: RequestOptions & { parse?: undefined; parseAsText: true },
): Promise<string>;
export async function request<T>(
  path: string,
  options: (RequestOptions & { parse: (json: unknown) => T }) | (RequestOptions & { parse?: undefined; parseAsText: true }),
): Promise<T | string> {
  const { method = "GET", body, signal, skipAuthRedirect } = options;
  const parse = 'parse' in options ? options.parse : undefined;
  const parseAsText = 'parseAsText' in options ? options.parseAsText : false;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw ApiError.network(err);
  }

  if (res.status === 204) {
    if (!res.ok) {
      const errJson = await readErrorBody(res);
      maybeRedirectUnauthorized(res.status, skipAuthRedirect);
      throw apiErrorFromResponse(res.status, errJson);
    }
    throw new ApiError(204, { ok: false, error: "unexpected empty body" });
  }

  if (parseAsText) {
    const text = await parseTextBody(res);
    if (!res.ok) {
      maybeRedirectUnauthorized(res.status, skipAuthRedirect);
      // Try to parse as JSON for error details
      let errBody: unknown = null;
      try {
        errBody = JSON.parse(text);
      } catch {
        // Ignore, treat as plain error text
      }
      throw apiErrorFromResponse(res.status, isApiErrorBody(errBody) ? errBody : null);
    }
    return text;
  }

  const json = await parseJsonBody(res);

  if (!res.ok) {
    maybeRedirectUnauthorized(res.status, skipAuthRedirect);
    throw apiErrorFromResponse(res.status, isApiErrorBody(json) ? json : null);
  }

  return parse!(json);
}

export async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const { method = "GET", body, signal, skipAuthRedirect } = options;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw ApiError.network(err);
  }

  if (res.status === 204) {
    if (!res.ok) {
      const errJson = await readErrorBody(res);
      maybeRedirectUnauthorized(res.status, skipAuthRedirect);
      throw apiErrorFromResponse(res.status, errJson);
    }
    return;
  }

  const json = await parseJsonBody(res);
  if (!res.ok) {
    maybeRedirectUnauthorized(res.status, skipAuthRedirect);
    throw apiErrorFromResponse(res.status, isApiErrorBody(json) ? json : null);
  }
}
