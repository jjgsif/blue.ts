import type {Identifier} from "./types.ts";
import type {ServerParams} from "./Interface/ServerParams.ts";
import type {ServerRequestInterface} from "./Interface/ServerRequestInterface.ts";
import {UploadedFile} from "./Files/UploadedFile.ts";
import {handleUploadedFile} from "./Files/FileUploadUtilities.ts";

export class ServerRequest<T = any> implements ServerRequestInterface<T> {
    private readonly _body: ReadableStream | null;
    private readonly _queryParams: Record<string, string>;
    private readonly _routeParams: Record<string, string>;
    private readonly _cookieParams: Record<string, string>;
    private readonly _uploadedFiles: Record<string, UploadedFile>;
    private readonly _attributes: Map<Identifier<any>, any>;
    private readonly _parsedBody: T | null;
    private readonly _protocolVersion: string;
    private readonly _serverParams: ServerParams;
    private readonly _requestTarget: string;


    constructor(
        private readonly _url: URL,
        private readonly _method: string,
        body: string | Record<PropertyKey, any> | ReadableStream | null = null,
        private readonly _headers: Map<string, string[]> = new Map<string, string[]>(),
        config: {
            protocolVersion?: string,
            queryParams?: Record<string, string>,
            routeParams?: Record<string, string>,
            cookieParams?: Record<string, string>,
            uploadedFiles?: Record<string, UploadedFile>,
            attributes?: Map<Identifier<any>, any>,
            parsedBody?: T | null,
            serverParams?: ServerParams
            requestTarget?: string
        } = {}
    ){
        if (body instanceof ReadableStream) {
            this._body = body;
        } else if (typeof body === "string") {
            const encoded = new TextEncoder().encode(body);
            this._body = new ReadableStream({ start(c) { c.enqueue(encoded); c.close(); } });
        } else if (body) {
            const encoded = new TextEncoder().encode(JSON.stringify(body));
            this._body = new ReadableStream({ start(c) { c.enqueue(encoded); c.close(); } });
        } else {
            this._body = body;
        }

        this._queryParams = config.queryParams || {};
        this._routeParams = config.routeParams || {};
        this._cookieParams = config.cookieParams || {};
        this._uploadedFiles = config.uploadedFiles || {};
        this._attributes = config.attributes || new Map();
        this._parsedBody = config.parsedBody !== undefined ? config.parsedBody : null;
        this._serverParams = config.serverParams || {};
        this._protocolVersion = config.protocolVersion || "1.1";
        this._requestTarget = config.requestTarget || (this._url.pathname + this._url.search);
    }

    withQueryParams(queryParams: Record<string, string>): ServerRequest<T> {
        return this.clone({queryParams});
    }
    getUploadedFiles(): Record<string, UploadedFile> {
        return {...this._uploadedFiles};
    }
    withUploadedFiles(uploadedFiles: Record<string, UploadedFile>): ServerRequest<T> {
        return this.clone({uploadedFiles});
    }

    getRequestTarget(): string {
        return this._requestTarget;
    }

    getMethod(): string {
        return this._method;
    }

    withMethod(method: string): ServerRequest<T> {
        return this.clone({method});
    }

    getBody(): ReadableStream {
        return this._body ?? new ReadableStream({ start(c) { c.close(); } });
    }

    withBody(stream: ReadableStream): ServerRequest<T> {
        return this.clone({body: stream})
    }

    getAttribute<U>(attribute: Identifier<U>, defaultValue: any = null): any {
        return this._attributes.get(attribute) ?? defaultValue;
    }

    getAttributes(): Map<Identifier<any>, any> {
        return new Map(this._attributes);
    }

    withAttribute<U>(name: Identifier<U>, value: U): ServerRequest<T> {
        const attributes = this.getAttributes();
        attributes.set(name, value);
        return this.clone({attributes});
    }

    hasHeader(name: string): boolean {
        return this._headers.has(name.toLowerCase());
    }

    getHeader(name: string): string[] {
        return this._headers.get(name.toLowerCase()) ?? [];
    }

    getHeaders(): Map<string, string[]> {
        return new Map(this._headers);
    }

    getHeaderLine(name: string): string {
        return (this._headers.get(name.toLowerCase()) ?? []).join(", ");
    }

    withHeader(name: string, value: string | string[]): ServerRequest<T> {
        const headers = this.getHeaders();
        headers.set(name.toLowerCase(), Array.isArray(value) ? value : [value]);
        return this.clone({headers});
    }

    withAddedHeader(name: string, value: string | string[]): ServerRequest<T> {
        const headers = this.getHeaders();
        const headerValues = headers.get(name.toLowerCase()) ?? [];
        headerValues.push(...(Array.isArray(value) ? value : [value]));
        headers.set(name.toLowerCase(), headerValues);
        return this.clone({headers});
    }

