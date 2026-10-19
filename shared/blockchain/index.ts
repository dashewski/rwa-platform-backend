export type BlockchainEvent<TData = Record<string, any>> = {
  chainId: string;
  name: string;
  blockNumber: number;
  transactionHash: string;
  address: string;
  logIndex: number;
  data: TData;
  timestamp: number;
};
