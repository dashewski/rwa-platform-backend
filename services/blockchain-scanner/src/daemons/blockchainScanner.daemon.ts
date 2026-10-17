import { ethers } from 'ethers';
import { logger } from '@shared/monitoring/src/monitoring.plugin';
import { AppError } from '@shared/errors/app-errors';
import EventEmitterABI from '../abi/EventEmitter.json';
import { BlockchainScannerService } from '../services/blockchainScanner.service';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';
import { MetricsDecorator } from '@shared/monitoring/src/metricsDecorator';
import { LogDecorator } from '@shared/monitoring/src/logDecorator';
import type { BlockchainEvent } from '@shared/blockchain';


export class BlockchainScannerDaemon {
  private provider: ethers.JsonRpcProvider;
  private eventEmitterContract: ethers.Contract;

  private isRunning: boolean = false;
  private lastProcessedBlock: number = 0;

  constructor(
    rpcUrl: string,
    private contractAddress: string,
    private blockConfirmations: number,
    private scanIntervalMs: number,
    private batchSize: number,
    private chainId: number,
    private initScanBlockNumber: number,
    private scannerService: BlockchainScannerService,
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.eventEmitterContract = new ethers.Contract(contractAddress, EventEmitterABI.abi, this.provider);
  }

  /**
   * Initialize daemon
   */
  @TraceDecorator()
  @LogDecorator()
  async initialize(): Promise<void> {
    try {
      const network = await this.provider.getNetwork();
      const providerChainId = Number(network.chainId);

      if (providerChainId !== this.chainId) {
        throw new AppError({
          message: `Chain ID mismatch. Expected ${this.chainId}, but provider returned ${providerChainId}`,
          statusCode: 502,
          code: 'BLOCKCHAIN_ERROR',
        });
      }

      this.lastProcessedBlock = await this.scannerService.getLastProcessedBlock();
      if (this.lastProcessedBlock === 0) {
        // No stored state: an explicit initScanBlockNumber (env) wins over the emitter genesis block.
        if (Number.isInteger(this.initScanBlockNumber) && this.initScanBlockNumber > 0) {
          this.lastProcessedBlock = this.initScanBlockNumber - 1;
          logger.info(`No stored scanner state, starting scan from INIT_SCAN_BLOCK_NUMBER=${this.initScanBlockNumber}`);
        } else {
          this.lastProcessedBlock = (await this.getGenesisBlock()) - 1;
        }
      }
    } catch (error) {
      throw new AppError({
        message: 'Failed to initialize Blockchain Scanner Daemon',
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
        cause: error,
      });
    }
  }

  /**
   * Get genesis block number from contract
   */
  private async getGenesisBlock(): Promise<number> {
    try {
      const genesisBlock = await this.eventEmitterContract.genesisBlock();
      return typeof genesisBlock === 'bigint' ? Number(genesisBlock) : genesisBlock;
    } catch (error) {
      throw new AppError({
        message: 'Failed to get genesis block',
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
        cause: error,
      });
    }
  }

