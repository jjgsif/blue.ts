export interface MessageInterface {
    // Protocol
    getProtocolVersion(): string;
    withProtocolVersion(protocolVersion: string): MessageInterface;

    // Headers
    getHeaders(): Map<string, string[]>;
    hasHeader(name: string): boolean;
    getHeader(name: string): string[];
    getHeaderLine(name: string): string;
    withHeader(name: string, value: string | string[]): MessageInterface;
    withAddedHeader(name: string, value: string | string[]): MessageInterface;
    withoutHeader(name: string): MessageInterface;

    // Body
    getBody(): ReadableStream;
    withBody(stream: ReadableStream): MessageInterface;
}