    withoutHeader(name: string): ServerRequest<T> {
        const headers = this.getHeaders();
        headers.delete(name.toLowerCase());
        return this.clone({headers});
    }

    getCookieParams(): Record<string, string> {
        return {...this._cookieParams};
    }

    withCookieParams(cookieParams: Record<string, string>): ServerRequest<T> {
        return this.clone({cookieParams});
    }

    getParsedBody(): T | null {
        return this._parsedBody;
    }

    withParsedBody<U>(parsedBody: U): ServerRequest<U> {
        return this.clone({parsedBody});
    }

    getProtocolVersion(): string {
        return this._protocolVersion;
    }

    withProtocolVersion(protocolVersion: string): ServerRequest<T> {
        return this.clone({protocolVersion});
    }

    getQueryParams(): Record<string, string> {
        return {...this._queryParams};
    }

    getServerParams(): ServerParams {
        return {...this._serverParams};
    }

    getUrl(): URL {
        return new URL(this._url.href);
    }

    withUrl(url: URL): ServerRequest<T> {
        const headers = this.getHeaders();
        headers.set('host', [url.host]);
        return this.clone({url, headers});
    }

    withRequestTarget(requestTarget: string): ServerRequest<T> {
        return this.clone({requestTarget});
    }

    getRouteParams(): Record<string, string> {
        return {...this._routeParams};
    }

    withRouteParams(routeParams: Record<string, string>): ServerRequest<T> {
        return this.clone({routeParams});
    }

    private clone<U>(changes: Partial<{
        body: ReadableStream;
        method: string;
        url: URL;
        queryParams: Record<string, string>;
        routeParams: Record<string, string>;
        attributes: Map<Identifier<any>, any>;
        parsedBody: U | null;
        headers: Map<string, string[]>;
        cookieParams: Record<string, string>;
        protocolVersion: string;
        requestTarget: string;
        serverParams: ServerParams;
        uploadedFiles: Record<string, UploadedFile>;
    }>): ServerRequest<U> {
        return new ServerRequest<U>(
            changes.url ?? this._url,
            changes.method ?? this._method,
            changes.body ?? this._body,
            changes.headers ?? this._headers,
            {
                routeParams: changes.routeParams ?? this._routeParams,
                cookieParams: changes.cookieParams ?? this._cookieParams,
                parsedBody: typeof changes.parsedBody === 'undefined' ? this._parsedBody as U | null : changes.parsedBody,
                attributes: changes.attributes ?? this._attributes,
                queryParams: changes.queryParams ?? this._queryParams,
                serverParams: changes.serverParams ?? this._serverParams,
                uploadedFiles: changes.uploadedFiles ?? this._uploadedFiles,
                requestTarget: changes.requestTarget ?? this._requestTarget,
                protocolVersion: changes.protocolVersion ?? this._protocolVersion,
            }
        )
    }

    static async fromRequest<T>(req: Request): Promise<ServerRequest<T>>
    {
        const url = new URL(req.url);

        const headers = new Map<string, string[]>();
        for (const [header, val] of req.headers.entries()) {
            headers.set(header.toLowerCase(), Array.isArray(val) ? val : [val]);
        }

        // Parse cookies from header, then remove raw header
        const cookieHeader = headers.get('cookie')?.[0] ?? '';
        const cookieParams = Object.fromEntries(
            cookieHeader.split(';').filter(Boolean).flatMap(part => {
                const [key, ...val] = part.trim().split('=');
                if (!key) return [];
                return [[key.trim(), decodeURIComponent(val.join('='))]] as [string, string][];
            })
        );
        headers.delete('cookie');

        const queryParams = Object.fromEntries(url.searchParams.entries());

        const contentType = headers.get('content-type')?.[0] ?? '';
        let parsedBody: T | null = null;
        let uploadedFiles: Record<string, UploadedFile> = {};

        try {
            if (contentType.includes('application/json')) {
                parsedBody = await req.json() as T;
            } else if (contentType.includes('multipart/form-data')) {
                const formData = await req.formData();
                const bodyObj: Record<string, string> = {};
                for (const [key, value] of formData.entries()) {
                    if (value instanceof File) {
                        uploadedFiles[key] = await handleUploadedFile(value);
                    } else {
                        bodyObj[key] = value as string;
                    }
                }
                parsedBody = bodyObj as T;
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
                const formData = await req.formData();
                parsedBody = Object.fromEntries(
                    [...formData.entries()].map(([k, v]) => [k, v.toString()])
                ) as T;
            }
        } catch {
            parsedBody = null;
        }

        const bodyConsumed = parsedBody !== null || Object.keys(uploadedFiles).length > 0;

        return new ServerRequest<T>(
            url,
            req.method,
            bodyConsumed ? null : req.body,
            headers,
            {
                queryParams,
                cookieParams,
                uploadedFiles,
                parsedBody
            }
        );
    }
}