export interface ServerParams {
    remoteAddress?: string;
    remotePort?: number;
    localAddress?: string;
    localPort?: number;
    encrypted?: boolean;
    requestTime?: Date;
}