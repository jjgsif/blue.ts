import type {MessageInterface} from "./MessageInterface.ts";

export interface ResponseInterface extends MessageInterface {
    getStatusCode(): number;
    withStatus(statusCode: number, reason: string): ResponseInterface;
    getReasonPhrase(): string;
}