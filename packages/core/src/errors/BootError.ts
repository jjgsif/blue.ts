interface BootErrorOptions {
    providerName: string,
    options: {
        message?: string,
        isFatal: boolean,
        extra?: any
    }
}

export class BootError extends Error {
    public readonly providerName: string;
    public readonly isFatal: boolean;
    public readonly extra: any;

    constructor({providerName, options}: BootErrorOptions) {
        super(options.message);

        this.providerName = providerName;
        this.isFatal = options.isFatal;
        this.extra = options.extra;
    }
}