import type { RouteParams } from './types.ts';

export class Context<T extends string = string> {
  // Parsed URL — cached to avoid re-parsing on every searchParams/pathname access
  private readonly _url: URL;

  // Raw body bytes cached on first read so multiple accessors can decode from the same buffer
  private _rawBody: Promise<ArrayBuffer> | null = null;

  // Lazily parsed cookies from the Cookie header
  private _cookies: ReadonlyMap<string, string> | null = null;

  constructor(
      readonly req: Request,
      readonly params: RouteParams<T>,
      readonly generateUrl: (name: string, params?: RouteParams) => string
  ) {
    this._url = new URL(this.req.url);
  }

  // ── Request metadata ────────────────────────────────────────────────────────

  get headers(): Headers {
    return this.req.headers;
  }

  get searchParams(): URLSearchParams {
    return this._url.searchParams;
  }

  get cookies(): ReadonlyMap<string, string> {
    if (this._cookies === null) {
      this._cookies = parseCookies(this.req.headers.get('cookie') ?? '');
    }
    return this._cookies;
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  // All body accessors share a single read of the underlying stream.
  // Middleware can call ctx.text() and the handler can still call ctx.json() —
  // the bytes are read once and cached.

  async text(): Promise<string> {
    return new TextDecoder().decode(await this._body());
  }

  async json<T = unknown>(): Promise<T> {
    return JSON.parse(await this.text()) as T;
  }

  async formData(): Promise<FormData> {
    // Re-wrap cached bytes as a Response so the runtime can parse multipart/form-data
    // (requires the original Content-Type header for boundary extraction)
    const buffer = await this._body();
    const contentType = this.req.headers.get('content-type') ?? '';
    const res = new Response(buffer, { headers: { 'content-type': contentType } });
    return res.formData() as Promise<FormData>;
  }

  private _body(): Promise<ArrayBuffer> {
    if (this._rawBody === null) {
      this._rawBody = this.req.arrayBuffer();
    }
    return this._rawBody;
  }

  // ── Redirect to Named Route ──────────────────────────────────────────────────

  redirectToRoute<K extends string = string>(name: string, params?: RouteParams<K>, status: 301 | 302 | 303 | 307 | 308 = 302)
  {
    return Response.redirect(this.generateUrl(name, params), status);
  }

  // ── Static response factories ────────────────────────────────────────────────

  static json<T>(data: T, init?: ResponseInit): Response {
    const res = new Response(JSON.stringify(data), init);
    if (!res.headers.has('Content-Type')) res.headers.set('Content-Type', 'application/json');
    return res;
  }

  static text(body: string, init?: ResponseInit): Response {
    const res = new Response(body, init);
    if (!res.headers.has('Content-Type')) res.headers.set('Content-Type', 'text/plain; charset=utf-8');
    return res;
  }

  static redirect(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    return Response.redirect(url, status);
  }

  static empty(status = 204): Response {
    return new Response(null, { status });
  }
}

function parseCookies(header: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;

  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) map.set(decodeURIComponent(key), decodeURIComponent(value));
  }

  return map;
}