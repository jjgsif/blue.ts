import type {MessageInterface} from "./MessageInterface.ts";

export interface RequestInterface extends MessageInterface {
    getRequestTarget(): string;
    withRequestTarget(requestTarget: string): MessageInterface;
    getMethod(): string;
    withMethod(method: string): MessageInterface;
    getUrl(): URL;
    withUrl(url: URL): MessageInterface;
}