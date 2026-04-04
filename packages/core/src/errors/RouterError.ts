import type {HttpMethod} from "../types.ts";

export class RouterError extends Error {
    constructor(
        reason: string,
        method: HttpMethod,
        path: string,
    ) {
        super(`An error has occurred with ${method} - ${path}`, {
            cause: reason
        });
    }
}