declare module 'inquirer' {
  export interface Question {
    type?: string;
    name?: string;
    message?: string;
    default?: any;
    choices?: Array<{ name: string; value: any; short?: string }>;
    validate?: (input: any) => boolean | string;
  }

  export interface Answers {
    [key: string]: any;
  }

  const inquirer: {
    prompt<T extends Answers = Answers>(questions: Question[]): Promise<T>;
  };

  export default inquirer;
}

declare module 'commander' {
  export class Command {
    name(name: string): this;
    description(desc: string): this;
    version(v: string): this;
    command(name: string): Command;
    option(flags: string, description?: string, defaultValue?: any): this;
    action(fn: (...args: any[]) => void): this;
    parse(argv: string[]): void;
  }
}

declare module 'ora' {
  interface Ora {
    start(text?: string): this;
    stop(): this;
    succeed(text?: string): this;
    fail(text?: string): this;
    text: string;
  }
  export default function ora(options?: { text?: string; spinner?: string }): Ora;
}

declare module 'chalk' {
  interface ChalkInstance {
    (text: string): string;
    bold: ChalkInstance;
    underline: ChalkInstance;
    dim: ChalkInstance;
  }
  interface Chalk {
    cyan: ChalkInstance;
    green: ChalkInstance;
    yellow: ChalkInstance;
    red: ChalkInstance;
    blue: ChalkInstance;
    bold: ChalkInstance;
    underline: ChalkInstance;
    dim: ChalkInstance;
  }
  const chalk: Chalk;
  export default chalk;
}

declare module 'google-auth-library' {
  export class GoogleAuth {
    constructor(options?: { scopes?: string[] });
    getClient(): Promise<any>;
    getAccessToken(): Promise<{ token?: string; res?: any }>;
    getProjectId(): Promise<string>;
    getCredentials(): Promise<{ client_email?: string }>;
  }

  export class ExternalAccountClient {
    static fromJSON(options: any): any;
  }
}
