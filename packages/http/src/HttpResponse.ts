import type {ResponseInterface} from "./Interface/ResponseInterface.ts";

const REASON_PHRASES: Record<number, string> = {
    100: "Continue",
    101: "Switching Protocols",
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    410: "Gone",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
};

export class HttpResponse implements ResponseInterface {
    private readonly _headers: Map<string, string[]>;
    private readonly _body: ReadableStream | null;
    private readonly _protocolVersion: string;
    private readonly _statusCode: number;
    private readonly _reasonPhrase: string;

    constructor(
        statusCode: number = 200,
        headers: Map<string, string[]> = new Map(),
        body: ReadableStream | null = null,
        config: {
            reasonPhrase?: string,
            protocolVersion?: string,
        } = {}
    ) {
        this._statusCode = statusCode;
        this._headers = new Map(headers);
        this._body = body;
        this._reasonPhrase = config.reasonPhrase ?? REASON_PHRASES[statusCode] ?? "";
        this._protocolVersion = config.protocolVersion ?? "1.1";
    }

    getStatusCode(): number { return this._statusCode; }

    getReasonPhrase(): string { return this._reasonPhrase; }

    withStatus(statusCode: number, reason?: string): HttpResponse {
        return this.clone({ statusCode, reasonPhrase: reason ?? REASON_PHRASES[statusCode] });
    }

    getProtocolVersion(): string { return this._protocolVersion; }

    withProtocolVersion(protocolVersion: string): HttpResponse {
        return this.clone({ protocolVersion });
    }

    getBody(): ReadableStream {
        return this._body ?? new ReadableStream({ start(c) { c.close(); } });
    }

    withBody(stream: ReadableStream): HttpResponse {
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

    withHeader(name: string, value: string | string[]): HttpResponse {
        const headers = this.getHeaders();
        headers.set(name.toLowerCase(), Array.isArray(value) ? value : [value]);
        return this.clone({ headers });
    }

    withAddedHeader(name: string, value: string | string[]): HttpResponse {
        const headers = this.getHeaders();
        const key = name.toLowerCase();
        const existing = headers.get(key) ?? [];
        existing.push(...(Array.isArray(value) ? value : [value]));
        headers.set(key, existing);
        return this.clone({ headers });
    }

    withoutHeader(name: string): HttpResponse {
        const headers = this.getHeaders();
        headers.delete(name.toLowerCase());
        return this.clone({ headers });
    }

    withJson<T extends object>(json: T): HttpResponse {
        const headers = this.getHeaders();
        const encoded = new TextEncoder().encode(JSON.stringify(json));
        headers.set('content-type', ['application/json']);
        headers.set('content-length', [String(encoded.byteLength)]);
        const body = new ReadableStream({
            start(c) { c.enqueue(encoded); c.close(); }
        });
        return this.clone({ body, headers });
    }

    private clone(changes: Partial<{
        statusCode: number,
        reasonPhrase: string,
        headers: Map<string, string[]>,
        body: ReadableStream | null,
        protocolVersion: string,
    }>): HttpResponse {
        return new HttpResponse(
            changes.statusCode ?? this._statusCode,
            changes.headers ?? this._headers,
            changes.body !== undefined ? changes.body : this._body,
            {
                reasonPhrase: changes.reasonPhrase ?? this._reasonPhrase,
                protocolVersion: changes.protocolVersion ?? this._protocolVersion,
            }
        );
    }

    toStandard(): Response {
        const headers = new Headers();
        for (const [key, values] of this._headers) {
            values.forEach(v => headers.append(key, v));
        }
        return new Response(this._body, {
            status: this._statusCode,
            statusText: this._reasonPhrase,
            headers,
        });
    }

    static fromStandard(res: Response): HttpResponse {
        const headers = new Map<string, string[]>();
        for (const [k, v] of res.headers.entries()) {
            headers.set(k.toLowerCase(), [v]);
        }
        return new HttpResponse(
            res.status,
            headers,
            res.body,
            { reasonPhrase: res.statusText }
        );
    }
}