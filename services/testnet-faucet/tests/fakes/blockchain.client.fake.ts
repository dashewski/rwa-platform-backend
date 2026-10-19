/**
 * In-memory fake of BlockchainClient for unit tests.
 *
 * The real client signs and broadcasts transactions through ethers. Tests use
 * this fake to keep the service layer isolated: no RPC, no wallet, no
 * network, deterministic transaction hashes. The public API mirrors
 * src/clients/blockchain.client.ts, and every method is wrapped in bun:test
 * mock() so interactions can be asserted.
 */
import { mock } from 'bun:test';

export type FakeNativeTransfer = {
  kind: 'native';
  recipientAddress: string;
  amount: string;
  transactionHash: string;
};

export type FakeErc20Transfer = {
  kind: 'erc20';
  tokenAddress: string;
  recipientAddress: string;
  amount: string;
  transactionHash: string;
};

export type FakeTransfer = FakeNativeTransfer | FakeErc20Transfer;

function nextTransactionHash(sequence: number): string {
  // 32-byte hex string shaped like a real transaction hash, deterministic per fake instance.
  return `0x${sequence.toString(16).padStart(64, '0')}`;
}

export function createFakeBlockchainClient() {
  const transfers: FakeTransfer[] = [];

  const client = {
    transfers,

    initialize: mock(async (): Promise<void> => {}),

    transferToken: mock(async (recipientAddress: string, amount: string): Promise<string> => {
      const transactionHash = nextTransactionHash(transfers.length + 1);
      transfers.push({ kind: 'native', recipientAddress, amount, transactionHash });
      return transactionHash;
    }),

    transferERC20Token: mock(
      async (tokenAddress: string, recipientAddress: string, amount: string): Promise<string> => {
        const transactionHash = nextTransactionHash(transfers.length + 1);
        transfers.push({ kind: 'erc20', tokenAddress, recipientAddress, amount, transactionHash });
        return transactionHash;
      },
    ),

    shutdown: mock(async (): Promise<void> => {}),
  };

  return client;
}

export type FakeBlockchainClient = ReturnType<typeof createFakeBlockchainClient>;
