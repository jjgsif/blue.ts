export type Runtime = 'bun' | 'node' | 'deno';
export type AuthStrategy = 'jwt' | 'session' | 'apikey' | 'basic';

export interface UserChoices {
    projectName: string;
    runtime: Runtime;
    packages: {
        auth: boolean;
        logging: boolean;
        middleware: boolean;
    };
    authStrategies: AuthStrategy[];
}