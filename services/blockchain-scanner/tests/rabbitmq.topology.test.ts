/**
 * Contract tests for the blockchain-scanner service, the only producer of
 * blockchain events. Two properties matter and both are easy to break:
 *
 *  1. the exchange the outbox daemon polls is the exchange the client declares
 *     (the exchange name itself comes from RABBITMQ_EXCHANGE, the client
 *     topology is hardcoded — a mismatch makes every publish fail);
 *  2. the scanner publishes strictly in order with no attempt limit, so an
 *     event nobody bound must not bounce back: `blockchain.events` carries an
 *     `alternate-exchange`, and every unroutable event lands in the fanout
 *     quarantine queue instead of stalling the stream.
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';
import EventEmitterABI from '../src/abi/EventEmitter.json';
import { RabbitMQClient as RwaClient } from '../../rwa/src/clients/rabbitmq.client';
import { RabbitMQClient as ChartsClient } from '../../charts/src/clients/rabbitmq.client';
import { RabbitMQClient as DaoClient } from '../../dao/src/clients/rabbitmq.client';
import { RabbitMQClient as LoyaltyClient } from '../../loyalty/src/clients/rabbitmq.client';
import { RabbitMQClient as PortfolioClient } from '../../portfolio/src/clients/rabbitmq.client';

type ExchangeConfig = { isSync: boolean; concurrency: number; maxAttempts: number };

const uri = 'amqp://guest:guest@localhost:5672';
const client = new RabbitMQClient(uri);
const topology = client.getTopologyDefinition();
const outbox = new OutboxPublisherDaemon({} as never);
const config = (outbox as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;

/** Events the EventEmitter contract declares but no consumer binds today. */
const UNCONSUMED_EVENTS = [
  'Initialized',
  'PlatformToken_Transfer',
  'ReferralTreasury_EmergencyWithdrawn',
  'Upgraded',
];

describe('blockchain-scanner RabbitMQ topology', () => {
  test('declares the blockchain events exchange with the unrouted quarantine flag', () => {
    expect(topology.exchanges).toEqual({
      'blockchain.events': {
        type: 'direct',
        options: { durable: true },
        allowUnrouted: true,
      },
    });

    // The fanout quarantine exchange and its queue are derived by the base
    // client from `allowUnrouted`, so they never appear in the topology.
    expect(topology.queues).toEqual({});
  });

  test('the outbox polls the very exchange the client declares', () => {
    expect(Object.keys(config)).toEqual(['blockchain.events']);
    expect(client.isExchangeRegistered('blockchain.events')).toBe(true);
  });

  test('strict order, unlimited attempts: the stream waits for the head message', () => {
    expect(config['blockchain.events']).toEqual({
      isSync: true,
      concurrency: 1,
      maxAttempts: Number.POSITIVE_INFINITY,
    });
  });

  test('every event any consumer binds is emitted by the scanner (no dead bindings)', () => {
    const declared = new Set(
      EventEmitterABI.abi.filter((item) => item.type === 'event').map((item) => item.name as string),
    );
    const consumed = new Set<string>([
      ...new RwaClient(uri).getTopologyDefinition().queues['blockchain.events.rwa'].bindings['blockchain.events'],
      ...new ChartsClient(uri).getTopologyDefinition().queues['blockchain.events.charts'].bindings['blockchain.events'],
      ...new DaoClient(uri).getTopologyDefinition().queues['blockchain.events.dao'].bindings['blockchain.events'],
      ...new LoyaltyClient(uri).getTopologyDefinition().queues['blockchain.events.loyalty'].bindings[
        'blockchain.events'
      ],
      ...new PortfolioClient(uri).getTopologyDefinition().queues['blockchain.events.portfolio'].bindings[
        'blockchain.events'
      ],
    ]);

    expect([...consumed].filter((event) => !declared.has(event))).toEqual([]);
  });

  test('the ABI declares exactly four events with no consumer — they land in the quarantine queue', () => {
    const declared = EventEmitterABI.abi
      .filter((item) => item.type === 'event')
      .map((item) => item.name as string);
    const consumed = new Set<string>([
      ...new RwaClient(uri).getTopologyDefinition().queues['blockchain.events.rwa'].bindings['blockchain.events'],
      ...new ChartsClient(uri).getTopologyDefinition().queues['blockchain.events.charts'].bindings['blockchain.events'],
      ...new DaoClient(uri).getTopologyDefinition().queues['blockchain.events.dao'].bindings['blockchain.events'],
      ...new LoyaltyClient(uri).getTopologyDefinition().queues['blockchain.events.loyalty'].bindings[
        'blockchain.events'
      ],
      ...new PortfolioClient(uri).getTopologyDefinition().queues['blockchain.events.portfolio'].bindings[
        'blockchain.events'
      ],
    ]);

    expect(declared.filter((event) => !consumed.has(event)).sort()).toEqual(UNCONSUMED_EVENTS);
  });
});
