import type {Context} from "../context.ts";

export class HandlerError extends Error {
    constructor(error: Error, context: Context) {
        super(`Handler Error: ${error.message} - ${context.req.method} ${context.req.url}`, {cause: error});
        this.stack = error.stack;
    }
}