/**
 * In-memory fakes of the ethers.js layer used by BlockchainScannerDaemon.
 *
 * The daemon builds its own JsonRpcProvider and EventEmitter contract in the
 * constructor; the daemon tests swap both fields for these fakes right after
 * construction, so no RPC endpoint is contacted and no network call is made.
 * The fakes mirror the exact method names and signatures the daemon uses:
 * provider.getNetwork(), provider.getBlockNumber(), contract.genesisBlock()
 * and contract.queryFilter(name, fromBlock, toBlock), plus the shape of an
 * ethers EventLog (fragment/args/blockNumber/index/getBlock()).
 */
import { mock } from 'bun:test';

export function createFakeEthersProvider() {
  const state = {
    chainId: 0n, // getNetwork() result; the daemon compares it with its configured chain id
    blockNumber: 0, // getBlock()/getBlockNumber() result
    getNetworkError: null as Error | null,
    getBlockNumberError: null as Error | null,
    getBlockError: null as Error | null,
  };

  const provider = {
    state,

    getNetwork: mock(async (): Promise<{ chainId: bigint }> => {
      if (state.getNetworkError) throw state.getNetworkError;
      return { chainId: state.chainId };
    }),

    getBlockNumber: mock(async (): Promise<number> => {
      if (state.getBlockNumberError) throw state.getBlockNumberError;
      return state.blockNumber;
    }),

    getBlock: mock(async (): Promise<{ number: number }> => {
      if (state.getBlockError) throw state.getBlockError;
      return { number: state.blockNumber };
    }),
  };

  return provider;
}

export type FakeEthersProvider = ReturnType<typeof createFakeEthersProvider>;

export type FakeEventLog = {
  blockNumber: number;
  transactionHash: string;
  index: number;
  args?: any[];
  fragment?: { name: string; inputs: Array<{ name: string }> };
  getBlock: () => Promise<{ timestamp: number }>;
};

export type FakeEventLogInput = {
  /** Event name as it appears in the EventEmitter ABI (fragment.name). */
  name: string;
  /** ABI parameter names in declaration order (fragment.inputs). */
  inputs: string[];
  /** Decoded argument values; bigints where the ABI declares uint256. */
  args?: any[];
  blockNumber: number;
  index: number;
  transactionHash?: string;
  blockTimestamp?: number;
  /** Set to false to simulate a log whose fragment is missing from the ABI. */
  withFragment?: boolean;
};

function fakeTransactionHash(blockNumber: number, index: number): string {
  return `0x${(blockNumber * 1000 + index).toString(16).padStart(64, '0')}`;
}

export function createFakeEventLog(input: FakeEventLogInput): FakeEventLog {
  const log: FakeEventLog = {
    blockNumber: input.blockNumber,
    transactionHash: input.transactionHash ?? fakeTransactionHash(input.blockNumber, input.index),
    index: input.index,
    args: input.args,
    getBlock: async () => ({ timestamp: input.blockTimestamp ?? 1_700_000_000 + input.blockNumber }),
  };

  if (input.withFragment !== false) {
    log.fragment = { name: input.name, inputs: input.inputs.map((name) => ({ name })) };
  }

  return log;
}

export function createFakeEventEmitterContract() {
  const state = {
    genesisBlock: 0n, // genesisBlock() result
    events: [] as FakeEventLog[], // logs returned by queryFilter()
    genesisBlockError: null as Error | null,
    queryFilterError: null as Error | null,
  };

  const contract = {
    state,

    genesisBlock: mock(async (): Promise<bigint> => {
      if (state.genesisBlockError) throw state.genesisBlockError;
      return state.genesisBlock;
    }),

    queryFilter: mock(async (_eventName: string, fromBlock: number, toBlock: number): Promise<FakeEventLog[]> => {
      if (state.queryFilterError) throw state.queryFilterError;
      // Mirrors ethers: only logs of the requested range come back.
      return state.events.filter((event) => event.blockNumber >= fromBlock && event.blockNumber <= toBlock);
    }),
  };

  return contract;
}

export type FakeEventEmitterContract = ReturnType<typeof createFakeEventEmitterContract>;
