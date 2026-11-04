/**
 * Contract tests for the ai-evaluator RabbitMQ topology.
 *
 * The evaluator used to consume evaluation.requests; it is now triggered over
 * HTTP and keeps jobs in MongoDB, so it is a producer only: results go to the
 * evaluation exchange through the outbox. The rwa side still owns the results
 * queue, so both directions are pinned here.
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';
import { RabbitMQClient as RwaClient } from '../../rwa/src/clients/rabbitmq.client';

type ExchangeConfig = { isSync: boolean; concurrency: number; maxAttempts: number };

const EVALUATION_RESULT_KEYS = ['poolResult', 'businessResult'];

const client = new RabbitMQClient('amqp://guest:***@localhost:5672');
const topology = client.getTopologyDefinition();
const outbox = new OutboxPublisherDaemon({} as never, client);
const config = (outbox as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;

describe('ai-evaluator RabbitMQ topology', () => {
  test('declares only the evaluation exchange, no request queue', () => {
    expect(topology.exchanges).toEqual({
      evaluation: { type: 'direct', options: { durable: true }, allowUnrouted: false },
    });
    expect(Object.keys(topology.queues)).toEqual([]);
  });

  test('the outbox polls the evaluation exchange', () => {
    expect(Object.keys(config)).toEqual(['evaluation']);
    expect(client.isExchangeRegistered('evaluation')).toBe(true);
  });

  test('rwa binds its results queue to the same exchange and keys', () => {
    const rwaTopology = new RwaClient('amqp://guest:***@localhost:5672', []).getTopologyDefinition();
    const queue = Object.entries(rwaTopology.queues).find(([, options]) =>
      Object.keys(options.bindings).includes('evaluation'),
    );

    expect(queue).toBeDefined();
    expect(queue?.[1].bindings.evaluation).toEqual(EVALUATION_RESULT_KEYS);
  });
});