  /**
   * Get latest block number
   */
  private async getLatestBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      throw new AppError({
        message: 'Failed to get latest block number',
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
        cause: error,
      });
    }
  }

  /**
   * Get events from block range
   */
  private async getEvents(fromBlock: number, toBlock: number): Promise<BlockchainEvent[]> {
    try {
      const allEvents = await this.eventEmitterContract.queryFilter('*' as any, fromBlock, toBlock);

      const eventsByBlock: Record<number, ethers.EventLog[]> = {};
      const blockNumbers: number[] = [];

      for (const event of allEvents) {
        if (!eventsByBlock[event.blockNumber]) {
          eventsByBlock[event.blockNumber] = [];
          blockNumbers.push(event.blockNumber);
        }
        eventsByBlock[event.blockNumber].push(event as ethers.EventLog);
      }

      blockNumbers.sort((a, b) => a - b);

      const processedEvents: BlockchainEvent[] = [];

      for (const blockNumber of blockNumbers) {
        const blockEvents = eventsByBlock[blockNumber];
        const block = await blockEvents[0].getBlock();

        for (const event of blockEvents) {
          const eventName = this.getEventName(event);
          processedEvents.push({
            chainId: this.chainId,
            name: eventName,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            address: this.contractAddress,
            logIndex: event.index,
            data: this.parseEventData(event),
            timestamp: Number(block.timestamp),
          });
        }
      }

      return processedEvents;
    } catch (error) {
      throw new AppError({
        message: `Failed to get events from block ${fromBlock} to ${toBlock}`,
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
        cause: error,
      });
    }
  }

  private getEventName(event: ethers.EventLog): string {
    try {
      return event.fragment.name;
    } catch (error) {
      return 'Unknown';
    }
  }

  private parseEventData(event: ethers.EventLog): Record<string, any> {
    try {
      const args = event.args;
      if (!args) {
        return {};
      }

      const result: Record<string, any> = {};
      for (let i = 0; i < args.length; i++) {
        result[event.fragment.inputs[i].name] = args[i];
      }

      return this.convertBigIntToString(result);
    } catch (error) {
      throw new AppError({
        message: `Failed to parse event data`,
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
        cause: error,
      });
    }
  }

  private convertBigIntToString(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map((item) => this.convertBigIntToString(item));
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const key in obj) {
        if (isNaN(Number(key))) {
          result[key] = this.convertBigIntToString(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }

  @TraceDecorator()
  @LogDecorator()
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    this.runLoop().catch((err) => {
      logger.error('runLoop fatal error, killing process for Docker restart', err, {
        lastProcessedBlock: this.lastProcessedBlock,
        chainId: this.chainId,
      });
      setTimeout(() => {
        process.exit(1)
      }, 5000);
    });
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.scan();
      } catch (error) {
        logger.error('Error during scan cycle', error, {
          lastProcessedBlock: this.lastProcessedBlock,
          chainId: this.chainId,
        });
      }

      if (!this.isRunning) break;

      await new Promise((resolve) => setTimeout(resolve, this.scanIntervalMs));
    }
  }

  @TraceDecorator()
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
  }

  @TraceDecorator({ root: true })
  private async scan(): Promise<void> {
    let currentBlock: number;
    try {
      currentBlock = await this.getLatestBlockNumber();
    } catch (error) {
      return;
    }
    const confirmedBlock = currentBlock - this.blockConfirmations;

    if (this.lastProcessedBlock >= confirmedBlock) {
      return;
    }

    const fromBlock = this.lastProcessedBlock + 1;
    const toBlock = Math.min(fromBlock + this.batchSize - 1, confirmedBlock);
    const blocksRemaining = confirmedBlock - this.lastProcessedBlock;

    try {
      await this.processBatch(fromBlock, toBlock);
      this.lastProcessedBlock = toBlock;
    } catch (error) {
      throw new AppError({
        message: 'Error during blockchain scan',
        statusCode: 502,
        code: 'BLOCKCHAIN_ERROR',
        cause: error,
      });
    }
  }

  @TraceDecorator()
  @MetricsDecorator()
  @LogDecorator({
    args: (a) => ({ fromBlock: a[0], toBlock: a[1] }),
  })
  private async processBatch(fromBlock: number, toBlock: number): Promise<void> {
    const events = await this.getEvents(fromBlock, toBlock);

    if (events.length > 0) {
      const eventsByBlock = events.reduce(
        (acc, event) => {
          if (!acc[event.blockNumber]) {
            acc[event.blockNumber] = [];
          }
          acc[event.blockNumber].push(event);
          return acc;
        },
        {} as Record<number, BlockchainEvent[]>,
      );

      const blockNumbers = Object.keys(eventsByBlock)
        .map(Number)
        .sort((a, b) => a - b);

      for (const blockNumber of blockNumbers) {
        const blockEvents = eventsByBlock[blockNumber];
        await this.scannerService.applyBlockEvents(blockNumber, blockEvents);
      }
    }

    // Single update of last processed block per batch — source of truth for crash recovery
    await this.scannerService.updateLastProcessedBlock(toBlock);
  }
}
