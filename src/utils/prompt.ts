import inquirer from 'inquirer';

export async function askPassword(message = 'Enter wallet password:'): Promise<string> {
  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message,
      mask: '*',
    },
  ]);
  return password as string;
}

export async function askConfirm(message: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false,
    },
  ]);
  return confirmed as boolean;
}

export async function askInput(message: string, defaultValue?: string): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);
  return value as string;
}

export async function askSelect(message: string, choices: string[]): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'list',
      name: 'value',
      message,
      choices,
    },
  ]);
  return value as string;
}
