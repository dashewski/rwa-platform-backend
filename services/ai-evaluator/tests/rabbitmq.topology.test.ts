/**
 * Contract tests for the ai-evaluator service, which is producer-only: it
 * declares the `evaluation` exchange and publishes pool/business results into
 * it through the outbox. The queue and its bindings belong to the rwa service —
 * that asymmetry is exactly why these tests exist: the evaluator must publish
 * with the keys rwa has bound (`poolResult`, `businessResult`).
 *
 * No broker, no database.
 */
import { describe, expect, test } from 'bun:test';
import { RabbitMQClient } from '../src/clients/rabbitmq.client';
import { OutboxPublisherDaemon } from '../src/daemons/outboxPublisher.daemon';
import { RabbitMQClient as RwaClient } from '../../rwa/src/clients/rabbitmq.client';

type ExchangeConfig = { isSync: boolean; concurrency: number; maxAttempts: number };

const EVALUATION_RESULT_KEYS = ['poolResult', 'businessResult'];

const client = new RabbitMQClient('amqp://guest:guest@localhost:5672');
const topology = client.getTopologyDefinition();
const outbox = new OutboxPublisherDaemon({} as never);
const config = (outbox as unknown as { exchangesConfig: Record<string, ExchangeConfig> }).exchangesConfig;

describe('ai-evaluator RabbitMQ topology', () => {
  test('declares only the evaluation exchange: queues are the consumer side', () => {
    expect(topology).toEqual({
      exchanges: { evaluation: { type: 'direct', options: { durable: true } } },
      queues: {},
    });
  });

  test('the outbox polls a registered exchange', () => {
    expect(Object.keys(config)).toEqual(['evaluation']);

    for (const exchange of Object.keys(config)) {
      expect(client.isExchangeRegistered(exchange)).toBe(true);
    }
  });

  test('parallel publishing: 5 in flight, 10 attempts', () => {
    expect(config['evaluation']).toEqual({ isSync: false, concurrency: 5, maxAttempts: 10 });
  });

  test('the exchange and both routing keys exist on the consumer side', () => {
    const rwa = new RwaClient('amqp://guest:guest@localhost:5672').getTopologyDefinition();

    expect(rwa.exchanges.evaluation).toEqual(topology.exchanges.evaluation);
    expect(rwa.queues['evaluation.results'].bindings.evaluation as readonly string[]).toEqual(EVALUATION_RESULT_KEYS);
  });
});
