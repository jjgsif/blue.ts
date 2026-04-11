export class NotFoundException extends Error {
    constructor(identifier: string) {
        super(`Unknown identifier: ${identifier}`);
    }
}