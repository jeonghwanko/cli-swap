export interface WalletInfo {
  name: string;
  type: 'evm' | 'solana';
  address: string;
  encryptedKey: string;   // AES-256-GCM encrypted private key
  iv: string;             // initialization vector (hex)
  salt: string;           // password salt (hex)
  authTag: string;        // GCM auth tag (hex)
  createdAt: string;
}

export interface AppConfig {
  defaultWallet?: string;
  defaultSlippage: number;  // percentage, e.g. 0.5
  rpcOverrides: Record<string, string>;  // chainId -> rpc url
}

export interface QuoteResult {
  fromChain: string;
  fromToken: string;
  fromAmount: string;
  toChain: string;
  toToken: string;
  toAmount: string;
  toAmountMin: string;
  estimatedGas: string;
  executionDuration: number; // seconds
  toolsUsed: string[];
}

export interface SwapResult {
  status: 'success' | 'failed';
  txHash?: string;
  fromAmount: string;
  toAmount: string;
  explorerUrl?: string;
  error?: string;
}

export interface SendResult {
  status: 'success' | 'failed';
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}
