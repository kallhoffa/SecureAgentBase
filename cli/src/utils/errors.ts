import chalk from 'chalk';

export class CLIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CLIError';
  }
}

export function handleError(err: unknown): void {
  if (err instanceof CLIError) {
    console.error(chalk.red(`✖ ${err.message}`));
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(chalk.red(`✖ ${err.message}`));
    if (process.env.DEBUG && err.stack) {
      console.error(chalk.dim(err.stack));
    }
    process.exit(1);
  }
  console.error(chalk.red('✖ An unknown error occurred'));
  process.exit(1);
}
