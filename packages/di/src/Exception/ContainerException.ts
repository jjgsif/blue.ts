export class ContainerException extends Error {
    constructor(
        message: string,
        context: { identifier: string; lifetime: string; chain?: string },
        error: Error
    ) {
        const chainStr = context.chain ? ` [${context.chain}]` : "";
        super(`${message} - ${context.identifier} (${context.lifetime})${chainStr}`);
        // Append rather than replace so the container call site is preserved in the trace
        this.stack = `${this.stack}\nCaused by: ${error.stack}`;
        this.cause = error;
    }
}