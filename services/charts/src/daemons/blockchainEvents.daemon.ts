import type { RabbitMQClient } from '@shared/rabbitmq/src/rabbitmq.client';
import { OrderedConsumerDaemon } from '@shared/ordered-consumer';
import type { OrderedConsumerService } from '@shared/ordered-consumer/src/services/orderedConsumer.service';
import type { BlockchainEvent } from '@shared/blockchain';
import { ChartsService } from '../services/charts.service';
import { TransactionsService } from '../services/transactions.service';
import { PoolTransactionType } from '../models/shared/enums.model';

export const BLOCKCHAIN_EVENTS_EXCHANGE = 'blockchain.events';
export const BLOCKCHAIN_EVENTS_QUEUE = 'blockchain.events.charts';

export class BlockchainEventsDaemon extends OrderedConsumerDaemon {
  constructor(
    rabbitClient: RabbitMQClient,
    consumerService: OrderedConsumerService,
    private readonly chartsService: ChartsService,
    private readonly transactionsService: TransactionsService,
  ) {
    super(rabbitClient, consumerService, BLOCKCHAIN_EVENTS_EXCHANGE, {
      Pool_ReservesUpdated: async (event: BlockchainEvent) => {
        const { emittedFrom, realHoldReserve, virtualHoldReserve, virtualRwaReserve } = event.data as any;

        await this.chartsService.recordPriceData({
          poolAddress: emittedFrom,
          timestamp: event.timestamp,
          blockNumber: event.blockNumber,
          realHoldReserve: realHoldReserve.toString(),
          virtualHoldReserve: virtualHoldReserve.toString(),
          virtualRwaReserve: virtualRwaReserve.toString(),
        });
      },
      Pool_RwaMinted: async (event: BlockchainEvent) => {
        const { emittedFrom, minter, rwaAmountMinted, holdAmountPaid, feePaid } = event.data as any;

        await this.transactionsService.recordTransaction({
          poolAddress: emittedFrom,
          transactionType: PoolTransactionType.MINT,
          userAddress: minter,
          timestamp: event.timestamp,
          rwaAmount: rwaAmountMinted.toString(),
          holdAmount: holdAmountPaid.toString(),
          holdFee: feePaid.toString(),
        });
      },
      Pool_RwaBurned: async (event: BlockchainEvent) => {
        const {
          emittedFrom,
          burner,
          rwaAmountBurned,
          holdAmountReceived,
          bonusAmountReceived,
          holdFeePaid,
          bonusFeePaid,
        } = event.data as any;

        await this.transactionsService.recordTransaction({
          poolAddress: emittedFrom,
          transactionType: PoolTransactionType.BURN,
          userAddress: burner,
          timestamp: event.timestamp,
          rwaAmount: rwaAmountBurned.toString(),
          holdAmount: holdAmountReceived.toString(),
          bonusAmount: bonusAmountReceived.toString(),
          holdFee: holdFeePaid.toString(),
          bonusFee: bonusFeePaid.toString(),
        });
      },
    });
  }
}
