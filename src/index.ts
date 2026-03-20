#!/usr/bin/env node

import { Command } from 'commander';
import { registerWalletCommand } from './commands/wallet.js';
import { registerChainsCommand } from './commands/chains.js';
import { registerTokensCommand } from './commands/tokens.js';
import { registerBalanceCommand } from './commands/balance.js';
import { registerQuoteCommand } from './commands/quote.js';
import { registerSwapCommand } from './commands/swap.js';
import { registerConfigCommand } from './commands/config.js';
import { registerAgentCommand } from './commands/agent.js';
import { registerBatchCommand } from './commands/batch.js';

const program = new Command();

program
  .name('cli-swap')
  .description('Multi-chain token swap CLI for humans and AI agents. Powered by Li.Fi (60+ chains).')
  .version('0.1.0');

// Register commands
registerWalletCommand(program);
registerChainsCommand(program);
registerTokensCommand(program);
registerBalanceCommand(program);
registerQuoteCommand(program);
registerSwapCommand(program);
registerConfigCommand(program);
registerAgentCommand(program);
registerBatchCommand(program);

program.parse();
