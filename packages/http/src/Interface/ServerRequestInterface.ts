import type {RequestInterface} from "./RequestInterface.ts";
import type {ServerParams} from "./ServerParams.ts";
import type {MessageInterface} from "./MessageInterface.ts";
import type {UploadedFile} from "../Files/UploadedFile.ts";
import type {Identifier} from "../types.ts";

export interface ServerRequestInterface<T = any> extends RequestInterface {
    getServerParams(): ServerParams;
    getCookieParams(): Record<string, string>
    withCookieParams(cookieParams: Record<string, string>): MessageInterface;
    getQueryParams(): Record<string, string>;
    withQueryParams(queryParams: Record<string, string>): MessageInterface;
    getUploadedFiles(): Record<string, UploadedFile>;
    withUploadedFiles(uploadedFiles: Record<string, UploadedFile>): MessageInterface;
    getParsedBody(): T | null;
    withParsedBody<U>(parsedBody: U): MessageInterface;
    getAttributes(): Map<Identifier<any>, any>;
    getAttribute<U>(attribute: Identifier<U>, defaultValue: any): any;
    withAttribute<U>(name: Identifier<U>, value: U): MessageInterface;
}