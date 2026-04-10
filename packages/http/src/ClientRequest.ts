import type {RequestInterface} from "./Interface/RequestInterface.ts";
import {HttpResponse} from "./HttpResponse.ts";

export class ClientRequest implements RequestInterface {
    private static readonly NO_BODY_METHODS = new Set(['GET', 'HEAD']);

    private readonly _url: URL;
    private readonly _method: string;
    private readonly _headers: Map<string, string[]>;
    private readonly _body: ReadableStream | null;
    private readonly _protocolVersion: string;
    private readonly _queryParams: Record<string, string>;

    constructor(
        method: string,
        url: URL,
        body: ReadableStream | null = null,
        headers: Map<string, string[]> = new Map(),
        config: {
            queryParams?: Record<string, string>,
            protocolVersion?: string,
        } = {}
    ) {
        this._method = method;
        this._headers = new Map(headers);
        this._body = body;
        this._protocolVersion = config.protocolVersion ?? "1.1";

        const resolvedUrl = new URL(url.href);
        const merged: Record<string, string> = {};
        for (const [key, val] of resolvedUrl.searchParams.entries()) {
            merged[key] = val;
        }
        for (const [key, val] of Object.entries(config.queryParams ?? {})) {
            merged[key] = val;
            resolvedUrl.searchParams.set(key, val);
        }
        this._queryParams = merged;
        this._url = resolvedUrl;
    }
    
    getMethod(): string { return this._method; }

    withMethod(method: string): ClientRequest {
        return this.clone({ method });
    }

    getUrl(): URL { return new URL(this._url.href); }

    withUrl(url: URL): ClientRequest {
        const headers = this.getHeaders();
        headers.set('host', [url.host]);
        return this.clone({ url, headers });
    }

    getRequestTarget(): string {
        return this._url.pathname + this._url.search;
    }

    withRequestTarget(requestTarget: string): ClientRequest {
        const url = new URL(requestTarget, this._url.origin);
        return this.clone({ url });
    }

    getProtocolVersion(): string { return this._protocolVersion; }

    withProtocolVersion(protocolVersion: string): ClientRequest {
        return this.clone({ protocolVersion });
    }

    getBody(): ReadableStream {
        return this._body ?? new ReadableStream({ start(c) { c.close(); } });
    }

    withBody(stream: ReadableStream): ClientRequest {
        return this.clone({ body: stream });
    }

    getHeaders(): Map<string, string[]> {
        return new Map(this._headers);
    }

    hasHeader(name: string): boolean {
        return this._headers.has(name.toLowerCase());
    }

    getHeader(name: string): string[] {
        return this._headers.get(name.toLowerCase()) ?? [];
    }

    getHeaderLine(name: string): string {
        return this.getHeader(name).join(", ");
    }

    withHeader(name: string, value: string | string[]): ClientRequest {
        const headers = this.getHeaders();
        headers.set(name.toLowerCase(), Array.isArray(value) ? value : [value]);
        return this.clone({ headers });
    }

    withAddedHeader(name: string, value: string | string[]): ClientRequest {
        const headers = this.getHeaders();
        const key = name.toLowerCase();
        const existing = headers.get(key) ?? [];
        existing.push(...(Array.isArray(value) ? value : [value]));
        headers.set(key, existing);
        return this.clone({ headers });
    }

    withoutHeader(name: string): ClientRequest {
        const headers = this.getHeaders();
        headers.delete(name.toLowerCase());
        return this.clone({ headers });
    }

    getQueryParams(): Record<string, string> {
        return { ...this._queryParams };
    }

    withQueryParams(queryParams: Record<string, string>): ClientRequest {
        return this.clone({ queryParams });
    }

    withQueryParam(key: string, value: string): ClientRequest {
        return this.clone({ queryParams: { ...this._queryParams, [key]: value } });
    }

    withJson<T extends object>(json: T): ClientRequest {
        const headers = this.getHeaders();
        const encoded = new TextEncoder().encode(JSON.stringify(json));
        headers.set('content-type', ['application/json']);
        headers.set('content-length', [String(encoded.byteLength)]);
        const body = new ReadableStream({
            start(c) { c.enqueue(encoded); c.close(); }
        });
        return this.clone({ headers, body });
    }

    withBearerToken(token: string): ClientRequest {
        return this.withHeader('authorization', `Bearer ${token}`);
    }

    withBasicAuth(username: string, password: string): ClientRequest {
        const bytes = new TextEncoder().encode(`${username}:${password}`);
        const encoded = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
        return this.withHeader('authorization', `Basic ${encoded}`);
    }

    async send(): Promise<HttpResponse> {
        const headers = new Headers();
        for (const [key, values] of this._headers) {
            values.forEach(v => headers.append(key, v));
        }

        const res = await fetch(this._url.href, {
            method: this._method,
            headers,
            body: ClientRequest.NO_BODY_METHODS.has(this._method.toUpperCase()) ? null : this._body,
        });

        return HttpResponse.fromStandard(res);
    }

    private clone(changes: Partial<{
        method: string,
        url: URL,
        body: ReadableStream | null,
        headers: Map<string, string[]>,
        queryParams: Record<string, string>,
        protocolVersion: string,
    }>): ClientRequest {
        return new ClientRequest(
            changes.method ?? this._method,
            changes.url ?? new URL(this._url.href),
            changes.body !== undefined ? changes.body : this._body,
            changes.headers ?? this._headers,
            {
                queryParams: changes.queryParams ?? this._queryParams,
                protocolVersion: changes.protocolVersion ?? this._protocolVersion,
            }
        );
    }

    static create(method: string, url: string | URL): ClientRequest {
        return new ClientRequest(method.toUpperCase(), typeof url === 'string' ? new URL(url) : url);
    }

    static get(url: string | URL): ClientRequest {
        return ClientRequest.create('GET', url);
    }

    static post(url: string | URL): ClientRequest {
        return ClientRequest.create('POST', url);
    }

    static put(url: string | URL): ClientRequest {
        return ClientRequest.create('PUT', url);
    }

    static patch(url: string | URL): ClientRequest {
        return ClientRequest.create('PATCH', url);
    }

    static delete(url: string | URL): ClientRequest {
        return ClientRequest.create('DELETE', url);
    }
}