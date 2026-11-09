/**
 * Contract tests for the ai-evaluator RabbitMQ topology.
 *
 * The evaluator is both producer and consumer of its own work:
 *  - evaluation.requests: the service queues an "evaluate" message to itself;
 *  - evaluation.results: the finished score goes to rwa.
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';
import { RabbitMQClient as RwaClient } from '../../rwa/src/clients/rabbitmq.client';

type ExchangeConfig = {
  isSync: boolean;
  concurrency: number;
  maxAttempts: number;
  retryDelaySeconds: number;
};

const RESULT_KEYS = ['poolResult', 'businessResult'];

const client = new RabbitMQClient('amqp://guest:***@localhost:5672');
const topology = client.getTopologyDefinition();
const outbox = new OutboxPublisherDaemon({} as never, client);
const config = (outbox as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;

describe('ai-evaluator RabbitMQ topology', () => {
  test('declares the requests and results exchanges and the requests queue', () => {
    expect(Object.keys(topology.exchanges)).toEqual(['evaluation.requests', 'evaluation.results']);
    expect(Object.keys(topology.queues)).toEqual(['evaluation.requests']);
  });

  test('the requests queue is bound to evaluate and survives 3 cycles before parking', () => {
    const queue = topology.queues['evaluation.requests'];

    expect(queue.bindings).toEqual({ 'evaluation.requests': ['evaluate'] });
    expect(queue.deferAfterAttempts).toBe(3);
    expect(queue.parkAfterCycles).toBe(3);
  });

  test('the outbox polls both exchanges with a 30s retry delay', () => {
    expect(Object.keys(config)).toEqual(['evaluation.requests', 'evaluation.results']);

    for (const exchange of Object.keys(config)) {
      expect(config[exchange]).toMatchObject({ isSync: false, concurrency: 5, maxAttempts: 10, retryDelaySeconds: 30 });
      expect(client.isExchangeRegistered(exchange)).toBe(true);
    }
  });

  test('rwa binds its results queue to evaluation.results with the result keys', () => {
    const rwaTopology = new RwaClient('amqp://guest:***@localhost:5672', []).getTopologyDefinition();
    const queue = rwaTopology.queues['evaluation.results'];

    expect(queue.bindings).toEqual({ 'evaluation.results': RESULT_KEYS });
  });
});
