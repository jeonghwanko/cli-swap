import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function success(msg: string): void {
  console.log(chalk.green('✓'), msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗'), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠'), msg);
}

export function info(msg: string): void {
  console.log(chalk.blue('ℹ'), msg);
}

export function table(data: Record<string, string | number>[]): void {
  console.table(data);
}

export function heading(title: string): void {
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}

export function keyValue(key: string, value: string | number): void {
  console.log(`  ${chalk.gray(key + ':')} ${value}`);
}

export function spinner(text: string): Ora {
  return ora({ text, spinner: 'dots' }).start();
}

export function jsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
